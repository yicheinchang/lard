"use client";

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type ActiveView = 'kanban' | 'table' | 'settings';

interface ViewContextType {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  jobDetailHeight: number;
  setJobDetailHeight: (height: number) => void;
  
  // Dirty state tracking
  isDirty: boolean;
  dirtyMessage: string;
  setDirty: (isDirty: boolean, message?: string) => void;
  
  // Navigation guard
  showDiscardDialog: boolean;
  requestAction: (action: () => void, message?: string) => void;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
}

const ViewContext = createContext<ViewContextType | undefined>(undefined);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ActiveView>('kanban');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(120);
  const [jobDetailHeight, setJobDetailHeight] = useState(45); // in percentage
  
  // Persistence
  useEffect(() => {
    const savedWidth = localStorage.getItem('sidebarWidth');
    const savedHeight = localStorage.getItem('jobDetailHeight');
    const savedCollapsed = localStorage.getItem('sidebarCollapsed');
    
    if (savedWidth) setSidebarWidth(parseInt(savedWidth, 10));
    if (savedHeight) setJobDetailHeight(parseInt(savedHeight, 10));
    if (savedCollapsed) setSidebarCollapsed(savedCollapsed === 'true');
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebarWidth', sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('jobDetailHeight', jobDetailHeight.toString());
  }, [jobDetailHeight]);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed.toString());
  }, [sidebarCollapsed]);

  // Dirty state member
  const [isDirty, setIsDirty] = useState(false);
  const [dirtyMessage, setDirtyMessage] = useState('');
  
  // Guard state
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  const setDirty = (dirty: boolean, message: string = 'You have unsaved changes. Do you want to discard them?') => {
    setIsDirty(dirty);
    if (dirty) setDirtyMessage(message);
  };

  const requestAction = (action: () => void, message?: string) => {
    if (!isDirty) {
      action();
    } else {
      setPendingAction(() => action);
      if (message) setDirtyMessage(message);
      setShowDiscardDialog(true);
    }
  };

  const confirmDiscard = () => {
    setIsDirty(false);
    setShowDiscardDialog(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const cancelDiscard = () => {
    setShowDiscardDialog(false);
    setPendingAction(null);
  };

  return (
    <ViewContext.Provider value={{ 
      activeView, 
      setActiveView, 
      sidebarCollapsed, 
      setSidebarCollapsed,
      sidebarWidth,
      setSidebarWidth,
      jobDetailHeight,
      setJobDetailHeight,
      isDirty,
      dirtyMessage,
      setDirty,
      showDiscardDialog,
      requestAction,
      confirmDiscard,
      cancelDiscard
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
