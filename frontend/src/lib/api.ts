import axios from 'axios';

import { 
  updateSettingsAction, 
  rebuildVectorsAction, 
  testLlmAction, 
  testEmbeddingAction,
  updateJobAction,
  deleteJobAction,
  checkDuplicateAction,
  addStepAction,
  updateStepAction,
  deleteStepAction,
  deleteDocumentAction,
  extractUrlAction,
  extractTextAction
} from './actions';

const api = axios.create({
  baseURL: '/api/proxy',
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
  decision_date?: string;
  closed_date?: string;
  last_updated?: string;
  last_operation?: string;
  is_starred?: boolean;
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
  num_ctx: number;
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
  extraction_mode: 'single' | 'multi';
  max_concurrency: number;
  custom_prompts: {
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
  };
  system_prompts: {
    extraction_base: string;
    extraction_description: string;
    json_ld: string;
    qa_validator: string;
    // Multi-Agent Fields (Text)
    field_company: string;
    field_role: string;
    field_location: string;
    field_salary: string;
    field_id: string;
    field_posted: string;
    field_deadline: string;
    // Multi-Agent Fields (JSON)
    json_company: string;
    json_role: string;
    json_location: string;
    json_salary: string;
    json_id: string;
    json_posted: string;
    json_deadline: string;
    json_description: string;
    job_post_check: string;
    qa_validator_json: string;
    qa_validator_text: string;
  };
}

export const getSettings = async (): Promise<AppSettings> => {
  const response = await api.get('/settings');
  return response.data;
};

export const updateSettings = async (data: Partial<AppSettings>): Promise<AppSettings> => {
  return updateSettingsAction(data);
};

export const getDefaultPrompts = async (): Promise<AppSettings['system_prompts']> => {
  const response = await api.get('/settings/default-prompts');
  return response.data;
};

export const rebuildVectors = async () => {
  return rebuildVectorsAction();
};

export const testLlmConnection = async (testConfig?: { provider: string; config: any }) => {
  return testLlmAction(testConfig ? {
    provider: testConfig.provider,
    config: testConfig.config
  } : undefined);
};

export const testEmbeddingConnection = async (testConfig?: { provider: string; config: any }) => {
  return testEmbeddingAction(testConfig ? {
    provider: testConfig.provider,
    config: testConfig.config
  } : undefined);
};

export const getOllamaModels = async (baseUrl: string): Promise<string[]> => {
  const response = await api.get('/settings/ollama-models', {
    params: { base_url: baseUrl }
  });
  return response.data.models;
};

// ── Jobs ──────────────────────────────────────────────────────────────

export const getJobs = async () => {
  const response = await api.get('/jobs');
  return response.data;
};

export const createJobStream = async (job: Partial<Job>, file: File | null, onProgress: (event: string, msg: string, data?: any) => void) => {
  const formData = new FormData();
  formData.append('job_data_str', JSON.stringify(job));
  if (file) {
    formData.append('file', file);
  }

  const response = await fetch(`/api/proxy/jobs/stream`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Creation failed: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No reader available');

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
        try {
          const data = JSON.parse(line.replace('data: ', ''));
          onProgress(data.event, data.msg || '', data);
        } catch (e) {
          console.error('Error parsing SSE line:', e);
        }
      }
    }
  }
};

export const updateJobStream = async (id: number, jobUpdate: Partial<Job>, onProgress: (event: string, msg: string, data?: any) => void) => {
  const response = await fetch(`/api/proxy/jobs/${id}/stream`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(jobUpdate),
  });

  if (!response.ok) {
    throw new Error(`Update failed: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No reader available');

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
        try {
          const data = JSON.parse(line.replace('data: ', ''));
          onProgress(data.event, data.msg || '', data);
        } catch (e) {
          console.error('Error parsing SSE line:', e);
        }
      }
    }
  }
};

export const updateJob = async (id: number, jobUpdate: Partial<Job>) => {
  return updateJobAction(id, jobUpdate);
};

export const deleteJob = async (id: number) => {
  return deleteJobAction(id);
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
  return checkDuplicateAction(data);
};

export const addInterviewStep = async (jobId: number, step_type_name: string, step_date?: string, status?: string, notes?: string) => {
  return addStepAction(jobId, { step_type_name, step_date, status, notes });
};

export const updateInterviewStep = async (stepId: number, updateData: { step_type_name?: string, step_date?: string, status?: string, notes?: string }) => {
  return updateStepAction(stepId, updateData);
};

export const deleteInterviewStep = async (stepId: number) => {
  return deleteStepAction(stepId);
};

export const extractJobFromUrl = async (url: string, signal?: AbortSignal) => {
  return extractUrlAction(url);
};

export const extractJobFromText = async (text: string, signal?: AbortSignal) => {
  return extractTextAction(text);
};

export const extractJobFromFile = async (file: File, signal?: AbortSignal) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/ai/extract-file', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    signal
  });
  return response.data;
};

export const extractJobFromPdf = async (file: File, signal?: AbortSignal) => {
  return extractJobFromFile(file, signal);
};

export const uploadJobDocumentStream = async (jobId: number, file: File, docType: string, onProgress: (event: string, msg: string, data?: any) => void) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('doc_type', docType);

  const response = await fetch(`/api/proxy/jobs/${jobId}/documents/stream`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No reader available');

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
        try {
          const data = JSON.parse(line.replace('data: ', ''));
          onProgress(data.event, data.msg || '', data);
        } catch (e) {
          console.error('Error parsing SSE line:', e);
        }
      }
    }
  }
};

export const deleteJobDocument = async (docId: number) => {
  return deleteDocumentAction(docId);
};

export default api;
