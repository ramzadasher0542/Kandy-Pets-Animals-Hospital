/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import EmptyState from './ui/EmptyState';
import { Modal } from './ui/Modal';
import { createPortal } from 'react-dom';
import { 
  Search, FileText, Printer, ShieldAlert, X, DollarSign, 
  Calendar, CheckCircle2, AlertTriangle, ArrowRight, ChevronLeft, ChevronRight,
  Receipt,
} from 'lucide-react';
import { formatDisplayDate } from '../utils/time';
import { showToast } from './Toast';
import { fetchPaginatedInvoices, fetchInvoiceStats } from '../lib/db';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import PageShell from './ui/PageShell';

interface InvoicesProps {
  invoices: any[];
  onVoidInvoice: (id: string) => Promise<void>;
  systemConfig?: any;
}

const PAGE_SIZE = 50;

export default function InvoicesManager({ invoices = [], onVoidInvoice, systemConfig }: InvoicesProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'paid' | 'void'>('All');
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  // MISSION 2: Internal paginated state — queries IndexedDB directly
  const [pageInvoices, setPageInvoices] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // KPI state from DB aggregate (all-time, not just today)
  const [stats, setStats] = useState({ total: 0, revenue: 0, voided: 0 });

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  // Load paginated invoices from IndexedDB on-demand
  const loadPage = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchPaginatedInvoices(currentPage, PAGE_SIZE, debouncedSearch, statusFilter);
      setPageInvoices(result.invoices);
      setTotalCount(result.total);
    } catch (err) {
      console.error('[InvoicesManager] Pagination query failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, debouncedSearch, statusFilter]);

  // Load KPI stats from DB aggregate (all-time)
  const loadStats = useCallback(async () => {
    try { setStats(await fetchInvoiceStats()); } catch (err) { console.error('[InvoicesManager] Stats failed:', err); }
  }, []);

  // Reload on filter/page/search change
  useEffect(() => { loadPage(); }, [loadPage]);
  // Reload stats on mount + when today's invoices change (prop trigger for void/add)
  useEffect(() => { loadStats(); }, [invoices.length]);
  // Reset to page 0 when filters change
  useEffect(() => { setCurrentPage(0); }, [debouncedSearch, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currencySign = systemConfig?.currencySymbol || 'Rs.';

  const handleVoid = async () => {
    if (!selectedInvoice) return;
    if (selectedInvoice.paymentStatus === 'void') {
      showToast('This invoice is already voided.', 'error');
      return;
    }
    
    // ARMOR: Catch any variation of the invoice ID
    const invId = selectedInvoice.invoiceNumber || selectedInvoice.invoice_number || selectedInvoice.id.slice(0,8);
    
    if (window.confirm(`CRITICAL ACTION: Are you sure you want to VOID Invoice ${invId}? This will mark the revenue as zero.`)) {
      
      // AUDIT FIX: Route through App.tsx handler for single source of truth
      await onVoidInvoice(selectedInvoice.id);
      
      showToast(`Invoice ${invId} successfully voided.`, 'success');
      setSelectedInvoice(null);
      // Refresh paginated data after void
      loadPage();
      loadStats();
    }
  };

  const handlePrint = () => {
    showToast('Initializing secure print spooler...', 'success');
    window.print();
  };

  return (
    <PageShell
      title="Invoices & Billing"
      kpis={[
        {
          icon: <FileText className="w-6 h-6" />,
          iconBg: 'bg-indigo-50 text-indigo-600',
          label: 'Total Transactions',
          value: <>{stats.total} <span className="text-xs text-slate-500 font-bold ml-1">Records</span></>
        },
        {
          icon: <DollarSign className="w-6 h-6" />,
          iconBg: 'bg-emerald-50 text-emerald-600',
          label: 'Gross Revenue (Paid)',
          value: <span className="font-mono">{currencySign}{(stats.revenue).toFixed(2)}</span>
        },
        {
          icon: stats.voided > 0 ? <AlertTriangle className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />,
          iconBg: stats.voided > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400',
          label: 'Voided Receipts',
          value: <span className={stats.voided > 0 ? 'text-rose-600' : 'text-slate-500'}>{stats.voided} <span className="text-xs font-bold ml-1">Nullified</span></span>
        }
      ]}
      filters={{
        options: [
          { id: 'All', label: 'Complete Archive' },
          { id: 'paid', label: 'paid' },
          { id: 'void', label: 'void' }
        ],
        active: statusFilter,
        onChange: (id) => setStatusFilter(id as any)
      }}
      search={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: "Search Invoice #, Client, or Pet..."
      }}
    >
      <div id="invoices-manager-module" className="flex-1 flex flex-col overflow-hidden relative">
        {/* Main Data Grid */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Time</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice ID</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client & Patient</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Amount</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="text-sm font-black text-slate-400 animate-pulse">Loading invoices...</div>
                  </td>
                </tr>
              ) : pageInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16">
                    <EmptyState icon={<FileText className="w-6 h-6 text-slate-400" />} title="No invoices match the current filter." />
                  </td>
                </tr>
              ) : pageInvoices.map(inv => {
                const isVoid = inv.paymentStatus === 'void';
                const d = new Date(inv.date);
                
                // ARMOR: Extract ID safely
                const displayId = inv.invoiceNumber || inv.invoice_number || inv.id.slice(0,8);

                return (
                  <tr key={inv.id} className={`hover:bg-slate-50 transition-colors group ${isVoid ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800 text-xs">{formatDisplayDate(inv.date)}</div>
                      <div className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">
                        {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded inline-block border border-indigo-100">
                        {displayId}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-black text-slate-800 text-sm">{inv.ownerName || 'Walk-in Client'}</div>
                      <div className="text-[10px] font-bold text-slate-500 mt-0.5">{inv.petName || 'Retail Customer'}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className={`font-mono text-sm font-black ${isVoid ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {currencySign}{(inv.sales_total || 0).toFixed(2)}
                      </div>
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                        {inv.paymentMethod === 'split' ? 'SPLIT TENDER' : inv.paymentMethod}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge tone={isVoid ? 'rose' : 'emerald'} className="inline-flex items-center gap-1">
                        {isVoid ? <X className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                        {inv.paymentStatus}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setSelectedInvoice(inv)} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-xs inline-flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100">
                        Inspect <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROLS */}
        {totalPages > 1 && (
          <div className="border-t border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 bg-slate-50/50">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} of {totalCount}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className={`p-2 rounded-xl border transition-all ${currentPage === 0 ? 'text-slate-300 border-slate-100 cursor-not-allowed' : 'text-slate-600 border-slate-200 hover:bg-slate-100 cursor-pointer'}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-black text-slate-700 min-w-[80px] text-center">
                Page {currentPage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className={`p-2 rounded-xl border transition-all ${currentPage >= totalPages - 1 ? 'text-slate-300 border-slate-100 cursor-not-allowed' : 'text-slate-600 border-slate-200 hover:bg-slate-100 cursor-pointer'}`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RECEIPT INSPECTOR MODAL */}
            <Modal
        open={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        size="md"
        title={
          <div>
            <div className="text-sm font-black text-slate-800">Receipt Inspector</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Financial Archive Record</div>
          </div>
        }
        icon={<div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl"><Receipt className="w-5 h-5"/></div>}
        headerActions={
          <button onClick={handlePrint} className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl cursor-pointer transition-colors"><Printer className="w-4 h-4"/></button>
        }
        footer={
          selectedInvoice?.paymentStatus !== 'void' ? (
            <div className="flex justify-end">
              {/* AUTH-3: handleVoid existed but was never wired to any control, so
                  voiding was impossible from the UI. Now reachable and gated. */}
              <button
                data-testid="btn-void-invoice"
                onClick={handleVoid}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-colors cursor-pointer"
              >
                Void Invoice
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="print:p-4 print:overflow-visible relative">
          
          {selectedInvoice?.paymentStatus === 'void' && (
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 border-4 border-rose-500 text-rose-500 text-5xl font-black uppercase tracking-widest px-8 py-4 opacity-20 pointer-events-none select-none z-50">
              VOIDED
            </div>
          )}

          <div className="text-center border-b border-slate-200 pb-6 mb-6">
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">{systemConfig?.hospitalName || 'CeylonPets Hospital'}</h1>
            <p className="text-xs font-bold text-slate-500 mt-1">{systemConfig?.hospitalAddress || 'Kandy, Sri Lanka'}</p>
            <p className="text-xs font-bold text-slate-500">{systemConfig?.hospitalPhone || '+94 81 234 5678'}</p>
          </div>

          <div className="flex justify-between items-end mb-6 text-sm">
            <div>
              <p className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">Billed To</p>
              <p className="font-black text-slate-800">{selectedInvoice?.ownerName || 'Walk-in Client'}</p>
              {selectedInvoice?.petName && <p className="font-bold text-slate-600 text-xs mt-0.5">Patient: {selectedInvoice?.petName}</p>}
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">Invoice No.</p>
              <p className="font-mono font-black text-slate-800">{selectedInvoice?.invoiceNumber || selectedInvoice?.invoice_number || selectedInvoice?.id.slice(0,8)}</p>
              <p className="font-mono font-bold text-slate-500 text-xs mt-0.5">{selectedInvoice?.date ? new Date(selectedInvoice.date).toLocaleDateString() : ''} {selectedInvoice?.date ? new Date(selectedInvoice.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</p>
            </div>
          </div>

          <table className="w-full text-sm mb-6">
            <thead className="border-b-2 border-slate-800">
              <tr>
                <th className="py-2 text-left text-[10px] font-black text-slate-800 uppercase tracking-widest">Description</th>
                <th className="py-2 text-center text-[10px] font-black text-slate-800 uppercase tracking-widest">Qty</th>
                <th className="py-2 text-right text-[10px] font-black text-slate-800 uppercase tracking-widest">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* ARMOR: Handle missing arrays and variant property names safely */}
              {(selectedInvoice?.items || selectedInvoice?.purchases || selectedInvoice?.cart || []).map((item: any, idx: number) => {
                const price = item.price || item.unitPrice || 0;
                const qty = item.quantity || item.qty || 1;
                const total = item.total || item.lineTotal || (price * qty) || 0;
                
                return (
                <tr key={idx}>
                  <td className="py-3 pr-2 font-bold text-slate-700">{item.name || item.itemName || 'Retail Purchase'} <div className="text-[10px] font-black text-slate-400">@ {currencySign}{price.toFixed(2)}</div></td>
                  <td className="py-3 px-2 text-center font-mono font-bold text-slate-600">{qty}</td>
                  <td className="py-3 pl-2 text-right font-mono font-black text-slate-800">{currencySign}{total.toFixed(2)}</td>
                </tr>
                )
              })}
            </tbody>
          </table>

          <div className="border-t border-slate-200 pt-4 mb-8">
            <div className="flex justify-between items-center">
              <span className="font-black text-slate-800 uppercase tracking-widest">Total Paid</span>
              <span className="text-xl font-mono font-black text-indigo-600">{currencySign}{((selectedInvoice?.total || selectedInvoice?.grandTotal || 0)).toFixed(2)}</span>
            </div>
            {selectedInvoice?.paymentMethod && (
              <div className="flex justify-between items-center mt-2">
                <span className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">Payment Method</span>
                <span className="font-bold text-slate-700 uppercase">{selectedInvoice.paymentMethod}</span>
              </div>
            )}
          </div>
          
          <div className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Thank you for trusting {systemConfig?.hospitalName || 'us'} with your pet's care.
          </div>
        </div>
      </Modal>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        
        @media print {
          @page { margin: 0; size: auto; }
          body * { visibility: hidden; }
          #invoices-manager-module { display: none; }
          .print\\:bg-white { background-color: white !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-none { border: none !important; }
          .print\\:w-full { width: 100% !important; }
          .print\\:max-w-none { max-width: none !important; }
          .print\\:h-auto { height: auto !important; }
          .print\\:overflow-visible { overflow: visible !important; }
          .fixed.inset-0.z-\\[80\\] > div { visibility: visible !important; position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 20px; }
          .fixed.inset-0.z-\\[80\\] > div * { visibility: visible; color: black !important; }
        }
      `}</style>
    </div>
    </PageShell>
  );
}