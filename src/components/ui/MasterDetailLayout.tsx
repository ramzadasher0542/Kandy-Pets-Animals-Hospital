import React from 'react';

export interface MasterDetailLayoutProps {
  listHeader: React.ReactNode;
  list: React.ReactNode;
  listEmptyMessage?: string;
  detail: React.ReactNode;
  detailEmptyIcon?: React.ReactNode;
  detailEmptyTitle?: string;
  detailEmptyMessage?: string;
  isEmpty?: boolean;
}

export default function MasterDetailLayout({
  listHeader,
  list,
  detail,
  detailEmptyIcon,
  detailEmptyTitle,
  detailEmptyMessage,
  isEmpty,
}: MasterDetailLayoutProps) {
  return (
    <div className="flex h-full w-full gap-4 overflow-hidden">
      <aside className="w-[340px] min-w-[320px] max-w-[400px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
        <div className="p-6 border-b border-slate-100 bg-slate-50 shrink-0 space-y-4">
          {listHeader}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-slate-50/30">
          {list}
        </div>
      </aside>

      <main className="flex-1 bg-slate-50 rounded-2xl flex flex-col border border-slate-200 shadow-sm overflow-hidden relative">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center relative opacity-50">
            {detailEmptyIcon && <div className="mb-4">{detailEmptyIcon}</div>}
            {detailEmptyTitle && (
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">{detailEmptyTitle}</h3>
            )}
            {detailEmptyMessage && (
              <p className="text-xs font-bold text-slate-400 mt-2">{detailEmptyMessage}</p>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col relative overflow-hidden animate-fade-in">
            {detail}
          </div>
        )}
      </main>
    </div>
  );
}
