import React, { useEffect } from 'react';
import { Loader2, CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import { Portal } from './Portal';

interface ProcessingOverlayProps {
  isOpen: boolean;
  tasks: Array<{
    id: string;
    label: string;
    status: 'waiting' | 'loading' | 'completed' | 'error';
  }>;
  title?: string;
  onClose?: () => void;
  error?: string | null;
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ 
  isOpen, 
  tasks, 
  title = "Processing Document", 
  onClose,
  error 
}) => {
  const hasError = tasks.some(t => t.status === 'error') || !!error;
  const isCompleted = tasks.every(t => t.status === 'completed') && !hasError;

  // Auto-close on success
  useEffect(() => {
    if (isOpen && isCompleted && !hasError && onClose) {
      const timer = setTimeout(() => {
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isCompleted, hasError, onClose]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
        <div className="bg-[var(--bg)] border border-[var(--border-color)] w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-scale-up glass relative overflow-hidden">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">
              {hasError ? (
                <AlertCircle className="w-6 h-6 text-red-400" />
              ) : isCompleted ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : (
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              )}
            </div>
            <h2 className="text-xl font-bold text-[var(--fg)] mb-1">{title}</h2>
            <p className="text-xs text-[var(--fg-muted)]">Please wait while we process your document</p>
          </div>

          {/* Task List */}
          <div className="space-y-3 mb-6">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 py-1">
                <div className="shrink-0">
                  {task.status === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : task.status === 'loading' ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  ) : task.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <Circle className="w-4 h-4 text-[var(--fg-subtle)]" />
                  )}
                </div>
                <span className={`text-sm transition-colors duration-300 ${
                  task.status === 'completed' ? 'text-[var(--fg-muted)] line-through decoration-violet-500/30' :
                  task.status === 'loading' ? 'text-primary font-medium' :
                  task.status === 'error' ? 'text-red-400' :
                  'text-[var(--fg-subtle)]'
                }`}>
                  {task.label}
                </span>
              </div>
            ))}
          </div>

          {/* Error Detail */}
          {error && (
            <div className="mb-6 p-3 bg-red-400/10 border border-red-400/20 rounded-lg text-[10px] text-red-400 break-words leading-relaxed animate-fade-in">
              <span className="font-bold uppercase mr-1">Error:</span> {error}
            </div>
          )}

          {/* Footer Actions (Only for Error - Success auto-closes) */}
          {hasError && (
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg bg-red-400/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </Portal>
  );
};
