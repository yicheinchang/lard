"use client";

import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import MdEditor from 'react-markdown-editor-lite';
import MarkdownIt from 'markdown-it';
import 'react-markdown-editor-lite/lib/index.css';
import { Job, getStepTypes, StepType, addInterviewStep, updateInterviewStep, updateJob, uploadJobDocument, deleteJobDocument, getCompanies } from '../lib/api';
import { X, Calendar, User, Mail, Plus, Circle, FileText, Edit2, Save, Paperclip, Trash2, ExternalLink, Link as LinkIcon, StickyNote } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { DocumentPreview } from './DocumentPreview';

interface JobDetailViewProps {
  job: Job | null;
  onClose: () => void;
  onJobUpdated: () => void;
  onDirtyStateChange?: (isDirty: boolean) => void;
}

export const JobDetailView: React.FC<JobDetailViewProps> = ({ job, onClose, onJobUpdated, onDirtyStateChange }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'pipeline' | 'notes'>('pipeline');
  const mdParser = new MarkdownIt();
  const [stepTypes, setStepTypes] = useState<StepType[]>([]);
  const [newStepName, setNewStepName] = useState('');
  const [newStepDate, setNewStepDate] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Job>>({});
  const [companies, setCompanies] = useState<{id: number, name: string}[]>([]);

  // Notes state
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState<string>('');

  // Job-level Notes state
  const [jobNotes, setJobNotes] = useState<string>('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isEditingJobNotes, setIsEditingJobNotes] = useState(false);
  
  const isDirty = useMemo(() => {
    if (!isEditingInfo || !job) return false;
    
    // Compare essential fields
    const fields: (keyof Job)[] = [
      'company', 'role', 'url', 'status', 'location', 
      'description', 'salary_range', 'hr_email', 
      'hiring_manager_name', 'hiring_manager_email',
      'company_job_id'
    ];
    
    return fields.some(field => {
      const original = job[field] || '';
      const current = editFormData[field] || '';
      return String(original) !== String(current);
    });
  }, [isEditingInfo, editFormData, job]);

  useEffect(() => {
    onDirtyStateChange?.(isDirty);
  }, [isDirty, onDirtyStateChange]);

  // Deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      getCompanies().then(setCompanies).catch(console.error);
      setEditFormData(job);
      setJobNotes(job.notes || '');
    }
  }, [job]);

  // Debounced auto-save for job notes
  useEffect(() => {
    if (!job || job.notes === jobNotes) return;

    const timeoutId = setTimeout(async () => {
      setIsSavingNotes(true);
      try {
        await updateJob(job.id!, { notes: jobNotes });
      } catch (err) {
        console.error("Failed to auto-save notes", err);
      } finally {
        setIsSavingNotes(false);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [jobNotes, job?.id]);

  const sortedSteps = useMemo(() => {
    if (!job?.steps) return [];
    return [...job.steps].sort((a, b) => {
      const dateA = a.step_date ? new Date(a.step_date).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.step_date ? new Date(b.step_date).getTime() : Number.MAX_SAFE_INTEGER;
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

  const handleDeleteJob = async () => {
    if (!job?.id) return;
    try {
      const { deleteJob } = await import('../lib/api');
      await deleteJob(job.id);
      onJobUpdated();
      onClose();
    } catch (err) {
      console.error("Failed to delete job", err);
      alert("Failed to delete application.");
    }
    setShowDeleteConfirm(false);
  };

  const stepStatusOptions = ['Requested', 'Scheduled', 'Passed', 'Completed'];

  return (
    <>
      <div className="absolute inset-x-0 bottom-0 top-1/2 md:top-[40%] bg-[var(--bg)] border-t border-[var(--border-color)] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col z-20 animate-slide-up">
        {/* Header */}
        <div className="flex justify-between items-center p-4 md:px-8 border-b border-[var(--border-color)] bg-[var(--surface)] backdrop-blur-md shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-[var(--fg)] flex items-center gap-3">
              {job.company}
              <span className="text-sm px-2.5 py-1 bg-[var(--surface-hover)] rounded-full font-medium" style={{ color: 'var(--fg-muted)' }}>{job.status}</span>
            </h2>
            <p className="text-[var(--fg-muted)]">{job.role} {job.location && <span className="text-[var(--fg-subtle)]">• {job.location}</span>}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--surface-hover)] rounded-full text-[var(--fg-subtle)] hover:text-[var(--fg)] transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-4 md:px-8 border-b border-[var(--border-color)] shrink-0">
          <button 
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'pipeline' ? 'border-violet-500 text-violet-500' : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'}`}
            onClick={() => setActiveTab('pipeline')}
          >
            Interview Pipeline
          </button>
          <button 
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'info' ? 'border-violet-500 text-violet-500' : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'}`}
            onClick={() => setActiveTab('info')}
          >
            Job Details
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          {activeTab === 'pipeline' && (
            <div className="max-w-3xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-[var(--fg)] opacity-90">Timeline</h3>
                <button onClick={() => setIsAdding(!isAdding)} className="text-sm bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors">
                  <Plus className="w-4 h-4" /> Add Step
                </button>
              </div>

              {isAdding && (
                <div className="p-4 mb-6 rounded-xl border border-violet-500/30 bg-violet-500/5 flex flex-wrap gap-4 items-end">
                  <div className="flex flex-col gap-1 w-full sm:w-auto flex-1">
                    <label className="text-xs text-violet-500 font-medium">Step Name (Select or Type new)</label>
                    <input 
                      type="text" 
                      value={newStepName}
                      onChange={(e) => setNewStepName(e.target.value)}
                      list="step-types"
                      placeholder="e.g. Hiring Manager Screen"
                      className="bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--fg)] text-sm focus:outline-none focus:border-violet-500"
                    />
                    <datalist id="step-types">
                      {stepTypes.map(st => <option key={st.id} value={st.name} />)}
                    </datalist>
                  </div>
                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <label className="text-xs text-violet-500 font-medium">Date (Optional)</label>
                    <input 
                      type="date" 
                      value={newStepDate}
                      onChange={(e) => setNewStepDate(e.target.value)}
                      className="bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg px-3 py-2 flex-grow text-[var(--fg)] text-sm focus:outline-none focus:border-violet-500 style-date"
                    />
                  </div>
                  <button onClick={handleAddStep} className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Save</button>
                </div>
              )}

              <div className="relative pl-4 space-y-6 before:absolute before:inset-y-0 before:left-[21px] before:w-[2px] before:bg-[var(--border-color)]">
                {sortedSteps.length > 0 ? sortedSteps.map((step) => (
                  <div key={step.id} className="relative flex items-start gap-4 flex-col sm:flex-row group/step">
                    <div className="relative z-10 mt-1.5 bg-[var(--bg)] p-1 rounded-full outline-none">
                      <Circle className={`w-5 h-5 ${step.status === 'Completed' || step.status === 'Passed' ? 'text-green-500 fill-green-500/20' : 'text-[var(--fg-subtle)]'}`} />
                    </div>
                    <div className={`flex flex-col glass p-4 rounded-xl w-full border ${step.status === 'Completed' || step.status === 'Passed' ? 'border-green-500/20 bg-green-500/5' : 'border-[var(--border-color)]'} hover:border-violet-500/30 transition`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`font-semibold ${step.status === 'Completed' || step.status === 'Passed' ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)]'}`}>{step.step_type.name}</span>
                        <select 
                          className="text-xs font-medium px-2 py-1 rounded-md bg-[var(--input-bg)] text-[var(--fg-muted)] border border-[var(--border-color)] cursor-pointer focus:outline-none focus:border-violet-500 transition-colors"
                          value={step.status}
                          onChange={(e) => handleStatusChange(step.id, e.target.value)}
                        >
                          {stepStatusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                      {step.step_date && (
                        <div className="flex items-center gap-1.5 text-xs text-[var(--fg-subtle)] mt-2">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(step.step_date).toLocaleDateString()}
                        </div>
                      )}
                      
                      <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
                        {editingNoteId === step.id ? (
                          <div className="flex flex-col gap-2 mt-1 z-10 relative">
                            <textarea
                              value={noteContent}
                              onChange={(e) => setNoteContent(e.target.value)}
                              className="w-full bg-[var(--input-bg)] border border-violet-500/50 rounded-lg px-3 py-2 text-[var(--fg)] text-sm focus:outline-none focus:border-violet-500 min-h-[80px]"
                              placeholder="Add comments or notes..."
                              autoFocus
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingNoteId(null)} className="text-xs px-3 py-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors">Cancel</button>
                              <button onClick={() => saveNote(step.id)} className="text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                                <Save className="w-3.5 h-3.5" /> Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-4">
                            {step.notes ? (
                              <div className="text-sm text-[var(--fg-muted)] whitespace-pre-wrap">{step.notes}</div>
                            ) : (
                              <div className="text-sm text-[var(--fg-subtle)] italic">No notes added.</div>
                            )}
                            <button 
                              onClick={() => startEditingNote(step.id, step.notes)} 
                              className="shrink-0 text-xs text-[var(--fg-subtle)] hover:text-violet-500 opacity-0 group-hover/step:opacity-100 transition-all flex items-center gap-1.5 bg-[var(--surface)] hover:bg-[var(--surface-hover)] px-2 py-1 rounded border border-[var(--border-color)]"
                            >
                              <Edit2 className="w-3 h-3" /> {step.notes ? 'Edit' : 'Add Note'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="text-[var(--fg-subtle)] italic text-sm ml-6">No interview steps recorded yet.</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'info' && (
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1 space-y-6">
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                  <h3 className="text-lg font-semibold text-[var(--fg)] opacity-90">Description</h3>
                  {!isEditingInfo && (
                    <button onClick={() => setIsEditingInfo(true)} className="text-violet-500 flex items-center gap-1.5 text-sm hover:text-violet-400 transition-colors">
                      <Edit2 className="w-4 h-4" /> Edit
                    </button>
                  )}
                </div>

                {isEditingInfo ? (
                  <div className="min-h-[400px] job-description-editor">
                    <MdEditor 
                      style={{ height: '400px', background: 'transparent' }}
                      value={editFormData.description || ''}
                      renderHTML={text => mdParser.render(text)}
                      onChange={({ text }) => handleEditChange('description', text)}
                      placeholder="Enter Job Description in Markdown format..."
                      view={{ menu: true, md: true, html: false }}
                      canView={{ menu: true, md: true, html: true, both: true, fullScreen: true, hideMenu: true }}
                    />
                  </div>
                ) : (
                  job.description ? (
                    <div className="prose dark:prose-invert prose-sm max-w-none text-[var(--fg-muted)] prose-headings:text-[var(--fg)] prose-strong:text-[var(--fg)] prose-li:text-[var(--fg-muted)]">
                      <ReactMarkdown>{job.description}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-[var(--fg-subtle)] italic text-sm"><FileText className="inline w-4 h-4 mr-1"/> No description imported.</p>
                  )
                )}
                
                <div className="mt-8 pt-6 border-t border-[var(--border-color)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <h3 className="text-lg font-semibold text-[var(--fg)] opacity-90">Attached Documents</h3>
                    <div className="flex items-center gap-2">
                      <select
                        value={docUploadType}
                        onChange={(e) => setDocUploadType(e.target.value)}
                        className="bg-[var(--surface-hover)] text-[var(--fg-muted)] border border-[var(--border-color)] text-xs rounded-lg px-2 py-1.5 outline-none focus:border-violet-500"
                      >
                        <option value="job_post">Job Post</option>
                        <option value="submitted_resume">Submitted Resume</option>
                        <option value="additional_document">Additional Document</option>
                      </select>
                      <label className="cursor-pointer text-xs bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all shrink-0">
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
                        <div className="bg-[var(--surface-hover)] p-2 rounded-lg text-violet-500">
                          <Paperclip className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--fg)] truncate group-hover:text-violet-500 transition-colors">
                            {doc.title}
                          </p>
                          <p className="text-xs text-[var(--fg-subtle)] capitalize">{doc.doc_type.replace(/_/g, ' ')}</p>
                        </div>
                        <button
                          className="p-1.5 text-[var(--fg-subtle)] hover:text-red-500 hover:bg-red-500/5 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                          onClick={(e) => handleDeleteDocument(e, doc.id)}
                          title="Delete Document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )) : (
                      <div className="col-span-full text-[var(--fg-subtle)] italic text-sm">No documents attached yet.</div>
                    )}
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-[var(--border-color)]">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-[var(--fg)] opacity-90 flex items-center gap-2">
                        <StickyNote className="w-5 h-5 text-violet-500" /> Additional Notes
                      </h3>
                      {isSavingNotes && <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse"></span>}
                    </div>
                    <button 
                      onClick={() => setIsEditingJobNotes(!isEditingJobNotes)}
                      className="text-xs font-medium text-violet-500 hover:text-violet-400 flex items-center gap-1.5 transition-colors bg-violet-500/10 px-2.5 py-1.5 rounded-lg border border-violet-500/20"
                    >
                      {isEditingJobNotes ? (
                        <> <FileText className="w-3.5 h-3.5" /> Finish Editing </>
                      ) : (
                        <> <Edit2 className="w-3.5 h-3.5" /> {jobNotes ? 'Edit Notes' : 'Add Notes'} </>
                      )}
                    </button>
                  </div>

                  {isEditingJobNotes ? (
                    <div className="min-h-[300px] job-notes-editor">
                      <MdEditor 
                        style={{ height: '300px', background: 'transparent' }}
                        value={jobNotes}
                        renderHTML={text => mdParser.render(text)}
                        onChange={({ text }) => setJobNotes(text)}
                        placeholder="Your notes here..."
                        view={{ menu: true, md: true, html: false }}
                        canView={{ menu: true, md: true, html: true, both: true, fullScreen: true, hideMenu: true }}
                      />
                    </div>
                  ) : (
                    <div className="glass p-4 rounded-xl min-h-[100px]">
                      {jobNotes ? (
                        <div className="prose dark:prose-invert prose-sm max-w-none text-[var(--fg-muted)]">
                          <ReactMarkdown>{jobNotes}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-[var(--fg-subtle)] italic text-sm">No additional notes for this application.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full lg:w-80 space-y-6 flex-shrink-0">
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                  <h3 className="text-lg font-semibold text-[var(--fg)] opacity-90">Contacts & Details</h3>
                </div>
                
                {isEditingInfo ? (
                  <div className="space-y-3 bg-[var(--input-bg)] p-4 rounded-xl border border-violet-500/30">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Company *</label>
                      <input 
                        className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" 
                        value={editFormData.company || ''} 
                        onChange={e => handleEditChange('company', e.target.value)}
                        list="edit-company-list"
                      />
                      <datalist id="edit-company-list">
                        {companies.map(c => (
                          <option key={c.id} value={c.name} />
                        ))}
                      </datalist>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Role *</label>
                      <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.role || ''} onChange={e => handleEditChange('role', e.target.value)}/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)] flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Application URL</label>
                      <input type="url" className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.url || ''} onChange={e => handleEditChange('url', e.target.value)} placeholder="https://..."/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Company Job ID</label>
                      <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.company_job_id || ''} onChange={e => handleEditChange('company_job_id', e.target.value)}/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Location</label>
                      <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.location || ''} onChange={e => handleEditChange('location', e.target.value)}/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Job Posted Date</label>
                      <input type="date" className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 style-date" value={editFormData.job_posted_date ? editFormData.job_posted_date.substring(0, 10) : ''} onChange={e => handleEditChange('job_posted_date', e.target.value || '')}/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Deadline</label>
                      <input type="date" className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 style-date" value={editFormData.application_deadline ? editFormData.application_deadline.substring(0, 10) : ''} onChange={e => handleEditChange('application_deadline', e.target.value || '')}/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)] mt-2 text-violet-500 font-medium">Hiring Manager Name</label>
                      <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.hiring_manager_name || ''} onChange={e => handleEditChange('hiring_manager_name', e.target.value)}/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Hiring Manager Email</label>
                      <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" type="email" value={editFormData.hiring_manager_email || ''} onChange={e => handleEditChange('hiring_manager_email', e.target.value)}/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)] mt-2 text-violet-500 font-medium">HR / Recruiter Email</label>
                      <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.hr_email || ''} onChange={e => handleEditChange('hr_email', e.target.value)}/>
                    </div>
                    
                    <button onClick={handleSaveInfo} className="w-full mt-4 bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-4 py-2 font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-violet-500/20">
                      <Save className="w-4 h-4"/> Save Details
                    </button>
                    <button onClick={() => { setIsEditingInfo(false); setEditFormData(job); }} className="w-full mt-2 text-[var(--fg-subtle)] hover:text-[var(--fg)] text-sm transition-colors">Cancel</button>
                  </div>
                ) : (
                  <div className="space-y-4 text-sm flex flex-col h-full">
                    {job.url && (
                      <div>
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 bg-violet-600/10 hover:bg-violet-600/20 border border-violet-500/30 hover:border-violet-500 text-violet-500 font-medium px-4 py-2.5 rounded-xl transition-all group"
                        >
                          <ExternalLink className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          Open Application Page
                        </a>
                      </div>
                    )}

                    <div>
                      <span className="text-[var(--fg-subtle)] block mb-1">Company Job ID</span>
                      <span className="text-[var(--fg-muted)] font-mono">{job.company_job_id || '-'}</span>
                    </div>

                    <div>
                      <span className="text-[var(--fg-subtle)] block mb-1">Hiring Manager</span>
                      {(job.hiring_manager_name || job.hiring_manager_email) ? (
                        <div className="glass p-3 rounded-lg flex flex-col gap-1">
                          <span className="text-[var(--fg)] font-medium flex items-center gap-2"><User className="w-3.5 h-3.5"/> {job.hiring_manager_name || 'Unknown Name'}</span>
                          {job.hiring_manager_email && <a href={`mailto:${job.hiring_manager_email}`} className="text-violet-500 hover:underline flex items-center gap-2"><Mail className="w-3.5 h-3.5"/> Mail</a>}
                        </div>
                      ) : <span className="text-[var(--fg-subtle)] italic">Not specified</span>}
                    </div>

                    <div>
                      <span className="text-[var(--fg-subtle)] block mb-1">HR / Recruiter</span>
                      {job.hr_email ? (
                        <div className="glass p-3 rounded-lg flex flex-col gap-1">
                          <a href={`mailto:${job.hr_email}`} className="text-violet-500 hover:underline flex items-center gap-2"><Mail className="w-3.5 h-3.5"/> {job.hr_email}</a>
                        </div>
                      ) : <span className="text-[var(--fg-subtle)] italic">Not specified</span>}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--border-color)]">
                      <div>
                        <span className="text-[var(--fg-subtle)] block text-xs mb-1">Posted</span>
                        <span className="text-[var(--fg-muted)]">{job.job_posted_date ? new Date(job.job_posted_date).toLocaleDateString() : '-'}</span>
                      </div>
                      <div>
                        <span className="text-[var(--fg-subtle)] block text-xs mb-1">Deadline</span>
                        <span className="text-[var(--fg-muted)]">{job.application_deadline ? new Date(job.application_deadline).toLocaleDateString() : '-'}</span>
                      </div>
                    </div>

                    <div className="mt-auto pt-8">
                      <button 
                        onClick={() => setShowDeleteConfirm(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-red-500 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/40 transition-all text-xs font-medium"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove Application
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="h-full flex flex-col">
               <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--fg)] opacity-90 flex items-center gap-2">
                       <StickyNote className="w-5 h-5 text-violet-400" /> Application Notes
                    </h3>
                    <p className="text-xs text-[var(--fg-subtle)]">Document research, thoughts, or preparation for this specific role.</p>
                  </div>
                  {isSavingNotes ? (
                    <span className="text-[10px] uppercase tracking-widest text-violet-500 font-bold animate-pulse">Saving...</span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-widest text-[var(--fg-subtle)] font-bold">Saved</span>
                  )}
               </div>
               
               <div className="flex-1 min-h-[400px] mb-8 job-notes-editor">
                  <MdEditor 
                    style={{ height: '100%', background: 'transparent' }}
                    value={jobNotes}
                    renderHTML={text => mdParser.render(text)}
                    onChange={({ text }) => setJobNotes(text)}
                    placeholder="Start documenting your thoughts here..."
                    view={{ menu: true, md: true, html: false }}
                    canView={{ menu: true, md: true, html: true, both: true, fullScreen: true, hideMenu: true }}
                  />
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

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Application?"
        message={`Are you sure you want to remove this application for ${job.company}? All interview steps and history will be permanently deleted. This action cannot be undone.`}
        onConfirm={handleDeleteJob}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmLabel="Delete Permanently"
        variant="danger"
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
