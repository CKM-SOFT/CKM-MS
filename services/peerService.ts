
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { User, PeerPacket } from '../types';
import { cryptoService } from './cryptoService';

class PeerService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private onMessageCallback: ((packet: PeerPacket) => void) | null = null;
  private onCallCallback: ((call: MediaConnection) => void) | null = null;
  private myPubKey: string | null = null;

  async init(myId: string, onOpen: (id: string) => void) {
    if (this.peer) return;
    this.peer = new Peer(myId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      }
    });
    
    this.myPubKey = await cryptoService.generateIdentity();
    
    this.peer.on('open', (id) => {
      onOpen(id);
    });

    this.peer.on('connection', (conn) => {
      this.setupConnection(conn);
      // Auto-handshake for E2EE when someone connects to us
      if (this.myPubKey) {
        setTimeout(() => {
          this.rawSend(conn, { 
            type: 'handshake', 
            data: this.myPubKey!, 
            sender: { id: this.peer!.id, name: 'User', status: 'online' } 
          });
        }, 800);
      }
    });

    this.peer.on('call', (call) => {
      if (this.onCallCallback) this.onCallCallback(call);
    });

    this.peer.on('error', (err) => {
      console.error("PeerJS Global Error:", err);
    });
  }

  private setupConnection(conn: DataConnection) {
    conn.on('data', async (data: any) => {
      try {
        const packet: PeerPacket = JSON.parse(data as string);
        
        if (packet.type === 'handshake') {
          await cryptoService.importPublicKey(conn.peer, packet.data);
          return;
        }

        if (packet.type === 'text' || packet.type === 'media') {
          packet.data = await cryptoService.decrypt(conn.peer, packet.data);
        }

        if (this.onMessageCallback) this.onMessageCallback(packet);
      } catch (e) {
        console.error("Failed to process peer data", e);
      }
    });

    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
    });
  }

  async validateId(peerId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.peer || this.peer.id === peerId) return resolve(false);
      
      const conn = this.peer.connect(peerId);
      const timeout = setTimeout(() => {
        conn.close();
        resolve(false);
      }, 5000);

      conn.on('open', () => {
        clearTimeout(timeout);
        this.setupConnection(conn);
        resolve(true);
      });
      
      conn.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  private rawSend(conn: DataConnection, packet: PeerPacket) {
    if (conn && conn.open) {
      conn.send(JSON.stringify(packet));
    }
  }

  async send(peerId: string, packet: PeerPacket) {
    if (packet.type === 'text' || packet.type === 'media') {
      packet.data = await cryptoService.encrypt(peerId, packet.data);
    }

    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      this.rawSend(conn, packet);
    } else {
      const newConn = this.peer?.connect(peerId);
      if (newConn) {
        newConn.on('open', () => {
          this.setupConnection(newConn);
          // Wait for handshake if needed
          setTimeout(() => this.rawSend(newConn, packet), 1000);
        });
      }
    }
  }

  call(peerId: string, stream: MediaStream): MediaConnection | undefined {
    return this.peer?.call(peerId, stream);
  }

  onMessage(cb: (packet: PeerPacket) => void) {
    this.onMessageCallback = cb;
  }

  onCall(cb: (call: MediaConnection) => void) {
    this.onCallCallback = cb;
  }

  destroy() {
    this.peer?.destroy();
    this.peer = null;
    this.connections.clear();
  }
}

export const peerService = new PeerService();
