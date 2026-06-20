/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, FileText, Printer, ShieldAlert, X, DollarSign, 
  Calendar, CheckCircle2, AlertTriangle, ArrowRight
} from 'lucide-react';
import { formatDisplayDate } from '../utils/time';
import { showToast } from './Toast';
import { fetchInvoices, upsertInvoice } from '../lib/db';

interface InvoicesProps {
  invoices?: any[];
  onVoidInvoice?: any;
  systemConfig?: any;
}

export default function InvoicesManager({ systemConfig }: InvoicesProps) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'paid' | 'void'>('All');
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  // BOOT SEQUENCE: Direct DB Fetch bypasses App.tsx state failures
  useEffect(() => {
    loadFinancialArchive();
  }, []);

  const loadFinancialArchive = async () => {
    try {
      const data = await fetchInvoices();
      setInvoices(data);
    } catch (err) {
      console.error('[Enterprise OS] Failed to load archive:', err);
    }
  };

  // High-Speed Filtering Engine
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== 'All' && inv.paymentStatus !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        // ARMOR: Catch any variation of the invoice ID
        const invNum = (inv.invoiceNumber || inv.invoice_number || inv.id || '').toLowerCase();
        return (
          invNum.includes(q) ||
          (inv.ownerName || '').toLowerCase().includes(q) ||
          (inv.petName || '').toLowerCase().includes(q)
        );
      }
      return true;
    }); 
  }, [invoices, searchQuery, statusFilter]);

  // KPI Calculations
  const validInvoices = invoices.filter(i => i.paymentStatus === 'paid');
  const totalRevenue = validInvoices.reduce((sum, inv) => sum + (inv.sales_total || 0), 0);
  const voidedCount = invoices.filter(i => i.paymentStatus === 'void').length;
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
      
      // DIRECT DB MUTATION: Safely voids without relying on App.tsx
      const target = { ...selectedInvoice, paymentStatus: 'void' as const };
      await upsertInvoice(target);
      await loadFinancialArchive(); // Instantly refresh the grid
      
      showToast(`Invoice ${invId} successfully voided.`, 'success');
      setSelectedInvoice(null);
    }
  };

  const handlePrint = () => {
    showToast('Initializing secure print spooler...', 'success');
    window.print();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full overflow-hidden p-6 gap-6" id="invoices-manager-module">
      
      {/* Top Action & Stats Bar */}
      <div className="flex flex-wrap lg:flex-nowrap gap-6 shrink-0">
        
        {/* KPI Cards */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600"><FileText className="w-6 h-6" /></div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Transactions</div>
              <div className="text-xl font-black text-slate-800">{invoices.length} <span className="text-xs text-slate-500 font-bold ml-1">Records</span></div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-emerald-50 p-3 rounded-xl text-emerald-600"><DollarSign className="w-6 h-6" /></div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gross Revenue (Paid)</div>
              <div className="text-xl font-black font-mono text-slate-800">
                {currencySign}{(totalRevenue).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className={`${voidedCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'} p-3 rounded-xl`}>
              {voidedCount > 0 ? <AlertTriangle className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Voided Receipts</div>
              <div className={`text-xl font-black ${voidedCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                {voidedCount} <span className="text-xs font-bold ml-1">Nullified</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Control Panel */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 custom-scrollbar">
          {['All', 'paid', 'void'].map(status => (
            <button 
              key={status} 
              onClick={() => setStatusFilter(status as any)}
              className={`whitespace-nowrap px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                statusFilter === status 
                  ? 'bg-slate-800 text-white shadow-md' 
                  : `bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200`
              }`}
            >
              {status === 'All' ? 'Complete Archive' : status}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search Invoice #, Client, or Pet..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

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
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <div className="text-sm font-black text-slate-500">No invoices match the current filter.</div>
                  </td>
                </tr>
              ) : filteredInvoices.map(inv => {
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
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{inv.paymentMethod}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border shadow-xs inline-flex items-center gap-1 ${
                        isVoid 
                          ? 'bg-rose-50 text-rose-700 border-rose-200' 
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {isVoid ? <X className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                        {inv.paymentStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setSelectedInvoice(inv)} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 font-bold rounded-lg text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-xs inline-flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100">
                        Inspect <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECEIPT INSPECTOR MODAL */}
      {selectedInvoice && createPortal(
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 print:bg-white print:p-0">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full animate-scale-up flex flex-col overflow-hidden max-h-[95vh] print:shadow-none print:border-none print:w-full print:max-w-none print:h-auto">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 shrink-0 flex justify-between items-center bg-slate-50/50 print:hidden">
              <div>
                <h2 className="text-sm font-black text-slate-800">Receipt Inspector</h2>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Financial Archive Record</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePrint} className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl cursor-pointer transition-colors"><Printer className="w-4 h-4"/></button>
                <button onClick={() => setSelectedInvoice(null)} className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-400 rounded-xl cursor-pointer transition-colors"><X className="w-4 h-4"/></button>
              </div>
            </div>

            {/* Printable Receipt Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-white print:p-4 print:overflow-visible relative">
              
              {selectedInvoice.paymentStatus === 'void' && (
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 border-4 border-rose-500 text-rose-500 text-5xl font-black uppercase tracking-widest px-8 py-4 opacity-20 pointer-events-none select-none z-50">
                  VOIDED
                </div>
              )}

              <div className="text-center border-b border-slate-200 pb-6 mb-6">
                <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">{systemConfig?.hospitalName || 'CeylonPets Hospital'}</h1>
                <p className="text-xs font-semibold text-slate-500 mt-1">{systemConfig?.hospitalAddress || 'Kandy, Sri Lanka'}</p>
                <p className="text-xs font-semibold text-slate-500">{systemConfig?.hospitalPhone || '+94 81 234 5678'}</p>
              </div>

              <div className="flex justify-between items-end mb-6 text-sm">
                <div>
                  <p className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">Billed To</p>
                  <p className="font-black text-slate-800">{selectedInvoice.ownerName || 'Walk-in Client'}</p>
                  {selectedInvoice.petName && <p className="font-semibold text-slate-600 text-xs mt-0.5">Patient: {selectedInvoice.petName}</p>}
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">Invoice No.</p>
                  <p className="font-mono font-black text-slate-800">{selectedInvoice.invoiceNumber || selectedInvoice.invoice_number || selectedInvoice.id.slice(0,8)}</p>
                  <p className="font-mono font-semibold text-slate-500 text-xs mt-0.5">{new Date(selectedInvoice.date).toLocaleDateString()} {new Date(selectedInvoice.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
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
                  {(selectedInvoice.items || selectedInvoice.purchases || selectedInvoice.cart || []).map((item: any, idx: number) => {
                    const price = item.price || item.unitPrice || 0;
                    const qty = item.quantity || item.qty || 1;
                    const total = item.total || item.lineTotal || (price * qty) || 0;
                    
                    return (
                    <tr key={idx}>
                      <td className="py-3 pr-2 font-bold text-slate-700">{item.name || item.itemName || 'Retail Purchase'} <div className="text-[10px] font-semibold text-slate-400">@ {currencySign}{price.toFixed(2)}</div></td>
                      <td className="py-3 px-2 text-center font-mono font-bold text-slate-600">{qty}</td>
                      <td className="py-3 pl-2 text-right font-mono font-black text-slate-800">{currencySign}{total.toFixed(2)}</td>
                    </tr>
                  )})}
                </tbody>
              </table>

              <div className="border-t-2 border-slate-800 pt-4 flex flex-col items-end gap-1">
                <div className="flex justify-between w-48 text-sm">
                  <span className="font-bold text-slate-500">Subtotal:</span>
                  <span className="font-mono font-black text-slate-700">{currencySign}{(selectedInvoice.sales_total || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-48 text-lg mt-2 pt-2 border-t border-slate-200">
                  <span className="font-black text-slate-900 uppercase">Total Paid:</span>
                  <span className="font-mono font-black text-slate-900">{currencySign}{(selectedInvoice.sales_total || 0).toFixed(2)}</span>
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                  Method: {selectedInvoice.paymentMethod || 'CASH'}
                </div>
              </div>

              <div className="mt-8 text-center border-t border-slate-200 pt-6">
                <p className="text-xs font-bold text-slate-500 italic">{systemConfig?.invoiceFooterMessage || 'Thank you for trusting CeylonPets!'}</p>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0 flex justify-between items-center print:hidden">
              {selectedInvoice.paymentStatus !== 'void' ? (
                <button onClick={handleVoid} className="px-5 py-2.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 font-black rounded-xl transition-colors text-[10px] uppercase tracking-widest cursor-pointer flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4"/> Execute Void Protocol
                </button>
              ) : (
                <div className="px-5 py-2.5 bg-slate-200 text-slate-500 font-black rounded-xl text-[10px] uppercase tracking-widest flex items-center gap-2 cursor-not-allowed">
                  <X className="w-4 h-4"/> Already Voided
                </div>
              )}
              
              <button onClick={handlePrint} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                <Printer className="w-4 h-4"/> Print Receipt
              </button>
            </div>
            
          </div>
        </div>,
        document.body
      )}

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
  );
}