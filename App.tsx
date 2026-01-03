
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Menu, Search, Mic, Send, MoreVertical, ArrowLeft, Moon, Sun, User as UserIcon, Settings, Phone, MessageSquare, Bookmark, Users, ChevronRight, X, Reply, Trash, Share, Check, CheckCheck, Clock, Smile, Paperclip, Copy, UserPlus, Edit3, PhoneOff, Video, UserMinus, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Message, Chat, ThemeType, LangType, PeerPacket } from './types';
import { COLORS, TRANSLATIONS, GEMINI_USER } from './constants';
import { Avatar } from './components/Avatar';
import { Ripple } from './components/Ripple';
import { VoicePlayer } from './components/VoicePlayer';
import { peerService } from './services/peerService';
import { askGemini } from './services/geminiService';
import { dbService } from './services/dbService';

const generateUniqueId = () => {
  const segment = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `ckm_${segment()}${segment()}`;
};

const DEFAULT_SELF: User = {
  id: generateUniqueId(),
  name: 'User',
  status: 'online',
  phone: '',
  bio: 'CKM Software Professional',
};

const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '✅', '❌', '🤔', '😊', '😎', '💡', '🚀'];

type ViewState = 'chats' | 'settings' | 'contacts' | 'new-group' | 'calls';

const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeType>('dark');
  const [lang, setLang] = useState<LangType>('en');
  const [activeView, setActiveView] = useState<ViewState>('chats');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [self, setSelf] = useState<User>(DEFAULT_SELF);
  const [chats, setChats] = useState<Chat[]>([
    { id: GEMINI_USER.id, user: GEMINI_USER, lastActivity: Date.now(), unreadCount: 0 }
  ]);
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({ [GEMINI_USER.id]: [] });
  
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [isSearchingInChat, setIsSearchingInChat] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [contactIdInput, setContactIdInput] = useState('');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState(false);

  const t = TRANSLATIONS[lang];
  const colors = COLORS[theme];
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // --- Initial Data Load ---
  useEffect(() => {
    const initApp = async () => {
      await dbService.init();
      
      const storedTheme = await dbService.getKV('theme');
      const storedLang = await dbService.getKV('lang');
      const storedSelf = await dbService.getKV('self');
      const storedChats = await dbService.getChats();
      const storedMsgs = await dbService.getMessages();

      if (storedTheme) setTheme(storedTheme);
      if (storedLang) setLang(storedLang);
      if (storedSelf) {
        setSelf(storedSelf);
        setEditName(storedSelf.name);
        setEditBio(storedSelf.bio || '');
      }
      
      if (storedChats.length > 0) {
        const merged = [GEMINI_USER, ...storedChats.filter(c => c.id !== GEMINI_USER.id)];
        setChats(merged);
      }

      const mMap: Record<string, Message[]> = { [GEMINI_USER.id]: [] };
      storedMsgs.forEach(m => {
        const cid = m.chatId || m.senderId;
        if (!mMap[cid]) mMap[cid] = [];
        mMap[cid].push(m);
      });
      setMessagesMap(mMap);
      setDbReady(true);
    };
    initApp();
  }, []);

  useEffect(() => {
    if (dbReady) {
      dbService.setKV('theme', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme, dbReady]);

  useEffect(() => { if (dbReady) dbService.setKV('lang', lang); }, [lang, dbReady]);
  useEffect(() => { if (dbReady) dbService.setKV('self', self); }, [self, dbReady]);
  useEffect(() => { if (dbReady) chats.forEach(c => dbService.saveChat(c)); }, [chats, dbReady]);

  // --- PeerJS & Realtime Logic ---
  useEffect(() => {
    const startPeer = async () => {
      const myId = (await dbService.getKV('peerId')) || self.id;
      await dbService.setKV('peerId', myId);

      peerService.init(myId, (id) => console.log("Peer Online:", id));
      
      peerService.onMessage((packet) => {
        handleIncomingPacket(packet);
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
          new Notification(packet.sender.name, {
            body: packet.type === 'text' ? packet.data : 'Sent a photo'
          });
        }
      });

      peerService.onCall((call) => {
        setIsCalling(true);
        setIsVideoCall(true);
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
          setLocalStream(stream);
          call.answer(stream);
          call.on('stream', (rStream) => setRemoteStream(rStream));
          call.on('close', () => endCall());
        });
      });
    };
    if (dbReady) startPeer();
    return () => peerService.destroy();
  }, [dbReady, self.id]);

  const handleIncomingPacket = useCallback((packet: PeerPacket) => {
    const { type, data, sender } = packet;
    
    setChats(prev => {
      const exists = prev.find(c => c.id === sender.id);
      if (exists) {
        return prev.map(c => c.id === sender.id ? { ...c, lastActivity: Date.now(), user: { ...c.user, status: 'online' } } : c);
      }
      return [{ id: sender.id, user: { ...sender, status: 'online' }, lastActivity: Date.now(), unreadCount: 1 }, ...prev];
    });

    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: sender.id,
      text: type === 'text' ? data : undefined,
      image: type === 'media' ? data : undefined,
      timestamp: Date.now(),
      status: 'read',
      isSelf: false,
      chatId: sender.id
    };

    setMessagesMap(prev => {
      const chatMsgs = prev[sender.id] || [];
      const updated = { ...prev, [sender.id]: [...chatMsgs, newMessage] };
      dbService.saveMessage(newMessage);
      return updated;
    });
  }, []);

  const startCall = async (video: boolean) => {
    if (!activeChatId) return;
    setIsCalling(true);
    setIsVideoCall(video);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
      setLocalStream(stream);
      const call = peerService.call(activeChatId, stream);
      call?.on('stream', (rStream) => setRemoteStream(rStream));
      call?.on('close', () => endCall());
    } catch (err) {
      console.error("Call failed:", err);
      setIsCalling(false);
    }
  };

  const endCall = () => {
    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setIsCalling(false);
  };

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [localStream, remoteStream]);

  const handleChatSelect = (id: string) => {
    setActiveChatId(id);
    setActiveView('chats');
    setIsDrawerOpen(false);
    setIsSearchingInChat(false);
    setIsMenuOpen(false);
    setIsProfileOpen(false);
    setChats(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c));
  };

  const sendMessage = async () => {
    if ((!inputText.trim() && !imagePreview) || !activeChatId) return;
    const msgText = inputText.trim();
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: self.id,
      text: msgText || undefined,
      image: imagePreview || undefined,
      timestamp: Date.now(),
      status: 'sent',
      isSelf: true,
      chatId: activeChatId
    };
    
    setMessagesMap(prev => {
      const chatMsgs = prev[activeChatId] || [];
      const updated = { ...prev, [activeChatId]: [...chatMsgs, newMessage] };
      dbService.saveMessage(newMessage);
      return updated;
    });

    if (activeChatId === GEMINI_USER.id) {
      const response = await askGemini(msgText || "Image shared");
      const botMsg: Message = {
        id: Math.random().toString(36).substr(2, 9),
        senderId: GEMINI_USER.id,
        text: response,
        timestamp: Date.now(),
        status: 'read',
        isSelf: false,
        chatId: GEMINI_USER.id
      };
      setMessagesMap(prev => {
        const chatMsgs = prev[GEMINI_USER.id] || [];
        const updated = { ...prev, [GEMINI_USER.id]: [...chatMsgs, botMsg] };
        dbService.saveMessage(botMsg);
        return updated;
      });
    } else {
      peerService.send(activeChatId, { 
        type: imagePreview ? 'media' : 'text', 
        data: imagePreview || msgText, 
        sender: self 
      });
    }

    setInputText('');
    setImagePreview(null);
    setIsEmojiPickerOpen(false);
    setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, lastMessage: imagePreview ? 'Photo' : msgText, lastActivity: Date.now() } : c));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAddContact = () => {
    if (!contactIdInput.trim() || contactIdInput === self.id) return;
    
    const newChat: Chat = {
      id: contactIdInput,
      user: { 
        id: contactIdInput, 
        name: `User ${contactIdInput.slice(-4)}`, 
        status: 'offline', 
        bio: 'Secured Peer Node'
      },
      lastActivity: Date.now(),
      unreadCount: 0
    };
    
    setChats(prev => {
      if (prev.find(c => c.id === contactIdInput)) return prev;
      return [newChat, ...prev];
    });
    handleChatSelect(contactIdInput);
    setContactIdInput('');
    setErrorMsg(null);
  };

  const handleCreateGroup = () => {
    if (!groupNameInput.trim()) return;
    const groupId = `group_${Math.random().toString(36).substr(2, 9)}`;
    const newChat: Chat = {
      id: groupId,
      user: { id: groupId, name: groupNameInput, status: 'online' },
      lastActivity: Date.now(),
      unreadCount: 0
    };
    setChats(prev => [newChat, ...prev]);
    handleChatSelect(groupId);
    setGroupNameInput('');
    setSelectedGroupMembers([]);
    setActiveView('chats');
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messagesMap, activeChatId]);

  const activeChat = chats.find(c => c.id === activeChatId);
  const filteredMessages = useMemo(() => {
    const msgs = activeChatId ? messagesMap[activeChatId] || [] : [];
    if (!chatSearchQuery) return msgs;
    return msgs.filter(m => m.text?.toLowerCase().includes(chatSearchQuery.toLowerCase()));
  }, [activeChatId, messagesMap, chatSearchQuery]);

  if (!dbReady) return <div className="h-screen flex items-center justify-center bg-black text-white">Initializing CKM MS System...</div>;

  return (
    <div className="flex h-screen w-full overflow-hidden transition-colors" style={{ backgroundColor: colors.mainBg, color: colors.mainText }}>
      {/* Drawer Overlay */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-40" onClick={() => setIsDrawerOpen(false)} />
            <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-y-0 left-0 w-72 z-50 shadow-2xl flex flex-col" style={{ backgroundColor: colors.sidebarBg }}>
              <div className="p-6 bg-[#1e3a8a] text-white">
                <Avatar id={self.id} name={self.name} size="lg" />
                <div className="mt-4 font-bold text-lg">{self.name}</div>
                <div className="text-sm opacity-80 flex items-center justify-between">
                  <span className="truncate">{self.id}</span>
                  <Ripple onClick={() => { navigator.clipboard.writeText(self.id); }} className="p-1 rounded hover:bg-white/10">
                    <Copy size={14} />
                  </Ripple>
                </div>
              </div>
              <div className="flex-1 py-2 overflow-y-auto custom-scrollbar flex flex-col">
                <Ripple onClick={() => { setActiveView('new-group'); setIsDrawerOpen(false); }} className="flex items-center space-x-6 px-6 py-3 hover:bg-black/5">
                  <Users size={24} style={{ color: colors.secondaryText }} />
                  <span className="font-medium">{t.newGroup}</span>
                </Ripple>
                <Ripple onClick={() => { setActiveView('contacts'); setIsDrawerOpen(false); }} className="flex items-center space-x-6 px-6 py-3 hover:bg-black/5">
                  <UserIcon size={24} style={{ color: colors.secondaryText }} />
                  <span className="font-medium">{t.contacts}</span>
                </Ripple>
                <Ripple onClick={() => { setActiveView('calls'); setIsDrawerOpen(false); }} className="flex items-center space-x-6 px-6 py-3 hover:bg-black/5">
                  <Phone size={24} style={{ color: colors.secondaryText }} />
                  <span className="font-medium">{t.calls}</span>
                </Ripple>
                <Ripple onClick={() => { setActiveView('settings'); setIsDrawerOpen(false); }} className="flex items-center space-x-6 px-6 py-3 hover:bg-black/5">
                  <Settings size={24} style={{ color: colors.secondaryText }} />
                  <span className="font-medium">{t.settings}</span>
                </Ripple>
                
                <div className="mt-auto p-8 text-center border-t" style={{ borderColor: colors.border }}>
                   <div className="text-[10px] uppercase tracking-[0.25em] font-bold opacity-50" style={{ color: colors.secondaryText }}>
                     CKM SOFTWARE MESSAGE SYSTEM v1.2
                   </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Profile Sidebar */}
      <AnimatePresence>
        {isProfileOpen && activeChat && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 sm:hidden bg-black/50" onClick={() => setIsProfileOpen(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed sm:static inset-y-0 right-0 w-80 z-50 shadow-2xl border-l flex flex-col" style={{ backgroundColor: colors.sidebarBg, borderColor: colors.border }}>
              <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: colors.border }}>
                <span className="font-bold">Info</span>
                <Ripple onClick={() => setIsProfileOpen(false)} className="p-2 rounded-full hover:bg-black/5"><X size={20}/></Ripple>
              </div>
              <div className="p-6 flex flex-col items-center border-b" style={{ borderColor: colors.border }}>
                <Avatar id={activeChat.id} name={activeChat.user.name} size="xl" />
                <h2 className="mt-4 text-xl font-bold">{activeChat.user.name}</h2>
                <p className="text-sm opacity-60 mt-1">{activeChat.user.status}</p>
              </div>
              <div className="p-6 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase opacity-40">Bio</p>
                  <p className="text-[15px]">{activeChat.user.bio || 'Professional User'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase opacity-40">Unique ID</p>
                  <p className="text-xs font-mono break-all bg-black/5 p-2 rounded-lg">{activeChat.id}</p>
                </div>
                <div className="pt-4 grid grid-cols-2 gap-2">
                    <Ripple onClick={() => startCall(false)} className="flex flex-col items-center justify-center p-4 rounded-xl bg-black/5 border" style={{ borderColor: colors.border }}>
                        <Phone size={24} className="text-blue-500 mb-2" />
                        <span className="text-[10px] font-bold uppercase">Call</span>
                    </Ripple>
                    <Ripple onClick={() => startCall(true)} className="flex flex-col items-center justify-center p-4 rounded-xl bg-black/5 border" style={{ borderColor: colors.border }}>
                        <Video size={24} className="text-blue-500 mb-2" />
                        <span className="text-[10px] font-bold uppercase">Video</span>
                    </Ripple>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Video Call UI */}
      <AnimatePresence>
        {isCalling && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center text-white">
            <div className="relative w-full h-full max-w-4xl max-h-[80vh] bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10">
              {remoteStream ? (
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <Avatar id={activeChatId!} name={activeChat?.user.name || ''} size="xl" />
                  <h2 className="mt-6 text-3xl font-bold">{activeChat?.user.name}</h2>
                  <p className="mt-2 text-blue-400 animate-pulse font-medium">{t.calling}</p>
                </div>
              )}
              {localStream && (
                <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-6 right-6 w-36 h-52 sm:w-56 sm:h-80 bg-black rounded-2xl border-2 border-blue-600 object-cover shadow-2xl" />
              )}
            </div>
            <div className="mt-10 flex space-x-8">
              <button onClick={endCall} className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center shadow-2xl hover:bg-red-700 active:scale-90 transition-all">
                <PhoneOff size={32} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Area */}
      <div className={`${(activeChatId || activeView !== 'chats') ? 'hidden sm:flex' : 'flex'} w-full sm:w-80 flex-shrink-0 border-r flex flex-col z-10`} style={{ backgroundColor: colors.sidebarBg, borderColor: colors.border }}>
        <div className="p-3.5 flex items-center space-x-3">
          <Ripple onClick={() => setIsDrawerOpen(true)} className="p-2 rounded-full hover:bg-black/5">
            <Menu size={24} style={{ color: colors.secondaryText }} />
          </Ripple>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={18} />
            <input 
              className="w-full pl-10 pr-4 py-2.5 rounded-full text-sm outline-none transition-all focus:ring-2 focus:ring-blue-600 bg-black/5" 
              placeholder={t.search} 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {chats.filter(c => c.user.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .sort((a,b) => b.lastActivity - a.lastActivity)
            .map(chat => (
              <Ripple key={chat.id} onClick={() => handleChatSelect(chat.id)} className={`flex items-center px-4 py-3.5 ${activeChatId === chat.id ? 'bg-[#1e3a8a] text-white' : 'hover:bg-black/5'}`}>
                <Avatar id={chat.user.id} name={chat.user.name} showStatus status={chat.user.status} />
                <div className="ml-3 flex-1 overflow-hidden">
                  <div className="flex justify-between items-center">
                    <span className="font-bold truncate">{chat.user.name}</span>
                    <span className="text-[10px] opacity-50">{chat.lastActivity ? new Date(chat.lastActivity).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-sm opacity-60 truncate mr-2">{chat.lastMessage || chat.user.bio || ''}</div>
                    {chat.unreadCount > 0 && <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">{chat.unreadCount}</div>}
                  </div>
                </div>
              </Ripple>
            ))}
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col relative transition-all duration-300">
        {activeView === 'settings' ? (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
            <div className="w-full max-w-xl">
              <Ripple onClick={() => setActiveView('chats')} className="mb-8 inline-flex items-center space-x-2 text-blue-500 font-bold"><ArrowLeft size={20} /><span>{t.cancel}</span></Ripple>
              <div className="flex flex-col items-center mb-10">
                <Avatar id={self.id} name={self.name} size="xl" />
                {isEditingProfile ? (
                  <div className="mt-6 w-full space-y-4">
                    <input className="w-full p-3 rounded-xl border bg-transparent text-lg font-bold outline-none" style={{ borderColor: colors.border }} value={editName} onChange={e => setEditName(e.target.value)} />
                    <textarea className="w-full p-3 rounded-xl border bg-transparent outline-none resize-none" style={{ borderColor: colors.border }} value={editBio} onChange={e => setEditBio(e.target.value)} rows={3} />
                    <div className="flex space-x-3 pt-2">
                      <Ripple onClick={() => { setSelf({...self, name: editName, bio: editBio}); setIsEditingProfile(false); }} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-center">{t.save}</Ripple>
                      <Ripple onClick={() => setIsEditingProfile(false)} className="flex-1 py-3 bg-black/5 rounded-xl font-bold text-center">Cancel</Ripple>
                    </div>
                  </div>
                ) : (
                  <>
                    <h1 className="text-3xl font-bold mt-4">{self.name}</h1>
                    <p className="opacity-60 text-lg mt-1 text-center max-w-md">{self.bio}</p>
                    <p className="opacity-40 text-xs mt-2 font-mono">{self.id}</p>
                    <Ripple onClick={() => { setEditName(self.name); setEditBio(self.bio||''); setIsEditingProfile(true); }} className="mt-6 px-8 py-2.5 bg-blue-600 text-white rounded-full font-bold shadow-lg flex items-center space-x-2">
                      <Edit3 size={18} />
                      <span>{t.editProfile}</span>
                    </Ripple>
                  </>
                )}
              </div>
              <div className="space-y-4">
                <Ripple onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-5 rounded-2xl border flex justify-between items-center bg-black/5" style={{ borderColor: colors.border }}>
                  <div className="flex items-center space-x-4">
                    {theme === 'dark' ? <Moon size={22} /> : <Sun size={22} />}
                    <span className="font-bold">{t.nightMode}</span>
                  </div>
                  <span className="text-blue-500 font-bold text-sm uppercase tracking-widest">{theme}</span>
                </Ripple>
                <Ripple onClick={() => setLang(lang === 'en' ? 'ru' : 'en')} className="p-5 rounded-2xl border flex justify-between items-center bg-black/5" style={{ borderColor: colors.border }}>
                  <div className="flex items-center space-x-4">
                    <Smile size={22} />
                    <span className="font-bold">{t.language}</span>
                  </div>
                  <span className="text-blue-500 font-bold text-sm uppercase tracking-widest">{lang}</span>
                </Ripple>
              </div>
            </div>
          </div>
        ) : activeView === 'new-group' ? (
          <div className="flex-1 p-6 flex flex-col items-center">
            <div className="w-full max-w-xl">
               <Ripple onClick={() => setActiveView('chats')} className="mb-6 inline-flex items-center space-x-2 text-blue-500 font-bold"><ArrowLeft size={20} /><span>Back</span></Ripple>
               <h1 className="text-3xl font-bold mb-6">{t.newGroup}</h1>
               <input className="w-full p-4 rounded-2xl border mb-6 outline-none bg-transparent" style={{ borderColor: colors.border }} placeholder={t.placeholderGroupName} value={groupNameInput} onChange={e => setGroupNameInput(e.target.value)} />
               <div className="text-xs font-bold uppercase opacity-50 mb-3 px-2">Select Members</div>
               <div className="border rounded-2xl overflow-hidden mb-6" style={{ borderColor: colors.border }}>
                 {chats.filter(c => c.id !== GEMINI_USER.id).map(chat => (
                   <label key={chat.id} className="flex items-center px-4 py-3 hover:bg-black/5 cursor-pointer border-b last:border-0" style={{ borderColor: colors.border }}>
                     <input 
                       type="checkbox" 
                       className="w-5 h-5 accent-blue-600" 
                       checked={selectedGroupMembers.includes(chat.id)}
                       onChange={e => {
                         if (e.target.checked) setSelectedGroupMembers([...selectedGroupMembers, chat.id]);
                         else setSelectedGroupMembers(selectedGroupMembers.filter(id => id !== chat.id));
                       }}
                     />
                     <div className="ml-4 flex items-center flex-1">
                        <Avatar id={chat.id} name={chat.user.name} size="xs" />
                        <span className="ml-3 font-bold">{chat.user.name}</span>
                     </div>
                   </label>
                 ))}
                 {chats.filter(c => c.id !== GEMINI_USER.id).length === 0 && <div className="p-8 text-center opacity-40 italic">No contacts to add</div>}
               </div>
               <Ripple onClick={handleCreateGroup} className={`w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-center shadow-xl transition-all ${!groupNameInput.trim() ? 'opacity-50' : 'active:scale-95'}`}>
                 {t.create}
               </Ripple>
            </div>
          </div>
        ) : activeView === 'calls' ? (
           <div className="flex-1 p-6 flex flex-col items-center">
              <div className="w-full max-w-xl">
                 <Ripple onClick={() => setActiveView('chats')} className="mb-6 inline-flex items-center space-x-2 text-blue-500 font-bold"><ArrowLeft size={20} /><span>Back</span></Ripple>
                 <h1 className="text-3xl font-bold mb-8">{t.calls}</h1>
                 <div className="flex flex-col items-center justify-center py-20 opacity-30">
                    <Phone size={64} className="mb-6" />
                    <p className="text-xl font-bold">{t.noCalls}</p>
                 </div>
              </div>
           </div>
        ) : activeView === 'contacts' ? (
          <div className="flex-1 p-6 flex flex-col items-center justify-center">
            <div className="w-full max-w-md text-center">
              <Ripple onClick={() => setActiveView('chats')} className="mb-8 inline-flex items-center space-x-2 text-blue-500 font-bold self-start"><ArrowLeft size={20} /><span>Back</span></Ripple>
              <div className="w-20 h-20 bg-blue-600/10 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <UserPlus size={40} />
              </div>
              <h1 className="text-3xl font-bold mb-4">{t.addContact}</h1>
              <input className="w-full p-4 rounded-2xl border mb-2 outline-none bg-transparent" style={{ borderColor: colors.border }} placeholder={t.enterId} value={contactIdInput} onChange={e => setContactIdInput(e.target.value)} />
              {errorMsg && <div className="text-sm text-red-500 mb-4">{errorMsg}</div>}
              <Ripple onClick={handleAddContact} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-2xl transition-all active:scale-95">{t.addContact}</Ripple>
            </div>
          </div>
        ) : activeChatId ? (
          <>
            <div className="h-16 border-b flex items-center justify-between px-4 z-10" style={{ borderColor: colors.border, backgroundColor: colors.sidebarBg }}>
              <div className="flex items-center space-x-3">
                <Ripple onClick={() => setActiveChatId(null)} className="sm:hidden p-2 rounded-full hover:bg-black/5"><ArrowLeft size={24}/></Ripple>
                <div className="cursor-pointer flex items-center space-x-3" onClick={() => setIsProfileOpen(true)}>
                  <Avatar id={activeChatId} name={activeChat?.user.name || ''} size="sm" />
                  <div className="leading-tight">
                    <div className="font-bold text-[15px]">{activeChat?.user.name}</div>
                    <div className="text-[11px] opacity-60 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                      <span>E2E • {activeChat?.user.status}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-1 sm:space-x-3">
                <Ripple onClick={() => { setIsSearchingInChat(!isSearchingInChat); if(isSearchingInChat) setChatSearchQuery(''); }} className={`p-2.5 rounded-full transition-colors ${isSearchingInChat ? 'bg-blue-600 text-white' : 'hover:bg-black/5'}`}><Search size={22} /></Ripple>
                <Ripple onClick={() => startCall(false)} className="p-2.5 rounded-full hover:bg-black/5"><Phone size={22} /></Ripple>
                <Ripple onClick={() => startCall(true)} className="p-2.5 rounded-full hover:bg-black/5"><Video size={22} /></Ripple>
                <Ripple onClick={() => setIsProfileOpen(true)} className="p-2.5 rounded-full hover:bg-black/5"><Info size={22} /></Ripple>
                <Ripple onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2.5 rounded-full hover:bg-black/5"><MoreVertical size={22} /></Ripple>
                
                <AnimatePresence>
                  {isMenuOpen && (
                    <motion.div initial={{ opacity: 0, scale: 0.9, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -20 }} className="absolute top-14 right-4 w-52 shadow-2xl rounded-2xl z-40 border p-2 backdrop-blur-xl" style={{ backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)', borderColor: colors.border }}>
                      <Ripple onClick={() => { setMessagesMap({...messagesMap, [activeChatId]: []}); setIsMenuOpen(false); }} className="flex items-center space-x-3 p-3 rounded-xl hover:bg-black/5"><Trash size={18} /><span>{t.clearHistory}</span></Ripple>
                      <Ripple onClick={() => { setChats(chats.filter(c => c.id !== activeChatId)); setActiveChatId(null); }} className="flex items-center space-x-3 p-3 rounded-xl hover:bg-red-500/10 text-red-500"><UserMinus size={18} /><span>{t.deleteChat}</span></Ripple>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {isSearchingInChat && (
              <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="p-3 border-b bg-black/5 flex items-center" style={{ borderColor: colors.border }}>
                <Search size={18} className="opacity-40 mr-2 ml-2" />
                <input autoFocus className="flex-1 bg-transparent outline-none text-sm" placeholder="Search in chat..." value={chatSearchQuery} onChange={e => setChatSearchQuery(e.target.value)} />
                <Ripple onClick={() => {setIsSearchingInChat(false); setChatSearchQuery('');}} className="p-1 rounded-full"><X size={18}/></Ripple>
              </motion.div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col space-y-2 custom-scrollbar" style={{ backgroundImage: theme === 'dark' ? 'url("https://www.transparenttextures.com/patterns/cubes.png")' : 'none', backgroundBlendMode: 'overlay' }}>
              {filteredMessages.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] sm:max-w-[70%] p-3.5 rounded-2xl shadow-sm text-[15px] relative ${msg.isSelf ? 'rounded-tr-none text-white' : 'rounded-tl-none'}`} style={{ backgroundColor: msg.isSelf ? colors.bubbleSelf : colors.bubbleOther }}>
                    {msg.image && (
                       <div className="mb-2 rounded-lg overflow-hidden border border-white/10 shadow-inner">
                         <img src={msg.image} className="w-full h-auto max-h-[400px] object-contain cursor-zoom-in" onClick={() => window.open(msg.image, '_blank')} />
                       </div>
                    )}
                    {msg.text && <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>}
                    <div className="text-[10px] text-right opacity-50 mt-1 font-medium">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
              {filteredMessages.length === 0 && chatSearchQuery && <div className="text-center py-20 opacity-40 font-bold italic">No results found for "{chatSearchQuery}"</div>}
            </div>

            <div className="p-3 sm:p-5 flex items-end space-x-3 max-w-5xl mx-auto w-full">
              <div className="flex-1 bg-black/5 rounded-[22px] p-2.5 relative shadow-lg border border-white/5" style={{ backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.8)' : 'rgba(255, 255, 255, 0.8)' }}>
                {imagePreview && (
                  <div className="mb-3 relative w-24 h-24 rounded-2xl overflow-hidden border shadow-inner">
                    <img src={imagePreview} className="w-full h-full object-cover" />
                    <button onClick={() => setImagePreview(null)} className="absolute top-1 right-1 bg-black/60 p-1 text-white rounded-full hover:bg-black/90"><X size={14} /></button>
                  </div>
                )}
                <div className="flex items-end">
                  <div className="relative">
                    <Ripple onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)} className="p-2 opacity-60 hover:opacity-100 transition-opacity"><Smile size={24} /></Ripple>
                    <AnimatePresence>
                      {isEmojiPickerOpen && (
                        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:10 }} className="absolute bottom-14 left-0 w-64 shadow-2xl rounded-2xl p-3 grid grid-cols-5 gap-2 z-50 border backdrop-blur-2xl" style={{ backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)', borderColor: colors.border }}>
                          {COMMON_EMOJIS.map(e => <button key={e} onClick={() => { setInputText(inputText + e); setIsEmojiPickerOpen(false); }} className="p-2.5 hover:bg-black/5 rounded-xl text-2xl transition-transform active:scale-150">{e}</button>)}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <textarea 
                    className="flex-1 bg-transparent border-none outline-none p-2 resize-none max-h-40 text-[15px] custom-scrollbar" 
                    placeholder="Message" 
                    rows={1} 
                    value={inputText} 
                    onChange={e => {
                       setInputText(e.target.value);
                       e.target.style.height = 'auto';
                       e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                    }} 
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  />
                  <Ripple onClick={() => fileInputRef.current?.click()} className="p-2 opacity-60 hover:opacity-100 transition-opacity"><Paperclip size={24} /></Ripple>
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
                </div>
              </div>
              <Ripple onClick={sendMessage} className="w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center text-white shadow-2xl transition-all active:scale-90" style={{ backgroundColor: colors.accent }}>
                <Send size={24} />
              </Ripple>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center px-10">
            <div className="w-32 h-32 rounded-full flex items-center justify-center bg-[#0611ff]/10 mb-8">
               <MessageSquare size={64} style={{ color: colors.accent }} />
            </div>
            <p className="text-xl font-bold">{t.noChatSelected}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
