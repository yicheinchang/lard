"use client";

import React, { useState, useEffect } from 'react';
import { Sun, Moon, Monitor, Bot, BotOff, Server, Key, Database, RefreshCw,
  CheckCircle2, XCircle, Loader2, AlertTriangle, Sparkles, ChevronDown, RotateCcw
} from 'lucide-react';
import { DEFAULT_SYSTEM_PROMPTS } from '@/lib/constants';
import { useSettings, applyTheme } from '@/lib/SettingsContext';
import { useView } from '@/lib/ViewContext';
import {
  testLlmConnection,
  testEmbeddingConnection,
  rebuildVectors,
  updateSettings as apiUpdateSettings,
  getOllamaModels,
  getDefaultPrompts,
  type AppSettings,
  type LlmConfig,
  type EmbeddingConfig,
} from '@/lib/api';
import { ConfirmDialog } from './ConfirmDialog';

// ── Types ────────────────────────────────────────────────────────────

type ThemeOption = 'dark' | 'light' | 'system';
type LlmProvider = 'ollama' | 'openai' | 'anthropic';
type EmbeddingProvider = 'default' | 'ollama' | 'openai';

// ── Sub-Components ──────────────────────────────────────────────────

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

const Label = ({ children, onReset, resetLabel = "Reset to default" }: { 
  children: React.ReactNode; 
  onReset?: () => void;
  resetLabel?: string;
}) => (
  <div className="flex items-center justify-between mb-1.5">
    <label className="block text-sm font-medium" style={{ color: 'var(--fg-muted)' }}>{children}</label>
    {onReset && (
      <button
        type="button"
        onClick={onReset}
        title={resetLabel}
        className="p-1 rounded-md hover:bg-[var(--surface-hover)] text-[var(--fg-subtle)] hover:text-violet-400 transition-all"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
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

const TextAreaInput = ({ value, onChange, placeholder, rows = 12 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) => (
  <textarea
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    rows={rows}
    className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all resize-y custom-scrollbar"
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

// ── Component ────────────────────────────────────────────────────────

export function SettingsPage() {
  const { settings, updateSettings: ctxUpdate, refreshSettings } = useSettings();
  const { setDirty } = useView();

  // Local form state (buffered so we can save explicitly)
  const [theme, setTheme] = useState<ThemeOption>('dark');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('ollama');
  const [llmConfig, setLlmConfig] = useState<LlmConfig>({
    ollama_base_url: '', ollama_model: '',
    openai_api_key: '', openai_model: '',
    anthropic_api_key: '', anthropic_model: '',
    num_ctx: 8192,
  });
  const [extractionMode, setExtractionMode] = useState<'single' | 'multi'>('single');
  const [maxConcurrency, setMaxConcurrency] = useState(2);
  const [embeddingProvider, setEmbeddingProvider] = useState<EmbeddingProvider>('default');
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>({
    ollama_base_url: '', ollama_model: '',
    openai_api_key: '', openai_model: '',
  });
  const [customPrompts, setCustomPrompts] = useState<{
    single_agent: string;
    multi_agent: {
      company: string;
      role: string;
      location: string;
      salary_range: string;
      job_posted_date: string;
      application_deadline: string;
      description: string;
    };
    job_post_check: string;
    qa_json: string;
    qa_text: string;
  }>({
    single_agent: '',
    multi_agent: { company: '', role: '', location: '', salary_range: '', job_posted_date: '', application_deadline: '', description: '' },
    job_post_check: '',
    qa_json: '',
    qa_text: ''
  });
  const [systemPrompts, setSystemPrompts] = useState<AppSettings['system_prompts']>({
    extraction_base: '',
    extraction_description: '',
    json_ld: '',
    qa_validator: '',
    qa_validator_json: '',
    qa_validator_text: '',
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
    job_post_check: ''
  });
  const [factoryPrompts, setFactoryPrompts] = useState<AppSettings['system_prompts']>(DEFAULT_SYSTEM_PROMPTS);

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
  const [showAdvancedPrompts, setShowAdvancedPrompts] = useState(false);
  const [showSystemPrompts, setShowSystemPrompts] = useState(false);
  const [activePromptField, setActivePromptField] = useState<keyof typeof customPrompts.multi_agent | 'job_post_check' | 'qa_json' | 'qa_text'>('company');
  const [activeSystemTab, setActiveSystemTab] = useState<'global' | 'text' | 'json'>('global');
  const [activeSystemPrompt, setActiveSystemPrompt] = useState<keyof AppSettings['system_prompts']>('extraction_base');

  // Ollama-specific states
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isCheckingOllama, setIsCheckingOllama] = useState(false);

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
      extractionMode !== settings.extraction_mode ||
      maxConcurrency !== settings.max_concurrency ||
      embeddingProvider !== settings.embedding_provider ||
      JSON.stringify(embeddingConfig) !== JSON.stringify(settings.embedding_config) ||
      JSON.stringify(customPrompts) !== JSON.stringify(settings.custom_prompts) ||
      JSON.stringify(systemPrompts) !== JSON.stringify(settings.system_prompts)
    );
  }, [theme, aiEnabled, llmProvider, llmConfig, extractionMode, maxConcurrency, embeddingProvider, embeddingConfig, customPrompts, systemPrompts, settings]);

  // Update global navigation guard
  useEffect(() => {
    setDirty(isDirty, "You have unsaved changes in Settings. Do you want to discard them and move to another page?");
    return () => setDirty(false);
  }, [isDirty, setDirty]);

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
    // Fetch latest factory defaults from backend to ensure Reset works correctly
    getDefaultPrompts().then(setFactoryPrompts).catch(err => {
      console.warn("Failed to fetch backend prompt defaults, using frontend constants fallback:", err);
    });

    if (!settings) return;
    setTheme(settings.theme);
    setAiEnabled(settings.ai_enabled);
    setLlmProvider(settings.llm_provider);
    setLlmConfig(settings.llm_config);
    setExtractionMode(settings.extraction_mode);
    setMaxConcurrency(settings.max_concurrency || 2);
    setEmbeddingProvider(settings.embedding_provider);
    setEmbeddingConfig(settings.embedding_config);
    setOriginalEmbeddingProvider(settings.embedding_provider);
    setOriginalEmbeddingConfig(settings.embedding_config);
    setCustomPrompts(settings.custom_prompts || {
      single_agent: '',
      multi_agent: { company: '', role: '', location: '', salary_range: '', job_posted_date: '', application_deadline: '', description: '' },
      job_post_check: '',
      qa_json: '',
      qa_text: ''
    });
    if (settings.system_prompts) {
      setSystemPrompts(settings.system_prompts);
    }
  }, [settings]);

  // Ollama status checker
  useEffect(() => {
    if (llmProvider !== 'ollama' || !llmConfig.ollama_base_url) {
      setOllamaOnline(null);
      return;
    }

    const checkOllama = async () => {
      setIsCheckingOllama(true);
      try {
        const models = await getOllamaModels(llmConfig.ollama_base_url);
        setOllamaModels(models);
        setOllamaOnline(true);
      } catch (err) {
        setOllamaOnline(false);
        setOllamaModels([]);
      } finally {
        setIsCheckingOllama(false);
      }
    };

    const timer = setTimeout(checkOllama, 800);
    return () => clearTimeout(timer);
  }, [llmProvider, llmConfig.ollama_base_url]);

  // ── Prompt Sync logic ─────────────────────────────────────────────

  // Ensure activeSystemPrompt is always valid for the current extractionMode
  useEffect(() => {
    if (extractionMode === 'multi') {
      // In multi-mode, some global prompts are hidden
      if (activeSystemTab === 'global' && (activeSystemPrompt === 'extraction_base' || activeSystemPrompt === 'json_ld')) {
        setActiveSystemPrompt('job_post_check');
      }
    } else {
      // In single-mode, text/json tabs are hidden entirely
      if (activeSystemTab !== 'global') {
        setActiveSystemTab('global');
        setActiveSystemPrompt('extraction_base');
      } else if (activeSystemPrompt !== 'extraction_base' && activeSystemPrompt !== 'json_ld' && activeSystemPrompt !== 'qa_validator_json' && activeSystemPrompt !== 'qa_validator_text') {
        // If we were on a field prompt and switched to single-mode, reset to extraction_base
        setActiveSystemPrompt('extraction_base');
      }
    }
  }, [extractionMode, activeSystemTab, activeSystemPrompt]);

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
        extraction_mode: extractionMode,
        max_concurrency: maxConcurrency,
        embedding_provider: embeddingProvider,
        embedding_config: embeddingConfig,
        custom_prompts: customPrompts,
        system_prompts: systemPrompts,
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

  // ── Theme cards ────────────────────────────────────────────────────

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
          className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-semibold transition-all hover:scale-105 active:scale-95 flex items-center gap-2 shadow-lg shadow-primary/20 text-sm"
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
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <label className="block text-sm font-medium" style={{ color: 'var(--fg-muted)' }}>Ollama Server URL</label>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${
                            isCheckingOllama ? 'bg-amber-400 animate-pulse' :
                            ollamaOnline === true ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' :
                            ollamaOnline === false ? 'bg-red-500' :
                            'bg-gray-500'
                          }`} />
                          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--fg-subtle)' }}>
                            {isCheckingOllama ? 'Checking...' :
                             ollamaOnline === true ? 'Online' :
                             ollamaOnline === false ? 'Offline' :
                             'Enter URL'}
                          </span>
                        </div>
                      </div>
                      <TextInput
                        value={llmConfig.ollama_base_url}
                        onChange={v => setLlmConfig(p => ({ ...p, ollama_base_url: v }))}
                        placeholder="http://localhost:11434"
                      />
                    </div>
                    <div>
                      <Label>Model Name</Label>
                      <div className="relative group">
                        <input
                          list="ollama-models"
                          value={llmConfig.ollama_model}
                          onChange={e => setLlmConfig(p => ({ ...p, ollama_model: e.target.value }))}
                          placeholder={ollamaOnline ? "Select or type model..." : "e.g. gemma3:4b-it-qat"}
                          className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all border border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--fg)]"
                        />
                        <datalist id="ollama-models">
                          {ollamaModels.map(m => <option key={m} value={m} />)}
                        </datalist>
                      </div>
                    </div>
                  </div>

                  {ollamaOnline === true && ollamaModels.length > 0 && llmConfig.ollama_model && !ollamaModels.includes(llmConfig.ollama_model) && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs animate-shake">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <p>
                        Model <strong>"{llmConfig.ollama_model}"</strong> is not found on the server. 
                        Please select one from the list or ensure it is pulled correctly.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* OpenAI Config */}
              {llmProvider === 'openai' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Label>API Key</Label>
                      {llmConfig.openai_api_key?.includes('(System)') && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/20">
                          System Default
                        </span>
                      )}
                    </div>
                    <TextInput
                      value={llmConfig.openai_api_key}
                      onChange={v => setLlmConfig(p => ({ ...p, openai_api_key: v }))}
                      placeholder="sk-…"
                      type={llmConfig.openai_api_key?.includes('(System)') ? 'text' : 'password'}
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
                    <div className="flex items-center gap-2 mb-1.5">
                      <Label>API Key</Label>
                      {llmConfig.anthropic_api_key?.includes('(System)') && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/20">
                          System Default
                        </span>
                      )}
                    </div>
                    <TextInput
                      value={llmConfig.anthropic_api_key}
                      onChange={v => setLlmConfig(p => ({ ...p, anthropic_api_key: v }))}
                      placeholder="sk-ant-…"
                      type={llmConfig.anthropic_api_key?.includes('(System)') ? 'text' : 'password'}
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

              <div className="pt-4 space-y-6">
                {/* Extraction Strategy */}
                <div>
                  <Label>Extraction Strategy</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'single', label: 'Single-Agent', desc: 'Fast, for Large LLMs' },
                      { id: 'multi', label: 'Multi-Agent', desc: 'Accurate, for Small LLMs' },
                    ].map(mode => {
                      const active = extractionMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setExtractionMode(mode.id as 'single' | 'multi')}
                          className={`
                            p-3 rounded-xl border-2 transition-all text-left
                            ${active
                              ? 'border-violet-500 bg-violet-500/10'
                              : 'border-[var(--border-color)] hover:border-violet-500/40 hover:bg-violet-500/5'
                            }
                          `}
                        >
                          <p className="font-medium text-sm" style={{ color: active ? 'var(--primary)' : 'var(--fg)' }}>{mode.label}</p>
                          <p className="text-[10px] sm:text-xs" style={{ color: 'var(--fg-subtle)' }}>{mode.desc}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Max Concurrency AI Agents */}
                <div className="animate-fade-in group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Label>Max Concurrent AI Agents</Label>
                      <div className="p-1 rounded-full bg-violet-500/10 text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-help" title="Controls how many agents run in parallel during Multi-Agent extraction. Higher values improve speed but increase hardware load.">
                        <Sparkles className="w-3 h-3" />
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/20">
                      {maxConcurrency} Agents
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      value={maxConcurrency}
                      onChange={(e) => setMaxConcurrency(parseInt(e.target.value))}
                      className="flex-1 accent-violet-500 cursor-pointer h-1.5 rounded-lg appearance-none bg-[var(--border-color)]"
                    />
                    <div className="flex gap-1">
                      {[1, 2, 3, 5, 10].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setMaxConcurrency(v)}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${maxConcurrency === v ? 'bg-violet-500 border-violet-500 text-white' : 'border-[var(--border-color)] text-[var(--fg-subtle)] hover:border-violet-500/40'}`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] mt-2 leading-relaxed" style={{ color: 'var(--fg-subtle)' }}>
                    Recommended: <strong>2-3</strong> for local LLMs, <strong>5+</strong> for Cloud APIs. 
                    <span className="text-amber-500 ml-1 opacity-80 italic">Overloading local servers may cause timeouts.</span>
                  </p>
                </div>

                {/* LLM Context Window (num_ctx) */}
                <div className="animate-fade-in group pb-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Label>LLM Context Window (num_ctx)</Label>
                      <div className="p-1 rounded-full bg-violet-500/10 text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-help" title="The total amount of text (in tokens) the model can remember at once. Higher values allow larger job descriptions but use more memory.">
                        <Database className="w-3 h-3" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={llmConfig.num_ctx}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 0;
                          setLlmConfig(p => ({ ...p, num_ctx: v }));
                        }}
                        className="w-20 px-2 py-0.5 rounded border border-violet-500/20 bg-violet-500/5 text-violet-400 text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                      />
                      <span className="text-[10px] font-bold text-[var(--fg-subtle)] uppercase">Tokens</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1024"
                      max="32768"
                      step="1024"
                      value={llmConfig.num_ctx}
                      onChange={(e) => setLlmConfig(p => ({ ...p, num_ctx: parseInt(e.target.value) }))}
                      className="flex-1 accent-violet-500 cursor-pointer h-1.5 rounded-lg appearance-none bg-[var(--border-color)]"
                    />
                    <div className="flex gap-1">
                      {[1024, 4096, 8192, 16384, 32768].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setLlmConfig(p => ({ ...p, num_ctx: v }))}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${llmConfig.num_ctx === v ? 'bg-violet-500 border-violet-500 text-white' : 'border-[var(--border-color)] text-[var(--fg-subtle)] hover:border-violet-500/40'}`}
                        >
                          {v >= 1024 ? `${v/1024}k` : v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] mt-2 leading-relaxed" style={{ color: 'var(--fg-subtle)' }}>
                    Standard: <strong>8192</strong> (8k). Cloud models (OpenAI/Anthropic) usually support 128k+, but local models are often limited to 8k-32k.
                  </p>
                </div>
              </div>

              {/* Collapsible Advanced Prompts */}
              <div className="mt-8 pt-6 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowAdvancedPrompts(!showAdvancedPrompts)}
                  className="flex items-center justify-between w-full group"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className={`w-4 h-4 ${showAdvancedPrompts ? 'text-violet-400' : 'text-[var(--fg-subtle)]'}`} />
                    <span className="text-sm font-semibold text-[var(--fg)] group-hover:text-violet-400 transition-colors">
                      Advanced AI Prompt Settings
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showAdvancedPrompts ? 'rotate-180 text-violet-400' : 'text-[var(--fg-subtle)]'}`} />
                </button>

                {showAdvancedPrompts && (
                  <div className="mt-5 space-y-5 animate-slide-up border-l-2 border-violet-500/10 pl-5 ml-2">
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-violet-500/5 border border-violet-500/10 text-[var(--fg-muted)] text-xs">
                      <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-violet-400" />
                      <div>
                        <p className="font-semibold text-violet-300">Additive Guidance</p>
                        <p className="mt-1 opacity-80 leading-relaxed">
                          These instructions are appended to the system prompts. Use them to fine-tune extraction behavior or enforcement.
                        </p>
                        <button
                          onClick={() => setCustomPrompts({
                            single_agent: '',
                            multi_agent: { company: '', role: '', location: '', salary_range: '', job_posted_date: '', application_deadline: '', description: '' },
                            job_post_check: '',
                            qa_json: '',
                            qa_text: ''
                          })}
                          className="mt-3 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-[var(--surface)] border border-violet-500/20 hover:bg-violet-500/10 transition-all text-violet-300 uppercase tracking-tight"
                        >
                          Reset all prompts
                        </button>
                      </div>
                    </div>

                    {extractionMode === 'single' ? (
                      <div className="space-y-2">
                        <Label 
                          onReset={() => setCustomPrompts(p => ({ ...p, single_agent: '' }))}
                          resetLabel="Clear custom instructions"
                        >
                          Single-Agent System Instructions
                        </Label>
                        <TextAreaInput
                          rows={12}
                          value={customPrompts.single_agent}
                          onChange={v => setCustomPrompts(p => ({ ...p, single_agent: v }))}
                          placeholder="Example: Always prefer the remote office. Ensure base compensation is formatted strictly numerically..."
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-1.5 p-1 bg-[var(--surface)] rounded-xl border border-[var(--border-color)]">
                          {[
                            { id: 'company', label: 'Company' },
                            { id: 'role', label: 'Role' },
                            { id: 'location', label: 'Location' },
                            { id: 'salary_range', label: 'Salary' },
                            { id: 'job_posted_date', label: 'Posted' },
                            { id: 'application_deadline', label: 'Deadline' },
                            { id: 'description', label: 'Description' },
                            { id: 'job_post_check', label: 'Job Check', hide: extractionMode === 'single' },
                            { id: 'qa_json', label: 'JSON QA' },
                            { id: 'qa_text', label: 'Text QA' },
                          ].map(tab => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setActivePromptField(tab.id as any)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-tight ${
                                activePromptField === tab.id
                                  ? 'bg-violet-600 text-white shadow-md'
                                  : 'text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-violet-500/5'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        <div className="animate-fade-in">
                          <Label 
                            onReset={() => setCustomPrompts(p => {
                               if (activePromptField === 'job_post_check' || activePromptField === 'qa_json' || activePromptField === 'qa_text') {
                                 return { ...p, [activePromptField]: '' };
                               }
                               return {
                                 ...p,
                                 multi_agent: { ...p.multi_agent, [activePromptField]: '' }
                               };
                             })}
                            resetLabel={`Clear custom ${activePromptField.replace(/_/g, ' ')} guidance`}
                          >
                            {activePromptField.replace(/_/g, ' ')} guidance
                          </Label>
                          <TextAreaInput
                            rows={12}
                            value={(activePromptField === 'job_post_check' || activePromptField === 'qa_json' || activePromptField === 'qa_text') ? customPrompts[activePromptField as 'job_post_check' | 'qa_json' | 'qa_text'] : customPrompts.multi_agent[activePromptField as keyof typeof customPrompts.multi_agent]}
                            onChange={v => {
                                if (activePromptField === 'job_post_check' || activePromptField === 'qa_json' || activePromptField === 'qa_text') {
                                  setCustomPrompts(p => ({ ...p, [activePromptField]: v }));
                                } else {
                                  setCustomPrompts(p => ({
                                    ...p,
                                    multi_agent: { ...p.multi_agent, [activePromptField]: v }
                                  }));
                                }
                              }}
                            placeholder={`Provide custom instructions for parsing the ${activePromptField.replace(/_/g, ' ')}...`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Collapsible System Prompts Section (Sub-section) */}
              <div className="mt-5 pt-5 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowSystemPrompts(!showSystemPrompts)}
                  className="flex items-center justify-between w-full group"
                >
                  <div className="flex items-center gap-2">
                    <Database className={`w-4 h-4 ${showSystemPrompts ? 'text-amber-400' : 'text-[var(--fg-subtle)]'}`} />
                    <span className="text-sm font-semibold text-[var(--fg)] group-hover:text-amber-400 transition-colors">
                      Base System Prompts
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showSystemPrompts ? 'rotate-180 text-amber-400' : 'text-[var(--fg-subtle)]'}`} />
                </button>

                {showSystemPrompts && (
                  <div className="mt-5 space-y-5 animate-slide-up border-l-2 border-amber-500/10 pl-5 ml-2">
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 text-[var(--fg-muted)] text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <p className="font-semibold text-amber-300">Advanced Prompt Engineering</p>
                        <p className="mt-1 opacity-80 leading-relaxed">
                          These are the core instructions defined in the backend. Modifying them can drastically alter extraction accuracy.
                        </p>
                        <button
                          onClick={() => setSystemPrompts({ ...factoryPrompts })}
                          className="mt-3 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-[var(--surface)] border border-amber-500/20 hover:bg-amber-500/10 transition-all text-amber-300 uppercase tracking-tight"
                        >
                          Reset system prompts
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Prompts Category Tabs */}
                      <div className="flex gap-4 border-b border-[var(--border-color)]">
                        {[
                          { id: 'global', label: 'Global' },
                          { id: 'text', label: 'Field (Text)', hide: extractionMode === 'single' },
                          { id: 'json', label: 'Field (JSON)', hide: extractionMode === 'single' },
                        ].filter(t => !t.hide).map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setActiveSystemTab(t.id as any);
                              if (t.id === 'global') setActiveSystemPrompt(extractionMode === 'single' ? 'extraction_base' : 'job_post_check');
                              if (t.id === 'text') setActiveSystemPrompt('field_company');
                              if (t.id === 'json') setActiveSystemPrompt('json_company');
                            }}
                            className={`pb-2 text-xs font-bold transition-all uppercase tracking-tight ${
                              activeSystemTab === t.id
                                ? 'border-b-2 border-amber-500 text-amber-400'
                                : 'text-[var(--fg-subtle)] hover:text-[var(--fg)]'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {/* Sub-tabs based on Category */}
                      <div className="flex flex-wrap gap-1.5 p-1 bg-[var(--surface)] rounded-xl border border-[var(--border-color)]">
                        {activeSystemTab === 'global' && [
                          { id: 'extraction_base', label: 'Main (Single)', hide: extractionMode === 'multi' },
                          { id: 'json_ld', label: 'JSON-LD (Single)', hide: extractionMode === 'multi' },
                          { id: 'job_post_check', label: 'Job Check', hide: extractionMode === 'single' },
                          { id: 'qa_validator_json', label: 'JSON Validation' },
                          { id: 'qa_validator_text', label: 'Text Validation' },
                        ].filter(tab => !tab.hide).map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveSystemPrompt(tab.id as any)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-tight ${
                              activeSystemPrompt === tab.id
                                ? 'bg-amber-600 text-white shadow-md'
                                : 'text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-amber-500/5'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                        {activeSystemTab === 'text' && [
                          { id: 'field_company', label: 'Company' },
                          { id: 'field_role', label: 'Role' },
                          { id: 'field_location', label: 'Location' },
                          { id: 'field_salary', label: 'Salary' },
                          { id: 'field_id', label: 'Job ID' },
                          { id: 'field_posted', label: 'Posted' },
                          { id: 'field_deadline', label: 'Deadline' },
                          { id: 'extraction_description', label: 'Description' },
                        ].map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveSystemPrompt(tab.id as any)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-tight ${
                              activeSystemPrompt === tab.id
                                ? 'bg-amber-600 text-white shadow-md'
                                : 'text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-amber-500/5'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                        {activeSystemTab === 'json' && [
                          { id: 'json_company', label: 'Company' },
                          { id: 'json_role', label: 'Role' },
                          { id: 'json_location', label: 'Location' },
                          { id: 'json_salary', label: 'Salary' },
                          { id: 'json_id', label: 'Job ID' },
                          { id: 'json_posted', label: 'Posted' },
                          { id: 'json_deadline', label: 'Deadline' },
                          { id: 'json_description', label: 'Description' },
                        ].map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveSystemPrompt(tab.id as any)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-tight ${
                              activeSystemPrompt === tab.id
                                ? 'bg-amber-600 text-white shadow-md'
                                : 'text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-amber-500/5'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="animate-fade-in min-h-[160px]">
                        <Label 
                          onReset={() => setSystemPrompts(p => ({
                            ...p,
                            [activeSystemPrompt]: factoryPrompts[activeSystemPrompt as keyof typeof factoryPrompts] || ''
                          }))}
                          resetLabel={`Restore default ${activeSystemPrompt.replace(/^(field_|json_)/, '').replace(/_/g, ' ')} prompt`}
                        >
                          {activeSystemPrompt.replace(/^(field_|json_)/, '').replace(/_/g, ' ')} base text ({activeSystemTab})
                        </Label>
                        <TextAreaInput
                          rows={12}
                          value={systemPrompts[activeSystemPrompt] || ''}
                          onChange={v => setSystemPrompts(p => ({
                            ...p,
                            [activeSystemPrompt]: v
                          }))}
                          placeholder="Loading default prompt..."
                        />
                        <p className="text-[10px] mt-2 opacity-60 italic" style={{ color: 'var(--fg-subtle)' }}>
                          Leave empty and save to revert to hardcoded factory default.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
