
export type UserStatus = 'online' | 'offline';
export type MessageStatus = 'sending' | 'sent' | 'read';
export type ThemeType = 'light' | 'dark';
export type LangType = 'en' | 'ru';

export interface User {
  id: string;
  name: string;
  avatar?: string;
  status: UserStatus;
  lastSeen?: number;
  phone?: string;
  bio?: string;
  publicKey?: string;
}

export interface Message {
  id: string;
  senderId: string;
  chatId?: string; // Target chat
  text?: string;
  image?: string;
  isVoice?: boolean;
  voiceUrl?: string;
  mediaData?: string; // Base64
  voiceDuration?: number;
  timestamp: number;
  status: MessageStatus;
  isSelf: boolean;
  replyToId?: string;
  isEdited?: boolean;
  forwardedFrom?: string;
  isSticker?: boolean;
  isCall?: boolean;
}

export interface Chat {
  id: string;
  user: User;
  lastMessage?: string;
  lastMessageTime?: number;
  lastActivity: number;
  unreadCount: number;
  pinnedMessageId?: string;
}

export interface PeerPacket {
  type: 'text' | 'voice' | 'media' | 'handshake' | 'typing';
  data: any; // Will be encrypted string or public key
  sender: User;
}
