import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Loader2, Sparkles, User } from 'lucide-react';
import api from '../lib/api';
import { Portal } from './Portal';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export const ChatAssistant: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  jobId?: number; // Optional context filter
}> = ({ isOpen, onClose, jobId }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I am your AI Job Application Assistant. Ask me anything about your saved jobs, uploaded resumes, or application strategies.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isAiReady, setIsAiReady] = useState<boolean | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, isInitializing]);

  // AI Readiness Polling
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        const res = await api.get('/ai/status');
        if (res.data.ready) {
          setIsAiReady(true);
          setIsInitializing(false);
          clearInterval(pollInterval);
        } else {
          setIsAiReady(false);
          setIsInitializing(true);
        }
      } catch (err) {
        console.error("Failed to check AI status:", err);
      }
    };

    if (isOpen && isAiReady !== true) {
      checkStatus();
      pollInterval = setInterval(checkStatus, 5000);
    }

    return () => clearInterval(pollInterval);
  }, [isOpen, isAiReady]);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await api.post('/ai/chat', { 
        message: userMsg.content,
        ...(jobId ? { job_id: jobId } : {})
      });
      
      const replyContent = response.data.error 
        ? `Error: ${response.data.error}` 
        : response.data.reply;

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: replyContent
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${err.message}`
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <Portal>
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-[var(--bg)] backdrop-blur-xl border-l border-[var(--border-color)] shadow-2xl z-50 flex flex-col pt-[72px] sm:pt-0 animate-slide-left">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-violet-600/10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="bg-violet-500/20 p-2 rounded-lg text-violet-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--fg)]">AI Assistant</h3>
              <p className="text-xs text-[var(--fg-muted)]">{jobId ? 'Context: Current Job' : 'Context: All Applications'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-violet-600' : 'bg-[var(--surface-alt)] border border-[var(--border-color)]'}`}>
                {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-violet-400" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl p-3 text-sm ${msg.role === 'user' ? 'bg-violet-600/20 text-[var(--fg)]' : 'bg-[var(--surface-hover)] text-[var(--fg-muted)] border border-[var(--border-color)]'}`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}
          {isInitializing && (
            <div className="flex gap-3">
               <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[var(--surface-alt)] border border-[var(--border-color)] animate-pulse">
                <Bot className="w-4 h-4 text-violet-400" />
              </div>
              <div className="bg-violet-600/10 rounded-2xl p-3 text-xs text-violet-500 border border-violet-500/20 italic">
                Initializing AI libraries... First start can take 5-10 minutes. I&apos;ll be ready shortly!
              </div>
            </div>
          )}
          {isTyping && (
            <div className="flex gap-3">
               <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[var(--surface-alt)] border border-[var(--border-color)]">
                <Bot className="w-4 h-4 text-violet-400" />
              </div>
              <div className="bg-[var(--surface-hover)] rounded-2xl p-4 flex items-center gap-1">
                <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg)] shrink-0">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about your applications..."
              className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-xl pl-4 pr-12 py-3 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 transition-colors placeholder-[var(--fg-subtle)]"
              disabled={isTyping}
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="absolute right-2 p-2 text-violet-400 hover:text-violet-500 disabled:opacity-50 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <div className="text-center mt-2 text-[10px] text-[var(--fg-subtle)]">
            Powered by LangGraph & RAG
          </div>
        </div>
      </div>
    </Portal>
  );
};
