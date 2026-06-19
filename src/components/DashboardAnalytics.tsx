import React from 'react';
import { Activity, Clock, Users, AlertTriangle, PackageX, Calendar, CreditCard, ChevronRight } from 'lucide-react';
import { Appointment, InventoryItem, ActiveShift } from '../types';

interface DashboardProps {
  appointments?: Appointment[];
  inventory?: InventoryItem[];
  activeShift?: ActiveShift | null;
  onNavigate?: (tab: string) => void;
}

export default function DashboardAnalytics({ 
  appointments = [], 
  inventory = [], 
  activeShift = null, 
  onNavigate = () => {} 
}: DashboardProps) {
  
  const todayStr = new Date().toISOString().split('T')[0];

  // Traffic Calculations
  const todaysAppointments = appointments.filter(a => a.date.startsWith(todayStr));
  const waiting = todaysAppointments.filter(a => a.status === 'scheduled');
  const inSession = todaysAppointments.filter(a => a.status === 'in-progress');
  const completed = todaysAppointments.filter(a => a.status === 'completed');

  // Inventory SOS (Items at or below minimum stock threshold)
  const lowStockItems = inventory.filter(i => i.stock <= (i.minStock || 5));

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-slate-50 w-full overflow-hidden font-sans relative">
      {/* Header */}
      <header className="flex-none px-8 py-6 bg-white border-b border-slate-200 shrink-0 z-10 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Clinic Floor Ops</h1>
            <p className="text-sm font-bold text-slate-500 mt-1">Real-time patient traffic & facility status</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
        
        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Shift Status */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-center gap-5 transition-all hover:shadow-md group">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${activeShift ? 'bg-emerald-100' : 'bg-rose-100'}`}>
              <Activity className={`w-7 h-7 ${activeShift ? 'text-emerald-600' : 'text-rose-600'}`} />
            </div>
            <div>
              <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Active Register</h3>
              <div className={`text-xl font-black ${activeShift ? 'text-slate-800' : 'text-rose-600'}`}>
                {activeShift ? activeShift.openedBy : 'REGISTER CLOSED'}
              </div>
            </div>
          </div>

          {/* Patient Load */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-center gap-5 transition-all hover:shadow-md group">
            <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
              <Users className="w-7 h-7 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Today's Traffic</h3>
              <div className="text-xl font-black text-slate-800 font-mono">
                {todaysAppointments.length} <span className="text-xs text-slate-400 font-sans tracking-normal font-bold">Total Clients</span>
              </div>
            </div>
          </div>

          {/* Critical Stock */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-center gap-5 transition-all hover:shadow-md group">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${lowStockItems.length > 0 ? 'bg-amber-100 animate-pulse' : 'bg-slate-100'}`}>
              <AlertTriangle className={`w-7 h-7 ${lowStockItems.length > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
            </div>
            <div>
              <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Inventory SOS</h3>
              <div className="text-xl font-black text-slate-800 font-mono">
                {lowStockItems.length} <span className="text-xs text-slate-400 font-sans tracking-normal font-bold">Items Low</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Patient Radar */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[400px]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50 rounded-t-2xl">
              <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2"><Clock className="w-4 h-4 text-indigo-500" /> Live Patient Radar</h2>
              <div className="flex gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded shadow-xs">{waiting.length} Waiting</span>
                <span className="bg-sky-100 text-sky-700 px-2 py-0.5 rounded shadow-xs">{inSession.length} In Session</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3">
              {todaysAppointments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-3">
                  <Calendar className="w-10 h-10 opacity-50" />
                  <div className="text-xs font-bold uppercase tracking-widest text-center">No appointments<br/>scheduled today.</div>
                </div>
              ) : (
                todaysAppointments.map(apt => (
                  <div key={apt.id} className="flex justify-between items-center p-4 border border-slate-100 rounded-xl bg-white hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer">
                    <div>
                      <div className="text-sm font-black text-slate-800">{apt.petName}</div>
                      <div className="text-[10px] font-bold text-slate-500 mt-0.5">{apt.ownerName} • {apt.veterinarian}</div>
                    </div>
                    <div>
                      {apt.status === 'scheduled' && <span className="px-3 py-1.5 bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-widest rounded-lg shadow-xs">Waiting</span>}
                      {apt.status === 'in-progress' && <span className="px-3 py-1.5 bg-sky-100 text-sky-700 text-[9px] font-black uppercase tracking-widest rounded-lg shadow-xs">In Session</span>}
                      {apt.status === 'completed' && <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-widest rounded-lg shadow-xs">Completed</span>}
                      {apt.status === 'cancelled' && <span className="px-3 py-1.5 bg-rose-100 text-rose-700 text-[9px] font-black uppercase tracking-widest rounded-lg shadow-xs">Cancelled</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Inventory SOS List */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[400px]">
            <div className="p-5 border-b border-slate-100 shrink-0 bg-slate-50 rounded-t-2xl">
              <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2"><PackageX className="w-4 h-4 text-rose-500" /> Stock SOS Alert</h2>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3">
              {lowStockItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-2"><span className="text-emerald-500 text-xl font-black">✓</span></div>
                  <div className="text-[10px] uppercase tracking-widest font-black text-center text-slate-400">All critical stock levels<br/>are optimal.</div>
                </div>
              ) : (
                lowStockItems.map(item => (
                  <div key={item.id} className="flex justify-between items-center p-3 border border-rose-100 rounded-xl bg-rose-50/50 hover:bg-rose-50 transition-colors">
                    <div className="overflow-hidden pr-2">
                      <div className="text-[11px] font-black text-slate-800 truncate">{item.name}</div>
                      <div className="text-[9px] font-bold text-rose-500 uppercase tracking-widest mt-0.5">Threshold: {item.minStock}</div>
                    </div>
                    <div className="text-xs font-black text-rose-700 bg-white px-2 py-1 rounded shadow-xs border border-rose-200 shrink-0 font-mono">{item.stock} Left</div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <button onClick={() => onNavigate('pos')} className="p-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-md flex justify-between items-center transition-transform active:scale-[0.98] group cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shadow-inner"><CreditCard className="w-6 h-6 text-white" /></div>
              <div className="text-left"><div className="text-sm font-black">Open Register (POS)</div><div className="text-[10px] font-bold text-indigo-200 mt-0.5 uppercase tracking-widest">Process payments & walk-ins</div></div>
            </div>
            <ChevronRight className="w-6 h-6 text-indigo-300 group-hover:text-white transition-colors" />
          </button>
          
          <button onClick={() => onNavigate('appointments')} className="p-5 bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md text-slate-800 rounded-2xl flex justify-between items-center transition-all active:scale-[0.98] group cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors"><Calendar className="w-6 h-6 text-slate-400 group-hover:text-indigo-600" /></div>
              <div className="text-left"><div className="text-sm font-black">Manage Schedule</div><div className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">View & update appointments</div></div>
            </div>
            <ChevronRight className="w-6 h-6 text-slate-300 group-hover:text-indigo-500 transition-colors" />
          </button>
        </div>

      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}