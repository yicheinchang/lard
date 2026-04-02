"use client";

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Loader2, Download } from 'lucide-react';

interface DocumentPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fileUrl: string | null;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  isOpen,
  onClose,
  title,
  fileUrl,
}) => {
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && (fileUrl?.endsWith('.md') || fileUrl?.endsWith('.txt'))) {
      setLoading(true);
      fetch(`http://localhost:8000${fileUrl}`)
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
  const fullUrl = `http://localhost:8000${fileUrl}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div
        className="glass bg-[#0a0a0f] w-full max-w-5xl h-full max-h-[90vh] rounded-2xl shadow-2xl relative animate-slide-up flex flex-col overflow-hidden border-violet-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white/90 truncate mr-4">{title}</h2>
          <div className="flex items-center gap-2">
            <a
              href={fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition flex items-center gap-1 text-sm bg-white/5"
            >
              <Download className="w-4 h-4" /> Download
            </a>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-black/50 overflow-hidden relative">
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
              <div className="p-8 text-center text-gray-400">
                <p>Your browser does not support inline PDF viewing.</p>
                <a href={fullUrl} target="_blank" className="text-violet-400 hover:underline mt-2 inline-block">Download the PDF instead</a>
              </div>
            </object>
          ) : markdownContent !== null ? (
            <div className="w-full h-full overflow-y-auto p-6 md:p-10 custom-scrollbar">
              <div className="prose prose-invert prose-violet max-w-4xl mx-auto">
                <ReactMarkdown>{markdownContent}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Unsupported file type preview.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
