"use client";

import React, { useState } from 'react';
import { Briefcase, Building2, CheckCircle2, Clock, XCircle, Globe, ChevronRight, ThumbsUp, ThumbsDown, Lock, Ban, Star } from 'lucide-react';
import { Job, getStepTypes, StepType } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';

interface JobCardProps {
  job: Job;
  onUpdateStatus: (id: number, status: string, date?: string, file?: File | null, docType?: string) => void;
  onClick?: () => void;
  columnKey?: string;
  onAddInterviewStep?: (id: number, stepName: string, date?: string) => void;
  onToggleStar?: (job: Job) => void;
}

const statusColors: Record<string, string> = {
  Wishlist: 'text-gray-400 bg-gray-400/10',
  Applied: 'text-blue-400 bg-blue-400/10',
  Interviewing: 'text-yellow-400 bg-yellow-400/10',
  Offered: 'text-emerald-400 bg-emerald-400/10',
  Rejected: 'text-red-400 bg-red-400/10',
  Closed: 'text-orange-400 bg-orange-400/10',
  Discontinued: 'text-slate-400 bg-slate-400/10',
};

const statusIcons: Record<string, React.ReactNode> = {
  Wishlist: <Clock className="w-3.5 h-3.5" />,
  Applied: <Briefcase className="w-3.5 h-3.5" />,
  Interviewing: <ChevronRight className="w-3.5 h-3.5" />,
  Offered: <CheckCircle2 className="w-3.5 h-3.5" />,
  Rejected: <XCircle className="w-3.5 h-3.5" />,
  Closed: <Lock className="w-3.5 h-3.5" />,
  Discontinued: <Ban className="w-3.5 h-3.5" />,
};

// Card border accents for Decision column
const decisionBorders: Record<string, string> = {
  Offered: 'border-emerald-500/30 hover:border-emerald-500/50',
  Rejected: 'border-red-500/30 hover:border-red-500/40',
  Discontinued: 'border-slate-500/30 hover:border-slate-500/40',
};

