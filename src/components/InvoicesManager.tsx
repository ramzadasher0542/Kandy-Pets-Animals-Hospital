import React, { useState, useEffect } from 'react';
import localforage from 'localforage';

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
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getStatusColor = (status: Invoice['status']): string => {
  switch (status) {
    case 'PAID': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'UNPAID': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    case 'PARTIAL': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
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

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'UNPAID' | 'PARTIAL'>('ALL');

  // Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const allInvoices: Invoice[] = [];

        await db.iterate((value: Invoice) => {
          allInvoices.push(value);
        });

        // Sort by date descending
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

    setStats({
      revenueToday: revenueTodayCents,
      unpaidInvoices: unpaidCount,
      totalTransactions: data.length,
    });
  };

  // Filter Logic
  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch =
      inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.patientName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-200 flex flex-col h-screen w-screen overflow-hidden font-sans">

      {/* Header */}
      <header className="flex-none px-8 py-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
        <h1 className="text-2xl font-bold tracking-tight text-white">Financial Hub</h1>
        <p className="text-sm text-slate-400 mt-1">Real-time invoice analytics and ledger management</p>
      </header>

      {/* Main Scrollable Area */}
      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Revenue Today */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="text-6xl">💰</span>
            </div>
            <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">Revenue Today</h3>
            <div className="mt-2 text-3xl font-bold text-emerald-400">
              {formatCurrency(stats.revenueToday)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Paid transactions only</div>
          </div>

          {/* Unpaid Invoices */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="text-6xl">⚠️</span>
            </div>
            <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">Unpaid Invoices</h3>
            <div className="mt-2 text-3xl font-bold text-rose-400">
              {stats.unpaidInvoices}
            </div>
            <div className="mt-1 text-xs text-slate-500">Requires attention</div>
          </div>

          {/* Total Transactions */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="text-6xl">📊</span>
            </div>
            <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">Total Transactions</h3>
            <div className="mt-2 text-3xl font-bold text-blue-400">
              {stats.totalTransactions}
            </div>
            <div className="mt-1 text-xs text-slate-500">Lifetime records</div>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex justify-between items-center mb-4">
          <form className="flex gap-4" onSubmit={(e) => e.preventDefault()}>
            <input
              type="text"
              placeholder="Search ID, Client, or Patient..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-80 placeholder-slate-600 transition-all"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-900 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="PAID">Paid</option>
              <option value="UNPAID">Unpaid</option>
              <option value="PARTIAL">Partial</option>
            </select>
          </form>
        </div>

        {/* Data Table Container */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 400px)' }}>
          <div className="overflow-auto custom-scrollbar flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-950 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">Date</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">Invoice ID</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">Client / Patient</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 text-right">Amount</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">Method</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <div className="animate-pulse flex justify-center items-center gap-2">
                        <div className="w-2 h-2 bg-slate-600 rounded-full"></div>
                        <div className="w-2 h-2 bg-slate-600 rounded-full"></div>
                        <div className="w-2 h-2 bg-slate-600 rounded-full"></div>
                      </div>
                      <span className="mt-2 block text-sm">Syncing with Vault...</span>
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <span className="block text-4xl mb-2 opacity-50">🔍</span>
                      No invoices found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="px-6 py-4 text-sm text-slate-300 whitespace-nowrap">
                        {formatDate(inv.date)}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-slate-400 whitespace-nowrap">
                        #{inv.id.slice(0, 8)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="font-medium text-slate-200">{inv.clientName}</div>
                        <div className="text-xs text-slate-500">{inv.patientName}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-slate-200 whitespace-nowrap">
                        {formatCurrency(inv.amountCents)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-300 whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          <span>{getMethodIcon(inv.method)}</span>
                          <span className="uppercase text-xs tracking-wide">{inv.method}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(inv.status)}`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="bg-slate-950 px-6 py-3 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center">
            <span>Showing {filteredInvoices.length} of {invoices.length} records</span>
            <span>Data Source: IndexedDB (localforage)</span>
          </div>
        </div>

      </main>

      {/* Global Styles for Scrollbar */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0f172a; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155; 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569; 
        }
      `}</style>
    </div>
  );
}