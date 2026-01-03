
import React from 'react';
import { AVATAR_GRADIENTS } from '../constants';

interface AvatarProps {
  id: string;
  name: string;
  image?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  status?: 'online' | 'offline';
}

export const Avatar: React.FC<AvatarProps> = ({ id, name, image, size = 'md', showStatus, status }) => {
  const sizeMap = {
    xs: 'w-8 h-8 text-xs',
    sm: 'w-10 h-10 text-sm',
    md: 'w-12 h-12 text-base',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-24 h-24 text-3xl',
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const getGradient = (userId: string) => {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
    return AVATAR_GRADIENTS[index];
  };

  const isGemini = id === 'gemini-ai-bot';

  return (
    <div className={`relative flex-shrink-0 ${sizeMap[size]}`}>
      {isGemini ? (
        <div className="w-full h-full rounded-full flex items-center justify-center bg-[#1A1A1A] p-[15%]">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" fill="url(#gemini-gradient)" />
            <defs>
              <linearGradient id="gemini-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                <stop stopColor="#4E8CFF" />
                <stop offset="0.5" stopColor="#B673F8" />
                <stop offset="1" stopColor="#FF9090" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      ) : image ? (
        <img src={image} alt={name} className="w-full h-full rounded-full object-cover" />
      ) : (
        <div className={`w-full h-full rounded-full flex items-center justify-center text-white font-medium bg-gradient-to-br ${getGradient(id)}`}>
          {getInitials(name)}
        </div>
      )}
      {showStatus && status === 'online' && (
        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-[#17212b] rounded-full"></div>
      )}
    </div>
  );
};
