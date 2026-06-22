"use client";

import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import MdEditor from 'react-markdown-editor-lite';
import MarkdownIt from 'markdown-it';
import 'react-markdown-editor-lite/lib/index.css';
import { Job, getStepTypes, StepType, addInterviewStep, updateInterviewStep, deleteInterviewStep, updateJobStream, updateJob, deleteJobDocument, getCompanies, InterviewStep, uploadJobDocumentStream } from '../lib/api';
import { X, Calendar, User, Mail, Plus, Circle, FileText, Edit2, Save, Paperclip, Trash2, ExternalLink, Link as LinkIcon, StickyNote, Send, AlertTriangle, CircleDollarSign, Star, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Sun, Moon, Archive, ThumbsUp, ThumbsDown, ChevronRight, XCircle, Ban, Lock } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { DocumentPreview } from './DocumentPreview';
import { DocumentViewer } from './DocumentViewer';
import { ProcessingOverlay } from './ProcessingOverlay';
import { AutoSaveIndicator } from './AutoSaveIndicator';
import { Portal } from './Portal';
import { parseContact, normalizeContactEmail } from '@/lib/utils';

import { useView } from '@/lib/ViewContext';
import { useSettings } from '@/lib/SettingsContext';

interface JobDetailViewProps {
  job: Job | null;
  onClose: () => void;
  onJobUpdated: () => void;
}

