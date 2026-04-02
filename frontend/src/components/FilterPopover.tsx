"use client";

import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, SlidersHorizontal, Trash2, CheckCircle2 } from 'lucide-react';

export interface FilterCriteria {
  appliedDateStart: string;
  appliedDateEnd: string;
  closingSoonDays: number;
  showOnlyClosingSoon: boolean;
  staleDays: number;
  showOnlyStale: boolean;
  statuses: string[];
}

interface FilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  criteria: FilterCriteria;
  onChange: (criteria: FilterCriteria) => void;
  onClear: () => void;
  availableStatuses: string[];
}

export const FilterPopover: React.FC<FilterPopoverProps> = ({
  isOpen,
  onClose,
  criteria,
  onChange,
  onClear,
  availableStatuses,
}) => {
  const [localCriteria, setLocalCriteria] = useState<FilterCriteria>(criteria);

  // Sync local state when props change (e.g. on external clear)
  useEffect(() => {
    setLocalCriteria(criteria);
  }, [criteria]);

  if (!isOpen) return null;

  const handleUpdate = (updates: Partial<FilterCriteria>) => {
    const newCriteria = { ...localCriteria, ...updates };
    setLocalCriteria(newCriteria);
    onChange(newCriteria);
  };

  const toggleStatus = (status: string) => {
    const newStatuses = localCriteria.statuses.includes(status)
      ? localCriteria.statuses.filter(s => s !== status)
      : [...localCriteria.statuses, status];
    handleUpdate({ statuses: newStatuses });
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" 
        onClick={onClose}
      />
      
      {/* Popover */}
      <div className="absolute right-0 top-full mt-2 w-[320px] md:w-[380px] glass bg-[#0f0f18] border border-white/10 rounded-2xl shadow-2xl z-50 p-5 animate-slide-up origin-top-right">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-white">Advanced Filters</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-full text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
          {/* Applied Date Range */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">
              <Calendar className="w-4 h-4" />
              Applied Date Range
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[10px] text-[var(--fg-subtle)] ml-1 font-medium">From</span>
                <input
                  type="date"
                  value={localCriteria.appliedDateStart}
                  onChange={(e) => handleUpdate({ appliedDateStart: e.target.value })}
                  className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg px-2 py-2 text-[var(--fg)] text-xs focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all style-date"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-[var(--fg-subtle)] ml-1 font-medium">To</span>
                <input
                  type="date"
                  value={localCriteria.appliedDateEnd}
                  onChange={(e) => handleUpdate({ appliedDateEnd: e.target.value })}
                  className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg px-2 py-2 text-[var(--fg)] text-xs focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all style-date"
                />
              </div>
            </div>
          </div>

          {/* Closing Soon Threshold */}
          <div className={`space-y-3 p-4 rounded-xl border border-[var(--border-color)] transition-all ${
            localCriteria.showOnlyClosingSoon ? 'bg-violet-500/10 border-violet-500/40' : 'bg-[var(--surface-hover)] border-[var(--border-color)]'
          }`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">
                <Clock className={`w-4 h-4 ${localCriteria.showOnlyClosingSoon ? 'text-violet-400' : ''}`} />
                Closing Soon
              </label>
              <button
                onClick={() => handleUpdate({ showOnlyClosingSoon: !localCriteria.showOnlyClosingSoon })}
                className={`w-11 h-6 rounded-full relative transition-all duration-300 shadow-inner ${
                  localCriteria.showOnlyClosingSoon ? 'bg-violet-500' : 'bg-[var(--border-color)]'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ease-in-out ${
                  localCriteria.showOnlyClosingSoon ? 'right-1' : 'left-1'
                }`} />
              </button>
            </div>
            
            <div className={`space-y-4 transition-all duration-300 ${localCriteria.showOnlyClosingSoon ? 'opacity-100' : 'opacity-30 pointer-events-none grayscale'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--fg-muted)] font-medium">Filter within:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={localCriteria.closingSoonDays}
                    onChange={(e) => handleUpdate({ closingSoonDays: parseInt(e.target.value) || 0 })}
                    className="w-14 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-center text-[var(--fg)] text-xs font-bold focus:outline-none focus:border-violet-500"
                  />
                  <span className="text-[11px] text-[var(--fg-subtle)]">days</span>
                </div>
              </div>
              <div className="relative group">
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={localCriteria.closingSoonDays}
                  onChange={(e) => handleUpdate({ closingSoonDays: parseInt(e.target.value) })}
                  className="w-full accent-violet-500 h-2 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer hover:bg-[var(--surface)] transition-all"
                />
              </div>
              <p className="text-[10px] text-[var(--fg-subtle)] italic leading-tight font-medium">Shows jobs with deadlines within the next {localCriteria.closingSoonDays} days.</p>
            </div>
          </div>

          {/* Stale Threshold */}
          <div className={`space-y-3 p-4 rounded-xl border border-[var(--border-color)] transition-all ${
            localCriteria.showOnlyStale ? 'bg-amber-500/10 border-amber-500/40' : 'bg-[var(--surface-hover)] border-[var(--border-color)]'
          }`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">
                <Clock className={`w-4 h-4 rotate-180 ${localCriteria.showOnlyStale ? 'text-amber-400' : ''}`} />
                Stale Applications
              </label>
              <button
                onClick={() => handleUpdate({ showOnlyStale: !localCriteria.showOnlyStale })}
                className={`w-11 h-6 rounded-full relative transition-all duration-300 shadow-inner ${
                  localCriteria.showOnlyStale ? 'bg-amber-500' : 'bg-[var(--border-color)]'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ease-in-out ${
                  localCriteria.showOnlyStale ? 'right-1' : 'left-1'
                }`} />
              </button>
            </div>
            
            <div className={`space-y-4 transition-all duration-300 ${localCriteria.showOnlyStale ? 'opacity-100' : 'opacity-30 pointer-events-none grayscale'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--fg-muted)] font-medium">Last update over:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={localCriteria.staleDays}
                    onChange={(e) => handleUpdate({ staleDays: parseInt(e.target.value) || 0 })}
                    className="w-14 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-md px-2 py-1 text-center text-[var(--fg)] text-xs font-bold focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[11px] text-[var(--fg-subtle)]">days ago</span>
                </div>
              </div>
              <div className="relative group">
                <input
                  type="range"
                  min="1"
                  max="90"
                  value={localCriteria.staleDays}
                  onChange={(e) => handleUpdate({ staleDays: parseInt(e.target.value) })}
                  className="w-full accent-amber-500 h-2 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer hover:bg-[var(--surface)] transition-all"
                />
              </div>
              <p className="text-[10px] text-[var(--fg-subtle)] italic leading-tight font-medium">Shows jobs with no updates for more than {localCriteria.staleDays} days.</p>
            </div>
          </div>

          {/* Status Filter */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4" />
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              {availableStatuses.map((status) => (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border ${
                    localCriteria.statuses.includes(status)
                      ? 'bg-violet-500 text-white border-violet-500 shadow-lg shadow-violet-500/20'
                      : 'bg-[var(--surface-hover)] border-[var(--border-color)] text-[var(--fg-muted)] hover:bg-[var(--surface)]'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 pt-5 border-t border-[var(--border-color)] flex items-center justify-between">
          <button
            onClick={onClear}
            className="flex items-center gap-2 text-xs font-bold text-[var(--fg-subtle)] hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Reset All
          </button>
          <button
            onClick={onClose}
            className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg hover:scale-105 active:scale-95"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
};
