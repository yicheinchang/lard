"use client";

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Portal } from './Portal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  onConfirm: (date?: string, file?: File | null, text?: string) => void;
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
  hideCancel?: boolean;
  showTextInput?: boolean;
  textLabel?: string;
  initialText?: string;
  textOptions?: string[];
}

const variantStyles = {
  default: {
    button: 'bg-primary hover:bg-primary-hover text-white',
    icon: <AlertTriangle className="w-6 h-6 text-violet-400" />,
    border: 'border-primary/30',
    glow: 'shadow-primary/10',
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
  hideCancel = false,
  showTextInput = false,
  textLabel = 'Text Input',
  initialText = '',
  textOptions = [],
}) => {
  const [date, setDate] = useState(initialDate);
  const [file, setFile] = useState<File | null>(null);
  const [textValue, setTextValue] = useState(initialText);
  
  React.useEffect(() => {
    if (isOpen && initialDate) {
      setDate(initialDate);
    } else if (isOpen && showDateInput && !date) {
      setDate(new Date().toISOString().substring(0, 10)); // Default to today
    }
    if (isOpen && initialText) {
      setTextValue(initialText);
    }
  }, [isOpen, initialDate, showDateInput, date, initialText]);
  const styles = variantStyles[variant];

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(showDateInput ? date : undefined, file, showTextInput ? textValue : undefined);
    setDate('');
    setFile(null);
    setTextValue('');
  };

  const handleCancel = () => {
    setDate('');
    setFile(null);
    setTextValue('');
    onCancel();
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
      >
        <div className={`glass bg-[var(--bg)] w-full max-w-md rounded-2xl p-6 shadow-2xl ${styles.glow} animate-slide-up ${styles.border}`}>
          {/* ... existing content ... */}
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

          {showTextInput && (
            <div className="mt-6 ml-10 relative">
              <label className="block text-xs text-[#a7a7b8] mb-1.5">{textLabel}</label>
              <input
                type="text"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                list={textOptions && textOptions.length > 0 ? "confirm-text-options" : undefined}
                className="w-full bg-[var(--input-bg)] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500 text-input-dropdown"
                placeholder="e.g. Phone Screen"
              />
              {textOptions && textOptions.length > 0 && (
                <datalist id="confirm-text-options">
                  {textOptions.map((opt, idx) => (
                    <option key={idx} value={opt} />
                  ))}
                </datalist>
              )}
            </div>
          )}

          {showDateInput && (
            <div className="mt-4 ml-10">
              <label className="block text-xs text-[#a7a7b8] mb-1.5">{dateLabel}</label>
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
            {!hideCancel && (
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors font-medium text-sm"
              >
                {cancelLabel}
              </button>
            )}
            <button
              onClick={handleConfirm}
              className={`px-5 py-2 rounded-lg font-medium text-sm transition-all hover:scale-105 active:scale-95 ${styles.button}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};
