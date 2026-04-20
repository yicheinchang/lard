"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getSettings, updateSettings as apiUpdateSettings, type AppSettings } from './api';

interface SettingsContextType {
  settings: AppSettings | null;
  loading: boolean;
  aiEnabled: boolean;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  ai_enabled: true,
  debug_mode: true,
  llm_provider: 'ollama',
  llm_config: {
    ollama_base_url: 'http://host.docker.internal:11434',
    ollama_model: 'gemma3:4b-it-qat',
    openai_api_key: '',
    openai_model: 'gpt-4o-mini',
    anthropic_api_key: '',
    anthropic_model: 'claude-3-haiku-20240307',
    num_ctx: 8192,
  },
  embedding_provider: 'default',
  embedding_config: {
    ollama_base_url: 'http://host.docker.internal:11434',
    ollama_model: 'nomic-embed-text',
    openai_api_key: '',
    openai_model: 'text-embedding-3-small',
  },
  extraction_mode: 'single',
  max_concurrency: 2,
  custom_prompts: {
    single_agent: '',
    multi_agent: {
      company: '',
      role: '',
      location: '',
      salary_range: '',
      job_posted_date: '',
      application_deadline: '',
      description: ''
    },
    job_post_check: '',
    qa_json: '',
    qa_text: ''
  },
  system_prompts: {
    extraction_base: '',
    extraction_description: '',
    json_ld: '',
    qa_validator: '',
    field_company: '',
    field_role: '',
    field_location: '',
    field_salary: '',
    field_id: '',
    field_posted: '',
    field_deadline: '',
    json_company: '',
    json_role: '',
    json_location: '',
    json_salary: '',
    json_id: '',
    json_posted: '',
    json_deadline: '',
    json_description: '',
    job_post_check: '',
    qa_validator_json: '',
    qa_validator_text: ''
  }
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// ── Theme application helper ──────────────────────────────────────────

export function applyTheme(theme: 'dark' | 'light' | 'system') {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

// ── Provider ──────────────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await getSettings();
      setSettings(data);
      applyTheme(data.theme);
    } catch (err) {
      console.error('Failed to load settings', err);
      applyTheme('dark');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Listen for system theme changes when mode is "system"
  useEffect(() => {
    if (settings?.theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [settings?.theme]);

  const handleUpdate = useCallback(async (patch: Partial<AppSettings>) => {
    try {
      const updated = await apiUpdateSettings(patch);
      setSettings(updated);
      if (patch.theme) applyTheme(patch.theme);
    } catch (err) {
      console.error('Failed to update settings', err);
      throw err;
    }
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        loading,
        aiEnabled: settings?.ai_enabled ?? true,
        updateSettings: handleUpdate,
        refreshSettings: fetchSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
