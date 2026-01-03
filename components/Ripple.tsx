
import React, { useState, useLayoutEffect, useCallback } from 'react';

interface RippleProps {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  // Separate handler for visual feedback to avoid interrupting click events
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export const Ripple: React.FC<RippleProps> = ({ children, className = '', onClick, onPointerDown: externalOnPointerDown }) => {
  const [ripples, setRipples] = useState<{ x: number; y: number; size: number; id: number }[]>([]);

  const createRipple = useCallback((e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const newRipple = { x, y, size, id: Date.now() };

    setRipples((prev) => [...prev, newRipple]);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (externalOnPointerDown) externalOnPointerDown(e);
    createRipple(e);
  };

  useLayoutEffect(() => {
    if (ripples.length > 0) {
      const timer = setTimeout(() => {
        setRipples((prev) => prev.slice(1));
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [ripples]);

  // Handle Enter/Space for accessibility
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && onClick) {
      e.preventDefault();
      onClick(e as any);
    }
  };

  return (
    <div 
      className={`ripple cursor-pointer select-none transition-all duration-200 active:opacity-80 focus:outline-none ${className}`} 
      onPointerDown={handlePointerDown}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {children}
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="ripple-effect"
          style={{
            top: ripple.y,
            left: ripple.x,
            width: ripple.size,
            height: ripple.size,
          }}
        />
      ))}
    </div>
  );
};
