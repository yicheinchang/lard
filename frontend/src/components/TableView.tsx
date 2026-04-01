"use client";

import React, { useState, useMemo } from 'react';
import { Job } from '../lib/api';
import {
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  Building2, Briefcase, MapPin, Calendar, Clock,
  Filter, X
} from 'lucide-react';

interface TableViewProps {
  jobs: Job[];
  onUpdateStatus: (id: number, status: string, date?: string, file?: File | null, docType?: string) => void;
  onJobClick: (job: Job) => void;
}

const ALL_STATUSES = ['Wishlist', 'Applied', 'Interviewing', 'Offered', 'Rejected', 'Closed', 'Discontinued'];

const statusBadgeColors: Record<string, string> = {
  Wishlist: 'text-gray-300 bg-gray-500/15 border-gray-500/20',
  Applied: 'text-blue-300 bg-blue-500/15 border-blue-500/20',
  Interviewing: 'text-amber-300 bg-amber-500/15 border-amber-500/20',
  Offered: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/20',
  Rejected: 'text-red-300 bg-red-500/15 border-red-500/20',
  Closed: 'text-orange-300 bg-orange-500/15 border-orange-500/20',
  Discontinued: 'text-slate-300 bg-slate-500/15 border-slate-500/20',
};

type SortKey = 'company' | 'role' | 'status' | 'location' | 'applied_date' | 'last_updated';
type SortDir = 'asc' | 'desc';

export const TableView: React.FC<TableViewProps> = ({ jobs, onUpdateStatus, onJobClick }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(ALL_STATUSES));
  const [sortKey, setSortKey] = useState<SortKey>('last_updated');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showFilters, setShowFilters] = useState(false);

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
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = jobs.filter(job => {
      if (!selectedStatuses.has(job.status)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          job.company.toLowerCase().includes(q) ||
          job.role.toLowerCase().includes(q) ||
          (job.location || '').toLowerCase().includes(q)
        );
      }
      return true;
    });

    result.sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';

      switch (sortKey) {
        case 'company': valA = a.company.toLowerCase(); valB = b.company.toLowerCase(); break;
        case 'role': valA = a.role.toLowerCase(); valB = b.role.toLowerCase(); break;
        case 'status': valA = a.status; valB = b.status; break;
        case 'location': valA = (a.location || '').toLowerCase(); valB = (b.location || '').toLowerCase(); break;
        case 'applied_date':
          valA = a.applied_date ? new Date(a.applied_date).getTime() : 0;
          valB = b.applied_date ? new Date(b.applied_date).getTime() : 0;
          break;
        case 'last_updated':
          valA = a.last_updated ? new Date(a.last_updated).getTime() : 0;
          valB = b.last_updated ? new Date(b.last_updated).getTime() : 0;
          break;
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [jobs, searchQuery, selectedStatuses, sortKey, sortDir]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ChevronsUpDown className="w-3.5 h-3.5 text-white/20" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3.5 h-3.5 text-violet-400" />
      : <ChevronDown className="w-3.5 h-3.5 text-violet-400" />;
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
      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by company, role, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
            showFilters
              ? 'bg-violet-500/15 text-violet-300 border-violet-500/20'
              : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:border-white/20'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filters
          {selectedStatuses.size < ALL_STATUSES.length && (
            <span className="bg-violet-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {selectedStatuses.size}
            </span>
          )}
        </button>

        <span className="text-xs text-gray-500 ml-auto">
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
                    : 'bg-white/5 text-gray-500 border-white/5 opacity-50'
                }`}
              >
                {status}
              </button>
            );
          })}
          <button
            onClick={() => setSelectedStatuses(new Set(ALL_STATUSES))}
            className="text-xs text-violet-400 hover:text-violet-300 px-2 transition-colors"
          >
            Reset
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar glass rounded-2xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none ${col.minW}`}
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
                <td colSpan={columns.length} className="text-center py-16 text-gray-500 italic">
                  No applications match your filters
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => onJobClick(job)}
                  className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3">
                    <span className="text-white font-medium group-hover:text-violet-300 transition-colors">
                      {job.company}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{job.role}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusBadgeColors[job.status] || 'text-gray-400 bg-white/5 border-white/10'}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{job.location || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {job.applied_date ? new Date(job.applied_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {job.last_updated ? new Date(job.last_updated).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
