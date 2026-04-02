import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, Link as LinkIcon, Building2, Briefcase, Plus, ChevronDown, ChevronUp, FileText, Upload, Zap, Paperclip, AlertTriangle } from 'lucide-react';
import { extractJobFromUrl, extractJobFromPdf, createJobStream, checkJobDuplicate, getCompanies, Job } from '../lib/api';
import { useSettings } from '@/lib/SettingsContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ProcessingOverlay } from './ProcessingOverlay';
import { Ticker } from './Ticker';

interface AddJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddJob: (job: Partial<Job>, file: File | null, onProgress: (event: string, msg: string, data?: any) => void) => Promise<any>;
}

const initialFormData: Partial<Job> = {
  company: '', role: '', url: '', status: 'Wishlist',
  location: '', company_job_id: '', hr_email: '', hiring_manager_name: '',
  hiring_manager_email: '', headhunter_name: '', headhunter_email: '',
  job_posted_date: '', application_deadline: '', description: '', salary_range: '',
  applied_date: '', closed_date: ''
};

// ── Helper Components (Defined outside to prevent focus loss) ──

const InputField = ({ label, field, value, onChange, type = "text", placeholder }: {
  label: string; field: keyof Job; value: string; onChange: (value: string) => void; type?: string; placeholder?: string;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs text-gray-400">{label}</label>
    <input
      type={type}
      placeholder={placeholder}
      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const StatusSelect = ({ value, appliedDate, onChange }: { 
  value: string; appliedDate?: string; onChange: (value: string) => void; 
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs text-gray-400">Initial Status</label>
    <select
      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-violet-500 transition-colors text-sm appearance-none cursor-pointer"
      value={value || 'Wishlist'}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="Wishlist" className="bg-[#1a1a24] text-white">Wishlist</option>
      <option value="Applied" className="bg-[#1a1a24] text-white">Applied</option>
      <option value="Interviewing" className="bg-[#1a1a24] text-white" disabled={!appliedDate}>Interviewing (Requires Applied Date)</option>
      <option value="Offered" className="bg-[#1a1a24] text-white" disabled={!appliedDate}>Offered (Requires Applied Date)</option>
      <option value="Rejected" className="bg-[#1a1a24] text-white" disabled={!appliedDate}>Rejected (Requires Applied Date)</option>
      <option value="Closed" className="bg-[#1a1a24] text-white">Closed</option>
      <option value="Discontinued" className="bg-[#1a1a24] text-white">Discontinued</option>
    </select>
  </div>
);

const FilePicker = ({ label, hint, selectedFile, isExtracting, fileInputRef, onFileSelect, onRemoveFile }: { 
  label: string; hint: string; selectedFile: File | null; isExtracting: boolean; fileInputRef: React.RefObject<HTMLInputElement | null>; onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void; onRemoveFile: () => void; 
}) => (
  <div>
    <input
      type="file"
      accept=".pdf,.md,.txt"
      className="hidden"
      ref={fileInputRef}
      onChange={onFileSelect}
    />
    {selectedFile ? (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-violet-500/40 bg-violet-500/10">
        <FileText className="w-4 h-4 text-violet-400 shrink-0" />
        <span className="text-sm text-violet-300 flex-1 truncate">{selectedFile.name}</span>
        <button
          type="button"
          onClick={onRemoveFile}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors shrink-0"
        >
          Remove
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isExtracting}
        className="w-full border border-dashed border-white/15 hover:border-violet-400/50 hover:bg-violet-500/5 text-gray-500 hover:text-gray-300 px-4 py-3 rounded-lg transition-all disabled:opacity-50 flex justify-center items-center gap-2 text-sm"
      >
        <Upload className="w-4 h-4" />
        {label}
      </button>
    )}
    {!selectedFile && <p className="text-xs text-gray-600 mt-1.5">{hint}</p>}
  </div>
);

export const AddJobModal: React.FC<AddJobModalProps> = ({ isOpen, onClose, onAddJob }) => {
  const { aiEnabled: globalAiEnabled } = useSettings();
  const [formData, setFormData] = useState<Partial<Job>>(initialFormData);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Shared file state — used for AI extraction (AI on) or attachment (AI off)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Custom states for duplication and suggestions
  const [companies, setCompanies] = useState<{id: number, name: string}[]>([]);
  const [duplicateCheckResult, setDuplicateCheckResult] = useState<any>(null);
  const [showSimilarConfirm, setShowSimilarConfirm] = useState(false);
  const [showCancelExtractionConfirm, setShowCancelExtractionConfirm] = useState(false);
  const [hallucinationWarning, setHallucinationWarning] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Document upload state (for manual attachments)
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadTasks, setUploadTasks] = useState([
    { id: 'meta', label: 'Saving job metadata...', status: 'waiting' as any },
    { id: 'upload', label: 'Uploading job post doc...', status: 'waiting' as any },
    { id: 'vector-doc', label: 'Vectorizing document...', status: 'waiting' as any },
    { id: 'vector-desc', label: 'Vectorizing description...', status: 'waiting' as any },
    { id: 'finalize', label: 'Finalizing...', status: 'waiting' as any },
  ]);

  React.useEffect(() => {
    if (isOpen) {
      getCompanies().then(setCompanies).catch(console.error);
      resetForm();
    } else {
      // Abort any pending extraction if modal is closed
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof Job, value: string) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Auto-set applied_date if moving FROM Wishlist to something else (except Closed/Discontinued)
      if (field === 'status') {
        const isTerminalNoDate = value === 'Closed' || value === 'Discontinued';
        
        if (value !== 'Wishlist' && !isTerminalNoDate && (prev.status === 'Wishlist' || !prev.status)) {
          // Only set if not already set
          if (!prev.applied_date) {
            newData.applied_date = new Date().toISOString().substring(0, 10);
          }
        } else if (value === 'Wishlist') {
          newData.applied_date = '';
        }
      }

      if (field === 'applied_date') {
        if (!value && prev.status !== 'Wishlist' && prev.status !== 'Discontinued') {
          newData.status = 'Wishlist';
        } else if (value && prev.status === 'Wishlist') {
          newData.status = 'Applied';
        }
      }

      return newData;
    });
  };

  const handleToggleAi = () => {
    if (!globalAiEnabled) return; // Can't enable AI if it's globally off
    setAiEnabled(prev => !prev);
    setError('');
    // File stays selected — user may have picked it before toggling
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setError('');
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── AI extraction (only when AI is enabled) ──
  const handleExtract = async () => {
    setError('');
    setIsExtracting(true);
    setExtractionStatus('Initializing AI...');
    
    // Create new abort controller
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    try {
      const endpoint = selectedFile ? '/api/ai/extract-pdf-stream' : '/api/ai/extract-url-stream';
      const body = selectedFile ? (() => {
        const fd = new FormData();
        fd.append('file', selectedFile);
        return fd;
      })() : JSON.stringify({ url: formData.url });

      const response = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST',
        headers: selectedFile ? {} : { 'Content-Type': 'application/json' },
        body,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      if (!response.body) throw new Error('ReadableStream not supported');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.replace('data: ', '');
            try {
              const data = JSON.parse(jsonStr);
              if (data.event === 'progress' || data.event === 'extracting' || data.event === 'field_done') {
                setExtractionStatus(data.msg);
              } else if (data.event === 'final_result') {
                applyExtraction(data);
              } else if (data.event === 'error') {
                setError(data.msg);
              }
            } catch (e) {
              console.error('Error parsing SSE:', e);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'CanceledError') {
        console.log('Extraction aborted');
        setExtractionStatus('Cancelled');
      } else {
        handleExtractError(err);
      }
    } finally {
      setIsExtracting(false);
      setExtractionStatus('');
      abortControllerRef.current = null;
    }
  };

  const handleCancelExtraction = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsExtracting(false);
    setExtractionStatus('');
  };

  const applyExtraction = (data: any) => {
    if (data.error) {
      setError(data.error);
    } else if (data.extracted) {
      setFormData(prev => ({
        ...prev,
        company: data.extracted.company || prev.company,
        role: data.extracted.role || prev.role,
        location: data.extracted.location || prev.location,
        company_job_id: data.extracted.company_job_id || prev.company_job_id,
        job_posted_date: isValidDate(data.extracted.job_posted_date) ? data.extracted.job_posted_date : prev.job_posted_date,
        application_deadline: isValidDate(data.extracted.application_deadline) ? data.extracted.application_deadline : prev.application_deadline,
        salary_range: data.extracted.salary_range || prev.salary_range,
        description: data.extracted.description || prev.description,
      }));
      
      const hasAdvanced = !!(
        data.extracted.location || 
        data.extracted.salary_range || 
        data.extracted.description || 
        data.extracted.company_job_id ||
        data.extracted.job_posted_date ||
        data.extracted.application_deadline
      );
      
      if (hasAdvanced) {
        setShowAdvanced(true);
      }
      
      if (data.extracted.hallucination_detected) {
        setHallucinationWarning(data.extracted.hallucination_reasons || "Potential AI Hallucination detected.");
      } else {
        setHallucinationWarning(null);
      }
    }
  };

  const handleExtractError = (err: any) => {
    const detail = err?.response?.data?.detail;
    if (Array.isArray(detail)) {
      setError(detail.map((d: any) => d.msg || JSON.stringify(d)).join(', '));
    } else {
      setError(typeof detail === 'string' ? detail : (err.message || 'Failed to extract data'));
    }
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setShowAdvanced(false);
    setSelectedFile(null);
    setError('');
    setHallucinationWarning(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isValidDate = (dateStr: any) => {
    if (!dateStr || typeof dateStr !== 'string') return false;
    // Basic YYYY-MM-DD check
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const d = new Date(dateStr);
    return d instanceof Date && !isNaN(d.getTime());
  };

  const handleSubmit = async (e: React.FormEvent, skipCheck = false) => {
    if (e) e.preventDefault();
    
    // Guard: Prevent submitting while extracting
    if (isExtracting && !skipCheck) {
      setShowCancelExtractionConfirm(true);
      return;
    }

    if (!formData.company || !formData.role) {
      setError('Company and Role are required.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      // 1. Perform Duplicate Check (if not skipped)
      if (!skipCheck) {
        const check = await checkJobDuplicate({
          company: formData.company,
          role: formData.role,
          url: formData.url,
          company_job_id: formData.company_job_id
        });

        if (check.status === 'exact_match') {
          const dateLabel = check.job.status === 'Wishlist' ? 'Added' : 'Applied';
          setError(`This role already exists! Found matching ${check.match_type} for ${check.job.company} - ${check.job.role} (${dateLabel} on ${new Date(check.job.applied_date).toLocaleDateString()}).`);
          setIsSubmitting(false);
          return;
        }

        if (check.status === 'similar_match') {
          setDuplicateCheckResult(check);
          setShowSimilarConfirm(true);
          setIsSubmitting(false);
          return;
        }
      }

      // 2. Proceed with creation
      const jobData = Object.fromEntries(
        Object.entries(formData).map(([k, v]) => [k, v === '' ? null : v])
      );
      
      setIsUploadingDoc(true);
      setUploadError(null);
      setUploadTasks(prev => prev.map(t => ({ ...t, status: 'waiting' })));

      try {
        await onAddJob(jobData, selectedFile, (event, msg) => {
          if (event === 'progress') {
            setUploadTasks(prev => {
              const currentTasks = [...prev];
              if (msg.includes('metadata')) {
                currentTasks[0].status = 'loading';
              } else if (msg.includes('Uploading job post')) {
                currentTasks[0].status = 'completed';
                currentTasks[1].status = 'loading';
              } else if (msg.includes('Vectorizing document')) {
                currentTasks[1].status = 'completed';
                currentTasks[2].status = 'loading';
              } else if (msg.includes('Vectorizing job description')) {
                currentTasks[0].status = 'completed';
                currentTasks[1].status = currentTasks[1].status === 'waiting' ? 'waiting' : 'completed';
                currentTasks[2].status = currentTasks[2].status === 'waiting' ? 'waiting' : 'completed';
                currentTasks[3].status = 'loading';
              }
              return currentTasks;
            });
          } else if (event === 'completed') {
            setUploadTasks(prev => prev.map(t => t.status === 'loading' || t.status === 'waiting' ? { ...t, status: 'completed' } : t));
            resetForm();
            onClose();
          } else if (event === 'error') {
            setUploadError(msg);
            setUploadTasks(prev => prev.map(t => t.status === 'loading' ? { ...t, status: 'error' } : t));
          }
        });
      } catch (error: any) {
        setUploadError(error.message || 'Failed to add job application');
      }
      return; 
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg || JSON.stringify(d)).join(', '));
      } else {
        setError(typeof detail === 'string' ? detail : (err.message || 'Failed to add job'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };


  const canExtract = !!(selectedFile || formData.url);
  // Effective AI state: local toggle AND global setting
  const effectiveAiEnabled = aiEnabled && globalAiEnabled;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="glass bg-[#0a0a0f] w-full max-w-2xl rounded-2xl p-6 shadow-2xl relative animate-slide-up border-violet-500/20 my-auto max-h-[90vh] flex flex-col">

        <button onClick={onClose} className="absolute right-4 top-4 text-gray-500 hover:text-white transition-colors z-10">
          ✕
        </button>

        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-400 mb-6 flex items-center gap-2 shrink-0">
          <Plus className="w-6 h-6 text-violet-400" />
          Add Job Application
        </h2>

        <div className="space-y-5 overflow-y-auto custom-scrollbar pr-2 flex-1 pb-4">

          {/* ── Application URL (always visible) ── */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-gray-400" />
              Application URL
              <span className="text-xs text-gray-600 font-normal">(saved as clickable link in job details)</span>
            </label>
            <input
              type="url"
              placeholder="https://company.com/careers/job-listing..."
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
              value={formData.url || ''}
              onChange={(e) => handleChange('url', e.target.value)}
            />
          </div>

          {/* ── AI Auto-fill Toggle Section (hidden when AI is globally disabled) ── */}
          {globalAiEnabled && (
          <div className={`rounded-xl border transition-all duration-300 ${effectiveAiEnabled ? 'border-violet-500/30 bg-violet-500/5' : 'border-white/8 bg-white/[0.02]'}`}>

            {/* Toggle Header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className={`w-4 h-4 transition-colors ${effectiveAiEnabled ? 'text-violet-400' : 'text-gray-600'}`} />
                <span className={`text-sm font-medium transition-colors ${effectiveAiEnabled ? 'text-violet-300' : 'text-gray-500'}`}>
                  AI Auto-fill
                </span>
                {effectiveAiEnabled && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30 flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5" /> ON
                  </span>
                )}
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={handleToggleAi}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none ${effectiveAiEnabled ? 'bg-violet-600' : 'bg-white/10'}`}
                aria-label="Toggle AI auto-fill"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-300 ${effectiveAiEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* ── AI ON: extraction controls ── */}
            {effectiveAiEnabled && (
              <div className="px-4 pb-4 space-y-3 animate-fade-in border-t border-violet-500/15 pt-3">
                <p className="text-xs text-gray-500">
                  Provide a URL and/or upload a job post file.{' '}
                  <strong className="text-violet-400">File takes priority</strong> over URL when both are present.
                </p>

                <FilePicker
                  label="Upload Job Post (PDF / Markdown / Text)"
                  hint="Supports .pdf, .md, .txt — takes priority over URL for extraction"
                  selectedFile={selectedFile}
                  isExtracting={isExtracting}
                  fileInputRef={fileInputRef}
                  onFileSelect={handleFileSelect}
                  onRemoveFile={handleRemoveFile}
                />

                <button
                  type="button"
                  onClick={() => {
                    if (isExtracting) {
                      setShowCancelExtractionConfirm(true);
                    } else {
                      handleExtract();
                    }
                  }}
                  disabled={!isExtracting && !canExtract}
                  className={`w-full ${isExtracting ? 'bg-violet-600/20 border border-violet-500/30' : 'bg-violet-600 hover:bg-violet-500'} text-white px-4 py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2 overflow-hidden min-h-[44px]`}
                >
                  {isExtracting ? (
                    <div className="flex items-center gap-3 w-full px-2 animate-fade-in">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-400 shrink-0" />
                      <div className="flex-1 overflow-hidden">
                        <Ticker text={extractionStatus} />
                      </div>
                      <span className="text-[10px] text-violet-400 font-bold uppercase tracking-widest shrink-0">Stop</span>
                    </div>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Auto-fill from {selectedFile ? 'File' : 'URL'}</>
                  )}
                </button>

                {!canExtract && (
                  <p className="text-xs text-center text-gray-600">Enter a URL above or upload a file to enable auto-fill</p>
                )}
              </div>
            )}

            {/* ── AI OFF: manual document attach ── */}
            {!effectiveAiEnabled && (
              <div className="px-4 pb-4 animate-fade-in border-t border-white/5 pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-400">Attach Job Post Document</span>
                  <span className="text-xs text-gray-600">(optional — will be saved with the application)</span>
                </div>
                <FilePicker
                  label="Upload Job Post (PDF / Markdown / Text)"
                  hint="Will be attached as a 'Job Post' document after saving"
                  selectedFile={selectedFile}
                  isExtracting={isExtracting}
                  fileInputRef={fileInputRef}
                  onFileSelect={handleFileSelect}
                  onRemoveFile={handleRemoveFile}
                />
              </div>
            )}
          </div>
          )}

          {/* ── Main Form ── */}
          <form id="add-job-form" onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-red-400 text-sm p-4 bg-red-400/10 rounded-xl border border-red-400/20 shadow-lg animate-pulse-subtle">
                <div className="flex items-start gap-3">
                   <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                   <div className="flex-1">
                      <p className="font-semibold mb-1">Could not add application:</p>
                      <ul className="list-disc list-inside space-y-1 text-xs opacity-90">
                        {error.split(', ').map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                   </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Company *</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    required
                    list="company-list"
                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                    value={formData.company}
                    onChange={(e) => handleChange('company', e.target.value)}
                  />
                  <datalist id="company-list">
                    {companies.map(c => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Role *</label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                    value={formData.role}
                    onChange={(e) => handleChange('role', e.target.value)}
                  />
                </div>
              </div>

              <StatusSelect 
                value={formData.status || 'Wishlist'} 
                appliedDate={formData.applied_date} 
                onChange={(val) => handleChange('status', val)} 
              />

              {formData.status !== 'Wishlist' && formData.applied_date && (
                <div className="animate-fade-in">
                  <InputField 
                    label="Actually Applied Date" 
                    field="applied_date" 
                    type="date" 
                    value={formData.applied_date || ''}
                    onChange={(val) => handleChange('applied_date', val)}
                  />
                  <p className="text-[10px] text-violet-400/60 mt-1 pl-1">Adjust if you applied on a different date.</p>
                </div>
              )}

              {formData.status === 'Closed' && (
                <div className="animate-fade-in">
                   <InputField 
                    label="Job Closed Date" 
                    field="closed_date" 
                    type="date" 
                    value={formData.closed_date || ''}
                    onChange={(val) => handleChange('closed_date', val)}
                  />
                  <p className="text-[10px] text-violet-400/60 mt-1 pl-1 italic">Leave blank if the exact date is unknown.</p>
                </div>
              )}
            </div>

            <div className="pt-1">
              <button
                type="button"
                className="flex items-center gap-2 text-violet-400 text-sm font-medium hover:text-violet-300 transition-colors"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showAdvanced ? 'Hide Advanced Details' : 'Show Advanced Details'}
              </button>
            </div>

            {showAdvanced && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 animate-fade-in">
                <InputField label="Location" field="location" value={formData.location || ''} onChange={(val) => handleChange('location', val)} />
                <InputField label="Salary Range" field="salary_range" value={formData.salary_range || ''} onChange={(val) => handleChange('salary_range', val)} />
                <InputField label="Company Job ID" field="company_job_id" value={formData.company_job_id || ''} onChange={(val) => handleChange('company_job_id', val)} />
                <InputField label="Posted Date" field="job_posted_date" type="date" value={formData.job_posted_date || ''} onChange={(val) => handleChange('job_posted_date', val)} />
                <InputField label="Application Deadline" field="application_deadline" type="date" value={formData.application_deadline || ''} onChange={(val) => handleChange('application_deadline', val)} />
                <InputField label="HR / Recruiter Email" field="hr_email" type="email" value={formData.hr_email || ''} onChange={(val) => handleChange('hr_email', val)} />
                <InputField label="Hiring Manager Name" field="hiring_manager_name" value={formData.hiring_manager_name || ''} onChange={(val) => handleChange('hiring_manager_name', val)} />
                <InputField label="Hiring Manager Email" field="hiring_manager_email" type="email" value={formData.hiring_manager_email || ''} onChange={(val) => handleChange('hiring_manager_email', val)} />
                <InputField label="Headhunter Name" field="headhunter_name" value={formData.headhunter_name || ''} onChange={(val) => handleChange('headhunter_name', val)} />
                <InputField label="Headhunter Email" field="headhunter_email" type="email" value={formData.headhunter_email || ''} onChange={(val) => handleChange('headhunter_email', val)} />
                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs text-gray-400 block px-0.5">Job Description (Markdown)</label>
                    {formData.description && (
                      <button 
                         type="button" 
                         onClick={() => handleChange('description', '')}
                         className="text-[10px] text-gray-500 hover:text-red-400 transition-colors uppercase font-bold tracking-tight"
                      >
                         Clear
                      </button>
                    )}
                  </div>

                  {hallucinationWarning && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl animate-fade-in mb-3">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-1">
                          <p className="text-xs font-bold text-amber-500 uppercase tracking-wide">Potential Hallucination Detected</p>
                          <p className="text-[11px] text-amber-200/70 leading-relaxed italic line-clamp-2 hover:line-clamp-none transition-all cursor-default overflow-hidden">
                             {hallucinationWarning}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleChange('description', '');
                            setHallucinationWarning(null);
                          }}
                          className="bg-amber-500/20 hover:bg-amber-500/40 text-amber-500 p-1.5 rounded-lg transition-colors shrink-0"
                          title="Discard problematic output"
                        >
                          <span className="text-xs">✕</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <textarea
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors text-sm min-h-[150px] custom-scrollbar"
                    value={formData.description || ''}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Provide full job description here..."
                  />
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="pt-4 mt-2 flex justify-end gap-3 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (isExtracting) {
                handleCancelExtraction();
              }
              onClose();
            }}
            className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-job-form"
            disabled={isSubmitting}
            className="bg-white text-black hover:bg-gray-200 px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Job'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showSimilarConfirm}
        title="Similar Record Found"
        message={duplicateCheckResult ? (
          <div>
            <p className="mb-2">A similar role was found in your system:</p>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <p className="font-semibold text-white">{duplicateCheckResult.job.company} - {duplicateCheckResult.job.role}</p>
              <p className="text-xs text-gray-400">Current Status: <span className="text-violet-400 font-medium">{duplicateCheckResult.job.status}</span></p>
              <p className="text-xs text-gray-400">
                {duplicateCheckResult.job.status === 'Wishlist' ? 'Added to system: ' : 'Applied on: '}
                {new Date(duplicateCheckResult.job.applied_date).toLocaleDateString()}
              </p>
              {duplicateCheckResult.job.job_posted_date && (
                <p className="text-xs text-gray-400">Job Posted on: {new Date(duplicateCheckResult.job.job_posted_date).toLocaleDateString()}</p>
              )}
            </div>
            <p className="mt-3">Are you sure you want to add this as a new application?</p>
          </div>
        ) : ""}
        onConfirm={() => handleSubmit(null as any, true)} // skipCheck = true
        onCancel={() => setShowSimilarConfirm(false)}
        confirmLabel="Add Anyway"
        cancelLabel="Wait, I'll Check"
        variant="default"
      />

      {/* Extraction Cancellation Support */}
      <ConfirmDialog
        isOpen={showCancelExtractionConfirm}
        title="Extraction in Progress"
        message="AI is still extracting job details. Do you want to cancel the extraction and add the job now with your current manual input?"
        confirmLabel="Cancel AI & Add Job"
        cancelLabel="Continue Waiting"
        onConfirm={() => {
          handleCancelExtraction();
          setShowCancelExtractionConfirm(false);
          // Manually trigger submit with skipCheck = true
          setTimeout(() => handleSubmit(null as any, true), 50);
        }}
        onCancel={() => setShowCancelExtractionConfirm(false)}
        variant="danger"
      />

      <ProcessingOverlay
        isOpen={isUploadingDoc}
        tasks={uploadTasks}
        title="Processing Document"
        error={uploadError}
        onClose={() => {
          setIsUploadingDoc(false);
          resetForm();
          onClose();
        }}
      />
    </div>
  );
};