export const JobCard: React.FC<JobCardProps> = ({ job, onUpdateStatus, onClick, columnKey, onAddInterviewStep, onToggleStar }) => {
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    nextStatus: string;
    variant: 'default' | 'danger' | 'success';
  }>({ isOpen: false, nextStatus: '', variant: 'default' });
  const [stepTypes, setStepTypes] = useState<string[]>([]);

  const allStatuses = ['Wishlist', 'Applied', 'Interviewing', 'Offered', 'Rejected'];
  const isTerminal = ['Offered', 'Rejected', 'Closed', 'Discontinued'].includes(job.status);
  const isInterviewing = job.status === 'Interviewing';

  const openConfirm = (nextStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (nextStatus === 'Interviewing') {
      getStepTypes().then(types => setStepTypes(types.map((t: StepType) => t.name))).catch(console.error);
    }
    setConfirmState({
      isOpen: true,
      nextStatus,
      variant: nextStatus === 'Rejected' || nextStatus === 'Discontinued' ? 'danger' : nextStatus === 'Offered' ? 'success' : 'default',
    });
  };

  const handleConfirm = (date?: string, file?: File | null, text?: string) => {
    if (confirmState.nextStatus === 'Interviewing' && onAddInterviewStep) {
      onAddInterviewStep(job.id!, text || 'Initial Interview', date);
    } else {
      onUpdateStatus(
        job.id!, 
        confirmState.nextStatus, 
        date,
        file, 
        confirmState.nextStatus === 'Applied' ? 'resume' : undefined
      );
    }
    setConfirmState({ isOpen: false, nextStatus: '', variant: 'default' });
  };

  const handleAdvance = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIndex = allStatuses.indexOf(job.status);
    if (currentIndex >= 0 && currentIndex < allStatuses.length - 1) {
      const nextStatus = allStatuses[currentIndex + 1];
      if (nextStatus === 'Interviewing') {
        getStepTypes().then(types => setStepTypes(types.map((t: StepType) => t.name))).catch(console.error);
      }
      setConfirmState({
        isOpen: true,
        nextStatus,
        variant: 'default',
      });
    }
  };

  // Decide card border for Decision column
  const borderClass = columnKey === 'Decision'
    ? decisionBorders[job.status] || 'hover:border-violet-500/30'
    : 'hover:border-violet-500/30';

  const hasActions = isInterviewing || !isTerminal || job.status === 'Applied' || job.status === 'Wishlist';

  return (
    <>
      <div 
        className={`relative glass p-2.5 rounded-xl flex flex-col gap-2 group cursor-pointer transition-all hover:-translate-y-0.5 hover:z-30 ${borderClass}`}
        onClick={onClick}
      >
        <div className="flex justify-between items-start gap-2">
          <div className="flex flex-col min-w-0 flex-1">
            <div className="group/tooltip relative">
              <h3 className="text-sm font-semibold text-[var(--fg)] flex items-center gap-1.5 truncate">
                <Building2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="truncate">{job.company}</span>
              </h3>
              {/* Tooltip for company */}
              <div className="absolute left-0 top-full mt-1.5 opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-all duration-200 bg-black/90 backdrop-blur-md border border-white/20 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-2xl z-50 whitespace-normal break-words max-w-[280px]">
                {job.company}
              </div>
            </div>

            <div className="group/tooltip relative mt-0.5">
              <p className="text-[11px] text-[var(--fg-muted)] ml-5 truncate">{job.role}</p>
              {/* Tooltip for role */}
              <div className="absolute left-5 top-full opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-all duration-200 bg-black/90 backdrop-blur-md border border-white/20 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-2xl z-50 whitespace-normal break-words max-w-[280px]">
                {job.role}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            {onToggleStar && (
              <button 
                onClick={(e) => { e.stopPropagation(); onToggleStar(job); }}
                className={`p-1.5 rounded-full hover:bg-[var(--surface-hover)] transition-colors ${job.is_starred ? 'text-yellow-400' : 'text-[var(--fg-subtle)] hover:text-yellow-400/50'}`}
                title={job.is_starred ? "Unstar Job" : "Star Job"}
              >
                <Star className={`w-3.5 h-3.5 ${job.is_starred ? 'fill-current' : ''}`} />
              </button>
            )}
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-full hover:bg-[var(--surface-hover)] text-[var(--fg-subtle)] hover:text-[var(--fg)] transition-colors"
                title="View Job Posting"
              >
                <Globe className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-1 relative">
          <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap ${statusColors[job.status] || 'text-[var(--fg-subtle)] bg-[var(--surface-hover)]'}`}>
            {statusIcons[job.status]}
            {job.status}
          </span>

          {hasActions && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
              {isInterviewing ? (
                <>
                  <button onClick={(e) => openConfirm('Offered', e)} className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 p-1.5 rounded-md transition-colors" title="Mark as Offered">
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => openConfirm('Rejected', e)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded-md transition-colors" title="Mark as Rejected">
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : !isTerminal ? (
                <>
                  <button onClick={handleAdvance} className="text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 p-1.5 rounded-md transition-colors" title="Advance to Next Stage">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  {job.status === 'Applied' && (
                    <button onClick={(e) => openConfirm('Rejected', e)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded-md transition-colors" title="Mark as Rejected">
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              ) : null}

              {(job.status === 'Applied' || job.status === 'Interviewing') && (
                <button onClick={(e) => openConfirm('Discontinued', e)} className="text-slate-400/80 hover:text-slate-300 hover:bg-slate-500/10 p-1.5 rounded-md transition-colors" title="Mark as Discontinued">
                  <Ban className="w-3.5 h-3.5" />
                </button>
              )}

              {job.status === 'Wishlist' && (
                <button onClick={(e) => openConfirm('Closed', e)} className="text-orange-400/80 hover:text-orange-300 hover:bg-orange-500/10 p-1.5 rounded-md transition-colors" title="Mark as Closed">
                  <Lock className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={`Move to ${confirmState.nextStatus}`}
        message={`Are you sure you want to advance "${job.company} — ${job.role}" to ${confirmState.nextStatus}?`}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmState({ isOpen: false, nextStatus: '', variant: 'default' })}
        confirmLabel={confirmState.nextStatus === 'Interviewing' ? 'Add Interview & Move to Interviewing' : `Move to ${confirmState.nextStatus}`}
        variant={confirmState.variant}
        showTextInput={confirmState.nextStatus === 'Interviewing'}
        textLabel="Interview Step Name (e.g. Phone Screen)"
        initialText=""
        textOptions={stepTypes}
        showDateInput={['Applied', 'Interviewing', 'Offered', 'Rejected', 'Closed', 'Discontinued'].includes(confirmState.nextStatus)}
        dateLabel={confirmState.nextStatus === 'Applied' ? 'Actually applied date' : confirmState.nextStatus === 'Offered' ? 'Offer received date' : confirmState.nextStatus === 'Interviewing' ? 'Interview Date (Optional)' : 'Status change date'}
        showFileUpload={confirmState.nextStatus === 'Applied'}
        fileUploadLabel="Attach Resume / CV (Optional)"
        accept=".pdf,.md"
      />
    </>
  );
};
