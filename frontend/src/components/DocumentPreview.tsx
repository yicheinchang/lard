"use client";

import React from 'react';
import { X, Download } from 'lucide-react';
import { Portal } from './Portal';
import { DocumentViewer } from './DocumentViewer';

interface DocumentPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fileUrl: string | null;
  theme: 'dark' | 'light';
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  isOpen,
  onClose,
  title,
  fileUrl,
  theme,
}) => {
  if (!isOpen || !fileUrl) return null;

  const fullUrl = `/api/proxy${fileUrl}`;

  return (
    <Portal>
      <div 
        data-theme={theme}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-md animate-fade-in" 
        onClick={onClose}
      >
        <div
          className="glass bg-[var(--bg)] w-full max-w-5xl h-full max-h-[90vh] rounded-2xl shadow-2xl relative animate-slide-up flex flex-col overflow-hidden border-[var(--border-color)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center p-4 border-b border-[var(--border-color)] bg-[var(--surface)] shrink-0">
            <h2 className="text-lg font-semibold text-[var(--fg)] truncate mr-4">{title}</h2>
            <div className="flex items-center gap-2">
              <a
                href={fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="p-2 hover:bg-[var(--surface-hover)] rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg)] transition flex items-center gap-1 text-sm bg-[var(--surface-hover)]/40"
              >
                <Download className="w-4 h-4" /> Download
              </a>
              <button onClick={onClose} className="p-2 hover:bg-[var(--surface-hover)] rounded-full text-[var(--fg-muted)] hover:text-[var(--fg)] transition">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 bg-[var(--input-bg)] overflow-hidden relative">
            <DocumentViewer fileUrl={fileUrl} title={title} theme={theme} />
          </div>
        </div>
      </div>
    </Portal>
  );
};
