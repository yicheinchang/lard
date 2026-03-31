import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
});

export interface StepType {
  id: number;
  name: string;
}

export interface InterviewStep {
  id: number;
  step_type: StepType;
  step_date?: string;
  status: string; // Scheduled, Completed, Passed, Requested
  notes?: string;
}

export interface DocumentMeta {
  id: number;
  job_id: number;
  title: string;
  doc_type: string;
  file_path: string;
  uploaded_at: string;
}

export interface Job {
  id?: number; // optional when creating
  company: string;
  role: string;
  url?: string;
  status: string; // Wishlist, Applied, Interviewing, Offered, Rejected, Closed, Discontinued
  
  job_posted_date?: string;
  application_deadline?: string;
  company_job_id?: string;
  location?: string;
  description?: string;
  salary_range?: string;
  
  hr_email?: string;
  hiring_manager_name?: string;
  hiring_manager_email?: string;
  headhunter_name?: string;
  headhunter_email?: string;
  notes?: string;

  created_at: string;
  applied_date?: string;
  steps?: InterviewStep[];
  documents?: DocumentMeta[];
}

// ── App Settings ──────────────────────────────────────────────────────

export interface LlmConfig {
  ollama_base_url: string;
  ollama_model: string;
  openai_api_key: string;
  openai_model: string;
  anthropic_api_key: string;
  anthropic_model: string;
}

export interface EmbeddingConfig {
  ollama_base_url: string;
  ollama_model: string;
  openai_api_key: string;
  openai_model: string;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  ai_enabled: boolean;
  llm_provider: 'ollama' | 'openai' | 'anthropic';
  llm_config: LlmConfig;
  embedding_provider: 'default' | 'ollama' | 'openai';
  embedding_config: EmbeddingConfig;
}

export const getSettings = async (): Promise<AppSettings> => {
  const response = await api.get('/settings');
  return response.data;
};

export const updateSettings = async (data: Partial<AppSettings>): Promise<AppSettings> => {
  const response = await api.put('/settings', data);
  return response.data;
};

export const rebuildVectors = async () => {
  const response = await api.post('/settings/rebuild-vectors');
  return response.data;
};

export const testLlmConnection = async (testConfig?: { provider: string; config: any }) => {
  const response = await api.post('/settings/test-llm', testConfig ? {
    provider: testConfig.provider,
    config: testConfig.config
  } : undefined);
  return response.data;
};

export const testEmbeddingConnection = async (testConfig?: { provider: string; config: any }) => {
  const response = await api.post('/settings/test-embedding', testConfig ? {
    provider: testConfig.provider,
    config: testConfig.config
  } : undefined);
  return response.data;
};

// ── Jobs ──────────────────────────────────────────────────────────────

export const getJobs = async () => {
  const response = await api.get('/jobs');
  return response.data;
};

export const createJob = async (job: Partial<Job>) => {
  const response = await api.post('/jobs/', job);
  return response.data;
};

export const updateJob = async (id: number, jobUpdate: Partial<Job>) => {
  const response = await api.put(`/jobs/${id}`, jobUpdate);
  return response.data;
};

export const deleteJob = async (id: number) => {
  const response = await api.delete(`/jobs/${id}`);
  return response.data;
};

export const getStepTypes = async () => {
  const response = await api.get('/steps/types');
  return response.data;
};

export const getCompanies = async (): Promise<{id: number, name: string}[]> => {
  const response = await api.get('/companies');
  return response.data;
};

export const checkJobDuplicate = async (data: { company: string, role: string, url?: string, company_job_id?: string }) => {
  const response = await api.post('/jobs/check-duplicate', data);
  return response.data;
};

export const addInterviewStep = async (jobId: number, step_type_name: string, step_date?: string, status?: string, notes?: string) => {
  const response = await api.post(`/jobs/${jobId}/steps`, { step_type_name, step_date, status, notes });
  return response.data;
};

export const updateInterviewStep = async (stepId: number, updateData: { step_type_name?: string, step_date?: string, status?: string, notes?: string }) => {
  const response = await api.put(`/jobs/steps/${stepId}`, updateData);
  return response.data;
};

export const extractJobFromUrl = async (url: string) => {
  const response = await api.post('/ai/extract-url', { url });
  return response.data;
};

export const extractJobFromText = async (text: string) => {
  const response = await api.post('/ai/extract-text', { text });
  return response.data;
};

export const extractJobFromPdf = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/ai/extract-pdf', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

export const uploadJobDocument = async (jobId: number, file: File, docType: string) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('doc_type', docType);
  
  const response = await api.post(`/jobs/${jobId}/documents`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

export const deleteJobDocument = async (docId: number) => {
  const response = await api.delete(`/documents/${docId}`);
  return response.data;
};

export default api;
