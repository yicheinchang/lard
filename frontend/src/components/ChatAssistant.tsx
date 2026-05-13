import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Loader2, Sparkles, User, History, Plus, ChevronLeft } from 'lucide-react';
import api from '../lib/api';
import { Portal } from './Portal';
import { useSettings } from '../lib/SettingsContext';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
}

export const ChatAssistant: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  jobId?: number; // Optional context filter
}> = ({ isOpen, onClose, jobId }) => {
  const { settings } = useSettings();
  
  const resolvedGlobalTheme = React.useMemo(() => {
    if (settings?.theme === 'system') {
      if (typeof window !== 'undefined') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'dark';
    }
    return settings?.theme || 'dark';
  }, [settings?.theme]);

  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isAiReady, setIsAiReady] = useState<boolean | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [width, setWidth] = useState(400);
  const isResizing = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize Session ID
  useEffect(() => {
    const savedSessionId = localStorage.getItem('ai_assistant_session_id');
    if (savedSessionId) {
      setSessionId(savedSessionId);
      loadSession(savedSessionId);
    } else {
      startNewChat();
    }
  }, []);

  const startNewChat = () => {
    const newId = crypto.randomUUID();
    setSessionId(newId);
    localStorage.setItem('ai_assistant_session_id', newId);
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I am your AI Job Application Assistant. Ask me anything about your saved jobs, uploaded resumes, or application strategies.'
    }]);
    setView('chat');
  };

  const fetchSessions = async () => {
    try {
      const res = await api.get('/ai/sessions');
      setSessions(res.data);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  };

  const loadSession = async (id: string) => {
    try {
      setIsTyping(true);
      const res = await api.get(`/ai/chat/${id}`);
      setSessionId(id);
      localStorage.setItem('ai_assistant_session_id', id);
      
      if (res.data.history && res.data.history.length > 0) {
        setMessages(res.data.history.map((m: any, idx: number) => ({
          id: `hist-${idx}`,
          role: m.role,
          content: m.content,
          reasoning: m.reasoning
        })));
      } else {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: 'Hello! This is a new conversation. How can I help you today?'
        }]);
      }
      setView('chat');
    } catch (err) {
      console.error("Failed to load session:", err);
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => {
    if (view === 'history') {
      fetchSessions();
    }
  }, [view]);

  // Load persisted width
  useEffect(() => {
    const savedWidth = localStorage.getItem('chat_assistant_width');
    if (savedWidth) setWidth(parseInt(savedWidth, 10));
  }, []);

  // Resize logic
  const startResizing = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
  }, []);

  const stopResizing = React.useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'default';
  }, []);

  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= 300 && newWidth <= window.innerWidth * 0.8) {
      setWidth(newWidth);
      localStorage.setItem('chat_assistant_width', newWidth.toString());
    }
  }, []);

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
        session_id: sessionId,
        ...(jobId ? { job_id: jobId } : {})
      });
      
      const { reply: replyContent, reasoning: replyReasoning, error: replyError } = response.data;
      
      const finalContent = replyError ? `Error: ${replyError}` : replyContent;

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: finalContent,
        reasoning: replyReasoning
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
    <>
    <Portal>
      <div 
        style={{ width: typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : `${width}px` }}
        className="fixed right-0 top-0 bottom-0 bg-[var(--bg)] backdrop-blur-xl border-l border-[var(--border-color)] shadow-2xl z-50 flex flex-col pt-[72px] sm:pt-0 animate-slide-left"
      >
        {/* Resize Handle */}
        <div 
          onMouseDown={startResizing}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-violet-500/30 active:bg-violet-500/50 transition-colors z-[60] hidden sm:block"
          title="Drag to resize"
        />
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-violet-600/10 shrink-0">
          <div className="flex items-center gap-2">
            {view === 'history' ? (
              <button 
                onClick={() => setView('chat')}
                className="p-1.5 hover:bg-[var(--surface-hover)] rounded-lg text-[var(--fg-subtle)] transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="bg-violet-500/20 p-2 rounded-lg text-violet-400">
                <Sparkles className="w-5 h-5" />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-[var(--fg)]">
                {view === 'chat' ? 'AI Assistant' : 'Chat History'}
              </h3>
              <p className="text-xs text-[var(--fg-muted)]">
                {view === 'history' ? `${sessions.length} sessions saved` : (jobId ? 'Context: Current Job' : 'Context: All Applications')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {view === 'chat' && (
              <>
                <button 
                  onClick={startNewChat}
                  title="New Chat"
                  className="p-2 text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setView('history')}
                  title="View History"
                  className="p-2 text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
                >
                  <History className="w-5 h-5" />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {view === 'chat' ? (
          <>
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-violet-600' : 'bg-[var(--surface-alt)] border border-[var(--border-color)]'}`}>
                    {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-violet-400" />}
                  </div>
                  <div className={`max-w-[90%] rounded-2xl overflow-hidden flex flex-col ${
                    msg.role === 'user' 
                      ? 'bg-violet-600/20 text-[var(--fg)]' 
                      : 'bg-[var(--surface-hover)] text-[var(--fg-muted)] border border-[var(--border-color)]'
                  }`}>
                    {/* Reasoning Section (Collapsible) */}
                    {msg.reasoning && (
                      <details className="border-b border-[var(--border-color)] bg-[var(--surface-alt)]/50 group">
                        <summary className="p-3 text-[10px] uppercase tracking-wider font-bold text-[var(--fg-subtle)] cursor-pointer list-none hover:bg-[var(--surface-hover)] transition-colors flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                          <span>Reasoning</span>
                          <span className="ml-auto text-[8px] opacity-0 group-open:opacity-100 transition-opacity">Hide</span>
                        </summary>
                        <div className="p-4 pt-0 text-xs italic text-[var(--fg-subtle)] border-t border-[var(--border-color)]/30 max-h-[200px] overflow-y-auto custom-scrollbar">
                          <ReactMarkdown 
                            remarkPlugins={[[remarkMath, { singleDollar: true }], remarkGfm]} 
                            rehypePlugins={[rehypeKatex]}
                          >
                            {msg.reasoning
                              .replace(/\u2011/g, '-') 
                              .replace(/\u202F/g, ' ') 
                              .replace(/\u00A0/g, ' ')
                            }
                          </ReactMarkdown>
                        </div>
                      </details>
                    )}

                    {/* Main Content */}
                    <div className={`p-4 text-sm prose prose-sm ${resolvedGlobalTheme === 'dark' ? 'prose-invert' : ''} max-w-none break-words overflow-hidden`}>
                      <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 overflow-x-auto custom-scrollbar">
                        <ReactMarkdown 
                          remarkPlugins={[[remarkMath, { singleDollar: true }], remarkGfm]} 
                          rehypePlugins={[rehypeKatex]}
                        >
                          {msg.content
                            .replace(/\u2011/g, '-') // Fix non-breaking hyphen (KaTeX error 8209)
                            .replace(/\u202F/g, ' ') // Fix narrow no-break space (KaTeX error 8239)
                            .replace(/\u00A0/g, ' ') // Fix non-breaking space
                            .replace(/\\\$/g, '$')   // 1. Normalize \$ to $
                            .replace(/\$/g, '\\$')   // 2. Escape all $ to \$
                            .replace(/\\\[/g, '$$$$')
                            .replace(/\\\]/g, '$$$$')
                            .replace(/\\\(/g, '$')   // 3. Convert math \( to $ (unescaped)
                            .replace(/\\\)/g, '$')}
                        </ReactMarkdown>
                      </div>
                    </div>
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
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--fg-subtle)] p-8 text-center">
                <History className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm">No past conversations found.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => loadSession(s.id)}
                    className={`w-full text-left p-3 rounded-xl transition-all border ${
                      s.id === sessionId 
                        ? 'bg-violet-600/10 border-violet-500/30' 
                        : 'border-transparent hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-sm font-medium line-clamp-1 ${s.id === sessionId ? 'text-violet-400' : 'text-[var(--fg)]'}`}>
                        {s.title || 'Untitled Session'}
                      </span>
                      <span className="text-[10px] text-[var(--fg-subtle)] shrink-0">
                        {new Date(s.updated_at + 'Z').toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--fg-muted)] line-clamp-1 opacity-70">
                      Last active: {new Date(s.updated_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Portal>
    <style jsx global>{`
      .katex-display {
        margin: 1em 0;
        overflow-x: auto;
        overflow-y: hidden;
      }
      .katex {
        font-size: 1.1em;
        color: inherit;
      }
    `}</style>
    </>
  );
};
