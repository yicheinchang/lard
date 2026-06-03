"use client";

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, FileText, Download } from 'lucide-react';

interface DocumentViewerProps {
  fileUrl: string | null;
  title: string;
  theme: 'dark' | 'light';
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  fileUrl,
  title,
  theme,
}) => {
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (fileUrl && (fileUrl.toLowerCase().endsWith('.md') || fileUrl.toLowerCase().endsWith('.txt'))) {
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
  }, [fileUrl]);

  if (!fileUrl) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--fg-subtle)]">
        No document selected.
      </div>
    );
  }

  const lowercaseUrl = fileUrl.toLowerCase();
  const isPdf = lowercaseUrl.endsWith('.pdf');
  const isHtml = lowercaseUrl.endsWith('.html') || lowercaseUrl.endsWith('.htm');
  const fullUrl = `/api/proxy${fileUrl}`;

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[var(--input-bg)]">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  if (isPdf) {
    return (
      <object
        data={fullUrl}
        type="application/pdf"
        className="w-full h-full border-none bg-white"
      >
        <iframe src={fullUrl} className="w-full h-full border-none bg-white" />
      </object>
    );
  }

  if (isHtml) {
    return (
      <iframe src={fullUrl} className="w-full h-full border-none bg-white" />
    );
  }

  if (markdownContent !== null) {
    return (
      <div className="w-full h-full overflow-y-auto p-6 md:p-10 custom-scrollbar bg-[var(--input-bg)]">
        <div className={`prose ${theme === 'dark' ? 'prose-invert' : ''} prose-violet max-w-4xl mx-auto break-words`}>
          <ReactMarkdown>{markdownContent}</ReactMarkdown>
        </div>
      </div>
    );
  }

  // Fallback for docx and unsupported files
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center max-w-md mx-auto">
      <div className="p-4 bg-violet-500/10 text-violet-500 rounded-full mb-4">
        <FileText className="w-12 h-12" />
      </div>
      <h4 className="text-lg font-bold text-[var(--fg)] mb-2">
        {lowercaseUrl.endsWith('.docx') ? 'Word Document Preview' : 'Preview Not Supported'}
      </h4>
      <p className="text-sm text-[var(--fg-muted)] mb-6">
        {lowercaseUrl.endsWith('.docx') 
          ? 'Inline preview for Microsoft Word (.docx) documents is not supported in the browser. You can download the file to view it.'
          : 'Preview is not supported for this file type. You can download the file directly.'}
      </p>
      <a
        href={fullUrl}
        target="_blank"
        rel="noopener noreferrer"
        download
        className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold shadow-lg shadow-violet-500/20 transition-all active:scale-95 cursor-pointer"
      >
        <Download className="w-4 h-4" />
        <span>Download File</span>
      </a>
    </div>
  );
};
