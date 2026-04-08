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
  const [activeColumn, setActiveColumn] = useState('Interviewing');

  // Set initial active column based on priority if not already set
  React.useEffect(() => {
    if (jobs.length > 0) {
      const hasInterviewing = jobs.some(j => j.status === 'Interviewing');
      const hasApplied = jobs.some(j => j.status === 'Applied');
      const defaultCol = hasInterviewing ? 'Interviewing' : (hasApplied ? 'Applied' : 'Wishlist');
      setActiveColumn(defaultCol);
    }
  }, [jobs.length > 0]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mobile/Narrow Tab Bar - Only visible < 1024px (lg) */}
      <div className="lg:hidden shrink-0 flex items-center bg-[var(--surface-hover)] p-1.5 rounded-xl mb-4 border border-[var(--border-color)] gap-1">
        {COLUMNS.map((col) => {
          const count = jobs.filter(j => col.statuses.includes(j.status)).length;
          const isActive = activeColumn === col.key;
          return (
            <button
              key={col.key}
              onClick={() => setActiveColumn(col.key)}
              className={`flex-1 py-2.5 px-1 rounded-lg transition-all duration-300 flex flex-col items-center gap-0.5 relative ${
                isActive
                  ? 'bg-violet-500 text-white shadow-xl shadow-violet-500/20'
                  : 'text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-white/5'
              }`}
            >
              <span className="text-[10px] uppercase tracking-widest font-bold leading-none">{col.label}</span>
              <span className={`text-[10px] font-medium opacity-60 ${isActive ? 'text-white' : ''}`}>{count}</span>
              {isActive && (
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-violet-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      <div className="kanban-grid pb-2 h-full min-h-0 overflow-x-auto custom-scrollbar scroll-smooth">
        {COLUMNS.map((column) => {
          let columnJobs = jobs.filter((job) => column.statuses.includes(job.status));
          
          // Specifically filter 'Closed' in Wishlist based on toggle
          if (column.key === 'Wishlist' && !showClosed) {
            columnJobs = columnJobs.filter(job => job.status !== 'Closed');
          }

          // Responsive visibility: On small screens, only show the active tab
          const isHiddenOnMobile = activeColumn !== column.key;

          return (
            <div 
              key={column.key} 
              className={`flex flex-col gap-3 min-w-0 max-h-full transition-opacity duration-300 ${isHiddenOnMobile ? 'hidden lg:flex' : 'flex'}`}
            >
              <div className="flex items-center justify-between px-2 shrink-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[var(--fg)] opacity-90 uppercase tracking-widest">{column.label}</h2>
                  {column.key === 'Wishlist' && (
                    <button 
                      onClick={() => setShowClosed(!showClosed)}
                      className={`p-1.5 rounded-lg transition-colors ${showClosed ? 'text-violet-500 bg-violet-500/10' : 'text-[var(--fg-subtle)] hover:text-[var(--fg)] bg-[var(--surface-hover)]'}`}
                      title={showClosed ? "Hide Closed Jobs" : "Show Closed Jobs"}
                    >
                      {showClosed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
                <span className="bg-violet-500/10 text-violet-400 text-[11px] px-2.5 py-0.5 rounded-full font-bold border border-violet-500/10">{columnJobs.length}</span>
              </div>
              
              <div className={`flex flex-col gap-3 p-3 rounded-2xl border flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar ${columnAccents[column.key] || 'bg-[var(--surface)] border-[var(--border-color)]'}`}>
                {columnJobs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-sm text-[var(--fg-subtle)] opacity-40 italic py-12 gap-2">
                    <div className="w-8 h-8 rounded-full border border-current opacity-20 flex items-center justify-center not-italic">?</div>
                    No jobs in this stage
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
    </div>
  );
};

