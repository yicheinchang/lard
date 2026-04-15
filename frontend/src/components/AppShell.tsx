"use client";

import React from 'react';
import { Briefcase, LayoutGrid, Table2, ChevronLeft, ChevronRight, Sparkles, Settings, Menu, X } from 'lucide-react';
import { ViewProvider, useView, type ActiveView } from '@/lib/ViewContext';
import { ChatAssistant } from './ChatAssistant';
import { useSettings } from '@/lib/SettingsContext';
import { ConfirmDialog } from './ConfirmDialog';

function Sidebar() {
  const { activeView, setActiveView, sidebarCollapsed, setSidebarCollapsed, sidebarWidth, setSidebarWidth, requestAction } = useView();
  const [isResizing, setIsResizing] = React.useState(false);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const SNAP_MIDPOINT = 112;
      const EXPANDED_WIDTH = 160;
      const COLLAPSED_WIDTH = 64;
      
      if (e.clientX < SNAP_MIDPOINT) {
        setSidebarCollapsed(true);
        setSidebarWidth(COLLAPSED_WIDTH);
      } else {
        setSidebarCollapsed(false);
        setSidebarWidth(EXPANDED_WIDTH);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    } else {
      document.body.style.cursor = 'default';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setSidebarWidth, setSidebarCollapsed]);

  const navItems = [
    { id: 'kanban' as const, label: 'Dashboard', icon: LayoutGrid },
    { id: 'table' as const, label: 'Table View', icon: Table2 },
  ];

  const handleViewChange = (view: ActiveView) => {
    if (view === activeView) return;
    requestAction(() => setActiveView(view));
  };

  return (
    <aside
      className={`
        border-r border-[var(--border-color)] hidden sm:flex flex-col sticky top-0 h-screen glass z-10
        transition-[width] duration-300 ease-in-out shrink-0 relative
      `}
      style={{ width: sidebarCollapsed ? '64px' : `${sidebarWidth}px` }}
    >
      {/* Resize Handle */}
      <div 
        className={`resize-handle-v ${isResizing ? 'dragging' : ''}`}
        onMouseDown={startResizing}
      />
      {/* Logo Area */}
      <div className={`flex flex-col ${sidebarCollapsed ? 'items-center justify-center p-4' : 'px-6 pt-6 pb-2'} mb-2`}>
        {sidebarCollapsed ? (
          <img 
            src="/logo.png" 
            className="w-[30px] h-[30px] object-contain rounded-lg" 
            alt="Lard Logo" 
          />
        ) : (
          <>
            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-400 flex items-center gap-2">
              <img src="/logo.png" className="w-[36px] h-[36px] object-contain" alt="Lard Logo" />
              Lard
            </h2>
            <p className="text-[10px] text-[var(--fg-subtle)] font-medium mt-1 leading-tight whitespace-normal text-center">Lazy AI-powered Resume Database</p>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex flex-col gap-1.5 flex-1 ${sidebarCollapsed ? 'px-2' : 'px-3'} mt-2`}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleViewChange(item.id)}
              className={`
                flex items-center gap-3 p-3 rounded-xl group transition-all duration-200
                ${sidebarCollapsed ? 'justify-center' : ''}
                ${isActive
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20 shadow-lg shadow-violet-500/5'
                  : 'text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] border border-transparent'
                }
              `}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon className={`w-5 h-5 shrink-0 transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
              {!sidebarCollapsed && (
                <span className="font-medium text-sm">{item.label}</span>
              )}
            </button>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings – pinned to bottom of nav */}
        <button
          onClick={() => handleViewChange('settings')}
          className={`
            flex items-center gap-3 p-3 rounded-xl group transition-all duration-200
            ${sidebarCollapsed ? 'justify-center' : ''}
            ${activeView === 'settings'
              ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20 shadow-lg shadow-violet-500/5'
              : 'text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] border border-transparent'
            }
          `}
          title={sidebarCollapsed ? 'Settings' : undefined}
        >
          <Settings className={`w-5 h-5 shrink-0 transition-transform ${activeView === 'settings' ? 'scale-110' : 'group-hover:scale-110'}`} />
          {!sidebarCollapsed && (
            <span className="font-medium text-sm">Settings</span>
          )}
        </button>
      </nav>

      {/* Collapse Toggle */}
      <div className={`${sidebarCollapsed ? 'px-2' : 'px-3'} pb-4`}>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-all duration-200 border border-transparent hover:border-[var(--border-color)]"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs font-medium">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function MobileHeader() {
  const { setIsMobileMenuOpen } = useView();
  return (
    <div className="sm:hidden flex items-center justify-between p-4 border-b border-[var(--border-color)] glass sticky top-0 z-30">
      <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-400 flex items-center gap-2">
        <img src="/logo.png" className="w-[36px] h-[36px] object-contain" alt="Lard Logo" />
        Lard
      </h2>
      <button 
        onClick={() => setIsMobileMenuOpen(true)}
        className="p-2 hover:bg-[var(--surface-hover)] rounded-lg text-[var(--fg-subtle)] hover:text-[var(--fg)] transition-all"
      >
        <Menu className="w-6 h-6" />
      </button>
    </div>
  );
}

function MobileDrawer() {
  const { isMobileMenuOpen, setIsMobileMenuOpen, activeView, setActiveView, requestAction } = useView();
  
  if (!isMobileMenuOpen) return null;

  const navItems = [
    { id: 'kanban' as const, label: 'Dashboard', icon: LayoutGrid },
    { id: 'table' as const, label: 'Table View', icon: Table2 },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  const handleNav = (view: ActiveView) => {
    setIsMobileMenuOpen(false);
    if (view === activeView) return;
    requestAction(() => setActiveView(view));
  };

  return (
    <div className="fixed inset-0 z-50 sm:hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" 
        onClick={() => setIsMobileMenuOpen(false)} 
      />
      
      {/* Drawer */}
      <aside className="absolute inset-y-0 left-0 w-72 bg-[var(--bg)] border-r border-[var(--border-color)] flex flex-col shadow-2xl animate-slide-right">
        <div className="p-6 flex items-center justify-between border-b border-[var(--border-color)]">
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-400 flex items-center gap-2">
            <img src="/logo.png" className="w-[36px] h-[36px] object-contain" alt="Lard Logo" />
            Lard
          </h2>
          <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-[var(--surface-hover)] rounded-full transition-all">
            <X className="w-5 h-5 text-[var(--fg-subtle)]" />
          </button>
        </div>
        
        <nav className="flex flex-col gap-2 p-4 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`
                  flex items-center gap-4 p-4 rounded-xl transition-all duration-200
                  ${isActive
                    ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20'
                    : 'text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)]'
                  }
                `}
              >
                <Icon className={`w-6 h-6 ${isActive ? 'text-violet-400' : ''}`} />
                <span className="font-semibold text-base">{item.label}</span>
              </button>
            );
          })}
        </nav>
        
        <div className="p-6 border-t border-[var(--border-color)] text-center text-xs text-[var(--fg-subtle)]">
          © 2026 Lard
        </div>
      </aside>
    </div>
  );
}

function MainContent({ children }: { children: React.ReactNode }) {
  const [isChatOpen, setIsChatOpen] = React.useState(false);
  const { aiEnabled } = useSettings();
  const { showDiscardDialog, dirtyMessage, confirmDiscard, cancelDiscard } = useView();

  return (
    <main className="flex-1 flex flex-col relative w-full h-screen overflow-hidden pb-0 min-w-0" style={{ background: `linear-gradient(to bottom, var(--bg), var(--bg))` }}>
      <MobileHeader />
      <MobileDrawer />
      
      {children}
      
      {/* Floating AI Button — hidden when AI is disabled */}
      {aiEnabled && (
        <button
          onClick={() => setIsChatOpen(true)}
          className={`fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-xl shadow-violet-600/20 flex items-center justify-center text-white hover:scale-105 transition-all z-40 ${isChatOpen ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100'}`}
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {/* Global Chat Assistant — hidden when AI is disabled */}
      {aiEnabled && (
        <ChatAssistant isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      )}

      {/* Global Navigation Guard Dialog */}
      <ConfirmDialog
        isOpen={showDiscardDialog}
        title="Unsaved Changes"
        message={dirtyMessage}
        confirmLabel="Discard & Continue"
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        variant="danger"
      />
    </main>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ViewProvider>
      <Sidebar />
      <MainContent>{children}</MainContent>
    </ViewProvider>
  );
}
