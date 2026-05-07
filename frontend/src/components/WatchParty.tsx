import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { X, Play, Pause, Send, MessageSquare } from 'lucide-react';
import api from '../api/api';

interface Message {
  user: { name: string };
  message: string;
  timestamp: string;
}

interface WatchPartyProps {
  fileId: string;
  fileName: string;
  workspaceId: string;
  user: { name: string } | null;
  onClose: () => void;
}

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

export const WatchParty: React.FC<WatchPartyProps> = ({ fileId, fileName, workspaceId, user, onClose }) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const isInternalChange = useRef(false);

  useEffect(() => {
    // 1. Load Video
    const loadVideo = async () => {
      try {
        const response = await api.get(`/files/${fileId}/download`, {
          responseType: 'blob'
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        setVideoUrl(url);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load video:', err);
      }
    };
    loadVideo();

    // 2. Connect Socket
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.emit('join-workspace', workspaceId);

    socket.on('video-update', ({ event, data }) => {
      if (!videoRef.current) return;
      isInternalChange.current = true;
      
      if (event === 'play') videoRef.current.play();
      if (event === 'pause') videoRef.current.pause();
      if (event === 'seek') videoRef.current.currentTime = data.time;
      
      setTimeout(() => { isInternalChange.current = false; }, 50);
    });

    socket.on('receive-message', (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
      if (videoUrl) window.URL.revokeObjectURL(videoUrl);
    };
  }, [fileId, workspaceId]);

  const handleVideoEvent = (event: 'play' | 'pause' | 'seek') => {
    if (isInternalChange.current || !socketRef.current) return;
    
    socketRef.current.emit('video-event', {
      workspaceId,
      event,
      data: { time: videoRef.current?.currentTime || 0 }
    });
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !socketRef.current) return;

    socketRef.current.emit('send-message', {
      workspaceId,
      message: newMessage,
      user: { name: user?.name || 'Guest' }
    });
    setNewMessage('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col md:flex-row">
      {/* Video Side */}
      <div className="flex-1 relative bg-black flex items-center justify-center">
        <button 
          onClick={onClose}
          className="absolute top-4 left-4 z-10 bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition"
        >
          <X size={24} />
        </button>

        {loading ? (
          <div className="text-white flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
            <p>Decrypting Secure Stream...</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={videoUrl || ''}
            className="w-full max-h-full"
            controls
            onPlay={() => handleVideoEvent('play')}
            onPause={() => handleVideoEvent('pause')}
            onSeeked={() => handleVideoEvent('seek')}
          />
        )}
        
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 px-4 py-1 rounded-full text-white text-sm">
          Watching: {fileName}
        </div>
      </div>

      {/* Chat Side */}
      <div className="w-full md:w-80 bg-white flex flex-col border-l border-slate-200">
        <div className="p-4 border-b border-slate-200 flex items-center bg-slate-50">
          <MessageSquare className="text-blue-600 mr-2" size={20} />
          <h3 className="font-bold text-slate-800">Watch Party Chat</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.user.name === user?.name ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] text-slate-500 mb-1">{msg.user.name}</span>
              <div className={`px-3 py-2 rounded-2xl text-sm ${
                msg.user.name === user?.name ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none'
              }`}>
                {msg.message}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="text-center text-slate-400 text-sm mt-10">
              No messages yet. Say hi!
            </div>
          )}
        </div>

        <form onSubmit={sendMessage} className="p-4 border-t border-slate-200 bg-slate-50">
          <div className="relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Send a message..."
              className="w-full pl-4 pr-10 py-2 border border-slate-300 rounded-full focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <button
              type="submit"
              className="absolute right-2 top-1.5 text-blue-600 hover:text-blue-700"
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
