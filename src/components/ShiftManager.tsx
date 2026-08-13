/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Lock, FileText, User, Printer, Plus, DollarSign, Banknote, CreditCard, Building2 } from 'lucide-react';
import { Invoice, ShiftReconciliation, User as StaffUser, ActiveShift, Shift } from '../types';
import { showToast } from './Toast';
import { fetchActiveShiftDetails, addCashAdjustment, closeShiftAndReconcile, fetchPaidInvoicesForShift, fetchActiveShiftState, exportFullDatabase } from '../lib/db';
import { downloadJsonFile } from '../lib/download';
import { supabase } from '../lib/supabase';
import { Badge } from './ui/Badge';
import PageShell from './ui/PageShell';
import { requireAuth } from '../lib/requireAuth';

// --- Cash Adjustment Type ---
interface CashAdjustment {
  id: string;
  type: 'IN' | 'OUT';
  amount: number;
  category: 'Expense' | 'Income' | 'Investment' | 'Owner Draw' | 'Starting Float' | 'Other';
  reason: string;
  date: string;
  createdBy: string;
  shiftId?: string;
}

interface ClosedShiftReport extends ShiftReconciliation {
  shiftId: string;
  openedAt: string;
  closedAt: string;
  openedBy: string;
  startingCash: number;
  actualCash: number;
  notes: string;
}

interface ShiftManagerProps {
  invoices: Invoice[];
  currentUser: StaffUser;
  activeShift: ActiveShift | null;
  setActiveShift: (s: ActiveShift | null) => void;
}

const formatCurrency = (v: number) => `Rs. ${v.toFixed(2)}`;

