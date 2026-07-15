import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, Clock, Users, AlertTriangle, PackageX, Calendar, 
  CreditCard, ChevronRight, CheckCircle, FileText, FileSignature,
  TrendingUp, Home
} from 'lucide-react';
import { 
  Appointment, InventoryItem, ActiveShift, Invoice, MedicalRecord, 
  ClinicQueueItem, ScheduleEntry, TimeEntry, StaffProfile,
  BoardingRecord, GroomingLog
} from '../types';
import { db } from '../lib/localDb';
import { sortQueueByUrgency } from '../lib/queueUtils';
import PageShell from './ui/PageShell';

interface DashboardProps {
  invoices: Invoice[];
  records: MedicalRecord[];
  inventory: InventoryItem[];
  appointments: Appointment[];
  activeShift?: ActiveShift | null;
  clinicQueue?: ClinicQueueItem[];
  scheduleEntries?: ScheduleEntry[];
  timeEntries?: TimeEntry[];
  staffProfiles?: StaffProfile[];
  onNavigate?: (tab: string) => void;
}

export default function DashboardAnalytics({ 
  invoices = [],
  records = [],
  appointments = [], 
  inventory = [], 
  activeShift = null, 
  clinicQueue = [],
  scheduleEntries = [],
  timeEntries = [],
  staffProfiles = [],
  onNavigate = () => {} 
}: DashboardProps) {
  
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const [vaultBalance, setVaultBalance] = useState<number>(0);
  const [boardingRecords, setBoardingRecords] = useState<BoardingRecord[]>([]);
  const [groomingLogs, setGroomingLogs] = useState<GroomingLog[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        let cSales = 0;
        invoices.filter(i => i.paymentStatus === 'paid').forEach(inv => {
          const total = inv.sales_total || 0;
          const method = (inv.paymentMethod || '').toLowerCase();
          if (method === 'cash') cSales += total;
          else if (method === 'split' && inv.splitPayments) {
            const cashSplit = inv.splitPayments.find((p: any) => p.method === 'cash');
            if (cashSplit) cSales += (cashSplit.amount || 0);
          }
        });
        
        let cIn = 0; let cOut = 0;
        await db.cashAdjustments.iterate((a: any) => { 
          if (a.type === 'IN') cIn += a.amount; 
          else cOut += a.amount; 
        });
        
        const b: BoardingRecord[] = [];
        await db.boardingRecords.iterate((r: any) => b.push(r));
        
        const g: GroomingLog[] = [];
        await db.groomingLogs.iterate((r: any) => g.push(r));
        
        if (isMounted) {
          setVaultBalance(cSales + cIn - cOut);
          setBoardingRecords(b);
          setGroomingLogs(g);
        }
      } catch (err) {
        console.error('Failed to load dashboard async data:', err);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [invoices]);

  // 1. TOP ROW STATS
  const patientsInBuilding = clinicQueue.filter(q => q.status !== 'completed').length;
  
  const todaysAppointments = appointments.filter(a => a.date.startsWith(todayStr) && !a.is_deleted);
  const completedAppointments = todaysAppointments.filter(a => a.status === 'completed');
  const remainingAppointments = todaysAppointments.filter(a => a.status === 'booked' || a.status === 'in-progress');
  
  const todaysInvoices = invoices.filter(i => i.date?.startsWith(todayStr) && i.paymentStatus === 'paid');
  const todaysRevenue = todaysInvoices.reduce((sum, i) => sum + (i.sales_total || 0), 0);

  // 2. NEEDS ATTENTION
  const needsAttention = useMemo(() => {
    const alerts: Array<{ id: string; type: string; title: string; subtitle: string; icon: any; color: string; tab: string }> = [];
    
    // Emergency Backfill
    appointments.forEach(apt => {
      if (!apt.is_deleted && apt.emergencyBackfillRequired && apt.status !== 'completed' && apt.status !== 'cancelled') {
        alerts.push({
          id: `emerg-${apt.id}`, type: 'emergency', title: `Complete details for ${apt.petName}`,
          subtitle: 'Emergency intake missing patient info', icon: AlertTriangle, color: 'text-rose-500 bg-rose-50 border-rose-200', tab: 'appointments'
        });
      }
    });

    // Inventory SOS
    inventory.forEach(item => {
      if (item.is_deleted) return;
      let isLowStock = !['service', 'lab_service'].includes(item.category) && item.stock <= item.minStock;
      let isExpired = false;
      let isExpiringSoon = false;
      
      if (item.expiryDate && item.stock > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const exp = new Date(item.expiryDate);
        const daysDiff = Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff < 0) isExpired = true;
        else if (daysDiff <= 30) isExpiringSoon = true;
      }

      if (isExpired) {
        alerts.push({ id: `inv-${item.id}-exp`, type: 'expired', title: `${item.name} has Expired`, subtitle: 'Remove from shelf immediately', icon: PackageX, color: 'text-rose-500 bg-rose-50 border-rose-200', tab: 'inventory' });
      } else if (isExpiringSoon) {
        alerts.push({ id: `inv-${item.id}-soon`, type: 'expiring', title: `${item.name} expiring soon`, subtitle: 'Check expiry dates', icon: Clock, color: 'text-amber-500 bg-amber-50 border-amber-200', tab: 'inventory' });
      } else if (isLowStock) {
        alerts.push({ id: `inv-${item.id}-low`, type: 'low_stock', title: `${item.name} is low on stock`, subtitle: `${item.stock} remaining (Min: ${item.minStock})`, icon: PackageX, color: 'text-amber-500 bg-amber-50 border-amber-200', tab: 'inventory' });
      }
    });

    // Late "booked" appointments (no-shows)
    todaysAppointments.forEach(apt => {
      if (apt.status === 'booked' && apt.time) {
        const aptTime = new Date(`${todayStr}T${apt.time}`);
        if (now.getTime() > aptTime.getTime() + 15 * 60000) { // 15 mins grace
          alerts.push({ id: `late-${apt.id}`, type: 'late', title: `${apt.petName} is late`, subtitle: `Scheduled for ${apt.time} - Possible no show`, icon: Clock, color: 'text-amber-500 bg-amber-50 border-amber-200', tab: 'appointments' });
        }
      }
    });

    // Boarding exceedances (> Rs. 15,000 deposit exceeded)
    boardingRecords.forEach(r => {
      if (r.status === 'active' && !r.is_deleted) {
        const charges = r.totalChargesCents ? r.totalChargesCents / 100 : 0;
        if (charges > 15000) {
          alerts.push({ id: `board-${r.id}`, type: 'boarding', title: `Boarding charges exceeded for ${r.petId}`, subtitle: `Charges: Rs.${charges} > Deposit: Rs.15,000`, icon: Home, color: 'text-amber-500 bg-amber-50 border-amber-200', tab: 'boarding' });
        }
      }
    });
    
    // Grooming without consent
    groomingLogs.forEach(g => {
      if (g.status === 'completed' && !g.consentSignature && !g.is_deleted) {
        alerts.push({ id: `groom-${g.id}`, type: 'grooming', title: `Missing consent for grooming`, subtitle: `Pet ID: ${g.petId} completed without signature`, icon: FileSignature, color: 'text-amber-500 bg-amber-50 border-amber-200', tab: 'grooming' });
      }
    });

    // Unbilled completed visits
    todaysAppointments.forEach(apt => {
      if (apt.status === 'completed') {
        const hasPaidInvoice = invoices.some(i => i.appointmentId === apt.id && i.paymentStatus === 'paid');
        if (!hasPaidInvoice) {
          alerts.push({ id: `unbilled-${apt.id}`, type: 'unbilled', title: `Unbilled visit for ${apt.petName}`, subtitle: 'Appointment completed, no invoice found', icon: CreditCard, color: 'text-sky-500 bg-sky-50 border-sky-200', tab: 'pos' });
        }
      }
    });

    // Sort: red (emergency/expired) first, then amber, then blue
    const order: Record<string, number> = { emergency: 1, expired: 1, late: 2, low_stock: 2, expiring: 2, boarding: 2, grooming: 2, unbilled: 3 };
    return alerts.sort((a, b) => (order[a.type] || 99) - (order[b.type] || 99));
  }, [appointments, inventory, todaysAppointments, invoices, boardingRecords, groomingLogs]);

  // 3. LIVE QUEUE — single shared urgency sort (emergency first, FIFO within tier)
  const sortedQueue = useMemo(() => {
    return sortQueueByUrgency(clinicQueue.filter(q => q.status !== 'completed'));
  }, [clinicQueue]);
  
  // 4. TODAY'S SCHEDULE
  const todaysSchedule = useMemo(() => {
    return scheduleEntries.filter(s => s.shiftStart.startsWith(todayStr) && !s.is_deleted).map(s => {
      const staff = staffProfiles.find(p => p.id === s.staffId);
      const clockedInEntry = timeEntries.find(t => t.staffId === s.staffId && t.date === todayStr && t.clockIn && !t.clockOut && !t.is_deleted);
      return { ...s, staff, isClockedIn: !!clockedInEntry };
    });
  }, [scheduleEntries, timeEntries, staffProfiles, todayStr]);

  // 5. REVENUE THIS WEEK MINI CHART
  const weekChart = useMemo(() => {
    const days = [];
    const maxDate = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(maxDate);
      d.setDate(d.getDate() - i);
      const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      
      const dayRevs = invoices
        .filter(inv => inv.date?.startsWith(dStr) && inv.paymentStatus === 'paid')
        .reduce((sum, inv) => sum + (inv.sales_total || 0), 0);
        
      days.push({
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        value: dayRevs,
        date: dStr
      });
    }
    const maxVal = Math.max(...days.map(d => d.value), 1);
    return { days, maxVal };
  }, [invoices]);

  const formatCurrency = (val: number) => 'Rs. ' + new Intl.NumberFormat('en-LK', { maximumFractionDigits: 0 }).format(val || 0);

  return (
    <PageShell title="Clinic Floor Ops" subtitle="Real-time patient traffic & facility status">
      <div className="flex flex-col h-full w-full overflow-hidden font-sans relative">
      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
        {/* TOP ROW: TODAY AT A GLANCE */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <Users className="w-7 h-7 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Patients in Building</h3>
              <div className="text-xl font-black text-slate-800 font-mono">
                {patientsInBuilding} <span className="text-xs text-slate-400 font-sans tracking-normal font-bold">Active</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
              <Calendar className="w-7 h-7 text-sky-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Today's Appointments</h3>
              <div className="text-xl font-black text-slate-800 font-mono">{todaysAppointments.length}</div>
              <div className="text-[10px] text-slate-400 font-bold mt-0.5">{completedAppointments.length} done · {remainingAppointments.length} left</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <TrendingUp className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Today's Revenue</h3>
              <div className="text-xl font-black text-slate-800 font-mono">
                {formatCurrency(todaysRevenue)}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
              <CreditCard className="w-7 h-7 text-slate-600" />
            </div>
            <div>
              <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Cash in Drawer</h3>
              <div className="text-xl font-black text-slate-800 font-mono">
                {formatCurrency(vaultBalance)}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* PRIMARY ROW: NEEDS ATTENTION */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[450px]">
            <div className="p-6 border-b border-slate-100 shrink-0 bg-slate-50 rounded-t-2xl flex justify-between items-center">
              <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Needs Attention
              </h2>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-white px-2 py-1 rounded shadow-xs border border-slate-200">{needsAttention.length} Issues</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
              {needsAttention.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-2"><CheckCircle className="w-6 h-6 text-emerald-500" /></div>
                  <div className="text-xs uppercase tracking-widest font-black text-center text-emerald-600">✅ All clear</div>
                </div>
              ) : (
                needsAttention.map((alert, i) => (
                  <div key={`${alert.id}-${i}`} onClick={() => onNavigate(alert.tab)} className={`flex items-center p-4 border rounded-xl bg-white hover:shadow-md transition-all cursor-pointer ${alert.color.split(' ')[2]}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mr-4 ${alert.color.split(' ')[1]}`}>
                      <alert.icon className={`w-5 h-5 ${alert.color.split(' ')[0]}`} />
                    </div>
                    <div className="flex-1 overflow-hidden pr-2">
                      <div className="text-sm font-black text-slate-800 truncate">{alert.title}</div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{alert.subtitle}</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-6 h-[450px]">
            {/* REVENUE CHART */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 shrink-0">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" /> Revenue This Week
              </h2>
              <div className="flex items-end justify-between h-24 gap-1">
                {weekChart.days.map((d, i) => (
                  <div key={i} className="flex flex-col items-center flex-1 group">
                    <div className="w-full relative flex justify-center h-full items-end rounded-t bg-slate-50">
                      <div 
                        className="w-full bg-emerald-400 rounded-t group-hover:bg-emerald-500 transition-all"
                        style={{ height: `${(d.value / weekChart.maxVal) * 100}%`, minHeight: d.value > 0 ? '4px' : '0' }}
                      ></div>
                      {/* Tooltip */}
                      <div className="absolute -top-8 bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                        {formatCurrency(d.value)}
                      </div>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-1">{d.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* TODAY'S SCHEDULE */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex-1 flex flex-col min-h-0">
              <div className="p-4 border-b border-slate-100 shrink-0 bg-slate-50 rounded-t-2xl">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-500" /> Today's Schedule
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                {todaysSchedule.length === 0 ? (
                  <div className="text-center text-[10px] font-bold text-slate-400 py-4">No staff scheduled today.</div>
                ) : (
                  todaysSchedule.map((s, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                      <div>
                        <div className="text-xs font-black text-slate-800">{s.staff?.fullName || 'Unknown'}</div>
                        <div className="text-[10px] font-bold text-slate-500">{s.role}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-mono font-bold text-slate-600">
                          {new Date(s.shiftStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                        <div className={`w-2 h-2 rounded-full ${s.isClockedIn ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-200'}`} title={s.isClockedIn ? 'Clocked In' : 'Not Clocked In'}></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM ROW: LIVE QUEUE */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[350px]">
          <div className="p-6 border-b border-slate-100 shrink-0 bg-slate-50 rounded-t-2xl flex justify-between items-center">
            <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-500" /> Live Queue
            </h2>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-white px-2 py-1 rounded shadow-xs border border-slate-200">
              {sortedQueue.length} Waiting
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
            {sortedQueue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-3">
                <Users className="w-10 h-10 opacity-50" />
                <div className="text-xs font-bold uppercase tracking-widest text-center">Queue is empty.</div>
              </div>
            ) : (
              sortedQueue.map(q => {
                const waitMins = Math.floor((now.getTime() - new Date(q.checkInTime).getTime()) / 60000);
                const isOverdue = waitMins > 45;
                return (
                  <div key={q.id} className={`flex justify-between items-center p-4 border rounded-xl hover:shadow-sm transition-all ${isOverdue ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl ${isOverdue ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                        {waitMins}<span className="text-[10px]">m</span>
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                          {q.petName}
                          {q.urgency === 'emergency' && <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-black uppercase tracking-widest rounded shrink-0">EMERGENCY</span>}
                          {q.urgency === 'non-emergency' && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded shrink-0">URGENT</span>}
                        </div>
                        {q.emergencyBackfillRequired && (
                          <div className="text-[10px] font-black uppercase tracking-widest text-amber-600 mt-0.5">⚠ DETAILS PENDING</div>
                        )}
                        <div className="text-[10px] font-bold text-slate-500 mt-0.5">{q.ownerName} • {q.serviceType}</div>
                      </div>
                    </div>
                    <div>
                      {/* Wait, ClinicQueueItem status is QueueStatus ('scheduled' | 'active' | 'completed'). Let's just say it's active. */}
                      {q.status === 'active' && <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded shadow-xs">Active</span>}
                      {q.status === 'scheduled' && <span className="px-3 py-1.5 bg-sky-100 text-sky-700 text-[10px] font-black uppercase tracking-widest rounded shadow-xs">Scheduled</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
    </PageShell>
  );
}
