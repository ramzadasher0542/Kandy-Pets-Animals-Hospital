/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { 
  BarChart3, DollarSign, Calendar, Package, 
  TrendingUp, TrendingDown, Users, Activity, Clock 
} from 'lucide-react';
import { InventoryItem, Appointment, MedicalRecord, Invoice } from '../types';

interface AnalyticsProps {
  inventory: InventoryItem[];
  appointments: Appointment[];
  records: MedicalRecord[];
  invoices: Invoice[];
  onTriggerSync: () => void;
  isOnline: boolean;
  syncQueueLength: number;
  systemConfig: any;
  currentUser: any;
}

export default function DashboardAnalytics({ 
  inventory, appointments, records, invoices, 
  systemConfig, currentUser 
}: AnalyticsProps) {

  // Existing Metrics Calculation
  const totalRevenue = useMemo(() => {
    return invoices.reduce((sum, inv) => sum + (inv.paymentStatus === 'paid' ? inv.sales_total : 0), 0);
  }, [invoices]);

  const totalAppointments = appointments.length;
  
  const uniquePatients = useMemo(() => {
    const ids = new Set(records.map(r => r.patientId));
    return ids.size;
  }, [records]);

  // CHUNK 5: WIP Pending Revenue Calculation
  const unbilledWipRevenue = useMemo(() => {
    const unbilledWipCents = records.reduce((totalCents, record) => {
      // Check if this record is billed by looking for an invoice with this appointmentId or matching patientId and visitDate
      const isBilled = invoices.some(inv => 
         (record.appointmentId && inv.appointmentId === record.appointmentId) || 
         (inv.patientId === record.patientId && inv.date === record.visitDate)
      );
      
      if (!isBilled && record.prescribedMeds && record.prescribedMeds.length > 0) {
        const medsTotal = record.prescribedMeds.reduce((medSum, med) => {
          if (med.itemId === 'boarding_deposit') {
            return medSum + (-15000 * 100 * med.quantity); // Negative escrow trap
          }
          const invItem = inventory.find(i => i.id === med.itemId);
          const price = invItem ? invItem.price : 0;
          return medSum + (Math.round(price * 100) * med.quantity);
        }, 0);
        return totalCents + medsTotal;
      }
      return totalCents;
    }, 0);

    return unbilledWipCents / 100;
  }, [records, invoices, inventory]);

  const formatNumber = (num: number) => {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const MetricCard = ({ title, value, icon: Icon, trend, trendUp, color = 'indigo' }: any) => (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-24 h-24 bg-${color}-50 rounded-bl-[100px] -z-10 transition-transform group-hover:scale-110`} />
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 bg-${color}-100 text-${color}-600 rounded-xl`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md ${trendUp ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
          {trendUp ? <TrendingUp className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          {trend}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-black text-slate-800 tracking-tight">{title}</h3>
        <p className="text-2xl font-mono font-black mt-1 text-slate-900">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 pb-6">
      
      {/* Top Action Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" /> Executive Dashboard
          </h2>
          <p className="text-xs text-slate-500 font-bold mt-0.5">Real-time financial and operational metrics</p>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <MetricCard 
          title="Total Collected Revenue" 
          value={`${systemConfig?.currencySymbol || 'Rs.'}${formatNumber(totalRevenue)}`} 
          icon={DollarSign} 
          trend="Real-time" 
          trendUp={true} 
          color="emerald" 
        />
        <MetricCard 
          title="Unbilled WIP Revenue" 
          value={`${systemConfig?.currencySymbol || 'Rs.'}${formatNumber(unbilledWipRevenue)}`} 
          icon={Activity} 
          trend="Floating" 
          trendUp={false} 
          color="amber" 
        />
        <MetricCard 
          title="Total Appointments" 
          value={totalAppointments} 
          icon={Calendar} 
          trend="All-time" 
          trendUp={true} 
          color="sky" 
        />
        <MetricCard 
          title="Registered Patients" 
          value={uniquePatients} 
          icon={Users} 
          trend="All-time" 
          trendUp={true} 
          color="indigo" 
        />
      </div>

      {/* Visual Charts Placeholder Space (Can be expanded with D3 or Recharts later) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[300px]">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col items-center justify-center text-center opacity-60">
          <BarChart3 className="w-16 h-16 text-slate-200 mb-4" />
          <h4 className="text-sm font-black text-slate-800">Revenue Trends</h4>
          <p className="text-xs font-bold text-slate-400 mt-1">Detailed visualization engine loading...</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col items-center justify-center text-center opacity-60">
          <Package className="w-16 h-16 text-slate-200 mb-4" />
          <h4 className="text-sm font-black text-slate-800">Inventory Movement</h4>
          <p className="text-xs font-bold text-slate-400 mt-1">Detailed visualization engine loading...</p>
        </div>
      </div>

    </div>
  );
}
