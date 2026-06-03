"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const [tooltipWidth, setTooltipWidth] = useState<number>(0);
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

  // Reset tooltip width when hidden
  useEffect(() => {
    if (!isVisible) {
      setTooltipWidth(0);
    }
  }, [isVisible]);

  // Callback ref to measure node width when it is dynamically mounted to the DOM by Portal
  const tooltipCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.width !== tooltipWidth) {
        setTooltipWidth(rect.width);
      }
    }
  }, [tooltipWidth]);

  // Viewport-aware horizontal adjustment
  const getTooltipStyle = () => {
    const style: React.CSSProperties = {
      position: 'absolute',
      top: `${coords.top + 6}px`,
      left: `${coords.left}px`,
      zIndex: 9999,
      visibility: tooltipWidth > 0 ? 'visible' : 'hidden',
    };

    // Ensure it doesn't overflow the right edge of the viewport
    if (typeof window !== 'undefined') {
      const widthToUse = tooltipWidth || 280;
      const rightEdge = coords.left + widthToUse;
      const viewportRightEdge = window.scrollX + window.innerWidth;
      
      if (rightEdge > viewportRightEdge - 20) {
        const adjustedLeft = viewportRightEdge - widthToUse - 20;
        // Don't shift it past the left edge of the viewport plus a 10px buffer
        style.left = `${Math.max(window.scrollX + 10, adjustedLeft)}px`;
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
            ref={tooltipCallbackRef}
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