export const JobDetailView: React.FC<JobDetailViewProps> = ({ job, onClose, onJobUpdated }) => {
  const { setDirty } = useView();
  const { settings } = useSettings();
  const [isAnimationFinished, setIsAnimationFinished] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [descFontSizeLevel, setDescFontSizeLevel] = useState(0);
  const [localThemeOverride, setLocalThemeOverride] = useState<'light' | 'dark' | null>(null);

  const resolvedGlobalTheme = useMemo(() => {
    if (settings?.theme === 'system') {
      if (typeof window !== 'undefined') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'dark';
    }
    return settings?.theme || 'dark';
  }, [settings?.theme]);

  const effectiveTheme = localThemeOverride || resolvedGlobalTheme;

  // Remove resizing logic for modal transition

  const [activeTab, setActiveTab] = useState<'info' | 'process' | 'notes' | 'resume'>(() => {
    if (job?.status === 'Wishlist' || job?.status === 'Applied') return 'info';
    return 'process';
  });
  const mdParser = new MarkdownIt();
  const [stepTypes, setStepTypes] = useState<StepType[]>([]);
  const [newStepName, setNewStepName] = useState('');
  const [newStepDate, setNewStepDate] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Job>>({});
  const [companies, setCompanies] = useState<{ id: number, name: string }[]>([]);

  // Interview Step Editing State
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [editStepForm, setEditStepForm] = useState<{ name: string, date: string, status: string, notes: string }>({
    name: '',
    date: '',
    status: '',
    notes: ''
  });

  // Job-level Notes state
  const [jobNotes, setJobNotes] = useState<string>(job?.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isEditingJobNotes, setIsEditingJobNotes] = useState(false);

  // Quick status advance state
  const [quickConfirmState, setQuickConfirmState] = useState<{
    isOpen: boolean;
    nextStatus: string;
    variant: 'default' | 'danger' | 'success';
  }>({ isOpen: false, nextStatus: '', variant: 'default' });
  const [quickStepTypes, setQuickStepTypes] = useState<string[]>([]);

  // Resumes list filtering
  const resumes = useMemo(() => {
    return job?.documents?.filter(doc => doc.doc_type === 'submitted_resume') || [];
  }, [job?.documents]);

  const showResumeTab = resumes.length > 0;
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);

  // Default first resume if none selected
  useEffect(() => {
    if (resumes.length > 0) {
      if (selectedResumeId === null || !resumes.some(r => r.id === selectedResumeId)) {
        setSelectedResumeId(resumes[0].id);
      }
    } else {
      setSelectedResumeId(null);
    }
  }, [resumes, selectedResumeId]);

  // Reset activeTab if it is 'resume' and all resumes were deleted
  useEffect(() => {
    if (activeTab === 'resume' && !showResumeTab) {
      setActiveTab('info');
    }
  }, [showResumeTab, activeTab]);

  const isDirty = useMemo(() => {
    // 1. Check Job Info
    if (isEditingInfo && job) {
      const fields: (keyof Job)[] = [
        'company', 'role', 'url', 'status', 'location',
        'employment_type', 'agency',
        'description', 'salary_range', 'hr_email',
        'hiring_manager_name', 'hiring_manager_email',
        'company_job_id', 'created_at', 'applied_date', 'decision_date', 'closed_date'
      ];

      const infoDirty = fields.some(field => {
        const original = job[field] || '';
        const current = editFormData[field] || '';
        return String(original) !== String(current);
      });
      if (infoDirty) return true;
    }

    // 2. Check Interview Step
    if (editingStepId !== null && job?.steps) {
      const step = job.steps.find(s => s.id === editingStepId);
      if (step) {
        const originalName = step.step_type.name || '';
        const originalDate = step.step_date ? step.step_date.substring(0, 10) : '';
        const originalStatus = step.status || '';
        const originalNotes = step.notes || '';

        if (
          editStepForm.name !== originalName ||
          editStepForm.date !== originalDate ||
          editStepForm.status !== originalStatus ||
          editStepForm.notes !== originalNotes
        ) {
          return true;
        }
      }
    }

    // 3. Check Add Step Form
    if (isAdding && (newStepName || newStepDate)) {
      return true;
    }

    return false;
  }, [isEditingInfo, editFormData, job, editingStepId, editStepForm, isAdding, newStepName, newStepDate]);

  useEffect(() => {
    let message = "You have unsaved changes in the job details. If you switch now, these changes will be lost.";
    if (editingStepId !== null) {
      message = "You have unsaved changes in the interview step. If you switch now, these changes will be lost.";
    } else if (isAdding) {
      message = "You have unsaved changes in the new interview step form. If you switch now, these changes will be lost.";
    }
    setDirty(isDirty, message);
    return () => setDirty(false); // Clear on close
  }, [isDirty, setDirty, editingStepId, isAdding]);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'vectorizing' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Terminal status confirm
  const [terminalStatusConfirm, setTerminalStatusConfirm] = useState<{
    isOpen: boolean,
    nextStatus: string,
    onConfirm: () => void
  }>({ isOpen: false, nextStatus: '', onConfirm: () => { } });

  // Modern Alert/Confirm replacements
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean, title: string, message: string, variant?: 'default' | 'danger' | 'success' }>({
    isOpen: false, title: '', message: ''
  });
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean,
    title: string,
    message: React.ReactNode,
    onConfirm: () => void,
    variant?: 'default' | 'danger' | 'success'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });

  const getRelativeTimeString = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;

    return date.toLocaleDateString();
  };

  // Document preview state
  const [previewDoc, setPreviewDoc] = useState<{ isOpen: boolean; title: string; fileUrl: string | null }>({
    isOpen: false,
    title: '',
    fileUrl: null,
  });

  // Document upload state
  const [docUploadType, setDocUploadType] = useState('job_post');
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadTasks, setUploadTasks] = useState([
    { id: 'upload', label: 'Uploading file...', status: 'waiting' as any },
    { id: 'extract', label: 'Extracting content...', status: 'waiting' as any },
    { id: 'vectorize', label: 'Generating embeddings...', status: 'waiting' as any },
    { id: 'finalize', label: 'Finalizing...', status: 'waiting' as any },
  ]);

  const handleAttachPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && job?.id) {
      setIsUploadingDoc(true);
      setUploadError(null);
      setUploadTasks(prev => prev.map(t => ({ ...t, status: 'waiting' })));

      try {
        await uploadJobDocumentStream(job.id, file, docUploadType, (event, msg) => {
          if (event === 'progress') {
            setUploadTasks(prev => {
              const currentTasks = [...prev];
              // Map specific backend messages to our UI tasks
              if (msg.includes('Initializing') || msg.includes('Saving')) {
                currentTasks[0].status = 'loading';
              } else if (msg.includes('Registering')) {
                currentTasks[0].status = 'completed';
                currentTasks[1].status = 'loading';
              } else if (msg.includes('Extracting')) {
                currentTasks[1].status = 'loading';
              } else if (msg.includes('vectorizing')) {
                currentTasks[1].status = 'completed';
                currentTasks[2].status = 'loading';
              } else if (msg.includes('Finalizing')) {
                currentTasks[2].status = 'completed';
                currentTasks[3].status = 'loading';
              }
              return currentTasks;
            });
          } else if (event === 'completed') {
            setUploadTasks(prev => prev.map(t => ({ ...t, status: 'completed' })));
            onJobUpdated();
          } else if (event === 'error') {
            setUploadError(msg);
            setUploadTasks(prev => prev.map(t => t.status === 'loading' ? { ...t, status: 'error' } : t));
          }
        });
      } catch (err: any) {
        console.error('Failed to attach document', err);
        setUploadError(err.message || 'Unknown upload error');
      }
    }
  };

  const handleDeleteDocument = async (e: React.MouseEvent, docId: number) => {
    e.stopPropagation();
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Document',
      message: 'Are you sure you want to delete this document? This action cannot be undone.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteJobDocument(docId);
          onJobUpdated();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          console.error('Failed to delete document', err);
          setAlertDialog({ isOpen: true, title: 'Delete Failed', message: 'Failed to delete document.', variant: 'danger' });
        }
      }
    });
  };

  // Load metadata only once when component mounts or list counts change
  useEffect(() => {
    if (job) {
      if (stepTypes.length === 0) getStepTypes().then(setStepTypes).catch(console.error);
      if (companies.length === 0) getCompanies().then(setCompanies).catch(console.error);
    }
  }, [job, stepTypes.length, companies.length]);

  // Sync edit form data if not actively editing
  useEffect(() => {
    if (job && !isEditingInfo) {
      setEditFormData(job);
    }
  }, [job, isEditingInfo]);

  // Sync notes when job ID changes (loading a different job)
  useEffect(() => {
    if (job) {
      setJobNotes(job.notes || '');
    }
  }, [job?.id]);

  // Debounced notes auto-save
  useEffect(() => {
    if (job?.id && jobNotes !== undefined && jobNotes !== (job.notes || '')) {
      setSaveStatus('saving');
      const timer = setTimeout(async () => {
        try {
          await updateJobStream(job.id!, { notes: jobNotes }, (event, msg) => {
            if (event === 'progress' && msg.includes('Vectorizing')) {
              setSaveStatus('vectorizing');
            } else if (event === 'completed') {
              setSaveStatus('saved');
              onJobUpdated();
              setTimeout(() => setSaveStatus('idle'), 2000);
            } else if (event === 'error') {
              setSaveStatus('error');
              setSaveError(msg);
            }
          });
        } catch (err: any) {
          setSaveStatus('error');
          setSaveError(err.message || 'Auto-save failed');
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [jobNotes, job?.id, job?.notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedSteps = useMemo(() => {
    let steps = job?.steps ? [...job.steps] : [];

    // Inject "Applied" event if applied_date exists
    if (job?.applied_date) {
      steps.push({
        id: -1, // Virtual ID
        step_type: { id: -1, name: 'Applied' },
        step_date: job.applied_date,
        status: 'Completed',
        notes: 'Application submitted to company.'
      } as any);
    }

    return steps.sort((a, b) => {
      const dateA = a.step_date ? new Date(a.step_date).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.step_date ? new Date(b.step_date).getTime() : Number.MAX_SAFE_INTEGER;
      return dateB - dateA;
    });
  }, [job?.steps, job?.applied_date]);

  if (!job) return null;

  const handleAddStep = async () => {
    if (!newStepName) return;
    try {
      await addInterviewStep(job.id!, newStepName, newStepDate ? newStepDate + 'T12:00:00.000Z' : undefined, 'Scheduled');
      setNewStepName('');
      setNewStepDate('');
      setIsAdding(false);
      onJobUpdated();

      const terminalStatuses = ["Rejected", "Offered", "Discontinued", "Closed"];
      if (terminalStatuses.includes(job.status)) {
        const calculatedNext = 'Interviewing';
        setTerminalStatusConfirm({
          isOpen: true,
          nextStatus: calculatedNext,
          onConfirm: async () => {
            await updateJob(job.id!, { status: calculatedNext });
            onJobUpdated();
            setTerminalStatusConfirm(prev => ({ ...prev!, isOpen: false }));
          }
        });
      }
    } catch (err) {
      console.error('Failed to add step', err);
    }
  };

  const handleStatusChange = async (stepId: number, nextStatus: string) => {
    try {
      await updateInterviewStep(stepId, { status: nextStatus });
      onJobUpdated();

      const terminalStatuses = ["Rejected", "Offered", "Discontinued", "Closed"];
      if (terminalStatuses.includes(job.status)) {
        // Recalculate what the status OUGHT to be
        const calculatedNext = 'Interviewing';
        setTerminalStatusConfirm({
          isOpen: true,
          nextStatus: calculatedNext,
          onConfirm: async () => {
            await updateJob(job.id!, { status: calculatedNext });
            onJobUpdated();
            setTerminalStatusConfirm(prev => ({ ...prev!, isOpen: false }));
          }
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteStep = async (stepId: number) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Interview Step',
      message: 'Are you sure you want to delete this interview step? The associated notes will also be lost.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteInterviewStep(stepId);
          onJobUpdated();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));

          const terminalStatuses = ["Rejected", "Offered", "Discontinued", "Closed"];
          if (terminalStatuses.includes(job.status)) {
            // If we delete a step and we are terminal, we might want to go back to Applied (if 0 steps) or stay
            const hasRemainingSteps = (job.steps?.length || 0) > 1;
            const calculatedNext = hasRemainingSteps ? 'Interviewing' : 'Applied';

            setTerminalStatusConfirm({
              isOpen: true,
              nextStatus: calculatedNext,
              onConfirm: async () => {
                await updateJob(job.id!, { status: calculatedNext });
                onJobUpdated();
                setTerminalStatusConfirm(prev => ({ ...prev!, isOpen: false }));
              }
            });
          }
        } catch (err) {
          console.error('Failed to delete step', err);
          setAlertDialog({ isOpen: true, title: 'Delete Failed', message: 'Failed to delete interview step.', variant: 'danger' });
        }
      }
    });
  };

  const startEditingStep = (step: InterviewStep) => {
    setEditingStepId(step.id);
    setEditStepForm({
      name: step.step_type.name || '',
      date: step.step_date ? step.step_date.substring(0, 10) : '',
      status: step.status || 'Scheduled',
      notes: step.notes || ''
    });
  };

  const saveStep = async (stepId: number) => {
    try {
      const step = job?.steps?.find(s => s.id === stepId);
      const updateData: any = {};

      if (editStepForm.name !== step?.step_type.name) updateData.step_type_name = editStepForm.name;
      if (editStepForm.date !== (step?.step_date ? step.step_date.substring(0, 10) : '')) updateData.step_date = editStepForm.date ? editStepForm.date + 'T12:00:00.000Z' : null;
      if (editStepForm.status !== step?.status) updateData.status = editStepForm.status;
      if (editStepForm.notes !== step?.notes) updateData.notes = editStepForm.notes;

      if (Object.keys(updateData).length > 0) {
        await updateInterviewStep(stepId, updateData);
        onJobUpdated();
      }
      setEditingStepId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditChange = (field: keyof Job, value: string) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

  const allStatuses = ['Wishlist', 'Applied', 'Interviewing', 'Offered', 'Rejected'];
  const isTerminal = ['Offered', 'Rejected', 'Closed', 'Discontinued'].includes(job.status);
  const isInterviewing = job.status === 'Interviewing';
  const hasActions = isInterviewing || !isTerminal || job.status === 'Applied' || job.status === 'Wishlist';

  const openQuickConfirm = (nextStatus: string) => {
    if (nextStatus === 'Interviewing') {
      getStepTypes().then(types => setQuickStepTypes(types.map((t: StepType) => t.name))).catch(console.error);
    }
    setQuickConfirmState({
      isOpen: true,
      nextStatus,
      variant: nextStatus === 'Rejected' || nextStatus === 'Discontinued' ? 'danger' : nextStatus === 'Offered' ? 'success' : 'default',
    });
  };

  const handleQuickAdvance = () => {
    const currentIndex = allStatuses.indexOf(job.status);
    if (currentIndex >= 0 && currentIndex < allStatuses.length - 1) {
      const nextStatus = allStatuses[currentIndex + 1];
      openQuickConfirm(nextStatus);
    }
  };

  const handleQuickConfirm = async (date?: string, file?: File | null, text?: string) => {
    try {
      if (quickConfirmState.nextStatus === 'Interviewing') {
        await addInterviewStep(job.id!, text || 'Initial Interview', date ? date + 'T12:00:00.000Z' : undefined, 'Scheduled');
        onJobUpdated();
      } else {
        const updateData: any = { status: quickConfirmState.nextStatus };
        if (date) {
          if (['Offered', 'Rejected', 'Discontinued'].includes(quickConfirmState.nextStatus)) {
            updateData.decision_date = date + 'T12:00:00.000Z';
          } else if (quickConfirmState.nextStatus === 'Applied') {
            updateData.applied_date = date + 'T12:00:00.000Z';
          } else if (quickConfirmState.nextStatus === 'Closed') {
            updateData.closed_date = date + 'T12:00:00.000Z';
          }
        }

        setIsUploadingDoc(true);
        setUploadError(null);
        setUploadTasks(prev => prev.map(t => ({ ...t, status: 'waiting' })));

        await updateJobStream(job.id!, updateData, (event, msg) => {
          if (event === 'progress') {
            setUploadTasks(prev => {
              const currentTasks = [...prev];
              if (msg.includes('Applying')) currentTasks[0].status = 'loading';
              else if (msg.includes('Vectorizing')) {
                 currentTasks[0].status = 'completed';
                 currentTasks[3].status = 'loading';
              }
              return currentTasks;
            });
          } else if (event === 'completed') {
            if (!file) {
              setUploadTasks(prev => prev.map(t => ({ ...t, status: 'completed' })));
              onJobUpdated();
            }
          } else if (event === 'error') {
            setUploadError(msg);
          }
        });

        if (file && quickConfirmState.nextStatus === 'Applied') {
          const combinedOp = `Advanced to Applied + Attached CV: ${file.name}`;
          await uploadJobDocumentStream(job.id!, file, 'submitted_resume', (event, msg) => {
            if (event === 'progress') {
              setUploadTasks(prev => {
                const currentTasks = [...prev];
                if (msg.includes('Initializing') || msg.includes('Saving')) currentTasks[0].status = 'loading';
                else if (msg.includes('Registering')) { currentTasks[0].status = 'completed'; currentTasks[1].status = 'loading'; }
                else if (msg.includes('Extracting')) currentTasks[1].status = 'loading';
                else if (msg.includes('vectorizing')) { currentTasks[1].status = 'completed'; currentTasks[2].status = 'loading'; }
                else if (msg.includes('Finalizing')) { currentTasks[2].status = 'completed'; currentTasks[3].status = 'loading'; }
                return currentTasks;
              });
            } else if (event === 'completed') {
              setUploadTasks(prev => prev.map(t => ({ ...t, status: 'completed' })));
              onJobUpdated();
            } else if (event === 'error') {
              setUploadError(msg);
            }
          }, combinedOp);
        }
      }
      setQuickConfirmState({ isOpen: false, nextStatus: '', variant: 'default' });
    } catch (err) {
      console.error('Failed to quick update status', err);
    }
  };

  const handleSaveInfo = async () => {
    // Validation: Contractor must have an agency
    if (editFormData.employment_type === 'Contractor' && (!editFormData.agency || editFormData.agency.trim() === '')) {
      setAlertDialog({
        isOpen: true,
        title: 'Validation Error',
        message: "Please provide the agency name for Contractor roles.",
        variant: 'danger'
      });
      return;
    }

    // Validation: cannot clear applied_date if steps exist
    if (!editFormData.applied_date && job.steps && job.steps.length > 0) {
      setAlertDialog({
        isOpen: true,
        title: 'Validation Error',
        message: "Cannot clear the 'Actually Applied' date while interview steps exist. Please delete all interview steps first.",
        variant: 'danger'
      });
      return;
    }

    try {
      const cleanData = Object.fromEntries(
        Object.entries(editFormData).map(([k, v]) => [k, v === '' ? null : v])
      );

      // Normalize contact emails to ensure proper quoting of display names
      cleanData.hr_email = normalizeContactEmail(cleanData.hr_email as string | null);
      cleanData.hiring_manager_email = normalizeContactEmail(cleanData.hiring_manager_email as string | null);
      cleanData.headhunter_email = normalizeContactEmail(cleanData.headhunter_email as string | null);

      // Anchor bare date strings (YYYY-MM-DD) to noon UTC to prevent timezone shift.
      // The backend UTCDateTime validator would otherwise coerce them to midnight UTC,
      // which renders as the previous calendar day in negative-offset timezones.
      const DATE_ONLY_FIELDS = ['applied_date', 'decision_date', 'closed_date', 'job_posted_date', 'application_deadline'];
      for (const field of DATE_ONLY_FIELDS) {
        if (cleanData[field] && typeof cleanData[field] === 'string' && cleanData[field].length === 10) {
          cleanData[field] = cleanData[field] + 'T12:00:00.000Z';
        }
      }

      const currentStatus = cleanData.status as string;
      const allowedWishlistTransitions = ['Wishlist', 'Discontinued', 'Closed'];

      // Item 4: Wishlist Guard - Wishlist status MUST NOT have an applied_date
      if (currentStatus === 'Wishlist' && cleanData.applied_date) {
        setAlertDialog({
          isOpen: true,
          title: 'Lifecycle Guard',
          message: "To move an application back to 'Wishlist', you must first clear the 'Actually Applied' date.",
          variant: 'danger'
        });
        return;
      }

      // Item 2: Interviewing Guard - Cannot move to Interviewing if zero steps
      if (currentStatus === 'Interviewing' && (job.steps || []).length === 0) {
        setAlertDialog({
          isOpen: true,
          title: 'Lifecycle Guard',
          message: "You cannot move an application to 'Interviewing' without at least one interview step. Please add a step in the Timeline first or use the 'Applied' status.",
          variant: 'danger'
        });
        return;
      }

      // Item 3: Applied Guard - Applied status MUST NOT have any interview steps
      if (currentStatus === 'Applied' && (job.steps || []).length > 0) {
        setAlertDialog({
          isOpen: true,
          title: 'Lifecycle Guard',
          message: "The 'Applied' status is reserved for applications without interview steps. Since this application has interview events, please use the 'Interviewing' status instead.",
          variant: 'danger'
        });
        return;
      }

      // Item 1: Refined Wishlist Message - Restriction: Wishlist (no date) can ONLY move to Discontinued or Closed terminal status
      if (!cleanData.applied_date && currentStatus && !allowedWishlistTransitions.includes(currentStatus)) {
        setAlertDialog({
          isOpen: true,
          title: 'Lifecycle Guard',
          message: `An application in the 'Wishlist' stage (no applied date) can only be moved to 'Closed' or 'Discontinued'. 'Applied', 'Interviewing', 'Offered' or 'Rejected' require an application date.`,
          variant: 'danger'
        });
        return;
      }

      if (job?.id) {
        setIsUploadingDoc(true);
        setUploadError(null);
        setUploadTasks(prev => prev.map(t => ({ ...t, status: 'waiting' })));

        try {
          await updateJobStream(job.id, { ...cleanData }, (event, msg) => {
            if (event === 'progress') {
              setUploadTasks(prev => {
                const currentTasks = [...prev];
                if (msg.includes('Applying')) currentTasks[0].status = 'loading';
                else if (msg.includes('Vectorizing job description')) {
                  currentTasks[0].status = 'completed';
                  currentTasks[1].status = 'completed';
                  currentTasks[2].status = 'waiting';
                  currentTasks[3].status = 'loading';
                }
                return currentTasks;
              });
            } else if (event === 'completed') {
              setUploadTasks(prev => prev.map(t => t.status === 'loading' || t.status === 'waiting' ? { ...t, status: 'completed' } : t));
              setIsEditingInfo(false);
              onJobUpdated();
            } else if (event === 'error') {
              setUploadError(msg);
            }
          });
        } catch (err: any) {
          setUploadError(err.message || 'Failed to save job details');
        }
      }
    } catch (error: any) {
      console.error("Failed to update job info", error);
      const detail = error?.response?.data?.detail;
      const errorMsg = Array.isArray(detail)
        ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ')
        : (typeof detail === 'string' ? detail : (error.message || 'Failed to update info'));

      setAlertDialog({ isOpen: true, title: 'Update Failed', message: errorMsg, variant: 'danger' });
    }
  };

  const handleDeleteJob = async () => {
    if (!job?.id) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Application',
      message: `Are you sure you want to delete ${job.company} - ${job.role}? All notes, steps, and documents will be permanently removed.`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { deleteJob } = await import('../lib/api');
          await deleteJob(job.id!);
          onJobUpdated();
          onClose();
        } catch (err) {
          console.error("Failed to delete job", err);
          setAlertDialog({ isOpen: true, title: 'Delete Failed', message: 'Failed to delete application.', variant: 'danger' });
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const stepStatusOptions = ['Requested', 'Scheduled', 'Passed', 'Completed'];

  return (
    <Portal>
      <div 
        className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 ${isFullScreen ? 'p-0' : 'p-4 md:p-8'} ${!isAnimationFinished ? 'animate-fade-in' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          data-theme={effectiveTheme}
          className={`bg-[var(--bg)] text-[var(--fg)] border border-[var(--border-color)] shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${isFullScreen ? 'w-full h-full rounded-none' : 'w-full max-w-[95vw] md:max-w-[90vw] lg:max-w-[85vw] xl:max-w-[80vw] 2xl:max-w-[1400px] h-[90vh] rounded-2xl md:rounded-3xl'} ${!isAnimationFinished ? 'animate-slide-up' : ''}`}
          onAnimationEnd={() => setIsAnimationFinished(true)}
        >
        {/* Header */}
        <div className="flex justify-between items-center p-4 md:px-8 border-b border-[var(--border-color)] bg-[var(--surface)] backdrop-blur-md shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-1.5 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <button 
                  onClick={() => updateJob(job.id!, { is_starred: !job.is_starred }).then(() => onJobUpdated())}
                  className={`p-1.5 -ml-1.5 rounded-full hover:bg-[var(--surface-hover)] transition-colors ${job.is_starred ? 'text-yellow-400' : 'text-[var(--fg-subtle)] hover:text-yellow-400/50'}`}
                  title={job.is_starred ? "Unstar Job" : "Star Job"}
                >
                  <Star className={`w-6 h-6 ${job.is_starred ? 'fill-current' : ''}`} />
                </button>
                <h2 className="text-2xl font-bold text-[var(--fg)] truncate" title={job.company}>
                  {job.company}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="text-sm px-2.5 py-1 bg-[var(--surface-hover)] rounded-full font-medium shrink-0" style={{ color: 'var(--fg-muted)' }}>{job.status}</span>
                {job.employment_type && job.employment_type !== 'FTE' && (
                  <span className={`text-[10px] px-2 py-1 border rounded-md font-bold uppercase tracking-wider shrink-0 ${
                    job.employment_type === 'Contractor' 
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-500' 
                      : 'border-blue-500/30 bg-blue-500/10 text-blue-500'
                  }`}>
                    {job.employment_type}
                  </span>
                )}
                {job.last_operation && (
                  <span 
                    className="text-[10px] px-2 py-1 bg-violet-500/10 text-violet-400 border border-violet-500/10 rounded-md font-medium flex items-center gap-1.5 max-w-[280px] sm:max-w-[400px] md:max-w-md lg:max-w-xl"
                    title={`${job.last_operation} • ${getRelativeTimeString(job.last_updated)}`}
                  >
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse shrink-0"></span>
                    <span className="truncate">
                      {job.last_operation} • {getRelativeTimeString(job.last_updated)}
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className="text-[var(--fg-muted)] text-sm flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              {job.url ? (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-violet-500 transition-colors inline-flex items-center gap-1 hover:underline decoration-violet-500/30 min-w-0 max-w-[65%]"
                  title={`Open Application Page: ${job.role}`}
                >
                  <span className="truncate font-medium">{job.role}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--fg-subtle)] transition-colors shrink-0" />
                </a>
              ) : (
                <span className="truncate font-medium min-w-0 max-w-[65%]" title={job.role}>
                  {job.role}
                </span>
              )}
              {job.location && (
                <span className="text-[var(--fg-subtle)] flex items-center gap-1 shrink-0">
                  <span className="hidden sm:inline text-[var(--fg-subtle)]/40">•</span>
                  <span>{job.location}</span>
                </span>
              )}
              {job.salary_range && (
                <span className="text-green-500/80 font-medium inline-flex items-center gap-1 shrink-0">
                  <CircleDollarSign className="w-3.5 h-3.5" />
                  {job.salary_range}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => window.open(`/api/proxy/jobs/${job.id}/pdf`, '_blank')}
              className="p-2 hover:bg-[var(--surface-hover)] rounded-full text-[var(--fg-subtle)] hover:text-[var(--fg)] transition flex items-center gap-1.5"
              title="Download Job Details PDF"
            >
              <FileText className="w-5 h-5" />
              <span className="text-xs font-medium hidden sm:inline">PDF</span>
            </button>
            <button 
              onClick={() => setIsFullScreen(!isFullScreen)} 
              className="p-2 hover:bg-[var(--surface-hover)] rounded-full text-[var(--fg-subtle)] hover:text-[var(--fg)] transition hidden md:block"
              title={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
            >
              {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-[var(--surface-hover)] rounded-full text-[var(--fg-subtle)] hover:text-[var(--fg)] transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex justify-between items-center px-4 md:px-8 border-b border-[var(--border-color)] shrink-0">
          <div className="flex">
            <button
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'process' ? 'border-violet-500 text-violet-500' : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'}`}
              onClick={() => setActiveTab('process')}
            >
              Interview Process
            </button>
            <button
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'info' ? 'border-violet-500 text-violet-500' : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'}`}
              onClick={() => setActiveTab('info')}
            >
              Job Details
            </button>
            {showResumeTab && (
              <button
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'resume' ? 'border-violet-500 text-violet-500' : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'}`}
                onClick={() => setActiveTab('resume')}
              >
                Resume
              </button>
            )}
          </div>

          {/* Quick Actions & Archive Tray */}
          <div className="flex items-center gap-2 py-1.5">
            {hasActions && (
              <div className="flex items-center gap-1.5">
                {isInterviewing ? (
                  <>
                    <button 
                      onClick={() => openQuickConfirm('Offered')} 
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 border border-emerald-600/20 dark:border-emerald-400/20 hover:bg-emerald-600/20 dark:hover:bg-emerald-400/20 transition-all active:scale-95 cursor-pointer" 
                      title="Mark as Offered"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>Offer</span>
                    </button>
                    <button 
                      onClick={() => openQuickConfirm('Rejected')} 
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600/10 dark:bg-red-400/10 text-red-600 dark:text-red-400 border border-red-600/20 dark:border-red-400/20 hover:bg-red-600/20 dark:hover:bg-red-400/20 transition-all active:scale-95 cursor-pointer" 
                      title="Mark as Rejected"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </>
                ) : !isTerminal ? (
                  <>
                    <button 
                      onClick={handleQuickAdvance} 
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600/10 dark:bg-violet-400/10 text-violet-600 dark:text-violet-400 border border-violet-600/20 dark:border-violet-400/20 hover:bg-violet-600/20 dark:hover:bg-violet-400/20 transition-all active:scale-95 cursor-pointer" 
                      title="Advance to Next Stage"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                      <span>Advance</span>
                    </button>
                    {job.status === 'Applied' && (
                      <button 
                        onClick={() => openQuickConfirm('Rejected')} 
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600/10 dark:bg-red-400/10 text-red-600 dark:text-red-400 border border-red-600/20 dark:border-red-400/20 hover:bg-red-600/20 dark:hover:bg-red-400/20 transition-all active:scale-95 cursor-pointer" 
                        title="Mark as Rejected"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    )}
                  </>
                ) : null}

                {(job.status === 'Applied' || job.status === 'Interviewing') && (
                  <button 
                    onClick={() => openQuickConfirm('Discontinued')} 
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-600/10 dark:bg-slate-400/10 text-slate-600 dark:text-slate-400 border border-slate-600/20 dark:border-slate-400/20 hover:bg-slate-600/20 dark:hover:bg-slate-400/20 transition-all active:scale-95 cursor-pointer" 
                    title="Mark as Discontinued"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Discontinue</span>
                  </button>
                )}

                {job.status === 'Wishlist' && (
                  <button 
                    onClick={() => openQuickConfirm('Closed')} 
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-600/10 dark:bg-orange-400/10 text-orange-600 dark:text-orange-400 border border-orange-600/20 dark:border-orange-400/20 hover:bg-orange-600/20 dark:hover:bg-orange-400/20 transition-all active:scale-95 cursor-pointer" 
                    title="Mark as Closed"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Close</span>
                  </button>
                )}
              </div>
            )}

            {/* Archive / Restore Action */}
            <button 
              onClick={() => updateJob(job.id!, { is_archived: !job.is_archived }).then(() => onJobUpdated())}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                job.is_archived 
                  ? 'bg-violet-600/15 text-violet-500 dark:text-violet-400 border border-violet-500/30' 
                  : 'bg-slate-600/5 dark:bg-slate-400/5 text-[var(--fg-muted)] border border-[var(--border-color)] hover:bg-[var(--surface-hover)]'
              }`}
              title={job.is_archived ? "Restore Application" : "Archive Application"}
            >
              <Archive className={`w-3.5 h-3.5 ${job.is_archived ? 'fill-current text-violet-500 dark:text-violet-400' : 'text-[var(--fg-subtle)]'}`} />
              <span>{job.is_archived ? 'Restore' : 'Archive'}</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className={`flex-1 flex flex-col ${activeTab === 'resume' ? 'overflow-hidden p-0' : 'overflow-y-auto p-4 md:p-8 custom-scrollbar'}`}>
          {activeTab === 'process' && (
            <div className="max-w-3xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-[var(--fg)] opacity-90">Timeline</h3>
                <div className="relative group/addstep">
                  <button
                    disabled={!job.applied_date}
                    onClick={() => setIsAdding(!isAdding)}
                    className={`text-sm bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Plus className="w-4 h-4" /> Add Step
                  </button>
                  {!job.applied_date && (
                    <div className="absolute bottom-full right-0 mb-2 w-48 p-2 tooltip-box text-[10px] rounded-lg opacity-0 group-hover/addstep:opacity-100 pointer-events-none transition-opacity shadow-xl z-50">
                      You must provide an "Actually Applied" date in the Job Details tab before adding interview steps.
                    </div>
                  )}
                </div>
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
                  <button onClick={handleAddStep} className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Save</button>
                </div>
              )}

              <div className="relative pl-4 space-y-6 before:absolute before:inset-y-0 before:left-[21px] before:w-[2px] before:bg-[var(--border-color)]">
                {sortedSteps.length > 0 ? sortedSteps.map((step) => (
                  <div key={step.id} className="relative flex items-start gap-4 flex-col sm:flex-row group/step">
                    <div className="relative z-10 mt-1.5 bg-[var(--bg)] p-1 rounded-full outline-none">
                      {step.id === -1 ? (
                        <Send className="w-5 h-5 text-violet-500 fill-violet-500/10" />
                      ) : (
                        <Circle className={`w-5 h-5 ${step.status === 'Completed' || step.status === 'Passed' ? 'text-green-500 fill-green-500/20' : 'text-[var(--fg-subtle)]'}`} />
                      )}
                    </div>
                    <div className={`flex flex-col glass p-4 rounded-xl w-full border ${step.status === 'Completed' || step.status === 'Passed' ? 'border-green-500/20 bg-green-500/5' : 'border-[var(--border-color)]'} hover:border-violet-500/30 transition`}>
                      <div className="flex justify-between items-center mb-1">
                        {editingStepId === step.id ? (
                          <input
                            value={editStepForm.name}
                            onChange={(e) => setEditStepForm(prev => ({ ...prev, name: e.target.value }))}
                            list="step-types"
                            className="bg-[var(--bg)] border border-violet-500/50 rounded-lg px-2 py-1 text-[var(--fg)] text-sm focus:outline-none focus:border-violet-500 flex-1 mr-4"
                            placeholder="Step Name"
                            autoFocus
                          />
                        ) : (
                          <span className={`font-semibold ${step.status === 'Completed' || step.status === 'Passed' ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)]'}`}>{step.step_type.name}</span>
                        )}

                        {step.id !== -1 && (
                          <select
                            className="text-xs font-medium px-2 py-1 rounded-md bg-[var(--input-bg)] text-[var(--fg-muted)] border border-[var(--border-color)] cursor-pointer focus:outline-none focus:border-violet-500 transition-colors dark:text-white"
                            value={editingStepId === step.id ? editStepForm.status : step.status}
                            onChange={(e) => editingStepId === step.id ? setEditStepForm(prev => ({ ...prev, status: e.target.value })) : handleStatusChange(step.id, e.target.value)}
                          >
                            {stepStatusOptions.map(opt => (
                              <option key={opt} value={opt} className="bg-[var(--surface)] text-[var(--fg)]">{opt}</option>
                            ))}
                          </select>
                        )}
                        {step.id === -1 && (
                          <span className="text-[10px] uppercase font-bold text-violet-500/60 tracking-wider">System Event</span>
                        )}
                      </div>

                      {editingStepId === step.id ? (
                        <div className="flex items-center gap-1.5 text-xs text-[var(--fg-subtle)] mt-2">
                          <Calendar className="w-3.5 h-3.5" />
                          <input
                            type="date"
                            value={editStepForm.date}
                            onChange={(e) => setEditStepForm(prev => ({ ...prev, date: e.target.value }))}
                            className="bg-[var(--bg)] border border-violet-500/30 rounded-lg px-2 py-0.5 text-[var(--fg)] text-xs focus:outline-none focus:border-violet-500 style-date"
                          />
                        </div>
                      ) : (
                        step.step_date && (
                          <div className="flex items-center gap-1.5 text-xs text-[var(--fg-subtle)] mt-2">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(step.step_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                          </div>
                        )
                      )}

                      <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
                        {editingStepId === step.id ? (
                          <div className="flex flex-col gap-2 mt-1 z-10 relative">
                            <textarea
                              value={editStepForm.notes}
                              onChange={(e) => setEditStepForm(prev => ({ ...prev, notes: e.target.value }))}
                              className="w-full bg-[var(--bg)] border border-violet-500/50 rounded-lg px-3 py-2 text-[var(--fg)] text-sm focus:outline-none focus:border-violet-500 min-h-[80px]"
                              placeholder="Add comments or notes..."
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingStepId(null)} className="text-xs px-3 py-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors">Cancel</button>
                              <button onClick={() => saveStep(step.id)} className="text-xs font-medium bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                                <Save className="w-3.5 h-3.5" /> Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-4">
                            {step.notes ? (
                              <div className="text-sm text-[var(--fg-muted)] whitespace-pre-wrap">{step.notes}</div>
                            ) : (
                              <div className="text-sm text-[var(--fg-subtle)] italic">
                                {step.id === -1 ? 'System generated event.' : 'No notes added.'}
                              </div>
                            )}
                            {step.id !== -1 && (
                              <div className="flex items-center gap-2 opacity-0 group-hover/step:opacity-100 transition-all">
                                <button
                                  onClick={() => startEditingStep(step)}
                                  className="shrink-0 text-xs text-[var(--fg-subtle)] hover:text-violet-500 transition-all flex items-center gap-1.5 bg-[var(--surface)] hover:bg-[var(--surface-hover)] px-2 py-1 rounded border border-[var(--border-color)]"
                                >
                                  <Edit2 className="w-3 h-3" /> Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteStep(step.id)}
                                  className="shrink-0 text-xs text-red-500/70 hover:text-red-500 transition-all flex items-center gap-1.5 bg-[var(--surface)] hover:bg-red-500/5 px-2 py-1 rounded border border-[var(--border-color)]"
                                >
                                  <Trash2 className="w-3 h-3" /> Delete
                                </button>
                              </div>
                            )}
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
              <div className="flex-1 min-w-0 space-y-6">
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-[var(--fg)] opacity-90">Description</h3>
                    {!isEditingInfo && (
                      <div className="flex items-center gap-1 bg-[var(--surface-hover)] p-0.5 rounded-lg border border-[var(--border-color)]">
                        <button 
                          onClick={() => setDescFontSizeLevel(prev => Math.max(prev - 1, 0))}
                          className={`p-1 rounded-md transition-colors ${descFontSizeLevel === 0 ? 'text-[var(--fg-subtle)] opacity-30 cursor-not-allowed' : 'text-[var(--fg-muted)] hover:text-violet-500 hover:bg-violet-500/10'}`}
                          title="Decrease Font Size"
                          disabled={descFontSizeLevel === 0}
                        >
                          <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => setDescFontSizeLevel(prev => Math.min(prev + 1, 4))}
                          className={`p-1 rounded-md transition-colors ${descFontSizeLevel === 4 ? 'text-[var(--fg-subtle)] opacity-30 cursor-not-allowed' : 'text-[var(--fg-muted)] hover:text-violet-500 hover:bg-violet-500/10'}`}
                          title="Increase Font Size"
                          disabled={descFontSizeLevel === 4}
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        {descFontSizeLevel > 0 && (
                          <button 
                            onClick={() => setDescFontSizeLevel(0)}
                            className="p-1 rounded-md text-[var(--fg-muted)] hover:text-red-400 hover:bg-red-400/10 transition-colors ml-0.5 border-l border-[var(--border-color)] pl-1.5"
                            title="Reset Font Size"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div className="w-px h-3 bg-[var(--border-color)] mx-0.5" />
                        <button 
                          onClick={() => setLocalThemeOverride(prev => (prev || resolvedGlobalTheme) === 'dark' ? 'light' : 'dark')}
                          className="p-1 rounded-md text-[var(--fg-muted)] hover:text-violet-500 hover:bg-violet-500/10 transition-colors"
                          title={`Switch to ${effectiveTheme === 'dark' ? 'Light' : 'Dark'} Mode (Temporary)`}
                        >
                          {effectiveTheme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                  </div>
                  {!isEditingInfo && (
                    <button onClick={() => { setEditFormData(job); setIsEditingInfo(true); }} className="text-violet-500 flex items-center gap-1.5 text-sm hover:text-violet-400 transition-colors">
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
                    <div className={`prose ${effectiveTheme === 'dark' ? 'prose-invert' : ''} ${
                      descFontSizeLevel === 0 ? 'prose-sm' : 
                      descFontSizeLevel === 1 ? 'prose-base' : 
                      descFontSizeLevel === 2 ? 'prose-lg' : 
                      descFontSizeLevel === 3 ? 'prose-xl' : 
                      'prose-2xl'
                    } max-w-none break-words text-[var(--fg-muted)] prose-headings:text-[var(--fg)] prose-strong:text-[var(--fg)] prose-li:text-[var(--fg-muted)] transition-all duration-200`}>
                      <ReactMarkdown>{job.description}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-[var(--fg-subtle)] italic text-sm"><FileText className="inline w-4 h-4 mr-1" /> No description imported.</p>
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
                        <input type="file" accept=".pdf,.docx,.html,.htm,.md,.txt" className="hidden" onChange={handleAttachPdf} />
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
                        <div className={`prose ${effectiveTheme === 'dark' ? 'prose-invert' : ''} prose-sm max-w-none break-words text-[var(--fg-muted)]`}>
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
                <div className="flex items-center gap-2">
                  <StickyNote className="w-5 h-5 text-violet-400" />
                  <h3 className="text-lg font-bold text-[var(--fg)] tracking-tight">Application Notes</h3>
                  <AutoSaveIndicator status={saveStatus} error={saveError} />
                </div>

                {isEditingInfo ? (
                  <div className="space-y-4 bg-[var(--input-bg)] p-4 rounded-xl border border-violet-500/30">
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
                      <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.role || ''} onChange={e => handleEditChange('role', e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Role Type *</label>
                      <select
                        required
                        className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 outline-none cursor-pointer"
                        value={editFormData.employment_type || 'FTE'}
                        onChange={e => handleEditChange('employment_type', e.target.value)}
                      >
                        <option value="FTE">Full-time (FTE)</option>
                        <option value="Contractor">Contractor</option>
                        <option value="Consultant">Consultant</option>
                      </select>
                    </div>
                    {editFormData.employment_type === 'Contractor' && (
                      <div className="flex flex-col gap-1 animate-fade-in">
                        <label className="text-xs text-[var(--fg-muted)]">Agency Name *</label>
                        <input 
                          required
                          className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" 
                          value={editFormData.agency || ''} 
                          onChange={e => handleEditChange('agency', e.target.value)} 
                          placeholder="e.g. Robert Half..." 
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)] flex items-center gap-1.5"><CircleDollarSign className="w-3 h-3 text-green-500/70" /> Salary Range</label>
                      <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 shadow-sm shadow-green-500/5" value={editFormData.salary_range || ''} onChange={e => handleEditChange('salary_range', e.target.value)} placeholder="e.g. $120k - $150k" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Current Status</label>
                      <select
                        className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 outline-none cursor-pointer"
                        value={editFormData.status || 'Wishlist'}
                        onChange={e => handleEditChange('status', e.target.value)}
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
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)] flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Application URL</label>
                      <input type="url" className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.url || ''} onChange={e => handleEditChange('url', e.target.value)} placeholder="https://..." />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Company Job ID</label>
                      <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.company_job_id || ''} onChange={e => handleEditChange('company_job_id', e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Location</label>
                      <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.location || ''} onChange={e => handleEditChange('location', e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Job Posted Date</label>
                      <input type="date" className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 style-date" value={editFormData.job_posted_date ? editFormData.job_posted_date.substring(0, 10) : ''} onChange={e => handleEditChange('job_posted_date', e.target.value || '')} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[var(--fg-subtle)]">Deadline</label>
                      <input type="date" className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 style-date" value={editFormData.application_deadline ? editFormData.application_deadline.substring(0, 10) : ''} onChange={e => handleEditChange('application_deadline', e.target.value || '')} />
                    </div>

                    <div className="space-y-3 pt-2 border-t border-violet-500/10">
                      <label className="text-xs text-violet-500 font-medium">Record Settings</label>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">Actually Applied Date</label>
                        <input type="date" className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 style-date" value={editFormData.applied_date ? editFormData.applied_date.substring(0, 10) : ''} onChange={e => handleEditChange('applied_date', e.target.value)} />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">Job Closed Date</label>
                        <input type="date" className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 style-date" value={editFormData.closed_date ? editFormData.closed_date.substring(0, 10) : ''} onChange={e => handleEditChange('closed_date', e.target.value)} />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">Decision Made Date</label>
                        <input type="date" className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 style-date" value={editFormData.decision_date ? editFormData.decision_date.substring(0, 10) : ''} onChange={e => handleEditChange('decision_date', e.target.value)} />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">System Record Created</label>
                        <input type="date" className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500 style-date" value={editFormData.created_at ? editFormData.created_at.substring(0, 10) : ''} onChange={e => handleEditChange('created_at', e.target.value)} />
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 pt-4 border-t border-[var(--border-color)]">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-[var(--fg-muted)]">Hiring Manager Name</label>
                        <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.hiring_manager_name || ''} onChange={e => handleEditChange('hiring_manager_name', e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-[var(--fg-muted)]">Hiring Manager Email</label>
                        <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" type="text" value={editFormData.hiring_manager_email || ''} onChange={e => handleEditChange('hiring_manager_email', e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-[var(--fg-muted)]">HR / Recruiter Email</label>
                        <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.hr_email || ''} onChange={e => handleEditChange('hr_email', e.target.value)} placeholder="Name <email@address.com>" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-[var(--fg-muted)]">Headhunter Name</label>
                        <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" value={editFormData.headhunter_name || ''} onChange={e => handleEditChange('headhunter_name', e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-[var(--fg-muted)]">Headhunter Email</label>
                        <input className="bg-[var(--bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-sm text-[var(--fg)] focus:outline-none focus:border-violet-500" type="text" value={editFormData.headhunter_email || ''} onChange={e => handleEditChange('headhunter_email', e.target.value)} placeholder="Name <email@address.com>" />
                      </div>
                    </div>

                    <button onClick={handleSaveInfo} className="w-full mt-4 bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-4 py-2 font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-violet-500/20">
                      <Save className="w-4 h-4" /> Save Details
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
                      <span className="text-[var(--fg-subtle)] block mb-1">Role Type</span>
                      <span className="text-[var(--fg-muted)]">{job.employment_type || 'FTE'}</span>
                    </div>

                    {job.employment_type === 'Contractor' && (
                      <div>
                        <span className="text-[var(--fg-subtle)] block mb-1">Agency</span>
                        <span className="text-[var(--fg-muted)]">{job.agency || '-'}</span>
                      </div>
                    )}

                    {job.company_job_id && (
                      <div>
                        <span className="text-[var(--fg-subtle)] block mb-1">Company Job ID</span>
                        <span className="text-[var(--fg-muted)] font-mono">{job.company_job_id}</span>
                      </div>
                    )}

                    {(job.hiring_manager_name || job.hiring_manager_email) && (
                      <div>
                        <span className="text-[var(--fg-subtle)] block mb-1">Hiring Manager</span>
                        {(() => {
                          const parsed = parseContact(job.hiring_manager_email || null);
                          const displayName = job.hiring_manager_name || parsed.name || 'Hiring Manager';
                          const displayEmail = parsed.email || job.hiring_manager_email;
                          
                          return (
                            <div className="glass p-3 rounded-lg flex flex-col gap-1">
                              <span className="text-[var(--fg)] font-medium flex items-center gap-2">
                                <User className="w-3.5 h-3.5" /> {displayName}
                              </span>
                              {displayEmail && (
                                <a href={`mailto:${displayEmail}`} className="text-violet-500 hover:underline flex items-center gap-2">
                                  <Mail className="w-3.5 h-3.5" /> Mail
                                </a>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {job.hr_email && (
                      <div>
                        <span className="text-[var(--fg-subtle)] block mb-1">HR / Recruiter</span>
                        {(() => {
                          const parsed = parseContact(job.hr_email);
                          const displayName = parsed.name || 'HR / Recruiter';
                          const displayEmail = parsed.email || job.hr_email;

                          return (
                            <div className="glass p-3 rounded-lg flex flex-col gap-1">
                              <span className="text-[var(--fg)] font-medium flex items-center gap-2">
                                <User className="w-3.5 h-3.5" /> {displayName}
                              </span>
                              <a href={`mailto:${displayEmail}`} className="text-violet-500 hover:underline flex items-center gap-2">
                                <Mail className="w-3.5 h-3.5" /> Mail
                              </a>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {(job.headhunter_name || job.headhunter_email) && (
                      <div>
                        <span className="text-[var(--fg-subtle)] block mb-1">Headhunter</span>
                        {(() => {
                          const parsed = parseContact(job.headhunter_email || null);
                          const displayName = job.headhunter_name || parsed.name || 'Headhunter';
                          const displayEmail = parsed.email || job.headhunter_email;

                          return (
                            <div className="glass p-3 rounded-lg flex flex-col gap-1">
                              <span className="text-[var(--fg)] font-medium flex items-center gap-2">
                                <User className="w-3.5 h-3.5" /> {displayName}
                              </span>
                              {displayEmail && (
                                <a href={`mailto:${displayEmail}`} className="text-violet-500 hover:underline flex items-center gap-2">
                                  <Mail className="w-3.5 h-3.5" /> Mail
                                </a>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--border-color)]">
                      <div>
                        <span className="text-[var(--fg-subtle)] block text-xs mb-1">Added to System</span>
                        <span className="text-[var(--fg-muted)]">{job.created_at ? new Date(job.created_at).toLocaleDateString() : '-'}</span>
                      </div>
                      <div>
                        <span className="text-[var(--fg-subtle)] block text-xs mb-1">Actually Applied</span>
                        <span className="text-[var(--fg-muted)] font-medium text-violet-400">{job.applied_date ? new Date(job.applied_date).toLocaleDateString('en-US', { timeZone: 'UTC' }) : 'Not Applied'}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      {job.job_posted_date && (
                        <div>
                          <span className="text-[var(--fg-subtle)] block text-xs mb-1">Posted Date</span>
                          <span className="text-[var(--fg-muted)]">{new Date(job.job_posted_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</span>
                        </div>
                      )}
                      {job.application_deadline && (
                        <div>
                          <span className="text-[var(--fg-subtle)] block text-xs mb-1">Deadline</span>
                          <span className="text-[var(--fg-muted)]">{new Date(job.application_deadline).toLocaleDateString('en-US', { timeZone: 'UTC' })}</span>
                        </div>
                      )}
                    </div>
                    {job.salary_range && job.salary_range !== 'Not specified' && (
                      <div className="pt-2 border-t border-[var(--border-color)]">
                        <span className="text-[var(--fg-subtle)] block text-xs mb-1 flex items-center gap-1.5"><CircleDollarSign className="w-3.5 h-3.5 text-green-500/70" /> Salary Range</span>
                        <span className="text-[var(--fg-muted)] font-medium">{job.salary_range}</span>
                      </div>
                    )}
                    {['Offered', 'Rejected', 'Discontinued'].includes(job.status) && job.decision_date && (
                      <div className="pt-2">
                        <span className="text-[var(--fg-subtle)] block text-xs mb-1">Decision Date</span>
                        <span className="text-[var(--fg-muted)] font-medium text-amber-400/80">{new Date(job.decision_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</span>
                      </div>
                    )}
                    {job.status === 'Closed' && job.closed_date && (
                      <div className="pt-2">
                        <span className="text-[var(--fg-subtle)] block text-xs mb-1">Job Closed Date</span>
                        <span className="text-[var(--fg-muted)] font-medium text-red-400/80">{new Date(job.closed_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</span>
                      </div>
                    )}

                    <div className="mt-auto pt-8 pb-4 flex flex-col gap-2">
                      <button
                        onClick={() => updateJob(job.id!, { is_archived: !job.is_archived }).then(() => onJobUpdated())}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 border border-violet-500/20 hover:border-violet-500/40 transition-all text-xs font-medium cursor-pointer"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        {job.is_archived ? "Restore Application" : "Archive Application"}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-red-500 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/40 transition-all text-xs font-medium cursor-pointer"
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

          {activeTab === 'resume' && (
            <div className="flex-grow flex flex-col h-full overflow-hidden bg-[var(--input-bg)]">
              {/* Secondary sub-tabs (pills) if there are multiple resumes */}
              {resumes.length > 1 && (
                <div className="flex items-center gap-2 p-3 border-b border-[var(--border-color)] bg-[var(--surface)] overflow-x-auto shrink-0 custom-scrollbar">
                  <span className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider px-2">Versions:</span>
                  {resumes.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedResumeId(doc.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all truncate max-w-[200px] cursor-pointer ${
                        selectedResumeId === doc.id
                          ? 'bg-violet-600/10 border-violet-500 text-violet-500 font-semibold'
                          : 'border-[var(--border-color)] text-[var(--fg-muted)] hover:bg-[var(--surface-hover)]'
                      }`}
                      title={doc.title}
                    >
                      {doc.title}
                    </button>
                  ))}
                </div>
              )}

              {/* Document Display Area */}
              <div className="flex-1 min-h-0 relative bg-[var(--input-bg)]">
                {(() => {
                  const activeResume = resumes.find(r => r.id === selectedResumeId);
                  if (!activeResume) {
                    return (
                      <div className="flex items-center justify-center h-full text-[var(--fg-subtle)]">
                        No active resume selected.
                      </div>
                    );
                  }
                  return (
                    <DocumentViewer
                      fileUrl={activeResume.file_path}
                      title={activeResume.title}
                      theme={effectiveTheme}
                    />
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={terminalStatusConfirm.isOpen}
        title="Resume Application Progress?"
        message={
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--fg-muted)]">
                This application is currently in a terminal stage (<span className="text-violet-400 font-bold">{job.status}</span>), but you've modified the interview steps.
              </p>
            </div>
            <p className="text-sm">Would you like to keep it as <span className="font-bold">{job.status}</span> or move it back to <span className="text-violet-400 font-bold">{terminalStatusConfirm.nextStatus}</span>?</p>
          </div>
        }
        onConfirm={terminalStatusConfirm.onConfirm}
        onCancel={() => setTerminalStatusConfirm(prev => ({ ...prev, isOpen: false }))}
        confirmLabel={`Move to ${terminalStatusConfirm.nextStatus}`}
        cancelLabel={`Stay ${job.status}`}
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
        theme={effectiveTheme}
      />

      <ConfirmDialog
        isOpen={alertDialog.isOpen}
        title={alertDialog.title}
        message={alertDialog.message}
        onConfirm={() => setAlertDialog(prev => ({ ...prev, isOpen: false }))}
        onCancel={() => setAlertDialog(prev => ({ ...prev, isOpen: false }))}
        confirmLabel="OK"
        variant={alertDialog.variant || 'default'}
        hideCancel={true}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        confirmLabel="Confirm"
        variant={confirmDialog.variant || 'default'}
      />

      <ConfirmDialog
        isOpen={quickConfirmState.isOpen}
        title={`Move to ${quickConfirmState.nextStatus}`}
        message={`Are you sure you want to advance "${job.company} — ${job.role}" to ${quickConfirmState.nextStatus}?`}
        onConfirm={handleQuickConfirm}
        onCancel={() => setQuickConfirmState({ isOpen: false, nextStatus: '', variant: 'default' })}
        confirmLabel={quickConfirmState.nextStatus === 'Interviewing' ? 'Add Interview & Move to Interviewing' : `Move to ${quickConfirmState.nextStatus}`}
        variant={quickConfirmState.variant}
        showTextInput={quickConfirmState.nextStatus === 'Interviewing'}
        textLabel="Interview Step Name (e.g. Phone Screen)"
        initialText=""
        textOptions={quickStepTypes}
        showDateInput={['Applied', 'Interviewing', 'Offered', 'Rejected', 'Closed', 'Discontinued'].includes(quickConfirmState.nextStatus)}
        dateLabel={quickConfirmState.nextStatus === 'Applied' ? 'Actually applied date' : quickConfirmState.nextStatus === 'Offered' ? 'Offer received date' : quickConfirmState.nextStatus === 'Interviewing' ? 'Interview Date (Optional)' : 'Status change date'}
        showFileUpload={quickConfirmState.nextStatus === 'Applied'}
        fileUploadLabel="Attach Resume / CV (Optional)"
        accept=".pdf,.md"
      />

      <ProcessingOverlay
        isOpen={isUploadingDoc}
        tasks={uploadTasks}
        title="Processing Document"
        error={uploadError}
        onClose={() => setIsUploadingDoc(false)}
      />
      </div>
    </Portal>
  );
};
