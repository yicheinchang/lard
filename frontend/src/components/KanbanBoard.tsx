import React from 'react';
import { Job } from '../lib/api';
import { JobCard } from './JobCard';

interface KanbanBoardProps {
  jobs: Job[];
  onUpdateStatus: (id: number, status: string, file?: File | null, docType?: string) => void;
  onJobClick: (job: Job) => void;
}

// Visual columns — "Decision" merges Offered + Rejected
const COLUMNS = [
  { key: 'Wishlist', label: 'Wishlist', statuses: ['Wishlist'] },
  { key: 'Applied', label: 'Applied', statuses: ['Applied'] },
  { key: 'Interviewing', label: 'Interviewing', statuses: ['Interviewing'] },
  { key: 'Decision', label: 'Decision', statuses: ['Offered', 'Rejected'] },
];

const columnAccents: Record<string, string> = {
  Wishlist: 'bg-gray-500/20 border-gray-500/10',
  Applied: 'bg-blue-500/10 border-blue-500/10',
  Interviewing: 'bg-amber-500/10 border-amber-500/10',
  Decision: 'bg-violet-500/10 border-violet-500/10',
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ jobs, onUpdateStatus, onJobClick }) => {
  return (
    <div className="kanban-grid gap-4 pb-8 h-full">
      {COLUMNS.map((column) => {
        const columnJobs = jobs.filter((job) => column.statuses.includes(job.status));

        return (
          <div key={column.key} className="flex flex-col gap-3 min-w-0">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider">{column.label}</h2>
              <span className="bg-white/10 text-white/60 text-xs px-2 py-0.5 rounded-full">{columnJobs.length}</span>
            </div>
            
            <div className={`flex flex-col gap-3 min-h-[400px] p-2.5 rounded-2xl border ${columnAccents[column.key] || 'bg-black/20 border-white/5'}`}>
              {columnJobs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-white/20 italic py-10">
                  No jobs here
                </div>
              ) : (
                columnJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onUpdateStatus={onUpdateStatus}
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
