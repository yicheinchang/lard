"use client";

import React, { useState, useMemo } from 'react';
import { Job, batchUpdateJobs } from '../lib/api';
import {
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  Building2, Briefcase, MapPin, Calendar, Clock,
  Filter, X, Star, Archive, Trash2
} from 'lucide-react';
import { Tooltip } from './Tooltip';
import { ConfirmDialog } from './ConfirmDialog';

interface TableViewProps {
  jobs: Job[];
  onUpdateStatus: (id: number, status: string, date?: string, file?: File | null, docType?: string) => void;
  onJobClick: (job: Job) => void;
  globalSortKey: string;
  globalSortDir: 'asc' | 'desc';
  onGlobalSortChange: (key: string) => void;
  onToggleStar?: (job: Job) => void;
  onToggleArchive?: (job: Job) => void;
  onJobUpdated: () => void;
}

const ALL_STATUSES = ['Wishlist', 'Applied', 'Interviewing', 'Offered', 'Rejected', 'Closed', 'Discontinued'];

const statusBadgeColors: Record<string, string> = {
  Wishlist: 'text-[var(--fg-muted)] bg-[var(--surface-hover)] border-[var(--border-color)]',
  Applied: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  Interviewing: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  Offered: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  Rejected: 'text-red-500 bg-red-500/10 border-red-500/20',
  Closed: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
  Discontinued: 'text-[var(--fg-subtle)] bg-[var(--surface-alt)] border-[var(--border-color)]',
};

type SortKey = 'company' | 'role' | 'status' | 'location' | 'applied_date' | 'last_updated';
type SortDir = 'asc' | 'desc';

