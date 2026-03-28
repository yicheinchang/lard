"use client";

import React from 'react';
import { Briefcase, LayoutGrid, Table2, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { ViewProvider, useView } from '@/lib/ViewContext';

function Sidebar() {
  const { activeView, setActiveView, sidebarCollapsed, setSidebarCollapsed } = useView();

  const navItems = [
    { id: 'kanban' as const, label: 'Dashboard', icon: LayoutGrid },
    { id: 'table' as const, label: 'Table View', icon: Table2 },
  ];

  return (
    <aside
      className={`
        ${sidebarCollapsed ? 'w-16' : 'w-64'}
        border-r border-white/10 hidden sm:flex flex-col sticky top-0 h-screen glass z-10
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
              onClick={() => setActiveView(item.id)}
              className={`
                flex items-center gap-3 p-3 rounded-xl group transition-all duration-200
                ${sidebarCollapsed ? 'justify-center' : ''}
                ${isActive
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20 shadow-lg shadow-violet-500/5'
                  : 'text-white/50 hover:text-white hover:bg-white/5 border border-transparent'
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
      </nav>

      {/* Collapse Toggle */}
      <div className={`${sidebarCollapsed ? 'px-2' : 'px-3'} pb-4`}>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all duration-200 border border-transparent hover:border-white/10"
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ViewProvider>
      <Sidebar />
      <main className="flex-1 flex flex-col relative w-full pb-0 bg-gradient-to-b from-[#0a0a0f] to-[#04040a] min-w-0">
        {children}
      </main>
    </ViewProvider>
  );
}
