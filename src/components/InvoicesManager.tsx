import React, { useState, useEffect } from 'react';
import localforage from 'localforage';
import { TrendingUp, AlertCircle, Receipt, Search, X, Printer } from 'lucide-react';

// --- Types & Interfaces ---
interface Invoice {
  id: string;
  clientId: string;
  clientName: string;
  patientName: string;
  date: string; // ISO String
  amountCents: number; // Raw integer cents
  method: 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';
  status: 'PAID' | 'UNPAID' | 'PARTIAL';
}

interface KPIStats {
  revenueToday: number;
  unpaidInvoices: number;
  totalTransactions: number;
}

// --- Constants ---
const DB_NAME = 'ceylonpets-vhms';
const STORE_NAME = 'invoices';

// Initialize localforage for IndexedDB
const db = localforage.createInstance({
  name: DB_NAME,
  storeName: STORE_NAME,
  driver: localforage.INDEXEDDB,
});

// --- Helper Functions ---
const formatCurrency = (cents: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
};

const formatDate = (isoString: string): string => {
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const getStatusColor = (status: Invoice['status']): string => {
  switch (status) {
    case 'PAID': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'UNPAID': return 'bg-rose-100 text-rose-700 border-rose-200';
    case 'PARTIAL': return 'bg-amber-100 text-amber-700 border-amber-200';
    default: return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

const getMethodIcon = (method: Invoice['method']): string => {
  switch (method) {
    case 'CASH': return '💵';
    case 'CARD': return '💳';
    case 'TRANSFER': return '🏦';
    default: return '🧾';
  }
};

// --- Main Component ---
export default function InvoicesManager() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<KPIStats>({ revenueToday: 0, unpaidInvoices: 0, totalTransactions: 0 });
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'UNPAID' | 'PARTIAL'>('ALL');

  // Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const allInvoices: Invoice[] = [];
        await db.iterate((value: Invoice) => { allInvoices.push(value); });
        allInvoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setInvoices(allInvoices);
        calculateStats(allInvoices);
      } catch (error) {
        console.error('Failed to load invoices:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Calculate KPIs
  const calculateStats = (data: Invoice[]) => {
    const today = new Date().toDateString();
    const revenueTodayCents = data
      .filter(inv => inv.status === 'PAID' && new Date(inv.date).toDateString() === today)
      .reduce((sum, inv) => sum + inv.amountCents, 0);
    const unpaidCount = data.filter(inv => inv.status === 'UNPAID' || inv.status === 'PARTIAL').length;

    setStats({ revenueToday: revenueTodayCents, unpaidInvoices: unpaidCount, totalTransactions: data.length });
  };

  // Filter Logic
  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          inv.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          inv.patientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-slate-50 w-full overflow-hidden font-sans relative">

      {/* Header */}
      <header className="flex-none px-8 py-6 bg-white border-b border-slate-200 shrink-0 z-10 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Financial Hub</h1>
            <p className="text-sm font-bold text-slate-500 mt-1">Real-time enterprise ledger & analytics</p>
          </div>
        </div>
      </header>

      {/* Main Scrollable Area */}
      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-center gap-5 transition-all hover:shadow-md hover:border-emerald-300 group">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Revenue Today</h3>
              <div className="text-2xl font-black text-slate-800 font-mono">{formatCurrency(stats.revenueToday)}</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-center gap-5 transition-all hover:shadow-md hover:border-rose-300 group">
            <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <AlertCircle className="w-7 h-7 text-rose-600" />
            </div>
            <div>
              <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Unpaid Balance</h3>
              <div className="text-2xl font-black text-rose-600 font-mono">{stats.unpaidInvoices} <span className="text-xs text-slate-400 font-sans tracking-normal font-bold">Pending</span></div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-center gap-5 transition-all hover:shadow-md hover:border-indigo-300 group">
            <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Receipt className="w-7 h-7 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Lifetime Ledgers</h3>
              <div className="text-2xl font-black text-slate-800 font-mono">{stats.totalTransactions}</div>
            </div>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex flex-col lg:flex-row justify-between items-center gap-4 mb-6 bg-white p-2 rounded-2xl shadow-sm border border-slate-200 shrink-0">
          <form className="relative w-full lg:w-96" onSubmit={(e) => e.preventDefault()}>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text" placeholder="Search Invoice ID, Client, or Patient..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all placeholder:text-slate-400"
            />
          </form>
          
          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 w-full lg:w-auto overflow-x-auto custom-scrollbar">
            {(['ALL', 'PAID', 'UNPAID', 'PARTIAL'] as const).map(status => (
              <button
                key={status} onClick={() => setStatusFilter(status)}
                className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === status 
                    ? status === 'PAID' ? 'bg-emerald-100 text-emerald-700 shadow-sm border border-emerald-200'
                    : status === 'UNPAID' ? 'bg-rose-100 text-rose-700 shadow-sm border border-rose-200'
                    : status === 'PARTIAL' ? 'bg-amber-100 text-amber-700 shadow-sm border border-amber-200'
                    : 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
                }`}
              >
                {status === 'ALL' ? 'All Records' : status}
              </button>
            ))}
          </div>
        </div>

        {/* Data Table Container */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col shrink-0">
          <div className="overflow-auto custom-scrollbar flex-1 max-h-[calc(100vh-380px)]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">Date</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">Invoice ID</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">Client / Patient</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 text-right">Amount</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">Method</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="animate-pulse flex justify-center items-center gap-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                      </div>
                      <span className="mt-4 block text-[10px] font-black text-slate-400 uppercase tracking-widest">Syncing Vault...</span>
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                      <span className="block text-4xl mb-3 opacity-50">🔍</span>
                      <span className="text-xs font-black uppercase tracking-widest">No ledgers found</span>
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr key={inv.id} onClick={() => setSelectedInvoice(inv)} className="hover:bg-indigo-50/50 transition-colors group cursor-pointer">
                      <td className="px-6 py-4 text-[11px] font-bold text-slate-500 whitespace-nowrap">{formatDate(inv.date)}</td>
                      <td className="px-6 py-4 text-xs font-black font-mono text-indigo-600 whitespace-nowrap">#{inv.id.slice(0, 8)}</td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-black text-slate-800">{inv.clientName}</div>
                        <div className="text-[10px] font-bold text-slate-500 mt-0.5">Patient: {inv.patientName}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-black text-slate-800 whitespace-nowrap font-mono">{formatCurrency(inv.amountCents)}</td>
                      <td className="px-6 py-4 text-xs whitespace-nowrap">
                        <span className="flex items-center gap-2 font-bold bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg w-max text-slate-600">
                          <span>{getMethodIcon(inv.method)}</span><span className="uppercase text-[9px] tracking-widest font-black">{inv.method}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-xs ${getStatusColor(inv.status)}`}>{inv.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400 flex justify-between items-center shrink-0">
            <span>Showing {filteredInvoices.length} of {invoices.length} records</span>
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div> Secure IndexedDB Vault</span>
          </div>
        </div>
      </main>

      {/* Slide-Out Receipt Modal */}
      {selectedInvoice && (
        <div className="absolute inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 transform transition-transform duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Official Receipt</div>
                <div className="text-lg font-black text-slate-800 font-mono">#{selectedInvoice.id.slice(0, 8)}</div>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-white custom-scrollbar relative">
              <div className="text-center mb-8 border-b border-slate-100 pb-8">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Ash Point Solutions</h2>
                <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">Veterinary Medical Hub</p>
              </div>
              <div className="space-y-6">
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-end mb-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Billed To</span>
                    <span className="text-[11px] font-bold text-slate-500">{formatDate(selectedInvoice.date)}</span>
                  </div>
                  <div className="font-black text-slate-800 text-sm">{selectedInvoice.clientName}</div>
                  <div className="text-[11px] font-bold text-slate-500 mt-0.5">Patient: {selectedInvoice.patientName}</div>
                </div>
                <div className="border-t border-dashed border-slate-200 pt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment Method</span>
                    <span className="text-[11px] font-black text-slate-700 flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg">{getMethodIcon(selectedInvoice.method)} {selectedInvoice.method}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${getStatusColor(selectedInvoice.status)}`}>{selectedInvoice.status}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0">
              <div className="flex justify-between items-center mb-5">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Net Total</span>
                <span className="text-3xl font-black text-slate-900 font-mono tracking-tight">{formatCurrency(selectedInvoice.amountCents)}</span>
              </div>
              <button onClick={() => window.print()} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer">
                <Printer className="w-4 h-4" /> Print Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}