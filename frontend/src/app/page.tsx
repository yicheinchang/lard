"use client";

import { useEffect, useState } from 'react';
import { Plus, Briefcase } from 'lucide-react';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TableView } from '@/components/TableView';
import { AddJobModal } from '@/components/AddJobModal';
import { JobDetailView } from '@/components/JobDetailView';
import { SettingsPage } from '@/components/SettingsPage';
import { Job, getJobs, createJob, updateJob, uploadJobDocument } from '@/lib/api';
import { useView } from '@/lib/ViewContext';

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { activeView } = useView();

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

  const handleUpdateStatus = async (id: number, status: string, file?: File | null, docType?: string) => {
    try {
      await updateJob(id, { status });
      if (file && docType) {
        await uploadJobDocument(id, file, docType);
      }
      await fetchJobs();
    } catch (error) {
      console.error('Failed to update status or upload file', error);
    }
  };

  const handleAddJob = async (job: Partial<Job>) => {
    const created = await createJob(job);
    await fetchJobs();
    return created; // return so modal can attach documents to the new job
  };

  // If settings view, render settings page directly
  if (activeView === 'settings') {
    return <SettingsPage />;
  }

  return (
    <div className={`flex flex-col h-full w-full p-4 md:p-6 lg:p-8 pt-6 ${selectedJob ? 'md:pb-[40vh]' : ''} transition-all duration-300`}>
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 shrink-0">
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

        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-white hover:bg-gray-100 text-black px-5 py-2.5 rounded-xl font-semibold transition-all hover:scale-105 active:scale-95 flex items-center gap-2 shadow-xl shadow-white/10 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Application
        </button>
      </header>

      <div className="flex-1 min-h-0 relative">
        {isLoading && jobs.length === 0 ? (
          <div className="flex justify-center items-center h-64 text-violet-400/50">
            <Briefcase className="w-12 h-12 animate-pulse" />
          </div>
        ) : activeView === 'kanban' ? (
          <KanbanBoard jobs={jobs} onUpdateStatus={handleUpdateStatus} onJobClick={(job) => setSelectedJob(job)} />
        ) : (
          <TableView jobs={jobs} onUpdateStatus={handleUpdateStatus} onJobClick={(job) => setSelectedJob(job)} />
        )}
      </div>

      <JobDetailView job={selectedJob} onClose={() => setSelectedJob(null)} onJobUpdated={fetchJobs} />

      <AddJobModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onAddJob={handleAddJob} 
      />
    </div>
  );
}
