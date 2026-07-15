import React from 'react';
import { Activity } from 'lucide-react';

export interface ClinicQueueItem {
  id: string;
  petId: string;
  petName: string;
  ownerName?: string;
  urgency?: string;
  serviceType?: string;
  emergencyBackfillRequired?: boolean;
}

export interface ClinicQueueProps {
  /** Queue items to render. If empty, the whole block renders nothing. */
  items: ClinicQueueItem[];
  /** Returns true when the given item is the currently selected patient. */
  isSelected: (item: ClinicQueueItem) => boolean;
  /** Fired when a queue card is clicked. */
  onSelect: (item: ClinicQueueItem) => void;
  /** Heading text. Defaults to "Active Clinic Queue". */
  title?: string;
  /** Right-side status pill text per item. Defaults to the item's serviceType, then "Waiting". */
  statusLabel?: (item: ClinicQueueItem) => string;
}

/**
 * Canonical clinic-queue block shared by every master-detail panel
 * (Customers, Vaccinations, Laboratory, Grooming, Examinations, Boarding, Pets).
 * One anatomy, one indigo theme, one set of urgency/backfill badges — so the
 * queue looks identical across the whole app. Each panel keeps its own filter
 * logic and just feeds pre-filtered items in.
 */
export default function ClinicQueue({
  items,
  isSelected,
  onSelect,
  title = 'Active Clinic Queue',
  statusLabel,
}: ClinicQueueProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="p-4 border-b border-slate-100 bg-indigo-50/50 shrink-0">
      <h3 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-3 flex items-center gap-2">
        <Activity className="w-3.5 h-3.5" /> {title}
      </h3>
      <div className="space-y-2">
        {items.map(q => {
          const selected = isSelected(q);
          const status = statusLabel ? statusLabel(q) : (q.serviceType || 'Waiting');
          return (
            <div
              key={q.id}
              onClick={() => onSelect(q)}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${selected ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' : 'bg-white border-indigo-100 hover:border-indigo-300 shadow-sm'}`}
            >
              <div className="flex justify-between items-center mb-1">
                <div className="font-bold text-sm truncate flex items-center gap-1.5">
                  {q.petName}
                  {q.urgency === 'emergency' && <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0">EMERGENCY</span>}
                  {q.urgency === 'non-emergency' && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0">URGENT</span>}
                </div>
                <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded shrink-0 ${selected ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                  {status}
                </div>
              </div>
              {q.emergencyBackfillRequired && (
                <div className={`text-[10px] font-black uppercase tracking-wider mb-1 ${selected ? 'text-amber-200' : 'text-amber-700'}`}>⚠ DETAILS PENDING</div>
              )}
              {q.ownerName && (
                <div className={`text-[10px] font-black ${selected ? 'text-indigo-200' : 'text-slate-500'}`}>
                  {q.ownerName}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
