import React from 'react';
import { Search } from 'lucide-react';

interface KpiCard {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  iconBg?: string;
}

interface FilterOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
  activeClass?: string;
  testId?: string;
}

export interface PageShellProps {
  title?: string;
  subtitle?: string;
  kpis?: KpiCard[];
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  filters?: {
    options: FilterOption[];
    active: string;
    onChange: (id: string) => void;
  };
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function PageShell({ title, subtitle, kpis, search, filters, actions, children }: PageShellProps) {
  return (
    <div className="flex flex-col h-full bg-slate-50 w-full overflow-hidden p-6 gap-6">
      {(title || kpis) && (
        <div className="flex flex-wrap lg:flex-nowrap gap-6 shrink-0">
          {(title || subtitle) && (
            <div className="flex-1 min-w-[240px]">
              {title && <h1 className="text-2xl font-black text-slate-800 tracking-tight">{title}</h1>}
              {subtitle && <p className="text-sm font-bold text-slate-500 mt-1">{subtitle}</p>}
            </div>
          )}
          {kpis && kpis.length > 0 && (
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
              {kpis.map((kpi, i) => (
                <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className={`${kpi.iconBg || 'bg-indigo-50 text-indigo-600'} p-3 rounded-xl`}>
                    {kpi.icon}
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{kpi.label}</div>
                    <div className="text-xl font-black text-slate-800">{kpi.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(filters || search || actions) && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row items-center justify-between gap-4 shrink-0">
          {filters && (
            <div className="flex items-center gap-2 overflow-x-auto w-full xl:w-auto pb-2 xl:pb-0 custom-scrollbar">
              {filters.options.map(opt => (
                <button
                  key={opt.id}
                  data-testid={opt.testId}
                  onClick={() => filters.onChange(opt.id)}
                  className={`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                    filters.active === opt.id
                      ? (opt.activeClass || 'bg-slate-800 text-white shadow-md')
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 w-full xl:w-auto justify-end flex-wrap">
            {search && (
              <div className="relative flex-1 xl:w-64 min-w-[200px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={search.placeholder || 'Search...'}
                  value={search.value}
                  onChange={e => search.onChange(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            )}
            {actions}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  );
}
