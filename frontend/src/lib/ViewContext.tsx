"use client";

import React, { createContext, useContext, useState, type ReactNode } from 'react';

export type ActiveView = 'kanban' | 'table';

interface ViewContextType {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

const ViewContext = createContext<ViewContextType | undefined>(undefined);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ActiveView>('kanban');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <ViewContext.Provider value={{ activeView, setActiveView, sidebarCollapsed, setSidebarCollapsed }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error('useView must be used within a ViewProvider');
  }
  return context;
}
