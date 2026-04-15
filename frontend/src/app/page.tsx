"use client";

import { useEffect, useState, useMemo } from 'react';
import { Plus, Briefcase, Search, X, ArrowDownAZ, ArrowUpAZ, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TableView } from '@/components/TableView';
import { AddJobModal } from '@/components/AddJobModal';
import { JobDetailView } from '@/components/JobDetailView';
import { SettingsPage } from '@/components/SettingsPage';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FilterPopover, FilterCriteria } from '@/components/FilterPopover';
import { Job, getJobs, createJobStream, updateJobStream, uploadJobDocumentStream, addInterviewStep, updateJob } from '@/lib/api';
import { useView } from '@/lib/ViewContext';
import { ProcessingOverlay } from '@/components/ProcessingOverlay';

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
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  const initialFilterCriteria: FilterCriteria = {
    appliedDateStart: '',
    appliedDateEnd: '',
    closingSoonDays: 7,
    showOnlyClosingSoon: false,
    staleDays: 14,
    showOnlyStale: false,
    statuses: [],
    starStatus: 'all',
  };
  const [filterCriteria, setFilterCriteria] = useState<FilterCriteria>(initialFilterCriteria);

  const hasActiveFilters = useMemo(() => {
    return (
      filterCriteria.appliedDateStart !== '' ||
      filterCriteria.appliedDateEnd !== '' ||
      filterCriteria.showOnlyClosingSoon === true ||
      filterCriteria.showOnlyStale === true ||
      filterCriteria.statuses.length > 0 ||
      (filterCriteria.starStatus !== undefined && filterCriteria.starStatus !== 'all')
    );
  }, [filterCriteria]);

  
  // Status transition state
  const [showAdvanceToApplied, setShowAdvanceToApplied] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<{id: number, status: string} | null>(null);

  // Document upload state (for status transitions)
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadTasks, setUploadTasks] = useState([
    { id: 'upload', label: 'Uploading file...', status: 'waiting' as any },
    { id: 'extract', label: 'Extracting content...', status: 'waiting' as any },
    { id: 'vectorize', label: 'Generating embeddings...', status: 'waiting' as any },
    { id: 'finalize', label: 'Finalizing...', status: 'waiting' as any },
  ]);

  const filteredAndSortedJobs = useMemo(() => {
    let result = jobs.filter(job => {
      // 1. Text Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSearch = (
          job.company?.toLowerCase().includes(q) ||
          job.role?.toLowerCase().includes(q) ||
          (job.location || '').toLowerCase().includes(q)
        );
        if (!matchesSearch) return false;
      }

      // 2. Status Filter
      if (filterCriteria.statuses.length > 0) {
        if (!filterCriteria.statuses.includes(job.status)) return false;
      }

      // 3. Activity Date Range Filter
      if (filterCriteria.appliedDateStart || filterCriteria.appliedDateEnd) {
        const start = filterCriteria.appliedDateStart ? new Date(filterCriteria.appliedDateStart) : null;
        const end = filterCriteria.appliedDateEnd ? new Date(filterCriteria.appliedDateEnd) : null;
        if (end) end.setDate(end.getDate() + 1); // Include entire end day

        const checkInRange = (d?: string) => {
          if (!d) return false;
          const date = new Date(d);
          if (start && date < start) return false;
          if (end && date >= end) return false;
          return true;
        };

        const hasAppliedInRange = checkInRange(job.applied_date);
        const hasDecisionInRange = checkInRange(job.decision_date);
        const hasInterviewInRange = job.steps?.some(step => checkInRange(step.step_date));

        if (!hasAppliedInRange && !hasDecisionInRange && !hasInterviewInRange) return false;
      }

      // 4. Closing Soon Filter
      if (filterCriteria.showOnlyClosingSoon) {
        if (!job.application_deadline) return false;
        const deadline = new Date(job.application_deadline);
        const today = new Date();
        const threshold = new Date();
        threshold.setDate(today.getDate() + filterCriteria.closingSoonDays);
        if (deadline < today || deadline > threshold) return false;
      }

      // 5. Stale Filter
      if (filterCriteria.showOnlyStale) {
        if (!job.last_updated) return false;
        const lastUpdated = new Date(job.last_updated);
        const today = new Date();
        const threshold = new Date();
        threshold.setDate(today.getDate() - filterCriteria.staleDays);
        if (lastUpdated > threshold) return false;
      }

      // 6. Star Filter
      if (filterCriteria.starStatus === 'starred' && !job.is_starred) return false;
      if (filterCriteria.starStatus === 'unstarred' && job.is_starred) return false;

      return true;
    });

    result.sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';

      if (sortKey === 'is_starred') {
        const aStarred = a.is_starred ? 1 : 0;
        const bStarred = b.is_starred ? 1 : 0;
        if (aStarred !== bStarred) return sortDir === 'asc' ? aStarred - bStarred : bStarred - aStarred;
        // Fallback to last_updated
        valA = a.last_updated ? new Date(a.last_updated).getTime() : 0;
        valB = b.last_updated ? new Date(b.last_updated).getTime() : 0;
      } else {
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
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      
      // Secondary sort: automatically put starred first within any identical grouping
      if (a.is_starred !== b.is_starred) {
        return a.is_starred ? -1 : 1;
      }

      return 0;
    });

    return result;
  }, [jobs, searchQuery, sortKey, sortDir, filterCriteria]);

  const availableStatuses = useMemo(() => {
    const defaultStatuses = ["Wishlist", "Applied", "Interviewing", "Offered", "Rejected", "Closed", "Discontinued"];
    const foundStatuses = Array.from(new Set(jobs.map(j => j.status)));
    return Array.from(new Set([...defaultStatuses, ...foundStatuses])).sort();
  }, [jobs]);

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

  const handleToggleStar = async (job: Job) => {
    try {
      // Optimistic update
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, is_starred: !j.is_starred } : j));
      if (selectedJob?.id === job.id) {
         setSelectedJob(prev => prev ? { ...prev, is_starred: !prev.is_starred } : null);
      }
      await updateJob(job.id!, { is_starred: !job.is_starred });
    } catch (error) {
      console.error('Failed to toggle star', error);
      fetchJobs(); // Revert on failure
    }
  };

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
        if (['Offered', 'Rejected', 'Discontinued'].includes(status)) {
          updateData.decision_date = new Date(date).toISOString();
        } else if (status === 'Applied') {
          updateData.applied_date = new Date(date).toISOString();
        } else if (status === 'Closed') {
          updateData.closed_date = new Date(date).toISOString();
        }
      }
      
      setIsUploadingDoc(true);
      setUploadError(null);
      setUploadTasks(prev => prev.map(t => ({ ...t, status: 'waiting' })));

      try {
        await updateJobStream(id, updateData, (event, msg) => {
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
              fetchJobs();
            }
          } else if (event === 'error') {
            setUploadError(msg);
          }
        });
        
        if (file && docType) {
          // If we also had a file, we continue with the document stream
          // Note: The backend update_job_stream doesn't handle files, only create_job_stream does.
          // For updates with files, we still use the separate upload stream.
          await uploadJobDocumentStream(id, file, docType, (event, msg) => {
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
              fetchJobs();
            } else if (event === 'error') {
              setUploadError(msg);
            }
          });
        }
      } catch (err: any) {
        console.error("Failed to update status", err);
        setUploadError(err.message || 'Update failed');
      }
    } catch (error) {
      console.error('Failed to update status', error);
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
    setIsUploadingDoc(true);
    setUploadError(null);
    setUploadTasks(prev => prev.map(t => ({ ...t, status: 'waiting' })));

    try {
      await updateJobStream(pendingStatusUpdate.id, { 
        status: pendingStatusUpdate.status,
        applied_date: date ? new Date(date).toISOString() : new Date().toISOString()
      }, (event, msg) => {
          if (event === 'progress') {
            setUploadTasks(prev => {
              const currentTasks = [...prev];
              if (msg.includes('Applying')) currentTasks[0].status = 'loading';
              return currentTasks;
            });
          } else if (event === 'completed') {
            if (!file) {
              setShowAdvanceToApplied(false);
              setPendingStatusUpdate(null);
              setUploadTasks(prev => prev.map(t => ({ ...t, status: 'completed' })));
              fetchJobs();
            }
          } else if (event === 'error') {
            setUploadError(msg);
          }
      });

      if (file) {
        try {
          await uploadJobDocumentStream(pendingStatusUpdate.id, file, 'resume', (event, msg) => {
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
              setShowAdvanceToApplied(false);
              setPendingStatusUpdate(null);
              fetchJobs();
            } else if (event === 'error') {
              setUploadError(msg);
            }
          });
        } catch (err: any) {
          console.error("Failed to upload resume during advance", err);
          setUploadError(err.message || 'Upload failed');
        }
      }
    } catch (error: any) {
      console.error('Failed to advance to applied', error);
      setUploadError(error.message || 'Update failed');
    }
  };

  const handleAddJob = async (job: Partial<Job>, file: File | null, onProgress: (event: string, msg: string, data?: any) => void) => {
    try {
      await createJobStream(job, file, onProgress);
      await fetchJobs();
    } catch (error) {
      console.error('Failed to add job via stream', error);
      throw error;
    }
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
    <div className="flex flex-col h-full w-full overflow-hidden p-4 md:p-6 lg:p-8 pt-6 transition-all duration-300">
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>
            {activeView === 'kanban' ? 'Application Tracking' : 'All Applications'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>
            {activeView === 'kanban'
              ? 'Monitor your job applications and hiring progress effortlessly'
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
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex items-center gap-2 bg-[var(--surface)] hover:bg-[var(--surface-hover)] border px-3 py-2 rounded-xl text-sm font-medium transition-all shadow-sm ${
                isFilterOpen || hasActiveFilters 
                ? 'border-violet-500 text-violet-400' 
                : 'border-[var(--border-color)] text-[var(--fg)]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 bg-violet-500 rounded-full" />
              )}
            </button>

            <FilterPopover
              isOpen={isFilterOpen}
              onClose={() => setIsFilterOpen(false)}
              criteria={filterCriteria}
              onChange={setFilterCriteria}
              onClear={() => setFilterCriteria(initialFilterCriteria)}
              availableStatuses={availableStatuses}
            />
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
                  {['last_updated', 'company', 'applied_date', 'created_at', 'is_starred'].map((opt) => (
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
            className="bg-primary hover:bg-primary-hover hover:scale-105 active:scale-95 text-white px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 shadow-lg shadow-primary/20 text-sm"
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
          <KanbanBoard jobs={filteredAndSortedJobs} onUpdateStatus={handleUpdateStatus} onJobClick={handleJobClick} onAddInterviewStep={handleAddInterviewStep} onToggleStar={handleToggleStar} />
        ) : (
          <TableView 
            jobs={filteredAndSortedJobs} 
            onUpdateStatus={handleUpdateStatus} 
            onJobClick={handleJobClick} 
            onToggleStar={handleToggleStar}
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
        key={selectedJob?.id || 'none'}
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

      <ProcessingOverlay
        isOpen={isUploadingDoc}
        tasks={uploadTasks}
        title="Processing Document"
        error={uploadError}
        onClose={() => setIsUploadingDoc(false)}
      />
    </div>
  );
};
