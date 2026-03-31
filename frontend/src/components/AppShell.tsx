"use client";

import React from 'react';
import { Briefcase, LayoutGrid, Table2, ChevronLeft, ChevronRight, Sparkles, Settings } from 'lucide-react';
import { ViewProvider, useView, type ActiveView } from '@/lib/ViewContext';
import { ChatAssistant } from './ChatAssistant';
import { useSettings } from '@/lib/SettingsContext';
import { ConfirmDialog } from './ConfirmDialog';

function Sidebar() {
  const { activeView, setActiveView, sidebarCollapsed, setSidebarCollapsed, requestAction } = useView();

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
        ${sidebarCollapsed ? 'w-16' : 'w-64'}
        border-r border-[var(--border-color)] hidden sm:flex flex-col sticky top-0 h-screen glass z-10
        transition-all duration-300 ease-in-out shrink-0
      `}
    >
      {/* Logo Area */}
      <div className={`flex items-center ${sidebarCollapsed ? 'justify-center p-4' : 'px-6 pt-6 pb-2'} mb-2`}>
        {sidebarCollapsed ? (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-white" />
          </div>
        ) : (
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-400 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            Tracker AI
          </h2>
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

function MainContent({ children }: { children: React.ReactNode }) {
  const [isChatOpen, setIsChatOpen] = React.useState(false);
  const { aiEnabled } = useSettings();
  const { showDiscardDialog, dirtyMessage, confirmDiscard, cancelDiscard } = useView();

  return (
    <main className="flex-1 flex flex-col relative w-full pb-0 min-w-0" style={{ background: `linear-gradient(to bottom, var(--bg), var(--bg))` }}>
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
