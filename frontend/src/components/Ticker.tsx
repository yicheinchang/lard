import React, { useEffect, useRef, useState } from 'react';

interface TickerProps {
  text: string;
}

export const Ticker: React.FC<TickerProps> = ({ text }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    if (containerRef.current && contentRef.current) {
      setShouldScroll(contentRef.current.offsetWidth > containerRef.current.offsetWidth);
    }
  }, [text]);

  if (!shouldScroll) {
    return (
      <div ref={containerRef} className="w-full truncate text-center text-xs sm:text-sm font-medium">
        <div ref={contentRef} className="inline-block px-1">{text}</div>
      </div>
    );
  }

  // Animation duration based on text length
  const duration = Math.max(5, text.length * 0.15);

  return (
    <div 
      ref={containerRef} 
      className="w-full overflow-hidden whitespace-nowrap text-xs sm:text-sm font-medium relative flex items-center h-5"
    >
      <div 
        ref={contentRef}
        className="inline-block px-4"
        style={{ 
          animation: `marquee ${duration}s linear infinite`,
          paddingRight: '2rem'
        }}
      >
        {text}
      </div>
      <div 
        className="inline-block px-4"
        style={{ 
          animation: `marquee ${duration}s linear infinite`,
          paddingRight: '2rem'
        }}
      >
        {text}
      </div>
      
      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
};
