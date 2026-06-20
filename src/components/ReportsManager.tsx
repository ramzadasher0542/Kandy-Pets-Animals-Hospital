import React, { useState, useEffect } from 'react';
import localforage from 'localforage';
import { Wallet, DollarSign, TrendingUp, TrendingDown, Plus, ArrowDownRight, ArrowUpRight, ShieldCheck, FileText } from 'lucide-react';
import { showToast } from './Toast';

// --- Types ---
interface CashAdjustment {
  id: string;
  type: 'IN' | 'OUT';
  amount: number;
  category: 'Expense' | 'Income' | 'Investment' | 'Owner Draw' | 'Starting Float' | 'Other';
  reason: string;
  date: string;
  createdBy: string;
}

// Support both legacy and new invoice schemas
interface VaultInvoice {
  id: string;
  date: string;
  method?: string;
  paymentMethod?: string;
  status?: string;
  paymentStatus?: string;
  sales_total?: number;
  amountCents?: number;
  profit?: number;
}

// --- DB Initialization ---
const invoicesDb = localforage.createInstance({ name: 'ceylonpets-vhms', storeName: 'invoices' });
const cashDb = localforage.createInstance({ name: 'ceylonpets-vhms', storeName: 'cash_adjustments' });

export default function ReportsManager() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<VaultInvoice[]>([]);
  const [adjustments, setAdjustments] = useState<CashAdjustment[]>([]);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [adjType, setAdjType] = useState<'IN' | 'OUT'>('OUT');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjCategory, setAdjCategory] = useState<CashAdjustment['category']>('Expense');
  const [adjReason, setAdjReason] = useState('');

  // Metrics
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    grossProfit: 0,
    cashSales: 0,
    cashIn: 0,
    cashOut: 0,
    vaultBalance: 0
  });

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const loadData = async () => {
    setLoading(true);
    try {
      const invs: VaultInvoice[] = [];
      await invoicesDb.iterate((val: VaultInvoice) => { invs.push(val); });
      
      const adjs: CashAdjustment[] = [];
      await cashDb.iterate((val: CashAdjustment) => { adjs.push(val); });
      
      // Sort descending
      adjs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setInvoices(invs);
      setAdjustments(adjs);
      calculateMetrics(invs, adjs);
    } catch (e) {
      console.error("Vault Error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const calculateMetrics = (invs: VaultInvoice[], adjs: CashAdjustment[]) => {
    let rev = 0; let prof = 0; let cSales = 0;
    
    // Only calculate PAID invoices
    const paidInvs = invs.filter(i => i.status === 'PAID' || i.paymentStatus === 'paid');
    
    paidInvs.forEach(inv => {
      const total = inv.sales_total || (inv.amountCents ? inv.amountCents / 100 : 0);
      rev += total;
      prof += inv.profit || (total * 0.4); // fallback 40% margin if legacy data
      
      const method = (inv.paymentMethod || inv.method || '').toLowerCase();
      if (method === 'cash') cSales += total;
    });

    let cIn = 0; let cOut = 0;
    adjs.forEach(a => {
      if (a.type === 'IN') cIn += a.amount;
      else cOut += a.amount;
    });

    setMetrics({
      totalRevenue: rev,
      grossProfit: prof,
      cashSales: cSales,
      cashIn: cIn,
      cashOut: cOut,
      vaultBalance: cSales + cIn - cOut
    });
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(adjAmount);
    if (!amt || amt <= 0) return showToast('Enter a valid amount', 'error');
    if (!adjReason.trim()) return showToast('Reason is required', 'error');

    const newAdj: CashAdjustment = {
      id: `CASH-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
      type: adjType, amount: amt, category: adjCategory, reason: adjReason,
      date: new Date().toISOString(), createdBy: 'Admin'
    };

    await cashDb.setItem(newAdj.id, newAdj);
    const newAdjs = [newAdj, ...adjustments];
    setAdjustments(newAdjs);
    calculateMetrics(invoices, newAdjs);
    
    setShowModal(false); setAdjAmount(''); setAdjReason('');
    showToast('Vault adjustment recorded successfully', 'success');
  };

  if (loading) return <div className="h-full flex items-center justify-center bg-slate-50"><div className="animate-pulse font-black tracking-widest text-slate-400 uppercase">Unlocking Vault...</div></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-slate-50 w-full overflow-hidden font-sans relative">
      
      {/* Executive Header */}
      <header className="flex-none px-8 py-8 bg-slate-900 shrink-0 z-10 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5"><ShieldCheck className="w-32 h-32 text-white" /></div>
        <div className="relative z-10 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">Owner's Vault</h1>
            <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-widest">Financial Reports & Cash Management</p>
          </div>
          <button onClick={() => setShowModal(true)} className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl text-[11px] uppercase tracking-widest flex items-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer">
            <Plus className="w-4 h-4" /> Adjust Cash Vault
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 h-full">
          
          {/* Left Column: Financial Performance */}
          <div className="xl:col-span-2 space-y-8">
            <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase"><TrendingUp className="w-4 h-4 text-indigo-500" /> Revenue & Margins</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Total Gross Revenue</span>
                <span className="text-4xl font-black text-slate-900 font-mono tracking-tight">{formatCurrency(metrics.totalRevenue)}</span>
              </div>
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500"></div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block mb-2">Profit</span>
                <span className="text-4xl font-black text-emerald-600 font-mono tracking-tight">{formatCurrency(metrics.grossProfit)}</span>
                <span className="text-[9px] font-bold text-slate-400 mt-2 block">* Gross margin tracking. Net profit handled externally.</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col items-center justify-center py-16">
               <FileText className="w-12 h-12 text-slate-200 mb-4" />
               <h3 className="text-sm font-black text-slate-800 mb-1">Detailed Ledger Export</h3>
               <p className="text-xs text-slate-500 font-semibold mb-6">Download your full transaction history for your accountant.</p>
               <button className="px-6 py-2.5 border-2 border-indigo-100 text-indigo-600 hover:bg-indigo-50 font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors cursor-pointer">Export CSV Ledger</button>
            </div>
          </div>

          {/* Right Column: Cash Management System */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden h-[600px] xl:h-auto">
            <div className="p-6 bg-slate-900 border-b border-slate-800 shrink-0 text-center">
               <Wallet className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Physical Cash Vault Balance</span>
               <span className="text-4xl font-black text-white font-mono tracking-tight">{formatCurrency(metrics.vaultBalance)}</span>
               <div className="flex justify-center gap-4 mt-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                 <span className="flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-emerald-400"/> {formatCurrency(metrics.cashSales + metrics.cashIn)} IN</span>
                 <span className="flex items-center gap-1"><ArrowDownRight className="w-3 h-3 text-rose-400"/> {formatCurrency(metrics.cashOut)} OUT</span>
               </div>
            </div>
            
            <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
               <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cash Adjustment History</h3>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {adjustments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <span className="text-[10px] uppercase tracking-widest font-black text-center">No manual cash<br/>adjustments logged.</span>
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {adjustments.map(adj => (
                    <div key={adj.id} className="p-4 bg-white border border-slate-100 rounded-xl shadow-xs flex justify-between items-center group hover:border-slate-300 transition-colors">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${adj.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{adj.category}</span>
                          <span className="text-[9px] font-mono text-slate-400">{formatDate(adj.date)}</span>
                        </div>
                        <div className="text-xs font-black text-slate-800 line-clamp-1">{adj.reason}</div>
                      </div>
                      <div className={`text-sm font-black font-mono whitespace-nowrap ${adj.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {adj.type === 'IN' ? '+' : '-'}{formatCurrency(adj.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Cash Adjustment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
            <div className="p-6 bg-slate-900 flex justify-between items-center">
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-400"/> Log Cash Adjustment</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleSaveAdjustment} className="p-6 space-y-5">
              
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button type="button" onClick={() => setAdjType('OUT')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${adjType === 'OUT' ? 'bg-white shadow-sm text-rose-600 border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Take Cash Out</button>
                <button type="button" onClick={() => setAdjType('IN')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${adjType === 'IN' ? 'bg-white shadow-sm text-emerald-600 border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Add Cash In</button>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Amount</label>
                <input type="number" step="0.01" min="0" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="0.00" className="w-full px-4 py-3 text-2xl font-black font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" autoFocus required />
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
                <input type="text" value={adjReason} onChange={e => setAdjReason(e.target.value)} placeholder="e.g. Bought cleaning supplies..." className="w-full px-4 py-3 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500" required />
              </div>

              <div className="pt-2">
                <button type="submit" className={`w-full py-4 text-white font-black rounded-xl text-xs uppercase tracking-widest shadow-lg transition-transform active:scale-95 cursor-pointer ${adjType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                  Confirm {adjType === 'IN' ? 'Cash Addition' : 'Cash Removal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}