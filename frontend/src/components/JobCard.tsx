"use client";

import React, { useState } from 'react';
import { Briefcase, Building2, CheckCircle2, Clock, XCircle, Globe, ChevronRight, ThumbsUp, ThumbsDown, Lock, Ban } from 'lucide-react';
import { Job } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';

interface JobCardProps {
  job: Job;
  onUpdateStatus: (id: number, status: string, file?: File | null, docType?: string) => void;
  onClick?: () => void;
  columnKey?: string;
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

export const JobCard: React.FC<JobCardProps> = ({ job, onUpdateStatus, onClick, columnKey }) => {
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    nextStatus: string;
    variant: 'default' | 'danger' | 'success';
  }>({ isOpen: false, nextStatus: '', variant: 'default' });

  const allStatuses = ['Wishlist', 'Applied', 'Interviewing', 'Offered', 'Rejected'];
  const isTerminal = ['Offered', 'Rejected', 'Closed', 'Discontinued'].includes(job.status);
  const isInterviewing = job.status === 'Interviewing';

  const openConfirm = (nextStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmState({
      isOpen: true,
      nextStatus,
      variant: nextStatus === 'Rejected' || nextStatus === 'Discontinued' ? 'danger' : nextStatus === 'Offered' ? 'success' : 'default',
    });
  };

  const handleConfirm = (date?: string, file?: File | null) => {
    // We pass docType="resume" specifically when transitioning to 'Applied'
    onUpdateStatus(
      job.id!, 
      confirmState.nextStatus, 
      file, 
      confirmState.nextStatus === 'Applied' ? 'resume' : undefined
    );
    setConfirmState({ isOpen: false, nextStatus: '', variant: 'default' });
  };

  const handleAdvance = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIndex = allStatuses.indexOf(job.status);
    if (currentIndex >= 0 && currentIndex < allStatuses.length - 1) {
      const nextStatus = allStatuses[currentIndex + 1];
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

  return (
    <>
      <div 
        className={`glass p-3.5 rounded-xl flex flex-col gap-2.5 group cursor-pointer transition-all hover:-translate-y-0.5 ${borderClass}`}
        onClick={onClick}
      >
        <div className="flex justify-between items-start gap-2">
          <div className="flex flex-col min-w-0">
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5 truncate">
              <Building2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="truncate">{job.company}</span>
            </h3>
            <p className="text-xs text-gray-400 ml-5 truncate">{job.role}</p>
          </div>
          
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded-full hover:bg-white/10 text-gray-500 hover:text-white transition-colors shrink-0"
              title="View Job Posting"
            >
              <Globe className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap mt-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 shrink-0 ${statusColors[job.status] || 'text-gray-400 bg-white/5'}`}>
            {statusIcons[job.status]}
            {job.status}
          </span>

          <div className="flex items-center gap-1.5 flex-wrap justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ml-auto">
            {isInterviewing ? (
              <>
                <button
                  onClick={(e) => openConfirm('Offered', e)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium py-0.5 px-1.5 rounded hover:bg-emerald-500/10 transition-colors flex items-center gap-1"
                  title="Mark as Offered"
                >
                  <ThumbsUp className="w-3 h-3" />
                  <span>Offered</span>
                </button>
                <button
                  onClick={(e) => openConfirm('Rejected', e)}
                  className="text-xs text-red-400 hover:text-red-300 font-medium py-0.5 px-1.5 rounded hover:bg-red-500/10 transition-colors flex items-center gap-1"
                  title="Mark as Rejected"
                >
                  <ThumbsDown className="w-3 h-3" />
                  <span>Rejected</span>
                </button>
              </>
            ) : !isTerminal ? (
              <button
                onClick={handleAdvance}
                className="text-xs text-violet-400 hover:text-violet-300 font-medium py-0.5 px-1.5 rounded hover:bg-violet-500/10 transition-colors"
                title="Advance to Next Stage"
              >
                Advance →
              </button>
            ) : null}
            
            {(job.status === 'Applied' || job.status === 'Interviewing') && (
              <button
                onClick={(e) => openConfirm('Discontinued', e)}
                className="text-xs text-slate-400/80 hover:text-slate-300 font-medium py-0.5 px-1.5 rounded hover:bg-slate-500/10 transition-colors flex items-center gap-1"
                title="Mark as Discontinued"
              >
                <Ban className="w-3 h-3" />
                <span>Discontinued</span>
              </button>
            )}

            {job.status === 'Wishlist' && (
              <button
                onClick={(e) => openConfirm('Closed', e)}
                className="text-xs text-orange-400/80 hover:text-orange-300 font-medium py-0.5 px-1.5 rounded hover:bg-orange-500/10 transition-colors flex items-center gap-1"
                title="Mark as Closed"
              >
                <Lock className="w-3 h-3" />
                <span>Closed</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={`Move to ${confirmState.nextStatus}`}
        message={`Are you sure you want to advance "${job.company} — ${job.role}" to ${confirmState.nextStatus}?`}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmState({ isOpen: false, nextStatus: '', variant: 'default' })}
        confirmLabel={`Move to ${confirmState.nextStatus}`}
        variant={confirmState.variant}
        showDateInput={['Offered', 'Rejected', 'Closed', 'Discontinued'].includes(confirmState.nextStatus)}
        dateLabel={confirmState.nextStatus === 'Offered' ? 'Offer received date' : 'Status change date'}
        showFileUpload={confirmState.nextStatus === 'Applied'}
        fileUploadLabel="Attach Resume / CV"
        accept=".pdf,.md"
      />
    </>
  );
};
