import React, { useState, useRef } from 'react';
import { Sparkles, Loader2, Link as LinkIcon, Building2, Briefcase, Plus, ChevronDown, ChevronUp, FileText, Upload, Zap, Paperclip } from 'lucide-react';
import { extractJobFromUrl, extractJobFromPdf, uploadJobDocument, checkJobDuplicate, getCompanies, Job } from '../lib/api';
import { useSettings } from '@/lib/SettingsContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface AddJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddJob: (job: Partial<Job>) => Promise<Job>;
}

const initialFormData: Partial<Job> = {
  company: '', role: '', url: '', status: 'Wishlist',
  location: '', company_job_id: '', hr_email: '', hiring_manager_name: '',
  hiring_manager_email: '', headhunter_name: '', headhunter_email: '',
  job_posted_date: '', application_deadline: '', description: '', salary_range: ''
};

export const AddJobModal: React.FC<AddJobModalProps> = ({ isOpen, onClose, onAddJob }) => {
  const { aiEnabled: globalAiEnabled } = useSettings();
  const [formData, setFormData] = useState<Partial<Job>>(initialFormData);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
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

  React.useEffect(() => {
    if (isOpen) {
      getCompanies().then(setCompanies).catch(console.error);
      resetForm();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof Job, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
    try {
      let data: any;
      if (selectedFile) {
        // File has higher priority
        data = await extractJobFromPdf(selectedFile);
      } else if (formData.url) {
        data = await extractJobFromUrl(formData.url);
      } else {
        setError('Please provide a URL or upload a file to auto-fill.');
        setIsExtracting(false);
        return;
      }
      applyExtraction(data);
    } catch (err: any) {
      handleExtractError(err);
    } finally {
      setIsExtracting(false);
    }
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
        salary_range: data.extracted.salary_range || prev.salary_range,
        description: data.extracted.description || prev.description,
      }));
      if (data.extracted.location || data.extracted.salary_range || data.extracted.description) {
        setShowAdvanced(true);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent, skipCheck = false) => {
    if (e) e.preventDefault();
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
      const cleanData = Object.fromEntries(
        Object.entries(formData).map(([k, v]) => [k, v === '' ? null : v])
      );
      const createdJob = await onAddJob(cleanData);

      // If AI is OFF and a file was selected, attach it as a "job_post" document
      if (!effectiveAiEnabled && selectedFile && createdJob?.id) {
        try {
          await uploadJobDocument(createdJob.id, selectedFile, 'job_post');
        } catch (uploadErr) {
          console.error('Job created, but failed to attach document:', uploadErr);
          // Non-fatal — job was created successfully
        }
      }

      resetForm();
      onClose();
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

  const InputField = ({ label, field, type = "text", placeholder }: {
    label: string; field: keyof Job; type?: string; placeholder?: string;
  }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
        value={formData[field] as string || ''}
        onChange={(e) => handleChange(field, e.target.value)}
      />
    </div>
  );

  const StatusSelect = () => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">Initial Status</label>
      <select
        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-violet-500 transition-colors text-sm appearance-none cursor-pointer"
        value={formData.status || 'Wishlist'}
        onChange={(e) => handleChange('status', e.target.value)}
      >
        <option value="Wishlist">Wishlist</option>
        <option value="Applied">Applied</option>
        <option value="Interviewing">Interviewing</option>
        <option value="Offered">Offered</option>
        <option value="Rejected">Rejected</option>
        <option value="Closed">Closed</option>
        <option value="Discontinued">Discontinued</option>
      </select>
    </div>
  );

  // File picker — shared between AI mode (extraction) and manual mode (attachment)
  const FilePicker = ({ label, hint }: { label: string; hint: string }) => (
    <div>
      <input
        type="file"
        accept=".pdf,.md,.txt"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileSelect}
      />
      {selectedFile ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-violet-500/40 bg-violet-500/10">
          <FileText className="w-4 h-4 text-violet-400 shrink-0" />
          <span className="text-sm text-violet-300 flex-1 truncate">{selectedFile.name}</span>
          <button
            type="button"
            onClick={handleRemoveFile}
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
                />

                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={isExtracting || !canExtract}
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/30 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isExtracting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Extracting…</>
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
                />
              </div>
            )}
          </div>
          )}

          {/* ── Main Form ── */}
          <form id="add-job-form" onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-red-400 text-sm p-3 bg-red-400/10 rounded-lg border border-red-400/20">
                {typeof error === 'string' ? error : JSON.stringify(error)}
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

              <StatusSelect />
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
                <InputField label="Location" field="location" />
                <InputField label="Salary Range" field="salary_range" />
                <InputField label="Company Job ID" field="company_job_id" />
                <InputField label="Posted Date" field="job_posted_date" type="date" />
                <InputField label="Application Deadline" field="application_deadline" type="date" />
                <InputField label="HR / Recruiter Email" field="hr_email" type="email" />
                <InputField label="Hiring Manager Name" field="hiring_manager_name" />
                <InputField label="Hiring Manager Email" field="hiring_manager_email" type="email" />
                <InputField label="Headhunter Name" field="headhunter_name" />
                <InputField label="Headhunter Email" field="headhunter_email" type="email" />
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Job Description (Markdown)</label>
                  <textarea
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors text-sm min-h-[100px]"
                    value={formData.description || ''}
                    onChange={(e) => handleChange('description', e.target.value)}
                  />
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="pt-4 mt-2 flex justify-end gap-3 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
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
    </div>
  );
};
