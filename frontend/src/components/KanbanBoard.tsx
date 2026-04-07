import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Job } from '../lib/api';
import { JobCard } from './JobCard';

interface KanbanBoardProps {
  jobs: Job[];
  onUpdateStatus: (id: number, status: string, date?: string, file?: File | null, docType?: string) => void;
  onJobClick: (job: Job) => void;
  onAddInterviewStep?: (id: number, stepName: string, date?: string) => void;
  onToggleStar?: (job: Job) => void;
}

// Visual columns — "Decision" merges Offered + Rejected + Discontinued
const COLUMNS = [
  { key: 'Wishlist', label: 'Wishlist', statuses: ['Wishlist', 'Closed'] },
  { key: 'Applied', label: 'Applied', statuses: ['Applied'] },
  { key: 'Interviewing', label: 'Interviewing', statuses: ['Interviewing'] },
  { key: 'Decision', label: 'Decision', statuses: ['Offered', 'Rejected', 'Discontinued'] },
];

const columnAccents: Record<string, string> = {
  Wishlist: 'bg-gray-500/20 border-gray-500/10',
  Applied: 'bg-blue-500/10 border-blue-500/10',
  Interviewing: 'bg-amber-500/10 border-amber-500/10',
  Decision: 'bg-violet-500/10 border-violet-500/10',
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ jobs, onUpdateStatus, onJobClick, onAddInterviewStep, onToggleStar }) => {
  const [showClosed, setShowClosed] = useState(false);

  return (
    <div className="kanban-grid gap-4 pb-4 h-full min-h-0 overflow-x-auto custom-scrollbar">
      {COLUMNS.map((column) => {
        let columnJobs = jobs.filter((job) => column.statuses.includes(job.status));
        
        // Specifically filter 'Closed' in Wishlist based on toggle
        if (column.key === 'Wishlist' && !showClosed) {
          columnJobs = columnJobs.filter(job => job.status !== 'Closed');
        }

        return (
          <div key={column.key} className="flex flex-col gap-3 min-w-0 max-h-full">
            <div className="flex items-center justify-between px-2 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--fg)] opacity-80 uppercase tracking-wider">{column.label}</h2>
                {column.key === 'Wishlist' && (
                  <button 
                    onClick={() => setShowClosed(!showClosed)}
                    className={`p-1 rounded-md transition-colors ${showClosed ? 'text-violet-500 bg-violet-500/10' : 'text-[var(--fg-subtle)] hover:text-[var(--fg)]'}`}
                    title={showClosed ? "Hide Closed Jobs" : "Show Closed Jobs"}
                  >
                    {showClosed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              <span className="bg-[var(--surface-hover)] text-[var(--fg-subtle)] text-xs px-2 py-0.5 rounded-full font-medium">{columnJobs.length}</span>
            </div>
            
            <div className={`flex flex-col gap-2 p-2 pr-2 rounded-2xl border flex-1 min-h-0 overflow-y-auto custom-scrollbar ${columnAccents[column.key] || 'bg-[var(--surface)] border-[var(--border-color)]'}`}>
              {columnJobs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-[var(--fg-subtle)] opacity-40 italic py-10">
                  No jobs here
                </div>
              ) : (
                columnJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onUpdateStatus={onUpdateStatus}
                    onAddInterviewStep={onAddInterviewStep}
                    onToggleStar={onToggleStar}
                    onClick={() => onJobClick(job)}
                    columnKey={column.key}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
