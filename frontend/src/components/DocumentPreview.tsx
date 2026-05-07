"use client";

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Loader2, Download } from 'lucide-react';
import { Portal } from './Portal';

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
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && (fileUrl?.endsWith('.md') || fileUrl?.endsWith('.txt'))) {
      setLoading(true);
      fetch(`/api/proxy${fileUrl}`)
        .then(res => res.text())
        .then(text => {
          setMarkdownContent(text);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setMarkdownContent('Failed to load content.');
          setLoading(false);
        });
    } else {
      setMarkdownContent(null);
    }
  }, [isOpen, fileUrl]);

  if (!isOpen || !fileUrl) return null;

  const isPdf = fileUrl.toLowerCase().endsWith('.pdf');
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
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              </div>
            ) : isPdf ? (
              <object
                data={fullUrl}
                type="application/pdf"
                className="w-full h-full border-none"
              >
                <div className="p-8 text-center text-[var(--fg-muted)]">
                  <p>Your browser does not support inline PDF viewing.</p>
                  <a href={fullUrl} target="_blank" className="text-violet-400 hover:underline mt-2 inline-block">Download the PDF instead</a>
                </div>
              </object>
            ) : markdownContent !== null ? (
              <div className="w-full h-full overflow-y-auto p-6 md:p-10 custom-scrollbar">
                <div className={`prose ${theme === 'dark' ? 'prose-invert' : ''} prose-violet max-w-4xl mx-auto break-words`}>
                  <ReactMarkdown>{markdownContent}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--fg-subtle)]">
                Unsupported file type preview.
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
};
