"use client";

import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Job, getStepTypes, StepType, addInterviewStep, updateInterviewStep, updateJob, uploadJobDocument, deleteJobDocument, DocumentMeta } from '../lib/api';
import { X, Calendar, User, Mail, Plus, Circle, FileText, Edit2, Save, MessageSquare, Paperclip, Trash2, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { DocumentPreview } from './DocumentPreview';

interface JobDetailViewProps {
  job: Job | null;
  onClose: () => void;
  onJobUpdated: () => void;
}

export const JobDetailView: React.FC<JobDetailViewProps> = ({ job, onClose, onJobUpdated }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'pipeline'>('pipeline');
  const [stepTypes, setStepTypes] = useState<StepType[]>([]);
  const [newStepName, setNewStepName] = useState('');
  const [newStepDate, setNewStepDate] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Job>>({});

  // Notes state
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState<string>('');

  // Advance state
  const [showAdvanceConfirm, setShowAdvanceConfirm] = useState(false);

  // Document preview state
  const [previewDoc, setPreviewDoc] = useState<{ isOpen: boolean; title: string; fileUrl: string | null }>({
    isOpen: false,
    title: '',
    fileUrl: null,
  });

  // Attach job document
  const [docUploadType, setDocUploadType] = useState('job_post');
  
  const handleAttachPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && job?.id) {
      try {
        await uploadJobDocument(job.id, file, docUploadType);
        onJobUpdated();
      } catch (err) {
        console.error('Failed to attach document', err);
        alert('Failed to upload document.');
      }
    }
  };

  const handleDeleteDocument = async (e: React.MouseEvent, docId: number) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this document?")) {
      try {
        await deleteJobDocument(docId);
        onJobUpdated();
      } catch (err) {
        console.error('Failed to delete document', err);
        alert('Failed to delete document.');
      }
    }
  };

  useEffect(() => {
    if (job) {
      getStepTypes().then(setStepTypes).catch(console.error);
      setEditFormData(job);
    }
  }, [job]);

  const sortedSteps = useMemo(() => {
    if (!job?.steps) return [];
    return [...job.steps].sort((a, b) => {
      const dateA = a.step_date ? new Date(a.step_date).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.step_date ? new Date(b.step_date).getTime() : Number.MAX_SAFE_INTEGER;
      // Reverse chronological: newest first.
      return dateB - dateA;
    });
  }, [job?.steps]);

  if (!job) return null;

  const handleAddStep = async () => {
    if (!newStepName) return;
    try {
      await addInterviewStep(job.id!, newStepName, newStepDate || undefined, 'Scheduled');
      setNewStepName('');
      setNewStepDate('');
      setIsAdding(false);
      onJobUpdated();

      if (job.status === 'Wishlist' || job.status === 'Applied') {
        setShowAdvanceConfirm(true);
      }
    } catch (err) {
      console.error('Failed to add step', err);
    }
  };

  const advanceToInterviewing = async () => {
    try {
      await updateJob(job.id!, { status: 'Interviewing' });
      onJobUpdated();
    } catch (err) {
      console.error('Failed to advance to Interviewing', err);
    }
    setShowAdvanceConfirm(false);
  };

  const handleStatusChange = async (stepId: number, nextStatus: string) => {
    try {
      await updateInterviewStep(stepId, { status: nextStatus });
      onJobUpdated();
    } catch (err) {
      console.error(err);
    }
  };

  const startEditingNote = (stepId: number, currentNote: string | null = '') => {
    setEditingNoteId(stepId);
    setNoteContent(currentNote || '');
  };

  const saveNote = async (stepId: number) => {
    try {
      await updateInterviewStep(stepId, { notes: noteContent });
      setEditingNoteId(null);
      onJobUpdated();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditChange = (field: keyof Job, value: string) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveInfo = async () => {
    try {
      const cleanData = Object.fromEntries(
        Object.entries(editFormData).map(([k, v]) => [k, v === '' ? null : v])
      );
      await updateJob(job.id!, cleanData);
      setIsEditingInfo(false);
      onJobUpdated();
    } catch (error: any) {
      console.error("Failed to update job info", error);
      const detail = error?.response?.data?.detail;
      if (Array.isArray(detail)) {
        alert(detail.map((d: any) => d.msg || JSON.stringify(d)).join(', '));
      } else {
        alert(typeof detail === 'string' ? detail : (error.message || 'Failed to update info'));
      }
    }
  };

  const stepStatusOptions = ['Requested', 'Scheduled', 'Passed', 'Completed'];

  return (
    <>
      <div className="absolute inset-x-0 bottom-0 top-1/2 md:top-[40%] bg-[#0f0f16] border-t border-violet-500/20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col z-20 animate-slide-up">
        {/* Header */}
        <div className="flex justify-between items-center p-4 md:px-8 border-b border-white/5 bg-white/5 backdrop-blur-md">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              {job.company}
              <span className="text-sm px-2.5 py-1 bg-white/10 rounded-full font-medium">{job.status}</span>
            </h2>
            <p className="text-gray-400">{job.role} {job.location && <span className="text-gray-500">• {job.location}</span>}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-4 md:px-8 border-b border-white/5">
          <button 
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'pipeline' ? 'border-violet-500 text-violet-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            onClick={() => setActiveTab('pipeline')}
          >
            Interview Pipeline
          </button>
          <button 
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'info' ? 'border-violet-500 text-violet-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            onClick={() => setActiveTab('info')}
          >
            Job Details & Contacts
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          {activeTab === 'pipeline' && (
            <div className="max-w-3xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white/90">Timeline</h3>
                <button onClick={() => setIsAdding(!isAdding)} className="text-sm bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors">
                  <Plus className="w-4 h-4" /> Add Step
                </button>
              </div>

              {isAdding && (
                <div className="p-4 mb-6 rounded-xl border border-violet-500/30 bg-violet-500/5 flex flex-wrap gap-4 items-end">
                  <div className="flex flex-col gap-1 w-full sm:w-auto flex-1">
                    <label className="text-xs text-violet-300">Step Name (Select or Type new)</label>
                    <input 
                      type="text" 
                      value={newStepName}
                      onChange={(e) => setNewStepName(e.target.value)}
                      list="step-types"
                      placeholder="e.g. Hiring Manager Screen"
                      className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                    />
                    <datalist id="step-types">
                      {stepTypes.map(st => <option key={st.id} value={st.name} />)}
                    </datalist>
                  </div>
                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <label className="text-xs text-violet-300">Date (Optional)</label>
                    <input 
                      type="date" 
                      value={newStepDate}
                      onChange={(e) => setNewStepDate(e.target.value)}
                      className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 flex-grow text-white text-sm focus:outline-none focus:border-violet-500 style-date"
                    />
                  </div>
                  <button onClick={handleAddStep} className="bg-white text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">Save</button>
                </div>
              )}

              <div className="relative pl-4 space-y-6 before:absolute before:inset-y-0 before:left-[21px] before:w-[2px] before:bg-white/10">
                {sortedSteps.length > 0 ? sortedSteps.map((step) => (
                  <div key={step.id} className="relative flex items-start gap-4 flex-col sm:flex-row group/step">
                    <div className="relative z-10 mt-1.5 bg-[#0f0f16] p-1 rounded-full outline-none">
                      <Circle className={`w-5 h-5 ${step.status === 'Completed' || step.status === 'Passed' ? 'text-green-400 fill-green-400/20' : 'text-gray-500'}`} />
                    </div>
                    <div className={`flex flex-col glass p-4 rounded-xl w-full border ${step.status === 'Completed' || step.status === 'Passed' ? 'border-green-500/20 bg-green-500/5' : 'border-white/5'} hover:border-violet-500/30 transition`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`font-semibold ${step.status === 'Completed' || step.status === 'Passed' ? 'text-white' : 'text-gray-200'}`}>{step.step_type.name}</span>
                        
                        {/* Interactive Status Dropdown */}
                        <select 
                          className="text-xs font-medium px-2 py-1 rounded-md bg-black/40 text-gray-300 border border-white/10 cursor-pointer focus:outline-none focus:border-violet-500 transition-colors"
                          value={step.status}
                          onChange={(e) => handleStatusChange(step.id, e.target.value)}
                        >
                          {stepStatusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                      {step.step_date && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(step.step_date).toLocaleDateString()}
                        </div>
                      )}
                      
                      {/* Notes Section */}
                      <div className="mt-3 pt-3 border-t border-white/5">
                        {editingNoteId === step.id ? (
                          <div className="flex flex-col gap-2 mt-1 z-10 relative">
                            <textarea
                              value={noteContent}
                              onChange={(e) => setNoteContent(e.target.value)}
                              className="w-full bg-black/40 border border-violet-500/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500 min-h-[80px]"
                              placeholder="Add comments or notes..."
                              autoFocus
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingNoteId(null)} className="text-xs px-3 py-1.5 text-gray-400 hover:text-white transition-colors">Cancel</button>
                              <button onClick={() => saveNote(step.id)} className="text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                                <Save className="w-3.5 h-3.5" /> Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-4">
                            {step.notes ? (
                              <div className="text-sm text-gray-300 whitespace-pre-wrap">{step.notes}</div>
                            ) : (
                              <div className="text-sm text-gray-600 italic">No notes added.</div>
                            )}
                            <button 
                              onClick={() => startEditingNote(step.id, step.notes)} 
                              className="shrink-0 text-xs text-gray-500 hover:text-violet-400 opacity-0 group-hover/step:opacity-100 transition-all flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-2 py-1 rounded"
                            >
                              <Edit2 className="w-3 h-3" /> {step.notes ? 'Edit' : 'Add Note'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="text-gray-500 italic text-sm ml-6">No interview steps recorded yet.</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'info' && (
             <div className="flex flex-col lg:flex-row gap-8">
               <div className="flex-1 space-y-6">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <h3 className="text-lg font-semibold text-white/90">Description</h3>
                    {!isEditingInfo && (
                      <button onClick={() => setIsEditingInfo(true)} className="text-violet-400 flex items-center gap-1.5 text-sm hover:text-violet-300 transition-colors">
                        <Edit2 className="w-4 h-4" /> Edit
                      </button>
                    )}
                  </div>

                  {isEditingInfo ? (
                    <textarea
                      className="w-full bg-black/40 border border-violet-500/50 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none min-h-[300px] text-sm font-mono"
                      value={editFormData.description || ''}
                      onChange={(e) => handleEditChange('description', e.target.value)}
                      placeholder="Enter Job Description in Markdown format..."
                    />
                  ) : (
                    job.description ? (
                      <div className="prose prose-invert prose-sm max-w-none text-gray-300">
                        <ReactMarkdown>{job.description}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-gray-500 italic text-sm"><FileText className="inline w-4 h-4 mr-1"/> No description imported.</p>
                    )
                  )}
                  
                  {/* Documents Section */}
                  <div className="mt-8 pt-6 border-t border-white/10">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <h3 className="text-lg font-semibold text-white/90">Attached Documents</h3>
                      <div className="flex items-center gap-2">
                        <select
                          value={docUploadType}
                          onChange={(e) => setDocUploadType(e.target.value)}
                          className="bg-white/5 text-white/80 border border-white/10 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-violet-500"
                        >
                          <option value="job_post">Job Post</option>
                          <option value="submitted_resume">Submitted Resume</option>
                          <option value="additional_document">Additional Document</option>
                        </select>
                        <label className="cursor-pointer text-xs bg-white/5 hover:bg-white/10 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors border border-white/10 shrink-0">
                          <Plus className="w-3.5 h-3.5" /> Attach
                          <input type="file" accept=".pdf,.md" className="hidden" onChange={handleAttachPdf} />
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {job.documents && job.documents.length > 0 ? job.documents.map(doc => (
                        <div 
                          key={doc.id}
                          onClick={() => setPreviewDoc({ isOpen: true, title: doc.title, fileUrl: doc.file_path })}
                          className="glass p-3 rounded-xl flex items-center gap-3 cursor-pointer hover:border-violet-500/30 group transition-all"
                        >
                          <div className="bg-white/5 p-2 rounded-lg text-violet-400">
                            <Paperclip className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate group-hover:text-violet-300 transition-colors">
                              {doc.title}
                            </p>
                            <p className="text-xs text-gray-500 capitalize">{doc.doc_type.replace(/_/g, ' ')}</p>
                          </div>
                          <button
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                            onClick={(e) => handleDeleteDocument(e, doc.id)}
                            title="Delete Document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )) : (
                        <div className="col-span-full text-gray-500 italic text-sm">No documents attached yet.</div>
                      )}
                    </div>
                  </div>
               </div>

               <div className="w-full lg:w-80 space-y-6 flex-shrink-0">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <h3 className="text-lg font-semibold text-white/90">Contacts & Details</h3>
                  </div>
                  
                  {isEditingInfo ? (
                    <div className="space-y-3 bg-black/20 p-4 rounded-xl border border-violet-500/30">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Application URL</label>
                        <input type="url" className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500" value={editFormData.url || ''} onChange={e => handleEditChange('url', e.target.value)} placeholder="https://..."/>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">Company Job ID</label>
                        <input className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500" value={editFormData.company_job_id || ''} onChange={e => handleEditChange('company_job_id', e.target.value)}/>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">Location</label>
                        <input className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500" value={editFormData.location || ''} onChange={e => handleEditChange('location', e.target.value)}/>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">Job Posted Date</label>
                        <input type="date" className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500 style-date" value={editFormData.job_posted_date ? editFormData.job_posted_date.substring(0, 10) : ''} onChange={e => handleEditChange('job_posted_date', e.target.value || '')}/>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">Deadline</label>
                        <input type="date" className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500 style-date" value={editFormData.application_deadline ? editFormData.application_deadline.substring(0, 10) : ''} onChange={e => handleEditChange('application_deadline', e.target.value || '')}/>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 mt-2 text-violet-300">Hiring Manager Name</label>
                        <input className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500" value={editFormData.hiring_manager_name || ''} onChange={e => handleEditChange('hiring_manager_name', e.target.value)}/>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">Hiring Manager Email</label>
                        <input className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500" type="email" value={editFormData.hiring_manager_email || ''} onChange={e => handleEditChange('hiring_manager_email', e.target.value)}/>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 mt-2 text-violet-300">HR Name</label>
                        <input className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500" value={editFormData.hr_email || ''} onChange={e => handleEditChange('hr_email', e.target.value)} placeholder="(Usually email is enough)"/>
                      </div>
                      
                      <button onClick={handleSaveInfo} className="w-full mt-4 bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-4 py-2 font-medium flex items-center justify-center gap-2 transition-colors">
                        <Save className="w-4 h-4"/> Save Details
                      </button>
                      <button onClick={() => { setIsEditingInfo(false); setEditFormData(job); }} className="w-full mt-2 text-gray-400 hover:text-white text-sm transition-colors">Cancel</button>
                    </div>
                  ) : (
                    <div className="space-y-4 text-sm">

                      {/* Application URL */}
                      {job.url && (
                        <div>
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center justify-center gap-2 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/40 hover:border-violet-400 text-violet-300 hover:text-white font-medium px-4 py-2.5 rounded-xl transition-all group"
                          >
                            <ExternalLink className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            Open Application Page
                          </a>
                        </div>
                      )}

                      <div>
                        <span className="text-gray-500 block mb-1">Company Job ID</span>
                        <span className="text-gray-300 font-mono">{job.company_job_id || '-'}</span>
                      </div>

                      <div>
                        <span className="text-gray-500 block mb-1">Hiring Manager</span>
                        {(job.hiring_manager_name || job.hiring_manager_email) ? (
                          <div className="glass p-3 rounded-lg flex flex-col gap-1">
                            <span className="text-white font-medium flex items-center gap-2"><User className="w-3.5 h-3.5"/> {job.hiring_manager_name || 'Unknown Name'}</span>
                            {job.hiring_manager_email && <a href={`mailto:${job.hiring_manager_email}`} className="text-violet-400 hover:underline flex items-center gap-2"><Mail className="w-3.5 h-3.5"/> Mail</a>}
                          </div>
                        ) : <span className="text-gray-600 block">Not specified</span>}
                      </div>

                      <div>
                        <span className="text-gray-500 block mb-1">HR / Recruiter</span>
                        {job.hr_email ? (
                          <div className="glass p-3 rounded-lg flex flex-col gap-1">
                            <a href={`mailto:${job.hr_email}`} className="text-violet-400 hover:underline flex items-center gap-2"><Mail className="w-3.5 h-3.5"/> {job.hr_email}</a>
                          </div>
                        ) : <span className="text-gray-600 block">Not specified</span>}
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                        <div>
                          <span className="text-gray-500 block text-xs mb-1">Posted</span>
                          <span className="text-gray-300">{job.job_posted_date ? new Date(job.job_posted_date).toLocaleDateString() : '-'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-xs mb-1">Deadline</span>
                          <span className="text-gray-300">{job.application_deadline ? new Date(job.application_deadline).toLocaleDateString() : '-'}</span>
                        </div>
                      </div>
                    </div>
                  )}
               </div>
             </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showAdvanceConfirm}
        title="Advance Pipeline?"
        message={`Adding this step means the interview process has started. Would you like to explicitly move the application to the "Interviewing" stage?`}
        onConfirm={advanceToInterviewing}
        onCancel={() => setShowAdvanceConfirm(false)}
        confirmLabel="Move to Interviewing"
        variant="default"
      />

      <DocumentPreview 
        isOpen={previewDoc.isOpen}
        title={previewDoc.title}
        fileUrl={previewDoc.fileUrl}
        onClose={() => setPreviewDoc({ ...previewDoc, isOpen: false })}
      />
    </>
  );
};