export default function ShiftManager({ invoices, currentUser, activeShift, setActiveShift }: ShiftManagerProps) {
  const [openingFloatInput, setOpeningFloatInput] = useState('');
  const [actualClosingInput, setActualClosingInput] = useState('');
  const [lastClosedShift, setLastClosedShift] = useState<ClosedShiftReport | null>(null);

  // Cash Adjustment State
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjType, setAdjType] = useState<'IN' | 'OUT'>('OUT');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjCategory, setAdjCategory] = useState<CashAdjustment['category']>('Expense');
  const [adjReason, setAdjReason] = useState('');
  const [adjustments, setAdjustments] = useState<CashAdjustment[]>([]);

  // All paid invoices attributed to this shift, loaded from the cloud so
  // reconciliation covers the COMPLETE shift (including one crossing midnight),
  // not just today's in-memory invoice list.
  const [shiftPaidInvoices, setShiftPaidInvoices] = useState<Invoice[]>([]);

  // Fail-closed reconciliation: closing a shift is BLOCKED unless BOTH the shift's
  // paid invoices and its cash adjustments loaded cleanly from the cloud. Otherwise
  // a partial/empty load would let the drawer close on incomplete totals.
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [adjustmentsLoaded, setAdjustmentsLoaded] = useState(false);

  // Load adjustments for the current shift from Supabase (visible on any device).
  useEffect(() => {
    if (!activeShift) { setAdjustments([]); setAdjustmentsLoaded(false); return; }
    setAdjustmentsLoaded(false);
    const load = async () => {
      try {
        const { adjustments: adjs } = await fetchActiveShiftDetails();
        setAdjustments((adjs as CashAdjustment[]).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setAdjustmentsLoaded(true);
      } catch (e) {
        if (import.meta.env.DEV) console.error('Shift adjustments load failed:', e);
        setAdjustmentsLoaded(false);
        showToast('Could not load this shift’s cash adjustments from the cloud. Close is blocked until this loads.', 'error');
      }
    };
    load();
  }, [activeShift]);

  // Load this shift's paid invoices from the cloud for reconciliation.
  useEffect(() => {
    if (!activeShift) { setShiftPaidInvoices([]); setInvoicesLoaded(false); return; }
    setInvoicesLoaded(false);
    const load = async () => {
      try {
        setShiftPaidInvoices(await fetchPaidInvoicesForShift(activeShift.id));
        setInvoicesLoaded(true);
      } catch (e) {
        if (import.meta.env.DEV) console.error('Shift paid-invoice load failed:', e);
        setInvoicesLoaded(false);
        showToast('Could not load this shift’s sales from the cloud. Close is blocked until this loads.', 'error');
      }
    };
    load();
  }, [activeShift]);

  // ==========================================
  // MATH ENGINE: Drawer Balance by Payment Method
  // ==========================================
  // Formula:
  //   Expected Cash = Opening Float + Cash Sales + Cash Adjustments IN - Cash Adjustments OUT
  //   Card Total = Sum of card sales (no physical drawer impact, just tracking)
  //   Bank Transfer Total = Sum of bank_transfer sales (tracking only)
  //   Discrepancy = Actual Counted Cash - Expected Cash
  // ==========================================
  const drawerMath = useMemo(() => {
    if (!activeShift) return { cashSales: 0, cardSales: 0, bankSales: 0, adjustIn: 0, adjustOut: 0, expectedCash: 0, totalRevenue: 0, discrepancy: 0, txCount: 0 };

    // Cloud-loaded, already filtered to paid + this shiftId (all dates).
    const shiftInvoices = shiftPaidInvoices;

    // AUDIT FIX: Use integer cents to prevent floating-point drift, and support split payments
    let cashSalesCents = 0;
    let cardSalesCents = 0;
    let bankSalesCents = 0;

    shiftInvoices.forEach(inv => {
      if (inv.paymentMethod === 'split' && inv.splitPayments) {
        inv.splitPayments.forEach(sp => {
          if (sp.method === 'cash') cashSalesCents += Math.round(sp.amount * 100);
          else if (sp.method === 'card') cardSalesCents += Math.round(sp.amount * 100);
          else if (sp.method === 'bank_transfer') bankSalesCents += Math.round(sp.amount * 100);
        });
      } else {
        const totalCents = Math.round((inv.sales_total || 0) * 100);
        if (inv.paymentMethod === 'cash') cashSalesCents += totalCents;
        else if (inv.paymentMethod === 'card') cardSalesCents += totalCents;
        else if (inv.paymentMethod === 'bank_transfer') bankSalesCents += totalCents;
      }
    });

    const adjustInCents = adjustments.filter(a => a.type === 'IN').reduce((s, a) => s + Math.round(a.amount * 100), 0);
    const adjustOutCents = adjustments.filter(a => a.type === 'OUT').reduce((s, a) => s + Math.round(a.amount * 100), 0);

    const openingFloatCents = Math.round(activeShift.openingFloat * 100);
    const expectedCashCents = openingFloatCents + cashSalesCents + adjustInCents - adjustOutCents;
    const totalRevenueCents = cashSalesCents + cardSalesCents + bankSalesCents;
    const actualCents = Math.round((parseFloat(actualClosingInput) || 0) * 100);
    const discrepancyCents = actualCents - expectedCashCents;

    // Convert back to display currency (divide only at the end)
    return {
      cashSales: cashSalesCents / 100,
      cardSales: cardSalesCents / 100,
      bankSales: bankSalesCents / 100,
      adjustIn: adjustInCents / 100,
      adjustOut: adjustOutCents / 100,
      expectedCash: expectedCashCents / 100,
      totalRevenue: totalRevenueCents / 100,
      discrepancy: discrepancyCents / 100,
      txCount: shiftInvoices.length
    };
  }, [shiftPaidInvoices, activeShift, adjustments, actualClosingInput]);

  const handleOpenShift = async () => {
    if (!openingFloatInput) { showToast('Please enter a starting float amount.', 'error'); return; }
    
    const floatAmount = parseFloat(openingFloatInput) || 0;
    const openingFloatCents = Math.round(floatAmount * 100);

    const newShift: Shift = {
      id: crypto.randomUUID(),
      openedBy: currentUser.username,
      startTime: new Date().toISOString(),
      openingFloatCents,
      cashCollectedCents: 0,
      cardCollectedCents: 0,
      bankTransferCollectedCents: 0,
      expectedCashCents: openingFloatCents,
      actualCashCents: undefined,
      discrepancyCents: undefined,
      notes: '',
      isOpen: true,
      opening_float: floatAmount,
      actual_cash: null,
      discrepancy_reason: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
    };

    // Persist the shift to Supabase so any device can find the open shift.
    // Use insert (not openShift()) so the id we built stays consistent with
    // setActiveShift and the shiftId stamped onto invoices.
    if (!supabase) { showToast('No internet connection. Cannot open shift.', 'error'); return; }
    // Confirm cloud shift state before changing register state. If the cloud state
    // cannot be confirmed (unavailable != "no open shift"), BLOCK rather than risk a
    // duplicate open.
    const state = await fetchActiveShiftState();
    if (!state.available) {
      showToast('Cannot confirm register state with the cloud. Not opening a shift — check your connection and retry.', 'error');
      return;
    }
    if (state.shift) {
      showToast('A shift is already open. Close it before opening a new one.', 'error');
      return;
    }
    const { error } = await supabase.from('shifts').insert(newShift);
    if (error) {
      // The single-open-shift unique index rejects a concurrent duplicate open.
      const msg = /duplicate|unique|uniq_shifts_single_open/i.test(error.message || '')
        ? 'A shift was just opened on another device. Not opening a duplicate.'
        : `Failed to open shift: ${error.message}`;
      showToast(msg, 'error');
      return;
    }

    const activeShiftState: ActiveShift = {
      id: newShift.id,
      openedAt: newShift.startTime,
      openedBy: newShift.openedBy,
      openedByName: currentUser.name,
      openingFloat: floatAmount
    };

    setActiveShift(activeShiftState);
    showToast('Register opened and active shift started.', 'success');
  };

  const handleCloseShift = async () => {
    if (!activeShift) return;
    if (actualClosingInput === '') { showToast('Please enter the actual counted drawer cash.', 'error'); return; }

    // Fail closed: never reconcile on incomplete data. If either the shift's paid
    // invoices or its cash adjustments did not load from the cloud, block the close
    // so the drawer cannot be reconciled against partial/empty totals.
    if (!invoicesLoaded || !adjustmentsLoaded) {
      showToast('Cannot close: this shift’s sales/adjustments have not fully loaded from the cloud. Reload and retry before closing.', 'error');
      return;
    }

    // Supabase Free has no managed backups. A shift close therefore requires a
    // root-authorized portable backup download, generated after the financial
    // close so the final reconciliation is included in the snapshot.
    const backupAuth = await requireAuth(currentUser || null, 'daily_backup');
    if (!backupAuth.allowed) {
      showToast('Shift close cancelled: daily backup requires administrator/provider access.', 'error');
      return;
    }

    const log: ShiftReconciliation = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userId: currentUser.username,
      userName: currentUser.name,
      openingFloat: activeShift.openingFloat,
      cashSales: drawerMath.cashSales,
      expectedClosing: drawerMath.expectedCash,
      actualClosing: parseFloat(actualClosingInput) || 0,
      discrepancy: drawerMath.discrepancy,
      status: Math.abs(drawerMath.discrepancy) < 0.01 ? 'balanced' : 'discrepancy'
    };

    // Close the shift in Supabase (rupees → integer cents to match the columns).
    // The shift-close UPDATE and the reconciliation INSERT run in ONE database
    // transaction via close_shift_and_reconcile: both commit or neither does, so a
    // failure can no longer close the shift while losing the reconciliation.
    const notes = log.status === 'balanced' ? 'Balanced' : `Discrepancy Rs. ${Math.abs(drawerMath.discrepancy).toFixed(2)}`;
    let result: { already_closed: boolean };
    try {
      result = await closeShiftAndReconcile(
        activeShift.id,
        Math.round((parseFloat(actualClosingInput) || 0) * 100),
        Math.round(drawerMath.expectedCash * 100),
        Math.round(drawerMath.discrepancy * 100),
        notes,
        log
      );
    } catch (e: any) {
      // Neither the shift nor the reconciliation persisted — do not claim the
      // shift closed and do not clear the local active shift.
      showToast(`Failed to close shift: ${e.message}`, 'error');
      return;
    }

    if (result.already_closed) {
      // This shift was already closed by a prior (possibly lost-response) call.
      // The RPC created NO duplicate reconciliation, so do not show this attempt's
      // reconciliation as saved. Clear the stale active-shift UI and point the
      // operator at the original close in the report.
      setActiveShift(null);
      showToast('This shift was already closed — no duplicate reconciliation was created. Check the original close in the report.', 'warning');
      return;
    }

    // Both writes committed. Only now clear the local active-shift state.
    setLastClosedShift({
      ...log,
      shiftId: activeShift.id,
      openedAt: activeShift.openedAt,
      closedAt: log.timestamp,
      openedBy: currentUser.name,
      startingCash: activeShift.openingFloat,
      actualCash: parseFloat(actualClosingInput) || 0,
      notes,
    });
    setActiveShift(null);

    let backupDownloaded = false;
    try {
      const json = await exportFullDatabase();
      downloadJsonFile(json, `ceylonpets_backup_FULL_${new Date().toISOString().split('T')[0]}.json`);
      backupDownloaded = true;
    } catch (e) {
      if (import.meta.env.DEV) console.error('Daily shift backup failed:', e);
    }

    if (drawerMath.discrepancy !== 0) {
      showToast(`Warning: Drawer discrepancy of Rs. ${Math.abs(drawerMath.discrepancy).toFixed(2)} detected.`, 'warning');
    } else {
      showToast('Shift reconciled perfectly. Drawer is balanced.', 'success');
    }
    showToast(
      backupDownloaded
        ? 'Daily backup download started. Keep the file outside Supabase.'
        : 'Shift closed, but the daily backup failed. The day is not backed up; export it from Data & Operations now.',
      backupDownloaded ? 'success' : 'error'
    );
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return showToast('No active shift. Open register first.', 'error');
    const amt = parseFloat(adjAmount);
    if (!amt || amt <= 0) return showToast('Enter a valid amount.', 'error');
    if (!adjReason.trim()) return showToast('Reason is required.', 'error');

    const auth = await requireAuth(currentUser || null, 'cash_adjustment');
    if (!auth.allowed) {
      showToast('Authorization failed.', 'error');
      return;
    }

    const newAdj: CashAdjustment = {
      id: crypto.randomUUID(),
      type: adjType, amount: amt, category: adjCategory, reason: adjReason,
      date: new Date().toISOString(), createdBy: currentUser.name,
      shiftId: activeShift.id
    };

    try {
      await addCashAdjustment(newAdj);
    } catch (e: any) {
      showToast(`Failed to save adjustment: ${e.message}`, 'error');
      return;
    }
    setAdjustments(prev => [newAdj, ...prev]);
    setShowAdjModal(false); setAdjAmount(''); setAdjReason('');
    showToast(`Drawer ${adjType === 'IN' ? 'cash added' : 'cash removed'}: Rs. ${amt.toFixed(2)}`, 'success');
  };

  const handleDismissReceipt = () => {
    setLastClosedShift(null);
    setOpeningFloatInput('');
    setActualClosingInput('');
  };


  return (
    <>
      <PageShell
        title="Terminal Control Center"
        subtitle="Secure drawer management, cash adjustments & reconciliation"
        actions={
          <div className="flex items-center gap-3">
            {activeShift && (
              <button onClick={() => setShowAdjModal(true)} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl text-[10px] uppercase tracking-widest flex items-center gap-1.5 shadow-md transition-transform active:scale-95 cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> Adjust Drawer
              </button>
            )}
            <div className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-[10px] font-black shadow-xs flex items-center gap-1.5 uppercase tracking-wider">
              <User className="w-3.5 h-3.5" /> Clerk: <span className="bg-white px-2 py-0.5 rounded-xl border border-indigo-100">{currentUser.name}</span>
            </div>
          </div>
        }
      >
        <div className="flex-1 flex flex-col h-full gap-4 print:hidden" id="shift-manager-module">

        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          
          {/* VIEW A: Open Shift */}
          {!activeShift && !lastClosedShift && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="max-w-md w-full bg-slate-50 border border-slate-200 p-8 rounded-[2rem] shadow-inner space-y-6 text-center animate-fade-in">
                <div className="w-16 h-16 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <Lock className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Register is Closed</h3>
                  <p className="text-xs font-bold text-slate-500 mt-1">Enter the starting cash amount in the drawer to open the POS terminal.</p>
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">Starting Float (Rs.)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-xs font-black text-slate-400 font-mono">Rs.</span>
                    <input type="number" value={openingFloatInput} onChange={e => setOpeningFloatInput(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-lg font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      placeholder="0.00" />
                  </div>
                </div>
                <button onClick={handleOpenShift}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-xs uppercase tracking-widest cursor-pointer">
                  Open Register & Start Shift
                </button>
              </div>
            </div>
          )}

          {/* VIEW B: Active Shift — Full Drawer Dashboard */}
          {activeShift && !lastClosedShift && (
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Session Info Bar */}
              <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl flex justify-between items-center">
                <div>
                  <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Active Session</p>
                  <p className="text-xs text-indigo-900 font-bold mt-0.5">Opened at {new Date(activeShift.openedAt).toLocaleTimeString()} by {activeShift.openedByName}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest">Opening Float</p>
                  <p className="text-lg font-black font-mono text-indigo-900">{formatCurrency(activeShift.openingFloat)}</p>
                </div>
              </div>

              {/* Payment Method Breakdown */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <Banknote className="w-5 h-5 text-emerald-600 mx-auto mb-2" />
                  <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Cash Sales</p>
                  <p className="text-xl font-black font-mono text-emerald-900 mt-1">{formatCurrency(drawerMath.cashSales)}</p>
                </div>
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-center">
                  <CreditCard className="w-5 h-5 text-sky-600 mx-auto mb-2" />
                  <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Card Sales</p>
                  <p className="text-xl font-black font-mono text-sky-900 mt-1">{formatCurrency(drawerMath.cardSales)}</p>
                </div>
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-center">
                  <Building2 className="w-5 h-5 text-sky-600 mx-auto mb-2" />
                  <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Bank Transfers</p>
                  <p className="text-xl font-black font-mono text-sky-900 mt-1">{formatCurrency(drawerMath.bankSales)}</p>
                </div>
              </div>

              {/* Drawer Math Summary */}
              <div className="bg-slate-900 rounded-2xl p-4 text-white">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Drawer Balance Calculation</h3>
                <div className="space-y-2 font-mono text-xs">
                  <div className="flex justify-between border-b border-slate-700 pb-1"><span className="text-slate-400">Opening Float</span> <span>{formatCurrency(activeShift.openingFloat)}</span></div>
                  <div className="flex justify-between border-b border-slate-700 pb-1"><span className="text-emerald-400">+ Cash Sales</span> <span className="text-emerald-400">{formatCurrency(drawerMath.cashSales)}</span></div>
                  {drawerMath.adjustIn > 0 && <div className="flex justify-between border-b border-slate-700 pb-1"><span className="text-emerald-400">+ Cash Added</span> <span className="text-emerald-400">{formatCurrency(drawerMath.adjustIn)}</span></div>}
                  {drawerMath.adjustOut > 0 && <div className="flex justify-between border-b border-slate-700 pb-1"><span className="text-rose-400">− Cash Removed</span> <span className="text-rose-400">-{formatCurrency(drawerMath.adjustOut)}</span></div>}
                  <div className="flex justify-between pt-2 text-sm font-black text-amber-300"><span>= Expected Drawer Cash</span> <span>{formatCurrency(drawerMath.expectedCash)}</span></div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-700 flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-widest">
                  <span>{drawerMath.txCount} transactions this shift</span>
                  <span>Total Revenue: {formatCurrency(drawerMath.totalRevenue)}</span>
                </div>
              </div>

              {/* Cash Adjustments Log */}
              {adjustments.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-3 border-b border-slate-200">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cash Adjustments This Shift</h3>
                  </div>
                  <div className="max-h-40 overflow-y-auto p-2 space-y-1.5">
                    {adjustments.map(adj => (
                      <div key={adj.id} className="p-3 bg-white border border-slate-100 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <Badge tone={adj.type === 'IN' ? 'emerald' : 'rose'}>{adj.category}</Badge>
                          <span className="ml-2 font-bold text-slate-700">{adj.reason}</span>
                        </div>
                        <span className={`font-black font-mono ${adj.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {adj.type === 'IN' ? '+' : '-'}{formatCurrency(adj.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Close Shift Section */}
              <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-4 space-y-4">
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest text-center">End of Shift Reconciliation</h3>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block pl-1">Actual Counted Drawer Cash</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-xs font-black text-indigo-400 font-mono">Rs.</span>
                    <input type="number" value={actualClosingInput} onChange={e => setActualClosingInput(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white border-2 border-indigo-200 rounded-xl text-lg font-mono font-black text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      placeholder="0.00" />
                  </div>
                </div>
                {actualClosingInput && (
                  <div className={`p-3 rounded-xl text-center font-black text-sm ${drawerMath.discrepancy === 0 ? 'bg-emerald-100 text-emerald-800' : drawerMath.discrepancy > 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                    {drawerMath.discrepancy === 0 ? '✓ BALANCED' : drawerMath.discrepancy > 0 ? `+${formatCurrency(drawerMath.discrepancy)} OVER` : `${formatCurrency(drawerMath.discrepancy)} SHORT`}
                  </div>
                )}
                <button onClick={handleCloseShift}
                  className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-xl shadow-lg transition-colors text-xs uppercase tracking-widest cursor-pointer">
                  Reconcile & Close Register
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cash Adjustment Modal */}
      <Modal
        open={showAdjModal}
        onClose={() => setShowAdjModal(false)}
        size="sm"
        title={
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600"/> 
            <span className="text-sm font-black uppercase tracking-widest text-slate-800">Adjust Drawer Cash</span>
          </div>
        }
        footer={
          <>
            <button type="button" onClick={() => setShowAdjModal(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors">Cancel</button>
            <button type="submit" form="adjForm" className={`flex-[2] py-3 text-white font-black rounded-xl text-xs uppercase tracking-widest shadow-md transition-colors cursor-pointer ${adjType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
              Confirm {adjType === 'IN' ? 'Cash Addition' : 'Cash Removal'}
            </button>
          </>
        }
      >
        <form id="adjForm" onSubmit={handleSaveAdjustment} className="space-y-5">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button type="button" onClick={() => setAdjType('OUT')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer ${adjType === 'OUT' ? 'bg-white shadow-sm text-rose-600 border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Take Cash Out</button>
                <button type="button" onClick={() => setAdjType('IN')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer ${adjType === 'IN' ? 'bg-white shadow-sm text-emerald-600 border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Add Cash In</button>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Amount</label>
                <input type="number" step="0.01" min="0" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="0.00"
                  className="w-full px-4 py-3 text-2xl font-black font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" autoFocus required />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Category</label>
                <select value={adjCategory} onChange={e => setAdjCategory(e.target.value as any)} className="w-full px-4 py-3 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 cursor-pointer">
                  {adjType === 'OUT' ? (
                    <>
                      <option value="Expense">Business Expense (Supplies, Bills)</option>
                      <option value="Owner Draw">Owner Draw / Payout</option>
                      <option value="Other">Other Outflow</option>
                    </>
                  ) : (
                    <>
                      <option value="Income">Non-Invoice Income</option>
                      <option value="Starting Float">Starting Register Float</option>
                      <option value="Investment">Owner Investment</option>
                      <option value="Other">Other Inflow</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Reason / Details</label>
                <input type="text" value={adjReason} onChange={e => setAdjReason(e.target.value)} placeholder="e.g. Bought cleaning supplies..."
                  className="w-full px-4 py-3 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500" required />
              </div>
        </form>
      </Modal>

      {/* VIEW C: Z-Report Print Modal */}
            {/* VIEW C: Z-Report Print Modal */}
      <Modal
        open={!!lastClosedShift}
        onClose={() => setLastClosedShift(null)}
        size="sm"
        title={<span className="text-sm font-black text-slate-800 uppercase tracking-widest">End of Day (Z-Report)</span>}
        icon={<div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl print:hidden"><FileText className="w-5 h-5"/></div>}
        headerActions={
          <button onClick={() => window.print()} className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl cursor-pointer transition-colors print:hidden"><Printer className="w-4 h-4"/></button>
        }
        footer={
          <button onClick={() => setLastClosedShift(null)} className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs uppercase tracking-widest shadow-lg transition-colors cursor-pointer print:hidden">Done</button>
        }
      >
        <div className="print:p-0 print:bg-white print:block print:static relative -mx-6 -my-4 p-6 text-sm">
          <div className="text-center border-b border-slate-200 pb-4 mb-6">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Veterinary Hospital</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">End of Day (Z-Report)</p>
          </div>
          
          <div className="space-y-2 mb-6 text-xs font-mono font-bold text-slate-700">
            <div className="flex justify-between"><span>Shift ID:</span> <span>{lastClosedShift?.shiftId}</span></div>
            <div className="flex justify-between"><span>Opened:</span> <span>{new Date(lastClosedShift?.openedAt || '').toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Closed:</span> <span>{new Date(lastClosedShift?.closedAt || '').toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Cashier:</span> <span>{lastClosedShift?.openedBy}</span></div>
          </div>

          <div className="border-t border-b border-slate-200 py-4 mb-6 space-y-3">
            <div className="flex justify-between font-bold text-slate-600">
              <span>Starting Drawer Float</span>
              <span className="font-mono">Rs.{(lastClosedShift?.startingCash || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-600">
              <span>Cash Invoices & Adjustments</span>
              <span className="font-mono text-emerald-600">+Rs.{((lastClosedShift?.actualCash || 0) - (lastClosedShift?.startingCash || 0)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-black text-slate-900 text-base pt-2 border-t border-slate-100">
              <span>Actual Cash in Drawer</span>
              <span className="font-mono">Rs.{(lastClosedShift?.actualCash || 0).toFixed(2)}</span>
            </div>
            
            {lastClosedShift?.discrepancy !== 0 && (
              <div className="flex justify-between font-black text-rose-600 bg-rose-50 p-2 rounded-lg mt-2">
                <span>Discrepancy (Overage/Shortage)</span>
                <span className="font-mono">Rs.{(lastClosedShift?.discrepancy || 0).toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="space-y-1 mb-10 text-xs font-bold text-slate-500">
            {lastClosedShift?.notes && <p className="mb-2 italic text-slate-600">"{lastClosedShift.notes}"</p>}
            <p>System automatically syncs Z-reports to the cloud ledger.</p>
          </div>

          <div className="flex justify-between pt-10 border-t border-slate-300">
            <div className="text-center w-32 border-t border-slate-800 pt-1 text-xs font-black">Cashier Sign</div>
            <div className="text-center w-32 border-t border-slate-800 pt-1 text-xs font-black">Manager Sign</div>
          </div>
        </div>
      </Modal>
      </PageShell>
    </>
  );
}
