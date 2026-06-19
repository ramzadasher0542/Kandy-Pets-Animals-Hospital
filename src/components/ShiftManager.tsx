/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Calculator, AlertTriangle, CheckCircle2, FileText, User, Printer } from 'lucide-react';
import { Invoice, ShiftReconciliation, User as StaffUser, ActiveShift } from '../types';
import { showToast } from './Toast';

interface ShiftManagerProps {
  invoices: Invoice[];
  currentUser: StaffUser;
  activeShift: ActiveShift | null;
  setActiveShift: (s: ActiveShift | null) => void;
  onSaveShift: (log: ShiftReconciliation) => void;
}

export default function ShiftManager({ invoices, currentUser, activeShift, setActiveShift, onSaveShift }: ShiftManagerProps) {
  const [openingFloatInput, setOpeningFloatInput] = useState('');
  const [actualClosingInput, setActualClosingInput] = useState('');
  const [lastClosedShift, setLastClosedShift] = useState<ShiftReconciliation | null>(null);

  // Math Engine: Calculate expected cash based on today's invoices handled since shift opened
  const { cashSales, expectedClosing, discrepancy } = useMemo(() => {
    if (!activeShift) return { cashSales: 0, expectedClosing: 0, discrepancy: 0 };
    
    const shiftStartTimeMs = new Date(activeShift.openedAt).getTime();
    
    const shiftInvoices = invoices.filter(inv => {
      // Use invoice ID as epoch timestamp for accuracy
      const invTimeMs = parseInt(inv.id) * 1000;
      return inv.paymentStatus === 'paid' && inv.paymentMethod === 'cash' && invTimeMs >= shiftStartTimeMs;
    });

    const totalCash = shiftInvoices.reduce((sum, inv) => sum + inv.sales_total, 0);
    const expected = activeShift.openingFloat + totalCash;
    const actual = parseFloat(actualClosingInput) || 0;
    const diff = actual - expected;

    return { cashSales: totalCash, expectedClosing: expected, discrepancy: diff };
  }, [invoices, activeShift, actualClosingInput]);

  const handleOpenShift = () => {
    if (!openingFloatInput) {
      showToast('Please enter a starting float amount.', 'error');
      return;
    }
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
    if (actualClosingInput === '') {
      showToast('Please enter the actual counted drawer cash.', 'error');
      return;
    }

    const log: ShiftReconciliation = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userId: currentUser.username,
      userName: currentUser.name,
      openingFloat: activeShift.openingFloat,
      cashSales,
      expectedClosing,
      actualClosing: parseFloat(actualClosingInput) || 0,
      discrepancy,
      status: discrepancy === 0 ? 'balanced' : 'discrepancy'
    };

    onSaveShift(log);
    setLastClosedShift(log);
    setActiveShift(null);

    if (discrepancy !== 0) {
      showToast(`Warning: Drawer discrepancy of Rs. ${Math.abs(discrepancy).toFixed(2)} detected.`, 'warning');
    } else {
      showToast('Shift reconciled perfectly. Drawer is balanced.', 'success');
    }
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
            <p className="text-xs text-slate-500 font-bold mt-0.5">Secure drawer management & reconciliation</p>
          </div>
          <div className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-[10px] font-extrabold shadow-xs flex items-center gap-1.5 uppercase tracking-wider">
            <User className="w-3.5 h-3.5" /> Clerk: <span className="bg-white px-2 py-0.5 rounded-md border border-indigo-100">{currentUser.name}</span>
          </div>
        </div>

        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex items-center justify-center p-6 relative">
          <div className="max-w-md w-full">
            
            {/* VIEW A: Open Shift */}
            {!activeShift && !lastClosedShift && (
              <div className="bg-slate-50 border border-slate-200 p-8 rounded-[2rem] shadow-inner space-y-6 text-center animate-fade-in">
                <div className="w-16 h-16 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <Lock className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Register is Closed</h3>
                  <p className="text-xs font-semibold text-slate-500 mt-1">Please enter the starting cash amount in the drawer to open the POS terminal.</p>
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">Starting Float (LKR)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-xs font-black text-slate-400 font-mono">Rs.</span>
                    <input 
                      type="number" 
                      value={openingFloatInput} onChange={e => setOpeningFloatInput(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-lg font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <button 
                  onClick={handleOpenShift}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-xs uppercase tracking-widest cursor-pointer"
                >
                  Open Register & Start Shift
                </button>
              </div>
            )}

            {/* VIEW B: Close Shift */}
            {activeShift && !lastClosedShift && (
              <div className="bg-slate-50 border border-slate-200 p-8 rounded-[2rem] shadow-inner space-y-6 animate-fade-in">
                <div className="text-center">
                  <Calculator className="w-12 h-12 text-indigo-500 mx-auto mb-3" />
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">End of Shift Tally</h3>
                  <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl mt-4 text-left">
                    <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Active Session Details</p>
                    <p className="text-xs text-indigo-900 font-semibold mt-1">Opened at {new Date(activeShift.openedAt).toLocaleTimeString()} by {activeShift.openedByName} with starting float of Rs. {activeShift.openingFloat.toFixed(2)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block pl-1">Actual Counted Drawer Cash</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-xs font-black text-indigo-400 font-mono">Rs.</span>
                    <input 
                      type="number" 
                      value={actualClosingInput} onChange={e => setActualClosingInput(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white border-2 border-indigo-200 rounded-xl text-lg font-mono font-black text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                  <button 
                    onClick={handleCloseShift}
                    className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-xl shadow-lg transition-colors text-xs uppercase tracking-widest cursor-pointer"
                  >
                    Reconcile & Close Register
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
