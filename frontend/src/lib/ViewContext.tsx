"use client";

import React, { createContext, useContext, useState, type ReactNode } from 'react';

export type ActiveView = 'kanban' | 'table' | 'settings';

interface ViewContextType {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  unsavedChanges: boolean;
  setUnsavedChanges: (unsaved: boolean) => void;
}

const ViewContext = createContext<ViewContextType | undefined>(undefined);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ActiveView>('kanban');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  return (
    <ViewContext.Provider value={{ 
      activeView, 
      setActiveView, 
      sidebarCollapsed, 
      setSidebarCollapsed,
      unsavedChanges,
      setUnsavedChanges
    }}>
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
