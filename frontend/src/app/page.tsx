"use client";

import { useEffect, useState, useMemo } from 'react';
import { Plus, Briefcase, Search, X, ArrowDownAZ, ArrowUpAZ, ChevronDown } from 'lucide-react';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TableView } from '@/components/TableView';
import { AddJobModal } from '@/components/AddJobModal';
import { JobDetailView } from '@/components/JobDetailView';
import { SettingsPage } from '@/components/SettingsPage';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Job, getJobs, createJob, updateJob, uploadJobDocument, addInterviewStep } from '@/lib/api';
import { useView } from '@/lib/ViewContext';

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { activeView, requestAction } = useView();
  
  // Global Filter & Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>('last_updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  
  // Status transition state
  const [showAdvanceToApplied, setShowAdvanceToApplied] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<{id: number, status: string} | null>(null);

  const filteredAndSortedJobs = useMemo(() => {
    let result = jobs.filter(job => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          job.company?.toLowerCase().includes(q) ||
          job.role?.toLowerCase().includes(q) ||
          (job.location || '').toLowerCase().includes(q)
        );
      }
      return true;
    });

    result.sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';

      switch (sortKey) {
        case 'company': valA = (a.company || '').toLowerCase(); valB = (b.company || '').toLowerCase(); break;
        case 'role': valA = (a.role || '').toLowerCase(); valB = (b.role || '').toLowerCase(); break;
        case 'status': valA = a.status; valB = b.status; break;
        case 'location': valA = (a.location || '').toLowerCase(); valB = (b.location || '').toLowerCase(); break;
        case 'applied_date':
          valA = a.applied_date ? new Date(a.applied_date).getTime() : 0;
          valB = b.applied_date ? new Date(b.applied_date).getTime() : 0;
          break;
        case 'created_at':
          valA = a.created_at ? new Date(a.created_at).getTime() : 0;
          valB = b.created_at ? new Date(b.created_at).getTime() : 0;
          break;
        case 'last_updated':
        default:
          valA = a.last_updated ? new Date(a.last_updated).getTime() : 0;
          valB = b.last_updated ? new Date(b.last_updated).getTime() : 0;
          break;
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [jobs, searchQuery, sortKey, sortDir]);

  const fetchJobs = async () => {
    setIsLoading(true);
    try {
      const data = await getJobs();
      setJobs(data);
      if (selectedJob) {
        const updated = data.find((j: Job) => j.id === selectedJob.id);
        if (updated) setSelectedJob(updated);
      }
    } catch (error) {
      console.error('Failed to fetch jobs', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset overlays when switching views
  useEffect(() => {
    setSelectedJob(null);
    setIsModalOpen(false);
  }, [activeView]);

  const handleUpdateStatus = async (id: number, status: string, date?: string, file?: File | null, docType?: string) => {
    const currentJob = jobs.find(j => j.id === id);
    
    // special case: Wishlist -> Applied needs date prompt (from this component's local modal)
    if (currentJob?.status === 'Wishlist' && status === 'Applied' && !date) {
      setPendingStatusUpdate({ id, status });
      setShowAdvanceToApplied(true);
      return;
    }

    try {
      const updateData: any = { status };
      if (date) {
        updateData.applied_date = new Date(date).toISOString();
      }
      
      await updateJob(id, updateData);
      if (file && docType) {
        await uploadJobDocument(id, file, docType);
      }
      await fetchJobs();
    } catch (error) {
      console.error('Failed to update status or upload file', error);
    }
  };

  const handleAddInterviewStep = async (id: number, stepName: string, date?: string) => {
    try {
      await addInterviewStep(
        id, 
        stepName, 
        date ? new Date(date).toISOString() : undefined, 
        'Scheduled'
      );
      await fetchJobs();
    } catch (error) {
      console.error('Failed to add interview step', error);
    }
  };

  const confirmAdvanceToApplied = async (date?: string, file?: File | null) => {
    if (!pendingStatusUpdate) return;
    try {
      await updateJob(pendingStatusUpdate.id, { 
        status: pendingStatusUpdate.status,
        applied_date: date ? new Date(date).toISOString() : new Date().toISOString()
      });
      if (file) {
        await uploadJobDocument(pendingStatusUpdate.id, file, 'resume');
      }
      setShowAdvanceToApplied(false);
      setPendingStatusUpdate(null);
      await fetchJobs();
    } catch (error) {
      console.error('Failed to advance to applied', error);
    }
  };

  const handleAddJob = async (job: Partial<Job>) => {
    const created = await createJob(job);
    await fetchJobs();
    return created; // return so modal can attach documents to the new job
  };

  const handleJobClick = (job: Job | null) => {
    requestAction(() => {
      setSelectedJob(job);
    }, "You have unsaved changes in the current job details. If you switch now, these changes will be lost.");
  };

  const handleAddClick = () => {
    requestAction(() => {
      setIsModalOpen(true);
    }, "You have unsaved changes in the current job details. If you open the 'Add Application' form now, these changes will be lost.");
  };

  // If settings view, render settings page directly
  if (activeView === 'settings') {
    return <SettingsPage />;
  }

  return (
    <div className={`flex flex-col h-full w-full p-4 md:p-6 lg:p-8 pt-6 ${selectedJob ? 'md:pb-[40vh]' : ''} transition-all duration-300`}>
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>
            {activeView === 'kanban' ? 'Pipeline Dashboard' : 'All Applications'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>
            {activeView === 'kanban'
              ? 'Track your applications through the pipeline'
              : `${jobs.length} total applications`
            }
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          {/* Global Search Bar */}
          <div className="relative flex-1 min-w-[200px] xl:max-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border-color)] rounded-xl pl-9 pr-8 py-2 text-[var(--fg)] placeholder-[var(--fg-subtle)] focus:outline-none focus:border-violet-500 transition-colors text-sm shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[var(--fg)] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-2 bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border-color)] px-3 py-2 rounded-xl text-sm font-medium transition-all shadow-sm text-[var(--fg)]"
            >
              <span className="opacity-70">Sort:</span>
              <span className="capitalize">{sortKey.replace('_', ' ')}</span>
              <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-50" />
            </button>

            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 glass backdrop-blur-xl border border-[var(--border-color)] rounded-xl shadow-2xl py-1 z-50 flex flex-col">
                  {['last_updated', 'company', 'applied_date', 'created_at'].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        if (sortKey === opt) {
                          setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortKey(opt);
                          setSortDir('desc');
                        }
                        setShowSortMenu(false);
                      }}
                      className={`text-left px-4 py-2 text-sm hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-between ${sortKey === opt ? 'text-violet-400 font-medium' : 'text-[var(--fg)]'}`}
                    >
                      <span className="capitalize">{opt.replace('_', ' ')}</span>
                      {sortKey === opt && (
                         sortDir === 'asc' ? <ArrowUpAZ className="w-3.5 h-3.5" /> : <ArrowDownAZ className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button 
            onClick={handleAddClick}
            className="bg-[var(--fg)] hover:scale-105 active:scale-95 text-[var(--bg)] px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 shadow-lg text-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Application</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 relative">
        {isLoading && jobs.length === 0 ? (
          <div className="flex justify-center items-center h-64 text-violet-400/50">
            <Briefcase className="w-12 h-12 animate-pulse" />
          </div>
        ) : activeView === 'kanban' ? (
          <KanbanBoard jobs={filteredAndSortedJobs} onUpdateStatus={handleUpdateStatus} onJobClick={handleJobClick} onAddInterviewStep={handleAddInterviewStep} />
        ) : (
          <TableView 
            jobs={filteredAndSortedJobs} 
            onUpdateStatus={handleUpdateStatus} 
            onJobClick={handleJobClick} 
            globalSortKey={sortKey}
            globalSortDir={sortDir}
            onGlobalSortChange={(key) => {
              if (sortKey === key) {
                setSortDir(d => d === 'asc' ? 'desc' : 'asc');
              } else {
                setSortKey(key);
                setSortDir('asc');
              }
            }}
          />
        )}
      </div>

      <JobDetailView 
        job={selectedJob} 
        onClose={() => handleJobClick(null)}
        onJobUpdated={fetchJobs} 
      />

      <AddJobModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onAddJob={handleAddJob} 
      />

      <ConfirmDialog
        isOpen={showAdvanceToApplied}
        title="Specify Application Date"
        message="You are moving this job from Wishlist to Applied. When did you actually submit your application?"
        onConfirm={confirmAdvanceToApplied}
        onCancel={() => { setShowAdvanceToApplied(false); setPendingStatusUpdate(null); }}
        confirmLabel="Move to Applied"
        showDateInput={true}
        dateLabel="Application Date"
        showFileUpload={true}
        fileUploadLabel="Attach Resume / CV (Optional)"
        accept=".pdf,.md"
        variant="default"
      />
    </div>
  );
}
