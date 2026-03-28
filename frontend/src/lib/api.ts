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
  status: string; // Wishlist, Applied, Interviewing, Offered, Rejected
  
  job_posted_date?: string;
  application_deadline?: string;
  company_job_id?: string;
  location?: string;
  description?: string;
  
  hr_email?: string;
  hiring_manager_name?: string;
  hiring_manager_email?: string;
  headhunter_name?: string;
  headhunter_email?: string;

  applied_date?: string;
  last_updated?: string;
  steps?: InterviewStep[];
  documents?: DocumentMeta[];
}

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

export const getStepTypes = async () => {
  const response = await api.get('/steps/types');
  return response.data;
};

export const addInterviewStep = async (jobId: number, step_type_name: string, step_date?: string, status?: string, notes?: string) => {
  const response = await api.post(`/jobs/${jobId}/steps`, { step_type_name, step_date, status, notes });
  return response.data;
};

export const updateInterviewStep = async (stepId: number, updateData: { step_date?: string, status?: string, notes?: string }) => {
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
