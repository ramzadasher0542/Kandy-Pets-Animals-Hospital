/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Calculator, AlertTriangle, CheckCircle2, FileText, User, Printer, Plus, DollarSign, Banknote, CreditCard, Building2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Invoice, ShiftReconciliation, User as StaffUser, ActiveShift } from '../types';
import { showToast } from './Toast';
import localforage from 'localforage';

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

interface ShiftManagerProps {
  invoices: Invoice[];
  currentUser: StaffUser;
  activeShift: ActiveShift | null;
  setActiveShift: (s: ActiveShift | null) => void;
  onSaveShift: (log: ShiftReconciliation) => void;
}

const cashDb = localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'cash_adjustments' });
const formatCurrency = (v: number) => `Rs. ${v.toFixed(2)}`;

export default function ShiftManager({ invoices, currentUser, activeShift, setActiveShift, onSaveShift }: ShiftManagerProps) {
  const [openingFloatInput, setOpeningFloatInput] = useState('');
  const [actualClosingInput, setActualClosingInput] = useState('');
  const [lastClosedShift, setLastClosedShift] = useState<ShiftReconciliation | null>(null);

  // Cash Adjustment State
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjType, setAdjType] = useState<'IN' | 'OUT'>('OUT');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjCategory, setAdjCategory] = useState<CashAdjustment['category']>('Expense');
  const [adjReason, setAdjReason] = useState('');
  const [adjustments, setAdjustments] = useState<CashAdjustment[]>([]);

  // Load adjustments for current shift
  useEffect(() => {
    if (!activeShift) { setAdjustments([]); return; }
    const load = async () => {
      const adjs: CashAdjustment[] = [];
      await cashDb.iterate((val: CashAdjustment) => {
        if (val && val.shiftId === activeShift.id) adjs.push(val);
      });
      setAdjustments(adjs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
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

    const shiftInvoices = invoices.filter(inv =>
      inv.paymentStatus === 'paid' && inv.shiftId === activeShift.id
    );

    const cashSales = shiftInvoices.filter(i => i.paymentMethod === 'cash').reduce((s, i) => s + (i.sales_total || 0), 0);
    const cardSales = shiftInvoices.filter(i => i.paymentMethod === 'card').reduce((s, i) => s + (i.sales_total || 0), 0);
    const bankSales = shiftInvoices.filter(i => i.paymentMethod === 'bank_transfer').reduce((s, i) => s + (i.sales_total || 0), 0);

    const adjustIn = adjustments.filter(a => a.type === 'IN').reduce((s, a) => s + a.amount, 0);
    const adjustOut = adjustments.filter(a => a.type === 'OUT').reduce((s, a) => s + a.amount, 0);

    const expectedCash = activeShift.openingFloat + cashSales + adjustIn - adjustOut;
    const totalRevenue = cashSales + cardSales + bankSales;
    const actual = parseFloat(actualClosingInput) || 0;
    const discrepancy = actual - expectedCash;

    return { cashSales, cardSales, bankSales, adjustIn, adjustOut, expectedCash, totalRevenue, discrepancy, txCount: shiftInvoices.length };
  }, [invoices, activeShift, adjustments, actualClosingInput]);

  const handleOpenShift = () => {
    if (!openingFloatInput) { showToast('Please enter a starting float amount.', 'error'); return; }
    const newShift: ActiveShift = {
      id: crypto.randomUUID(),
      openedAt: new Date().toISOString(),
      openedBy: currentUser.username,
      openedByName: currentUser.name,
      openingFloat: parseFloat(openingFloatInput) || 0
    };
    setActiveShift(newShift);
    showToast('Register opened and active shift started.', 'success');
  };

  const handleCloseShift = () => {
    if (!activeShift) return;
    if (actualClosingInput === '') { showToast('Please enter the actual counted drawer cash.', 'error'); return; }

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
      status: drawerMath.discrepancy === 0 ? 'balanced' : 'discrepancy'
    };

    onSaveShift(log);
    setLastClosedShift(log);
    setActiveShift(null);

    if (drawerMath.discrepancy !== 0) {
      showToast(`Warning: Drawer discrepancy of Rs. ${Math.abs(drawerMath.discrepancy).toFixed(2)} detected.`, 'warning');
    } else {
      showToast('Shift reconciled perfectly. Drawer is balanced.', 'success');
    }
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return showToast('No active shift. Open register first.', 'error');
    const amt = parseFloat(adjAmount);
    if (!amt || amt <= 0) return showToast('Enter a valid amount.', 'error');
    if (!adjReason.trim()) return showToast('Reason is required.', 'error');

    const newAdj: CashAdjustment = {
      id: `CASH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      type: adjType, amount: amt, category: adjCategory, reason: adjReason,
      date: new Date().toISOString(), createdBy: currentUser.name,
      shiftId: activeShift.id
    };

    await cashDb.setItem(newAdj.id, newAdj);
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
      <div className="flex-1 flex flex-col h-[calc(100vh-140px)] gap-4 print:hidden" id="shift-manager-module">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
              <Lock className="w-5 h-5 text-indigo-600" /> Terminal Control Center
            </h2>
            <p className="text-xs text-slate-500 font-bold mt-0.5">Secure drawer management, cash adjustments & reconciliation</p>
          </div>
          <div className="flex items-center gap-3">
            {activeShift && (
              <button onClick={() => setShowAdjModal(true)} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl text-[10px] uppercase tracking-widest flex items-center gap-1.5 shadow-md transition-transform active:scale-95 cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> Adjust Drawer
              </button>
            )}
            <div className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-[10px] font-extrabold shadow-xs flex items-center gap-1.5 uppercase tracking-wider">
              <User className="w-3.5 h-3.5" /> Clerk: <span className="bg-white px-2 py-0.5 rounded-md border border-indigo-100">{currentUser.name}</span>
            </div>
          </div>
        </div>

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
                  <p className="text-xs font-semibold text-slate-500 mt-1">Enter the starting cash amount in the drawer to open the POS terminal.</p>
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">Starting Float (LKR)</label>
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
                  <p className="text-xs text-indigo-900 font-semibold mt-0.5">Opened at {new Date(activeShift.openedAt).toLocaleTimeString()} by {activeShift.openedByName}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-indigo-500 font-bold uppercase tracking-widest">Opening Float</p>
                  <p className="text-lg font-black font-mono text-indigo-900">{formatCurrency(activeShift.openingFloat)}</p>
                </div>
              </div>

              {/* Payment Method Breakdown */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <Banknote className="w-5 h-5 text-emerald-600 mx-auto mb-2" />
                  <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Cash Sales</p>
                  <p className="text-xl font-black font-mono text-emerald-900 mt-1">{formatCurrency(drawerMath.cashSales)}</p>
                </div>
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-center">
                  <CreditCard className="w-5 h-5 text-sky-600 mx-auto mb-2" />
                  <p className="text-[9px] font-black text-sky-700 uppercase tracking-widest">Card Sales</p>
                  <p className="text-xl font-black font-mono text-sky-900 mt-1">{formatCurrency(drawerMath.cardSales)}</p>
                </div>
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-center">
                  <Building2 className="w-5 h-5 text-violet-600 mx-auto mb-2" />
                  <p className="text-[9px] font-black text-violet-700 uppercase tracking-widest">Bank Transfers</p>
                  <p className="text-xl font-black font-mono text-violet-900 mt-1">{formatCurrency(drawerMath.bankSales)}</p>
                </div>
              </div>

              {/* Drawer Math Summary */}
              <div className="bg-slate-900 rounded-2xl p-5 text-white">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Drawer Balance Calculation</h3>
                <div className="space-y-2 font-mono text-xs">
                  <div className="flex justify-between border-b border-slate-700 pb-1"><span className="text-slate-400">Opening Float</span> <span>{formatCurrency(activeShift.openingFloat)}</span></div>
                  <div className="flex justify-between border-b border-slate-700 pb-1"><span className="text-emerald-400">+ Cash Sales</span> <span className="text-emerald-400">{formatCurrency(drawerMath.cashSales)}</span></div>
                  {drawerMath.adjustIn > 0 && <div className="flex justify-between border-b border-slate-700 pb-1"><span className="text-emerald-400">+ Cash Added</span> <span className="text-emerald-400">{formatCurrency(drawerMath.adjustIn)}</span></div>}
                  {drawerMath.adjustOut > 0 && <div className="flex justify-between border-b border-slate-700 pb-1"><span className="text-rose-400">− Cash Removed</span> <span className="text-rose-400">-{formatCurrency(drawerMath.adjustOut)}</span></div>}
                  <div className="flex justify-between pt-2 text-sm font-black text-yellow-300"><span>= Expected Drawer Cash</span> <span>{formatCurrency(drawerMath.expectedCash)}</span></div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-700 flex justify-between items-center text-[9px] text-slate-500 uppercase tracking-widest">
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
                      <div key={adj.id} className="p-3 bg-white border border-slate-100 rounded-lg flex justify-between items-center text-xs">
                        <div>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${adj.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{adj.category}</span>
                          <span className="ml-2 font-semibold text-slate-700">{adj.reason}</span>
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
              <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-5 space-y-4">
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
      {showAdjModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
            <div className="p-6 bg-slate-900 flex justify-between items-center">
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-400"/> Adjust Drawer Cash</h3>
              <button onClick={() => setShowAdjModal(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleSaveAdjustment} className="p-6 space-y-5">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button type="button" onClick={() => setAdjType('OUT')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer ${adjType === 'OUT' ? 'bg-white shadow-sm text-rose-600 border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Take Cash Out</button>
                <button type="button" onClick={() => setAdjType('IN')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer ${adjType === 'IN' ? 'bg-white shadow-sm text-emerald-600 border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Add Cash In</button>
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
                  className="w-full px-4 py-3 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500" required />
              </div>
              <div className="pt-2">
                <button type="submit" className={`w-full py-4 text-white font-black rounded-xl text-xs uppercase tracking-widest shadow-lg transition-transform active:scale-95 cursor-pointer ${adjType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                  Confirm {adjType === 'IN' ? 'Cash Addition' : 'Cash Removal'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* VIEW C: Z-Report Print Modal */}
      {lastClosedShift && createPortal(
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 print:p-0 print:bg-white print:block print:static">
          <div className="bg-white rounded-2xl w-full max-w-sm p-8 shadow-2xl relative print:shadow-none print:w-full print:max-w-none print:border-none print:p-0 animate-scale-up">
            
            <div className="text-center border-b border-slate-200 pb-4 mb-6">
              <h2 className="text-xl font-mono font-black text-slate-800 tracking-tight uppercase">Z-Report / End of Day</h2>
              <p className="text-[10px] font-mono text-slate-500 mt-1">{new Date(lastClosedShift.timestamp).toLocaleString()}</p>
            </div>

            <div className="space-y-2 font-mono text-xs text-slate-700 mb-6">
              <div className="flex justify-between border-b border-slate-100 pb-1"><span>Shift ID:</span> <span>{lastClosedShift.id.slice(0,8).toUpperCase()}</span></div>
              <div className="flex justify-between border-b border-slate-100 pb-1"><span>Cashier:</span> <span>{lastClosedShift.userName}</span></div>
              <div className="flex justify-between border-b border-slate-100 pb-1 mt-4"><span>Opening Float:</span> <span>{lastClosedShift.openingFloat.toFixed(2)}</span></div>
              <div className="flex justify-between border-b border-slate-100 pb-1"><span>Cash Sales:</span> <span>{lastClosedShift.cashSales.toFixed(2)}</span></div>
              <div className="flex justify-between border-b border-slate-100 pb-1 mt-4 font-bold text-slate-900"><span>Expected Drawer:</span> <span>{lastClosedShift.expectedClosing.toFixed(2)}</span></div>
              <div className="flex justify-between border-b border-slate-100 pb-1 font-bold text-slate-900"><span>Actual Cash:</span> <span>{lastClosedShift.actualClosing.toFixed(2)}</span></div>
              <div className={`flex justify-between pb-1 mt-4 font-black text-sm uppercase ${lastClosedShift.discrepancy === 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                <span>Discrepancy:</span> <span>{lastClosedShift.discrepancy.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 print:hidden">
              <button onClick={() => window.print()} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md text-xs uppercase tracking-widest">
                <Printer className="w-4 h-4" /> Print Z-Report
              </button>
              <button onClick={handleDismissReceipt} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs uppercase tracking-widest cursor-pointer transition-colors">
                Dismiss & Return to Open Shift
              </button>
            </div>
            
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
