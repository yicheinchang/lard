"use client";

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  onConfirm: (date?: string, file?: File | null) => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger' | 'success';
  showDateInput?: boolean;
  dateLabel?: string;
  showFileUpload?: boolean;
  fileUploadLabel?: string;
  accept?: string;
  initialDate?: string;
}

const variantStyles = {
  default: {
    button: 'bg-violet-600 hover:bg-violet-500 text-white',
    icon: <AlertTriangle className="w-6 h-6 text-violet-400" />,
    border: 'border-violet-500/30',
    glow: 'shadow-violet-500/10',
  },
  danger: {
    button: 'bg-red-600 hover:bg-red-500 text-white',
    icon: <AlertTriangle className="w-6 h-6 text-red-400" />,
    border: 'border-red-500/30',
    glow: 'shadow-red-500/10',
  },
  success: {
    button: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" />,
    border: 'border-emerald-500/30',
    glow: 'shadow-emerald-500/10',
  },
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  showDateInput = false,
  dateLabel = 'Date',
  showFileUpload = false,
  fileUploadLabel = 'Upload File',
  accept = '*/*',
  initialDate = '',
}) => {
  const [date, setDate] = useState(initialDate);
  const [file, setFile] = useState<File | null>(null);
  
  React.useEffect(() => {
    if (isOpen && initialDate) {
      setDate(initialDate);
    } else if (isOpen && showDateInput && !date) {
      setDate(new Date().toISOString().substring(0, 10)); // Default to today
    }
  }, [isOpen, initialDate, showDateInput, date]);
  const styles = variantStyles[variant];

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(showDateInput ? date : undefined, file);
    setDate('');
    setFile(null);
  };

  const handleCancel = () => {
    setDate('');
    setFile(null);
    onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
    >
      <div className={`glass bg-[#0f0f18] w-full max-w-md rounded-2xl p-6 shadow-2xl ${styles.glow} animate-slide-up ${styles.border}`}>
        <div className="flex items-start gap-4">
          <div className="mt-0.5 shrink-0">
            {styles.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
            <div className="text-sm text-gray-400 leading-relaxed">{message}</div>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 hover:bg-white/10 rounded-full text-gray-500 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {showDateInput && (
          <div className="mt-4 ml-10">
            <label className="block text-xs text-gray-400 mb-1.5">{dateLabel}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500 style-date"
            />
          </div>
        )}

        {showFileUpload && (
          <div className="mt-4 ml-10">
            <label className="block text-xs text-gray-400 mb-1.5">{fileUploadLabel}</label>
            <input
              type="file"
              accept={accept}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-violet-500/10 file:text-violet-400 hover:file:bg-violet-500/20 transition-all cursor-pointer border border-white/10 rounded-xl p-1 bg-black/40"
            />
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors font-medium text-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-5 py-2 rounded-lg font-medium text-sm transition-all hover:scale-105 active:scale-95 ${styles.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
