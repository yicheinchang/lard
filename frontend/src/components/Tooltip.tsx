"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Portal } from './Portal';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ 
  content, 
  children, 
  delay = 200,
  className = ""
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Position tooltip below the trigger
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      });
    }
  };

  const handleMouseEnter = () => {
    updatePosition();
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Viewport-aware horizontal adjustment
  const getTooltipStyle = () => {
    const style: React.CSSProperties = {
      position: 'absolute',
      top: `${coords.top + 6}px`,
      left: `${coords.left}px`,
      zIndex: 9999,
    };

    // Ensure it doesn't overflow the right edge of the viewport
    if (typeof window !== 'undefined') {
      const maxWidth = 280;
      if (coords.left + maxWidth > window.innerWidth - 20) {
        style.left = undefined;
        style.right = '20px';
      }
    }

    return style;
  };

  return (
    <div 
      ref={triggerRef} 
      onMouseEnter={handleMouseEnter} 
      onMouseLeave={handleMouseLeave}
      className={`inline-block ${className}`}
    >
      {children}
      {isVisible && content && (
        <Portal>
          <div 
            style={getTooltipStyle()}
            className="animate-fade-in pointer-events-none"
          >
            <div className="tooltip-box text-[11px] px-2.5 py-1.5 rounded-lg shadow-2xl whitespace-normal break-words max-w-[280px]">
              {content}
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
};
