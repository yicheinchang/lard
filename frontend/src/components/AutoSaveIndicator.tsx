import React from 'react';
import { Loader2, CheckCircle2, Cloud } from 'lucide-react';

interface AutoSaveIndicatorProps {
  status: 'idle' | 'saving' | 'vectorizing' | 'saved' | 'error';
  error?: string | null;
}

export const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({ status, error }) => {
  if (status === 'idle') return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-500/5 border border-violet-500/10 transition-all duration-300 animate-fade-in truncate max-w-[150px]">
      {status === 'saving' || status === 'vectorizing' ? (
        <Loader2 className="w-3 h-3 text-violet-400 animate-spin shrink-0" />
      ) : status === 'saved' ? (
        <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
      ) : (
        <Cloud className="w-3 h-3 text-red-400 shrink-0" />
      )}
      
      <span className="text-[10px] font-medium text-gray-400 truncate">
        {status === 'saving' ? 'Saving...' : 
         status === 'vectorizing' ? 'Vectorizing...' : 
         status === 'saved' ? 'Synced' : 
         'Sync Error'}
      </span>
      
      {error && (
        <div className="group relative ml-1">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-2 bg-red-900 border border-red-500 rounded text-[9px] text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            {error}
          </div>
        </div>
      )}
    </div>
  );
};
