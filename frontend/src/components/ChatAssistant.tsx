import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Loader2, Sparkles, User, History, Plus, ChevronLeft, Copy, Check, Edit3, RotateCw, Trash2, Minus } from 'lucide-react';
import api from '../lib/api';
import { Portal } from './Portal';
import { ConfirmDialog } from './ConfirmDialog';
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
  onClose: (finalRect?: { x: number; y: number; width: number; height: number }) => void;
  jobId?: number; // Optional context filter
  sparklePosition?: { x: number; y: number } | null;
}> = ({ isOpen, onClose, jobId, sparklePosition }) => {
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
  const [height, setHeight] = useState(600);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hasInitializedPosition, setHasInitializedPosition] = useState(false);
  
  const dragWindowRef = useRef<{
    startX: number;
    startY: number;
    posX: number;
    posY: number;
    isDragging: boolean;
  } | null>(null);

  const resizeWindowRef = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startPosX: number;
    startPosY: number;
    type: 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    isResizing: boolean;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

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

  const handleDeleteSession = async (id: string) => {
    try {
      await api.delete(`/ai/chat/${id}`);
      await fetchSessions();
      if (id === sessionId) {
        startNewChat();
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const handleRenameSession = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      await api.put(`/ai/chat/${id}/title`, { title: newTitle.trim() });
      setEditingSessionId(null);
      setRenameInput('');
      await fetchSessions();
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
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

  // Initialize position and anchor to sparkles button
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 640;
      if (!isMobile) {
        let sparkleX = window.innerWidth - 56 - 24;
        let sparkleY = window.innerHeight - 56 - 24;
        
        if (sparklePosition) {
          sparkleX = sparklePosition.x;
          sparkleY = sparklePosition.y;
        }

        const isLeft = sparkleX < window.innerWidth / 2;
        const isTop = sparkleY < window.innerHeight / 2;

        let targetX = 0;
        let targetY = 0;

        if (isLeft && isTop) {
          targetX = sparkleX;
          targetY = sparkleY;
        } else if (!isLeft && isTop) {
          targetX = sparkleX + 56 - width;
          targetY = sparkleY;
        } else if (isLeft && !isTop) {
          targetX = sparkleX;
          targetY = sparkleY + 56 - height;
        } else {
          targetX = sparkleX + 56 - width;
          targetY = sparkleY + 56 - height;
        }

        // Clamp to screen boundaries
        targetX = Math.max(12, Math.min(targetX, window.innerWidth - width - 12));
        targetY = Math.max(12, Math.min(targetY, window.innerHeight - height - 12));

        setPosition({ x: targetX, y: targetY });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sparklePosition]);

  // Handle Window Resize Clamp
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleWindowResize = () => {
      const isMobile = window.innerWidth < 640;
      if (isMobile) return;
      
      const maxW = window.innerWidth - 24;
      const maxH = window.innerHeight - 24;
      
      let newWidth = width;
      let newHeight = height;
      
      if (newWidth > maxW) newWidth = maxW;
      if (newHeight > maxH) newHeight = maxH;
      
      if (newWidth !== width) setWidth(newWidth);
      if (newHeight !== height) setHeight(newHeight);
      
      setPosition(prev => {
        const x = Math.max(12, Math.min(prev.x, window.innerWidth - newWidth - 12));
        const y = Math.max(12, Math.min(prev.y, window.innerHeight - newHeight - 12));
        return { x, y };
      });
    };
    
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [width, height]);

  // Dragging Window Logic
  const startDraggingWindow = (e: React.MouseEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) return; // Disable on mobile
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a') || (e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('textarea')) return;
    if (e.button !== 0) return; // Only left click
    
    e.preventDefault();
    dragWindowRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
      isDragging: true
    };
    
    document.addEventListener('mousemove', handleWindowMouseMove);
    document.addEventListener('mouseup', stopDraggingWindow);
  };

  const handleWindowMouseMove = React.useCallback((e: MouseEvent) => {
    if (!dragWindowRef.current?.isDragging) return;
    const drag = dragWindowRef.current;
    const deltaX = e.clientX - drag.startX;
    const deltaY = e.clientY - drag.startY;
    
    const maxW = window.innerWidth - width - 12;
    const maxH = window.innerHeight - height - 12;
    
    const nextX = Math.max(12, Math.min(drag.posX + deltaX, maxW));
    const nextY = Math.max(12, Math.min(drag.posY + deltaY, maxH));
    
    setPosition({ x: nextX, y: nextY });
  }, [width, height]);

  const stopDraggingWindow = React.useCallback(() => {
    if (!dragWindowRef.current) return;
    dragWindowRef.current.isDragging = false;
    document.removeEventListener('mousemove', handleWindowMouseMove);
    document.removeEventListener('mouseup', stopDraggingWindow);
    dragWindowRef.current = null;
  }, [handleWindowMouseMove]);

  // Resizing Window Logic (8 Directions)
  const startResizingWindow = (e: React.MouseEvent, type: 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) return; // Disable on mobile
    
    e.preventDefault();
    e.stopPropagation();
    
    resizeWindowRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: width,
      startHeight: height,
      startPosX: position.x,
      startPosY: position.y,
      type,
      isResizing: true
    };
    
    document.addEventListener('mousemove', handleWindowResizeMove);
    document.addEventListener('mouseup', stopResizingWindow);
    
    let cursor = 'default';
    if (type === 'left' || type === 'right') cursor = 'col-resize';
    else if (type === 'top' || type === 'bottom') cursor = 'row-resize';
    else if (type === 'top-left' || type === 'bottom-right') cursor = 'nwse-resize';
    else if (type === 'top-right' || type === 'bottom-left') cursor = 'nesw-resize';
    
    document.body.style.cursor = cursor;
  };

  const handleWindowResizeMove = React.useCallback((e: MouseEvent) => {
    if (!resizeWindowRef.current?.isResizing) return;
    const resize = resizeWindowRef.current;
    
    const minW = 300;
    const maxW = window.innerWidth - 24;
    const minH = 200;
    const maxH = window.innerHeight - 24;
    
    let newWidth = resize.startWidth;
    let newHeight = resize.startHeight;
    let newX = resize.startPosX;
    let newY = resize.startPosY;
    
    // Horizontal Resizing
    if (resize.type === 'left' || resize.type === 'top-left' || resize.type === 'bottom-left') {
      const deltaX = resize.startX - e.clientX;
      newWidth = Math.max(minW, Math.min(resize.startWidth + deltaX, maxW));
      newX = resize.startPosX - (newWidth - resize.startWidth);
    } else if (resize.type === 'right' || resize.type === 'top-right' || resize.type === 'bottom-right') {
      const deltaX = e.clientX - resize.startX;
      newWidth = Math.max(minW, Math.min(resize.startWidth + deltaX, maxW));
    }
    
    // Vertical Resizing
    if (resize.type === 'top' || resize.type === 'top-left' || resize.type === 'top-right') {
      const deltaY = resize.startY - e.clientY;
      newHeight = Math.max(minH, Math.min(resize.startHeight + deltaY, maxH));
      newY = resize.startPosY - (newHeight - resize.startHeight);
    } else if (resize.type === 'bottom' || resize.type === 'bottom-left' || resize.type === 'bottom-right') {
      const deltaY = e.clientY - resize.startY;
      newHeight = Math.max(minH, Math.min(resize.startHeight + deltaY, maxH));
    }
    
    newX = Math.max(12, Math.min(newX, window.innerWidth - newWidth - 12));
    newY = Math.max(12, Math.min(newY, window.innerHeight - newHeight - 12));
    
    setWidth(newWidth);
    localStorage.setItem('chat_assistant_width', newWidth.toString());
    setHeight(newHeight);
    setPosition({ x: newX, y: newY });
  }, []);

  const stopResizingWindow = React.useCallback(() => {
    if (!resizeWindowRef.current) return;
    resizeWindowRef.current.isResizing = false;
    document.removeEventListener('mousemove', handleWindowResizeMove);
    document.removeEventListener('mouseup', stopResizingWindow);
    document.body.style.cursor = 'default';
    resizeWindowRef.current = null;
  }, [handleWindowResizeMove]);

  // Robust Auto-Scroll Logic
  const scrollToBottom = React.useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(scrollToBottom, 60);
    return () => clearTimeout(timer);
  }, [messages, isTyping, isInitializing, isOpen, view, scrollToBottom]);

  // Adjust input textarea height dynamically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

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

  const sendMessage = async (messageContent: string, historyOverride?: Message[]) => {
    if (!messageContent.trim() || isTyping) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: messageContent.trim() };
    
    let nextMessages: Message[];
    let apiHistory: { role: string; content: string }[] | undefined = undefined;

    if (historyOverride) {
      // Pruning flow (Edit/Retry or Regenerate)
      nextMessages = [...historyOverride, userMsg];
      apiHistory = historyOverride
        .filter(m => m.id !== 'welcome')
        .map(m => ({
          role: m.role,
          content: m.content
        }));
    } else {
      // Normal incremental flow
      nextMessages = [...messages, userMsg];
    }

    setMessages(nextMessages);
    setInput('');
    setIsTyping(true);

    try {
      const response = await api.post('/ai/chat', { 
        message: userMsg.content,
        session_id: sessionId,
        history: apiHistory,
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

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const startEditing = (id: string, content: string) => {
    setEditingMessageId(id);
    setEditInput(content);
  };

  const handleSaveEdit = async (msgId: string) => {
    if (!editInput.trim() || isTyping) return;
    
    const msgIdx = messages.findIndex(m => m.id === msgId);
    if (msgIdx === -1) return;

    const prunedHistory = messages.slice(0, msgIdx);
    setEditingMessageId(null);
    setEditInput('');
    await sendMessage(editInput.trim(), prunedHistory);
  };

  const handleRegenerate = async () => {
    if (isTyping || messages.length < 2) return;

    const lastUserMsgIdx = messages.map(m => m.role).lastIndexOf('user');
    if (lastUserMsgIdx === -1) return;

    const lastUserMsg = messages[lastUserMsgIdx];
    const prunedHistory = messages.slice(0, lastUserMsgIdx);
    await sendMessage(lastUserMsg.content, prunedHistory);
  };

  return (
    <>
    <Portal>
      <div 
        style={typeof window !== 'undefined' && window.innerWidth < 640 ? {} : {
          width: `${width}px`,
          height: `${height}px`,
          left: `${position.x}px`,
          top: `${position.y}px`,
          maxHeight: 'calc(100vh - 24px)',
          maxWidth: 'calc(100vw - 24px)',
        }}
        className={`fixed bg-[var(--bg)]/85 backdrop-blur-xl border border-violet-500/20 shadow-2xl shadow-black/35 z-[60] flex flex-col transition-shadow ${
          typeof window !== 'undefined' && window.innerWidth < 640
            ? 'right-0 top-0 bottom-0 left-0 pt-[72px] sm:pt-0 animate-slide-left' 
            : 'rounded-2xl overflow-hidden'
        }`}
      >
        {/* Resize Handles (Desktop Only) */}
        {typeof window !== 'undefined' && window.innerWidth >= 640 && (
          <>
            {/* 4 Borders */}
            <div 
              onMouseDown={(e) => startResizingWindow(e, 'left')}
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-violet-500/20 active:bg-violet-500/40 transition-colors z-[60]"
              title="Drag left side to resize"
            />
            <div 
              onMouseDown={(e) => startResizingWindow(e, 'right')}
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-violet-500/20 active:bg-violet-500/40 transition-colors z-[60]"
              title="Drag right side to resize"
            />
            <div 
              onMouseDown={(e) => startResizingWindow(e, 'top')}
              className="absolute top-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-violet-500/20 active:bg-violet-500/40 transition-colors z-[60]"
              title="Drag top side to resize"
            />
            <div 
              onMouseDown={(e) => startResizingWindow(e, 'bottom')}
              className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-violet-500/20 active:bg-violet-500/40 transition-colors z-[60]"
              title="Drag bottom side to resize"
            />

            {/* 4 Corners */}
            <div 
              onMouseDown={(e) => startResizingWindow(e, 'top-left')}
              className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize hover:bg-violet-500/30 active:bg-violet-500/50 transition-colors z-[70]"
              title="Drag corner to resize"
            />
            <div 
              onMouseDown={(e) => startResizingWindow(e, 'top-right')}
              className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize hover:bg-violet-500/30 active:bg-violet-500/50 transition-colors z-[70]"
              title="Drag corner to resize"
            />
            <div 
              onMouseDown={(e) => startResizingWindow(e, 'bottom-left')}
              className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize hover:bg-violet-500/30 active:bg-violet-500/50 transition-colors z-[70]"
              title="Drag corner to resize"
            />
            <div 
              onMouseDown={(e) => startResizingWindow(e, 'bottom-right')}
              className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize hover:bg-violet-500/30 active:bg-violet-500/50 transition-colors z-[70]"
              title="Drag corner to resize"
            />
          </>
        )}

        {/* Header */}
        <div 
          onMouseDown={startDraggingWindow}
          className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-violet-600/10 shrink-0 cursor-grab active:cursor-grabbing select-none"
        >
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

            <button onClick={() => onClose({ x: position.x, y: position.y, width, height })} className="p-2 text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors">
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
                  <div className={`relative group/message max-w-[90%] rounded-2xl overflow-hidden flex flex-col ${
                    msg.role === 'user' 
                      ? 'bg-violet-600/20 text-[var(--fg)]' 
                      : 'bg-[var(--surface-hover)] text-[var(--fg-muted)] border border-[var(--border-color)]'
                  }`}>
                    {/* Action Buttons (Copy, Edit, Regenerate) */}
                    {editingMessageId !== msg.id && (
                      <div className="absolute right-2 top-2 opacity-0 group-hover/message:opacity-100 transition-opacity flex items-center gap-1 z-10">
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="p-1 rounded-md bg-[var(--surface)] border border-[var(--border-color)] text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-all shadow-sm shrink-0"
                          title="Copy to clipboard"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        
                        {msg.role === 'user' && (
                          <button
                            onClick={() => startEditing(msg.id, msg.content)}
                            className="p-1 rounded-md bg-[var(--surface)] border border-[var(--border-color)] text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-all shadow-sm shrink-0"
                            title="Edit prompt"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {msg.role === 'assistant' && messages[messages.length - 1]?.id === msg.id && messages.length > 1 && (
                          <button
                            onClick={handleRegenerate}
                            disabled={isTyping}
                            className="p-1 rounded-md bg-[var(--surface)] border border-[var(--border-color)] text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] disabled:opacity-50 transition-all shadow-sm shrink-0"
                            title="Regenerate response"
                          >
                            <RotateCw className={`w-3.5 h-3.5 ${isTyping ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                      </div>
                    )}
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

                    {editingMessageId === msg.id ? (
                      <div className="p-3 flex flex-col gap-2 min-w-[200px] bg-[var(--surface-hover)]">
                        <textarea
                          value={editInput}
                          onChange={e => setEditInput(e.target.value)}
                          className="w-full min-h-[60px] bg-[var(--input-bg)] border border-violet-500/50 rounded-lg p-2.5 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 custom-scrollbar resize-y"
                          placeholder="Edit your prompt..."
                        />
                        <div className="flex justify-end gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditInput('');
                            }}
                            className="px-2.5 py-1 rounded-md border border-[var(--border-color)] text-xs text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(msg.id)}
                            disabled={!editInput.trim() || isTyping}
                            className="px-2.5 py-1 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs text-white font-medium transition-all shadow-sm"
                          >
                            Save & Submit
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
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
              <form onSubmit={handleSend} className="relative flex items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your applications..."
                  rows={1}
                  style={{ height: 'auto', maxHeight: '160px' }}
                  className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-xl pl-4 pr-12 py-3 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 transition-colors placeholder-[var(--fg-subtle)] custom-scrollbar resize-none overflow-y-auto"
                  disabled={isTyping}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  className="absolute right-2 bottom-2 p-2 text-violet-400 hover:text-violet-500 disabled:opacity-50 transition-colors"
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
                  <div
                    key={s.id}
                    onClick={() => {
                      if (editingSessionId !== s.id) {
                        loadSession(s.id);
                      }
                    }}
                    className={`group/session-item relative w-full text-left p-3 pr-12 rounded-xl transition-all border flex justify-between items-center cursor-pointer ${
                      s.id === sessionId 
                        ? 'bg-violet-600/10 border-violet-500/30' 
                        : 'border-transparent hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    {editingSessionId === s.id ? (
                      <div 
                        className="flex-1 flex items-center gap-1 min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleRenameSession(s.id, renameInput);
                            } else if (e.key === 'Escape') {
                              setEditingSessionId(null);
                            }
                          }}
                          className="flex-1 bg-[var(--input-bg)] border border-violet-500/50 rounded-lg px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 min-w-0"
                          autoFocus
                        />
                        <button
                          onClick={() => handleRenameSession(s.id, renameInput)}
                          className="p-1 rounded-md text-green-500 hover:bg-green-500/10 transition-colors shrink-0"
                          title="Save"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingSessionId(null)}
                          className="p-1 rounded-md text-[var(--fg-subtle)] hover:bg-[var(--surface-hover)] transition-colors shrink-0"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0 pr-6">
                          <div className="flex justify-between items-start mb-1">
                            <span className={`text-sm font-medium line-clamp-1 ${s.id === sessionId ? 'text-violet-400' : 'text-[var(--fg)]'}`}>
                              {s.title || 'Untitled Session'}
                            </span>
                            <span className="text-[10px] text-[var(--fg-subtle)] shrink-0 ml-2">
                              {new Date(s.updated_at + 'Z').toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--fg-muted)] line-clamp-1 opacity-70">
                            Last active: {new Date(s.updated_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {/* Action overlay (visible on hover) */}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/session-item:opacity-100 focus-within:opacity-100 transition-all flex gap-1 bg-[var(--surface)] p-1 rounded-lg border border-[var(--border-color)] shadow-sm z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSessionId(s.id);
                              setRenameInput(s.title || '');
                            }}
                            className="p-1 rounded-md text-[var(--fg-subtle)] hover:text-violet-400 hover:bg-violet-500/10 transition-colors shrink-0"
                            title="Rename chat session"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmSessionId(s.id);
                            }}
                            className="p-1 rounded-md text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                            title="Delete chat session"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <ConfirmDialog
          isOpen={deleteConfirmSessionId !== null}
          title="Delete Chat Session"
          message="Are you sure you want to delete this chat session? This action cannot be undone."
          variant="danger"
          confirmLabel="Delete"
          onConfirm={async () => {
            if (deleteConfirmSessionId) {
              await handleDeleteSession(deleteConfirmSessionId);
              setDeleteConfirmSessionId(null);
            }
          }}
          onCancel={() => setDeleteConfirmSessionId(null)}
        />
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
