
import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface VoicePlayerProps {
  base64Data: string;
  duration?: number;
  isSelf: boolean;
}

export const VoicePlayer: React.FC<VoicePlayerProps> = ({ base64Data, duration, isSelf }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.onended = () => {
        setIsPlaying(false);
        setProgress(0);
      };
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current) {
          setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
        }
      };
    }
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="flex items-center space-x-3 py-1 min-w-[180px]">
      <button 
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
          isSelf ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-[#3390ec]/10 hover:bg-[#3390ec]/20 text-[#3390ec]'
        }`}
      >
        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} className="ml-1" fill="currentColor" />}
      </button>
      
      <div className="flex-1 space-y-1">
        <div className="relative h-1 w-full bg-black/10 rounded-full overflow-hidden">
          <div 
            className={`absolute top-0 left-0 h-full transition-all duration-100 ${isSelf ? 'bg-white' : 'bg-[#3390ec]'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={`text-[10px] ${isSelf ? 'text-white/70' : 'text-[#708499]'}`}>
          {duration ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '0:00'}
        </div>
      </div>

      <audio ref={audioRef} src={base64Data} className="hidden" />
    </div>
  );
};
