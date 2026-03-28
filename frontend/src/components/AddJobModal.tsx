import React, { useState } from 'react';
import { Sparkles, Loader2, Link as LinkIcon, Building2, Briefcase, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { extractJobFromUrl, Job } from '../lib/api';

interface AddJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddJob: (job: Partial<Job>) => Promise<void>;
}

export const AddJobModal: React.FC<AddJobModalProps> = ({ isOpen, onClose, onAddJob }) => {
  const [formData, setFormData] = useState<Partial<Job>>({
    company: '', role: '', url: '', status: 'Wishlist',
    location: '', company_job_id: '', hr_email: '', hiring_manager_name: '',
    hiring_manager_email: '', headhunter_name: '', headhunter_email: '',
    job_posted_date: '', application_deadline: '', description: ''
  });
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!isOpen) return null;

  const handleChange = (field: keyof Job, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleExtract = async () => {
    if (!formData.url) {
      setError('Please enter a valid URL to extract.');
      return;
    }
    setError('');
    setIsExtracting(true);
    try {
      const data = await extractJobFromUrl(formData.url);
      if (data.error) {
        setError(data.error);
      } else if (data.extracted) {
        setFormData(prev => ({
          ...prev,
          company: data.extracted.company || prev.company,
          role: data.extracted.role || prev.role,
        }));
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg || JSON.stringify(d)).join(', '));
      } else {
        setError(typeof detail === 'string' ? detail : (err.message || 'Failed to extract job data'));
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company || !formData.role) {
      setError('Company and Role are required.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      // Filter out empty strings for optional fields to avoid backend validation errors
      const cleanData = Object.fromEntries(
        Object.entries(formData).map(([k, v]) => [k, v === '' ? null : v])
      );
      await onAddJob(cleanData);
      // Reset form
      setFormData({
        company: '', role: '', url: '', status: 'Wishlist',
        location: '', company_job_id: '', hr_email: '', hiring_manager_name: '',
        hiring_manager_email: '', headhunter_name: '', headhunter_email: '',
        job_posted_date: '', application_deadline: '', description: ''
      });
      setShowAdvanced(false);
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

  const InputField = ({ label, field, type="text" }: { label: string, field: keyof Job, type?: string }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type={type}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
        value={formData[field] as string || ''}
        onChange={(e) => handleChange(field, e.target.value)}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="glass bg-[#0a0a0f] w-full max-w-2xl rounded-2xl p-6 shadow-2xl relative animate-slide-up border-violet-500/20 my-auto max-h-[90vh] flex flex-col">
        
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-500 hover:text-white transition-colors">
          ✕
        </button>

        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-400 mb-6 flex items-center gap-2 shrink-0">
          <Plus className="w-6 h-6 text-violet-400" />
          Add Job to Wishlist
        </h2>

        <div className="space-y-6 overflow-y-auto custom-scrollbar pr-2 flex-1 pb-4">
          {/* AI Extraction Section */}
          <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/20">
            <label className="block text-sm font-medium text-violet-300 mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> 
              AI Auto-fill from URL
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="url"
                  placeholder="https://company.com/careers/job-123"
                  className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                  value={formData.url || ''}
                  onChange={(e) => handleChange('url', e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={handleExtract}
                disabled={isExtracting}
                className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
              >
                {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Extract'}
              </button>
            </div>
          </div>

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
                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                    value={formData.company}
                    onChange={(e) => handleChange('company', e.target.value)}
                  />
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
            </div>

            <div className="pt-2">
              <button
                type="button"
                className="flex items-center gap-2 text-violet-400 text-sm font-medium hover:text-violet-300 transition-colors"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                {showAdvanced ? 'Hide Advanced Details' : 'Show Advanced Details'}
              </button>
            </div>

            {showAdvanced && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 animate-fade-in">
                <InputField label="Location" field="location" />
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
    </div>
  );
};
