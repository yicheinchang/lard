"use client";

import React, { useState, useEffect } from 'react';
import { Sun, Moon, Monitor, Bot, BotOff, Server, Key, Database, RefreshCw,
  CheckCircle2, XCircle, Loader2, AlertTriangle, Sparkles, ChevronDown
} from 'lucide-react';
import { useSettings, applyTheme } from '@/lib/SettingsContext';
import { useView } from '@/lib/ViewContext';
import {
  testLlmConnection,
  testEmbeddingConnection,
  rebuildVectors,
  updateSettings as apiUpdateSettings,
  type AppSettings,
  type LlmConfig,
  type EmbeddingConfig,
} from '@/lib/api';
import { ConfirmDialog } from './ConfirmDialog';

// ── Types ────────────────────────────────────────────────────────────

type ThemeOption = 'dark' | 'light' | 'system';
type LlmProvider = 'ollama' | 'openai' | 'anthropic';
type EmbeddingProvider = 'default' | 'ollama' | 'openai';

// ── Component ────────────────────────────────────────────────────────

export function SettingsPage() {
  const { settings, updateSettings: ctxUpdate, refreshSettings } = useSettings();
  const { setUnsavedChanges } = useView();

  // Local form state (buffered so we can save explicitly)
  const [theme, setTheme] = useState<ThemeOption>('dark');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('ollama');
  const [llmConfig, setLlmConfig] = useState<LlmConfig>({
    ollama_base_url: '', ollama_model: '',
    openai_api_key: '', openai_model: '',
    anthropic_api_key: '', anthropic_model: '',
  });
  const [embeddingProvider, setEmbeddingProvider] = useState<EmbeddingProvider>('default');
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>({
    ollama_base_url: '', ollama_model: '',
    openai_api_key: '', openai_model: '',
  });

  // UI states
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [testingLlm, setTestingLlm] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testingEmbed, setTestingEmbed] = useState(false);
  const [embedTestResult, setEmbedTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildDone, setRebuildDone] = useState(false);
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false);

  // Track whether embedding provider was changed (needs rebuild warning)
  const [originalEmbeddingProvider, setOriginalEmbeddingProvider] = useState<EmbeddingProvider>('default');
  const [originalEmbeddingConfig, setOriginalEmbeddingConfig] = useState<EmbeddingConfig | null>(null);
  const [showSaveRebuildConfirm, setShowSaveRebuildConfirm] = useState(false);

  const embeddingChanged = embeddingProvider !== originalEmbeddingProvider ||
    JSON.stringify(embeddingConfig) !== JSON.stringify(originalEmbeddingConfig);

  // ── Dirty State Tracking ──────────────────────────────────────────

  const isDirty = React.useMemo(() => {
    if (!settings) return false;
    return (
      theme !== settings.theme ||
      aiEnabled !== settings.ai_enabled ||
      llmProvider !== settings.llm_provider ||
      JSON.stringify(llmConfig) !== JSON.stringify(settings.llm_config) ||
      embeddingProvider !== settings.embedding_provider ||
      JSON.stringify(embeddingConfig) !== JSON.stringify(settings.embedding_config)
    );
  }, [theme, aiEnabled, llmProvider, llmConfig, embeddingProvider, embeddingConfig, settings]);

  // Update global navigation guard
  useEffect(() => {
    setUnsavedChanges(isDirty);
    return () => setUnsavedChanges(false);
  }, [isDirty, setUnsavedChanges]);

  // Track dirty state and settings in refs for cleanup closure
  const isDirtyRef = React.useRef(false);
  const activeThemeRef = React.useRef<ThemeOption>('dark');
  const savedThemeRef = React.useRef<ThemeOption>('dark');

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    activeThemeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    if (settings) {
      savedThemeRef.current = settings.theme;
    }
  }, [settings]);

  // Restore theme on unmount if changes weren't saved
  useEffect(() => {
    return () => {
      // Only revert if there are unsaved changes
      if (isDirtyRef.current) {
        applyTheme(savedThemeRef.current);
      }
    };
  }, []);

  // Sync from server settings
  useEffect(() => {
    if (!settings) return;
    setTheme(settings.theme);
    setAiEnabled(settings.ai_enabled);
    setLlmProvider(settings.llm_provider);
    setLlmConfig(settings.llm_config);
    setEmbeddingProvider(settings.embedding_provider);
    setEmbeddingConfig(settings.embedding_config);
    setOriginalEmbeddingProvider(settings.embedding_provider);
    setOriginalEmbeddingConfig(settings.embedding_config);
  }, [settings]);

  // ── Save handler ───────────────────────────────────────────────────

  const handleSave = async (forceRebuild = false) => {
    // If embedding changed and we're not already in the "force rebuild" confirmation flow
    if (embeddingChanged && !forceRebuild && !showSaveRebuildConfirm) {
      setShowSaveRebuildConfirm(true);
      return;
    }

    setShowSaveRebuildConfirm(false);
    setSaving(true);
    setSaveStatus('idle');

    try {
      await ctxUpdate({
        theme,
        ai_enabled: aiEnabled,
        llm_provider: llmProvider,
        llm_config: llmConfig,
        embedding_provider: embeddingProvider,
        embedding_config: embeddingConfig,
      });

      setSaveStatus('saved');
      setOriginalEmbeddingProvider(embeddingProvider);
      setOriginalEmbeddingConfig(embeddingConfig);

      // If user confirmed rebuild, trigger it now
      if (forceRebuild) {
        setRebuilding(true);
        setRebuildDone(false);
        try {
          await rebuildVectors();
          setRebuildDone(true);
        } catch (err) {
          console.error("Failed to trigger rebuild after save:", err);
        } finally {
          setRebuilding(false);
        }
      }

      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } finally {
      setSaving(false);
    }
  };

  // ── Test handlers ──────────────────────────────────────────────────

  const handleTestLlm = async () => {
    setTestingLlm(true);
    setLlmTestResult(null);
    try {
      const res = await testLlmConnection({
        provider: llmProvider,
        config: llmConfig
      });
      setLlmTestResult({ ok: true, msg: res.response || 'Connected successfully' });
    } catch (err: any) {
      setLlmTestResult({ ok: false, msg: err?.response?.data?.detail || err.message });
    } finally {
      setTestingLlm(false);
    }
  };

  const handleTestEmbed = async () => {
    setTestingEmbed(true);
    setEmbedTestResult(null);
    try {
      const res = await testEmbeddingConnection({
        provider: embeddingProvider,
        config: embeddingConfig
      });
      setEmbedTestResult({ ok: true, msg: `Connected — ${res.dimensions}D vectors` });
    } catch (err: any) {
      setEmbedTestResult({ ok: false, msg: err?.response?.data?.detail || err.message });
    } finally {
      setTestingEmbed(false);
    }
  };

  const handleRebuild = async () => {
    setShowRebuildConfirm(false);
    setRebuilding(true);
    setRebuildDone(false);
    try {
      await rebuildVectors();
      // The rebuild runs as a background task — we show a "queued" message
      setRebuildDone(true);
    } catch (err: any) {
      console.error('Rebuild failed', err);
    } finally {
      setRebuilding(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────

  const SectionCard = ({ title, icon: Icon, children, subtitle }: {
    title: string; icon: React.ElementType; children: React.ReactNode; subtitle?: string;
  }) => (
    <div className="glass rounded-2xl p-6 shadow-lg border border-[var(--border-color)]">
      <div className="flex items-center gap-3 mb-1">
        <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>{title}</h3>
          {subtitle && <p className="text-xs" style={{ color: 'var(--fg-subtle)' }}>{subtitle}</p>}
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );

  const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--fg-muted)' }}>{children}</label>
  );

  const TextInput = ({ value, onChange, placeholder, type = 'text' }: {
    value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
  }) => (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
      style={{
        backgroundColor: 'var(--input-bg)',
        color: 'var(--fg)',
        border: '1px solid var(--border-color)',
      }}
    />
  );

  const SelectInput = ({ value, onChange, options }: {
    value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
  }) => (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all cursor-pointer"
        style={{
          backgroundColor: 'var(--input-bg)',
          color: 'var(--fg)',
          border: '1px solid var(--border-color)',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--fg-subtle)' }} />
    </div>
  );

  const TestButton = ({ onClick, loading, label }: {
    onClick: () => void; loading: boolean; label: string;
  }) => (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-4 py-2 rounded-lg text-sm font-medium transition-all border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 disabled:opacity-50 flex items-center gap-2"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
      {label}
    </button>
  );

  const TestResult = ({ result }: { result: { ok: boolean; msg: string } | null }) => {
    if (!result) return null;
    return (
      <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${result.ok ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
        {result.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
        <span className="break-all">{result.msg}</span>
      </div>
    );
  };

  // ── Theme cards ────────────────────────────────────────────────────

  const themeOptions: { value: ThemeOption; label: string; icon: React.ElementType; desc: string }[] = [
    { value: 'dark', label: 'Dark', icon: Moon, desc: 'Sleek dark interface' },
    { value: 'light', label: 'Light', icon: Sun, desc: 'Clean light interface' },
    { value: 'system', label: 'System', icon: Monitor, desc: 'Follows your device' },
  ];

  return (
    <div className="flex flex-col h-full w-full p-4 md:p-6 lg:p-8 pt-6 animate-fade-in">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>
            Settings
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>
            Configure your application preferences
          </p>
        </div>

        {/* Save Button */}
        <button
          onClick={() => handleSave()}
          disabled={saving}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-semibold transition-all hover:scale-105 active:scale-95 flex items-center gap-2 shadow-lg shadow-violet-600/20 text-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saveStatus === 'saved' ? (
            <><CheckCircle2 className="w-4 h-4" /> Saved</>
          ) : saveStatus === 'error' ? (
            <><XCircle className="w-4 h-4" /> Error</>
          ) : (
            'Save Changes'
          )}
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-6 pb-8">

        {/* ─── Appearance ──────────────────────────────────────────── */}
        <SectionCard title="Appearance" icon={Sun} subtitle="Choose your preferred theme">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {themeOptions.map(opt => {
              const Icon = opt.icon;
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    setTheme(opt.value);
                    applyTheme(opt.value);
                  }}
                  className={`
                    p-4 rounded-xl border-2 transition-all text-left group
                    ${active
                      ? 'border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/5'
                      : 'border-[var(--border-color)] hover:border-violet-500/40 hover:bg-violet-500/5'
                    }
                  `}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className={`w-5 h-5 ${active ? 'text-violet-400' : ''}`} style={!active ? { color: 'var(--fg-subtle)' } : {}} />
                    <span className="font-medium text-sm" style={{ color: active ? 'var(--primary)' : 'var(--fg)' }}>{opt.label}</span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--fg-subtle)' }}>{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* ─── AI Assistant ────────────────────────────────────────── */}
        <SectionCard title="AI Assistant" icon={aiEnabled ? Bot : BotOff} subtitle="Configure your AI-powered features">

          {/* Master toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-3">
              <Sparkles className={`w-5 h-5 ${aiEnabled ? 'text-violet-400' : ''}`} style={!aiEnabled ? { color: 'var(--fg-subtle)' } : {}} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--fg)' }}>Enable AI Assistant</p>
                <p className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
                  {aiEnabled ? 'Chatbot, auto-fill, and RAG features are active' : 'All AI features are disabled and hidden'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAiEnabled(!aiEnabled)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 focus:outline-none shrink-0 ${aiEnabled ? 'bg-violet-600' : 'bg-[var(--border-color)]'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-300 ${aiEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Provider config — only shown when AI is on */}
          {aiEnabled && (
            <div className="space-y-4 animate-fade-in">

              {/* LLM Provider */}
              <div>
                <Label>LLM Provider</Label>
                <SelectInput
                  value={llmProvider}
                  onChange={v => { setLlmProvider(v as LlmProvider); setLlmTestResult(null); }}
                  options={[
                    { value: 'ollama', label: 'Ollama (Local)' },
                    { value: 'openai', label: 'OpenAI' },
                    { value: 'anthropic', label: 'Anthropic' },
                  ]}
                />
              </div>

              {/* Ollama Config */}
              {llmProvider === 'ollama' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                  <div>
                    <Label>Ollama Server URL</Label>
                    <TextInput
                      value={llmConfig.ollama_base_url}
                      onChange={v => setLlmConfig(p => ({ ...p, ollama_base_url: v }))}
                      placeholder="http://localhost:11434"
                    />
                  </div>
                  <div>
                    <Label>Model Name</Label>
                    <TextInput
                      value={llmConfig.ollama_model}
                      onChange={v => setLlmConfig(p => ({ ...p, ollama_model: v }))}
                      placeholder="gemma3:4b-it-qat"
                    />
                  </div>
                </div>
              )}

              {/* OpenAI Config */}
              {llmProvider === 'openai' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                  <div>
                    <Label>API Key</Label>
                    <TextInput
                      value={llmConfig.openai_api_key}
                      onChange={v => setLlmConfig(p => ({ ...p, openai_api_key: v }))}
                      placeholder="sk-…"
                      type="password"
                    />
                  </div>
                  <div>
                    <Label>Model Name</Label>
                    <TextInput
                      value={llmConfig.openai_model}
                      onChange={v => setLlmConfig(p => ({ ...p, openai_model: v }))}
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                </div>
              )}

              {/* Anthropic Config */}
              {llmProvider === 'anthropic' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                  <div>
                    <Label>API Key</Label>
                    <TextInput
                      value={llmConfig.anthropic_api_key}
                      onChange={v => setLlmConfig(p => ({ ...p, anthropic_api_key: v }))}
                      placeholder="sk-ant-…"
                      type="password"
                    />
                  </div>
                  <div>
                    <Label>Model Name</Label>
                    <TextInput
                      value={llmConfig.anthropic_model}
                      onChange={v => setLlmConfig(p => ({ ...p, anthropic_model: v }))}
                      placeholder="claude-3-haiku-20240307"
                    />
                  </div>
                </div>
              )}

              {/* Test connection */}
              <div className="flex items-center gap-3">
                <TestButton onClick={handleTestLlm} loading={testingLlm} label="Test LLM Connection" />
              </div>
              <TestResult result={llmTestResult} />
            </div>
          )}
        </SectionCard>

        {/* ─── Embedding ───────────────────────────────────────────── */}
        <SectionCard title="Embedding Model" icon={Database} subtitle="Controls how documents are vectorized for search and RAG">

          <div>
            <Label>Embedding Provider</Label>
            <SelectInput
              value={embeddingProvider}
              onChange={v => { setEmbeddingProvider(v as EmbeddingProvider); setEmbedTestResult(null); }}
              options={[
                { value: 'default', label: 'ChromaDB Default (all-MiniLM-L6-v2)' },
                { value: 'ollama', label: 'Ollama' },
                { value: 'openai', label: 'OpenAI' },
              ]}
            />
          </div>

          {/* Ollama embedding config */}
          {embeddingProvider === 'ollama' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
              <div>
                <Label>Ollama Server URL</Label>
                <TextInput
                  value={embeddingConfig.ollama_base_url}
                  onChange={v => setEmbeddingConfig(p => ({ ...p, ollama_base_url: v }))}
                  placeholder="http://localhost:11434"
                />
              </div>
              <div>
                <Label>Embedding Model</Label>
                <TextInput
                  value={embeddingConfig.ollama_model}
                  onChange={v => setEmbeddingConfig(p => ({ ...p, ollama_model: v }))}
                  placeholder="nomic-embed-text"
                />
              </div>
            </div>
          )}

          {/* OpenAI embedding config */}
          {embeddingProvider === 'openai' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
              <div>
                <Label>API Key</Label>
                <TextInput
                  value={embeddingConfig.openai_api_key}
                  onChange={v => setEmbeddingConfig(p => ({ ...p, openai_api_key: v }))}
                  placeholder="sk-…"
                  type="password"
                />
              </div>
              <div>
                <Label>Embedding Model</Label>
                <TextInput
                  value={embeddingConfig.openai_model}
                  onChange={v => setEmbeddingConfig(p => ({ ...p, openai_model: v }))}
                  placeholder="text-embedding-3-small"
                />
              </div>
            </div>
          )}

          {/* Test embedding */}
          <div className="flex items-center gap-3">
            <TestButton onClick={handleTestEmbed} loading={testingEmbed} label="Test Embedding" />
          </div>
          <TestResult result={embedTestResult} />

          {/* Embedding change warning */}
          {embeddingChanged && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-sm animate-fade-in">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Embedding model changed</p>
                <p className="text-xs mt-1 opacity-80">
                  Changing the embedding model invalidates existing vectors. After saving, you must rebuild the vector database for search and RAG to work correctly.
                </p>
              </div>
            </div>
          )}

          {/* Rebuild button */}
          <div className="pt-2 border-t border-[var(--border-color)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--fg)' }}>Rebuild Vector Database</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--fg-subtle)' }}>
                  Re-indexes all job descriptions and uploaded documents
                </p>
              </div>
              <button
                onClick={() => setShowRebuildConfirm(true)}
                disabled={rebuilding}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
              >
                {rebuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {rebuilding ? 'Rebuilding…' : 'Rebuild'}
              </button>
            </div>
            {rebuildDone && (
              <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm border border-green-500/20 animate-fade-in">
                <CheckCircle2 className="w-4 h-4" />
                Vector database rebuild has been queued and is processing in the background.
              </div>
            )}
          </div>
        </SectionCard>

      </div>

      {/* Rebuild Confirmation Dialog (Manual) */}
      <ConfirmDialog
        isOpen={showRebuildConfirm}
        title="Rebuild Vector Database"
        message="This will delete all existing vectors and re-index every job description and document. This may take a few minutes depending on the number of documents. Are you sure?"
        confirmLabel="Rebuild"
        onConfirm={() => handleRebuild()}
        onCancel={() => setShowRebuildConfirm(false)}
        variant="danger"
      />

      {/* Rebuild Confirmation Dialog (On Save) */}
      <ConfirmDialog
        isOpen={showSaveRebuildConfirm}
        title="Change Embedding Model?"
        message="You have changed the embedding configuration. Saving these changes will invalidate your existing search index. Would you like to save and trigger a full rebuild now?"
        confirmLabel="Save & Rebuild"
        onConfirm={() => handleSave(true)}
        onCancel={() => setShowSaveRebuildConfirm(false)}
        variant="default"
      />
    </div>
  );
}