export const TableView: React.FC<TableViewProps> = ({ jobs, onUpdateStatus, onJobClick, globalSortKey, globalSortDir, onGlobalSortChange, onToggleStar, onToggleArchive, onJobUpdated }) => {
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(ALL_STATUSES));
  const [showFilters, setShowFilters] = useState(false);

  // Selection states
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchAction, setBatchAction] = useState<'archive' | 'restore' | 'delete'>('archive');

  const handleSelectRow = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    const shownIds = filteredAndSorted.map(j => j.id!);
    const allSelected = shownIds.length > 0 && shownIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        shownIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        shownIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const handleExecuteBatch = async () => {
    try {
      const ids = Array.from(selectedIds);
      if (batchAction === 'archive') {
        await batchUpdateJobs(ids, { is_archived: true });
      } else if (batchAction === 'restore') {
        await batchUpdateJobs(ids, { is_archived: false });
      } else if (batchAction === 'delete') {
        await batchUpdateJobs(ids, { action: 'delete' });
      }
      onJobUpdated();
    } catch (err) {
      console.error("Batch action failed", err);
    } finally {
      setShowBatchConfirm(false);
      setSelectedIds(new Set());
    }
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    onGlobalSortChange(key);
  };

  const filteredAndSorted = useMemo(() => {
    return jobs.filter(job => selectedStatuses.has(job.status));
  }, [jobs, selectedStatuses]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (globalSortKey !== column) return <ChevronsUpDown className="w-3.5 h-3.5 text-[var(--fg-subtle)] opacity-30" />;
    return globalSortDir === 'asc'
      ? <ChevronUp className="w-3.5 h-3.5 text-violet-500" />
      : <ChevronDown className="w-3.5 h-3.5 text-violet-500" />;
  };

  const columns: { key: SortKey; label: string; icon: React.ReactNode; minW: string }[] = [
    { key: 'company', label: 'Company', icon: <Building2 className="w-3.5 h-3.5" />, minW: 'min-w-[140px]' },
    { key: 'role', label: 'Role', icon: <Briefcase className="w-3.5 h-3.5" />, minW: 'min-w-[160px]' },
    { key: 'status', label: 'Status', icon: null, minW: 'min-w-[120px]' },
    { key: 'location', label: 'Location', icon: <MapPin className="w-3.5 h-3.5" />, minW: 'min-w-[120px]' },
    { key: 'applied_date', label: 'Applied', icon: <Calendar className="w-3.5 h-3.5" />, minW: 'min-w-[110px]' },
    { key: 'last_updated', label: 'Updated', icon: <Clock className="w-3.5 h-3.5" />, minW: 'min-w-[110px]' },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex flex-wrap items-center gap-3">
        {/* Status Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
            showFilters
              ? 'bg-violet-500/15 text-violet-500 border-violet-500/30'
              : 'bg-[var(--surface)] text-[var(--fg-subtle)] border-[var(--border-color)] hover:text-[var(--fg)] hover:border-violet-500/30'
          }`}
        >
          <Filter className="w-4 h-4" />
          Status Filters
          {selectedStatuses.size < ALL_STATUSES.length && (
            <span className="bg-violet-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {selectedStatuses.size}
            </span>
          )}
        </button>

        <span className="text-xs text-[var(--fg-subtle)] ml-auto">
          {filteredAndSorted.length} of {jobs.length} applications
        </span>
      </div>

      {/* Filter Chips */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 animate-fade-in">
          {ALL_STATUSES.map(status => {
            const isSelected = selectedStatuses.has(status);
            return (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  isSelected
                    ? statusBadgeColors[status]
                    : 'bg-[var(--surface-alt)] text-[var(--fg-subtle)] border-[var(--border-color)] opacity-50'
                }`}
              >
                {status}
              </button>
            );
          })}
          <button
            onClick={() => setSelectedStatuses(new Set(ALL_STATUSES))}
            className="text-xs text-violet-500 hover:text-violet-600 px-2 transition-colors font-medium"
          >
            Reset
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar glass rounded-2xl border border-[var(--border-color)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)] bg-[var(--surface-alt)]/30">
              <th className="w-10 pl-4 py-3 select-none text-left">
                <input
                  type="checkbox"
                  checked={filteredAndSorted.length > 0 && filteredAndSorted.every(j => selectedIds.has(j.id!))}
                  onChange={handleSelectAll}
                  className="rounded border-[var(--border-color)] bg-[var(--input-bg)] text-violet-600 focus:ring-violet-500 cursor-pointer w-4 h-4"
                />
              </th>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`text-left px-4 py-3 text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--fg)] transition-colors select-none ${col.minW}`}
                  onClick={() => handleSort(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    {col.icon}
                    {col.label}
                    <SortIcon column={col.key} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="text-center py-16 text-[var(--fg-subtle)] italic">
                  No applications match your filters
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => onJobClick(job)}
                    className={`border-b border-[var(--border-color)] hover:bg-[var(--surface-hover)] cursor-pointer transition-colors group ${
                      job.employment_type === 'Contractor' ? 'border-l-4 border-l-amber-500/50' : 
                      job.employment_type === 'Consultant' ? 'border-l-4 border-l-blue-500/50' : ''
                    } ${
                      job.is_archived
                        ? 'opacity-65 saturate-50 border-dashed bg-[var(--surface-alt)]/25 hover:opacity-100 hover:saturate-100'
                        : ''
                    }`}
                  >
                    <td className="w-10 pl-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(job.id!)}
                        onChange={(e) => handleSelectRow(job.id!, e as any)}
                        className="rounded border-[var(--border-color)] bg-[var(--input-bg)] text-violet-600 focus:ring-violet-500 cursor-pointer w-4 h-4"
                      />
                    </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {onToggleStar && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onToggleStar(job); }}
                          className={`p-1.5 -ml-1.5 rounded-full hover:bg-[var(--surface-hover)] transition-colors ${job.is_starred ? 'text-yellow-500' : 'text-[var(--fg-subtle)] hover:text-yellow-500/50'}`}
                          title={job.is_starred ? "Unstar Job" : "Star Job"}
                        >
                          <Star className={`w-3.5 h-3.5 ${job.is_starred ? 'fill-current' : ''}`} />
                        </button>
                      )}
                      <Tooltip content={job.company} className="flex-1 min-w-0">
                        <span className="text-[var(--fg)] font-medium group-hover:text-violet-500 transition-colors truncate">
                          {job.company}
                        </span>
                      </Tooltip>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--fg-muted)]">
                    <Tooltip content={job.role} className="w-full">
                      <span className="truncate">{job.role}</span>
                    </Tooltip>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusBadgeColors[job.status] || 'text-[var(--fg-subtle)] bg-[var(--surface-hover)] border-[var(--border-color)]'}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--fg-subtle)]">{job.location || '—'}</td>
                  <td className="px-4 py-3 text-[var(--fg-subtle)]">
                    {job.applied_date ? new Date(job.applied_date).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-[var(--fg-subtle)]">
                    {job.last_updated ? new Date(job.last_updated).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-4 animate-slide-up pointer-events-auto">
          <div className="bg-[#0f0f18]/95 backdrop-blur-xl border border-violet-500/30 rounded-2xl shadow-2xl p-4 flex items-center justify-between gap-4 text-sm text-[var(--fg)]">
            <div className="font-semibold text-violet-400">
              {selectedIds.size} application{selectedIds.size > 1 ? 's' : ''} selected
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setBatchAction('archive'); setShowBatchConfirm(true); }}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-xl font-medium transition-all shadow-md active:scale-95 cursor-pointer text-xs"
              >
                <Archive className="w-3.5 h-3.5" />
                Archive
              </button>
              <button
                onClick={() => { setBatchAction('restore'); setShowBatchConfirm(true); }}
                className="flex items-center gap-1.5 bg-[var(--surface-hover)] hover:bg-[var(--surface)] text-[var(--fg)] border border-[var(--border-color)] px-3 py-1.5 rounded-xl font-medium transition-all active:scale-95 cursor-pointer text-xs"
              >
                Restore
              </button>
              <button
                onClick={() => { setBatchAction('delete'); setShowBatchConfirm(true); }}
                className="flex items-center gap-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-xl font-medium transition-all active:scale-95 cursor-pointer text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
              <div className="h-4 w-[1px] bg-[var(--border-color)] mx-1" />
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-[var(--fg-subtle)] hover:text-[var(--fg)] transition-colors font-semibold py-1.5 px-2 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Confirm Dialog */}
      <ConfirmDialog
        isOpen={showBatchConfirm}
        title={batchAction === 'archive' ? 'Archive Applications' : batchAction === 'restore' ? 'Restore Applications' : 'Delete Applications'}
        message={`Are you sure you want to ${batchAction === 'archive' ? 'archive' : batchAction === 'restore' ? 'restore' : 'permanently delete'} these ${selectedIds.size} selected application${selectedIds.size > 1 ? 's' : ''}?`}
        onConfirm={handleExecuteBatch}
        onCancel={() => setShowBatchConfirm(false)}
        confirmLabel={batchAction === 'archive' ? 'Archive' : batchAction === 'restore' ? 'Restore' : 'Delete'}
        variant={batchAction === 'delete' ? 'danger' : 'default'}
      />
    </div>
  );
};
