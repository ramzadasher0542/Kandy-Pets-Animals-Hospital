import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Wallet, TrendingUp, ArrowDownRight, ArrowUpRight, ShieldCheck, FileText, Download, Trash2,
  Calendar, Printer, Mail, Users, Stethoscope, Clock, Percent, PieChart, Package
} from 'lucide-react';
import { showToast } from './Toast';
import { db } from '../lib/localDb';
import { User, DeletionAudit } from '../types';
import type { SystemConfig } from './SystemSettings';

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

interface InvoiceItemLite { itemId?: string; sku?: string; name?: string; category?: string; quantity?: number; unitPrice?: number; totalPrice?: number; }

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
  cogs?: number;
  discount?: number;
  subtotal?: number;
  tax?: number;
  items?: InvoiceItemLite[];
  patientId?: string;
  petName?: string;
  ownerName?: string;
  ownerPhone?: string;
  appointmentId?: string;
  createdBy?: string;
  is_deleted?: boolean;
  splitPayments?: Array<{ method: string; amount?: number; amountCents?: number }>;
}

type RangePreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

// =====================================================================
// PURE RANGE HELPERS (local-time boundaries)
// =====================================================================
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

interface DateRange { start: Date; end: Date; label: string; }

function getRanges(preset: RangePreset, csStr: string, ceStr: string, now = new Date()): { cur: DateRange; prev: DateRange } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'today': {
      const cur = { start: startOfDay(now), end: endOfDay(now), label: 'Today' };
      const yest = new Date(now); yest.setDate(now.getDate() - 1);
      return { cur, prev: { start: startOfDay(yest), end: endOfDay(yest), label: 'Yesterday' } };
    }
    case 'this_week': {
      const dow = (now.getDay() + 6) % 7; // Monday = 0
      const mon = new Date(now); mon.setDate(now.getDate() - dow);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const pMon = new Date(mon); pMon.setDate(mon.getDate() - 7);
      const pSun = new Date(pMon); pSun.setDate(pMon.getDate() + 6);
      return { cur: { start: startOfDay(mon), end: endOfDay(sun), label: 'This Week' }, prev: { start: startOfDay(pMon), end: endOfDay(pSun), label: 'Last Week' } };
    }
    case 'last_month': {
      const cur = { start: startOfDay(new Date(y, m - 1, 1)), end: endOfDay(new Date(y, m, 0)), label: 'Last Month' };
      const prev = { start: startOfDay(new Date(y, m - 2, 1)), end: endOfDay(new Date(y, m - 1, 0)), label: 'Prev Month' };
      return { cur, prev };
    }
    case 'this_year': {
      const cur = { start: startOfDay(new Date(y, 0, 1)), end: endOfDay(new Date(y, 11, 31)), label: 'This Year' };
      const prev = { start: startOfDay(new Date(y - 1, 0, 1)), end: endOfDay(new Date(y - 1, 11, 31)), label: 'Last Year' };
      return { cur, prev };
    }
    case 'custom': {
      const cs = csStr ? new Date(csStr + 'T00:00:00') : null;
      const ce = ceStr ? new Date(ceStr + 'T00:00:00') : null;
      if (cs && ce && !isNaN(cs.getTime()) && !isNaN(ce.getTime())) {
        const start = startOfDay(cs); const end = endOfDay(ce);
        const dur = end.getTime() - start.getTime();
        const prevEnd = new Date(start.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - dur);
        return { cur: { start, end, label: 'Custom' }, prev: { start: prevStart, end: prevEnd, label: 'Prev Period' } };
      }
      // fall through to this_month if custom invalid
      return getRanges('this_month', '', '', now);
    }
    case 'this_month':
    default: {
      const cur = { start: startOfDay(new Date(y, m, 1)), end: endOfDay(new Date(y, m + 1, 0)), label: 'This Month' };
      const prev = { start: startOfDay(new Date(y, m - 1, 1)), end: endOfDay(new Date(y, m, 0)), label: 'Last Month' };
      return { cur, prev };
    }
  }
}

// Revenue stream classification. InvoiceItem.category only distinguishes 6 buckets,
// so grooming/boarding/surgery/admission (all billed as 'service') are refined by
// item name — a best-effort heuristic, not an authoritative field.
function classifyStream(item: InvoiceItemLite): string {
  const cat = (item.category || '').toLowerCase();
  const name = (item.name || '').toLowerCase();
  if (cat === 'vaccine') return 'Vaccinations';
  if (cat === 'lab_service') return 'Laboratory';
  if (cat === 'retail' || cat === 'food') return 'Retail & Food';
  if (cat === 'prescription') return 'Pharmacy';
  if (/surg|spay|neuter|castrat|orchi|ovario/.test(name)) return 'Surgeries';
  if (/groom|bath|nail|shave|deshed|de-shed|trim/.test(name)) return 'Grooming';
  if (/admiss|hospital/.test(name)) return 'Admissions';
  if (/board|cage|kennel|deposit/.test(name)) return 'Boarding';
  return 'Consultations / OPD';
}

const isPaid = (i: VaultInvoice) => (i.status === 'PAID' || i.paymentStatus === 'paid') && !i.is_deleted;
const invTotal = (i: VaultInvoice) => i.sales_total || (i.amountCents ? i.amountCents / 100 : 0);
const inRange = (dateVal: any, r: DateRange) => {
  if (!dateVal) return false;
  const t = new Date(dateVal).getTime();
  return !isNaN(t) && t >= r.start.getTime() && t <= r.end.getTime();
};
// Appointment dates are YYYY-MM-DD (local); parse to a local Date to avoid TZ drift.
const parseApptDate = (apt: any): Date | null => {
  if (!apt?.date) return null;
  const mParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(apt.date);
  const hh = /^(\d{1,2}):(\d{2})/.exec(apt.time || '00:00');
  const hour = hh ? parseInt(hh[1], 10) : 0;
  const min = hh ? parseInt(hh[2], 10) : 0;
  if (mParts) return new Date(+mParts[1], +mParts[2] - 1, +mParts[3], hour, min);
  const d = new Date(apt.date); return isNaN(d.getTime()) ? null : d;
};
const pctChange = (cur: number, prev: number): { pct: number; isNew: boolean } => {
  if (prev === 0) return { pct: cur > 0 ? 100 : 0, isNew: cur > 0 };
  return { pct: ((cur - prev) / prev) * 100, isNew: false };
};

interface ReportsManagerProps {
  currentUser: User;
  onVerifyMasterPin?: (pin: string) => boolean;
  config?: SystemConfig;
}

export default function ReportsManager({ currentUser, onVerifyMasterPin, config }: ReportsManagerProps) {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<VaultInvoice[]>([]);
  const [adjustments, setAdjustments] = useState<CashAdjustment[]>([]);
  const [deletions, setDeletions] = useState<DeletionAudit[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [shiftRecons, setShiftRecons] = useState<any[]>([]);

  const [rangePreset, setRangePreset] = useState<RangePreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Vault metrics (all-time cash position — intentionally NOT range-scoped)
  const [metrics, setMetrics] = useState({ cashSales: 0, cashIn: 0, cashOut: 0, vaultBalance: 0 });

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(val || 0);
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const formatPct = (n: number) => `${n >= 0 ? '' : ''}${n.toFixed(1)}%`;
  const normPhone = (p: string) => (p || '').replace(/\D/g, '').slice(-9);

  // Vault balance (all-time) — unchanged logic, do not touch.
  const calculateVault = useCallback((invs: VaultInvoice[], adjs: CashAdjustment[]) => {
    let cSales = 0;
    invs.filter(isPaid).forEach(inv => {
      const total = invTotal(inv);
      const method = (inv.paymentMethod || inv.method || '').toLowerCase();
      if (method === 'cash') cSales += total;
      else if (method === 'split' && inv.splitPayments) {
        const cashSplit = inv.splitPayments.find((p: any) => p.method === 'cash');
        if (cashSplit) cSales += (cashSplit.amount || (cashSplit.amountCents ? cashSplit.amountCents / 100 : 0));
      }
    });
    let cIn = 0; let cOut = 0;
    adjs.forEach(a => { if (a.type === 'IN') cIn += a.amount; else cOut += a.amount; });
    setMetrics({ cashSales: cSales, cashIn: cIn, cashOut: cOut, vaultBalance: cSales + cIn - cOut });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const invs: VaultInvoice[] = [];
      await db.invoices.iterate((val: VaultInvoice) => { if (val && !Array.isArray(val)) invs.push(val); });
      const adjs: CashAdjustment[] = [];
      await db.cashAdjustments.iterate((val: CashAdjustment) => { adjs.push(val); });
      adjs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const dels: DeletionAudit[] = [];
      await db.deletionAudit.iterate((val: DeletionAudit) => { if (val && !Array.isArray(val)) dels.push(val); });
      dels.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
      const appts: any[] = [];
      await db.appointments.iterate((v: any) => { if (v && !Array.isArray(v) && !v.is_deleted) appts.push(v); });
      const cls: any[] = [];
      await db.clients.iterate((v: any) => { if (v && !Array.isArray(v) && !v.is_deleted) cls.push(v); });
      const pays: any[] = [];
      await db.payslips.iterate((v: any) => { if (v && !Array.isArray(v) && !v.is_deleted) pays.push(v); });
      const recs: any[] = [];
      await db.shiftReconciliations.iterate((v: any) => { if (v && !Array.isArray(v)) recs.push(v); });

      setInvoices(invs); setAdjustments(adjs); setDeletions(dels);
      setAppointments(appts); setClients(cls); setPayslips(pays); setShiftRecons(recs);
      calculateVault(invs, adjs);
    } catch (e) {
      console.error('Vault Error:', e);
    } finally {
      setLoading(false);
    }
  }, [calculateVault]);

  useEffect(() => { loadData(); }, [loadData]);

  const { cur: range, prev: prevRange } = useMemo(() => getRanges(rangePreset, customStart, customEnd), [rangePreset, customStart, customEnd]);

  // =====================================================================
  // THE REPORT — everything below responds to the selected range
  // =====================================================================
  const report = useMemo(() => {
    const paid = invoices.filter(i => isPaid(i) && inRange(i.date, range));
    const paidPrev = invoices.filter(i => isPaid(i) && inRange(i.date, prevRange));

    const grossRevenue = paid.reduce((s, i) => s + invTotal(i), 0);
    const prevRevenue = paidPrev.reduce((s, i) => s + invTotal(i), 0);

    // COGS: prefer recorded cogs; else derive from profit (revenue - profit).
    const cogs = paid.reduce((s, i) => {
      if (i.cogs != null) return s + i.cogs;
      if (i.profit != null) return s + Math.max(0, invTotal(i) - i.profit);
      return s;
    }, 0);
    const grossProfit = grossRevenue - cogs;
    const grossMargin = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;

    // Staff cost: finalized/paid payslips whose period overlaps the range.
    const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS <= bE && bS <= aE;
    const staffCost = payslips.reduce((s, p) => {
      if (p.status !== 'finalized' && p.status !== 'paid') return s;
      const ps = new Date(p.periodStart).getTime(); const pe = new Date(p.periodEnd).getTime();
      if (isNaN(ps) || isNaN(pe)) return s;
      return overlaps(ps, pe, range.start.getTime(), range.end.getTime()) ? s + (p.netPayCents || 0) / 100 : s;
    }, 0);
    const netProfit = grossProfit - staffCost;

    // Category breakdown (by item revenue, so % sum to 100).
    const catMap: Record<string, number> = {};
    paid.forEach(inv => (inv.items || []).forEach(it => {
      const stream = classifyStream(it);
      const rev = it.totalPrice != null ? it.totalPrice : (it.unitPrice || 0) * (it.quantity || 0);
      catMap[stream] = (catMap[stream] || 0) + rev;
    }));
    const catTotal = Object.values(catMap).reduce((s, v) => s + v, 0);
    const categories = Object.entries(catMap)
      .map(([name, rev]) => ({ name, rev, pct: catTotal > 0 ? (rev / catTotal) * 100 : 0 }))
      .sort((a, b) => b.rev - a.rev);
    const categoryPctSum = categories.reduce((s, c) => s + c.pct, 0);

    // Appointments in range.
    const apptInRange = appointments.filter(a => { const d = parseApptDate(a); return d ? inRange(d, range) : false; });
    const apptPrev = appointments.filter(a => { const d = parseApptDate(a); return d ? inRange(d, prevRange) : false; });
    const completed = apptInRange.filter(a => a.status === 'completed');
    const cancelled = apptInRange.filter(a => a.status === 'cancelled');
    const emergency = apptInRange.filter(a => a.urgency === 'emergency');

    const uniquePets = (list: any[]) => new Set(list.filter(a => a.status === 'completed').map(a => `${(a.petName || '').toLowerCase()}|${normPhone(a.ownerPhone)}`)).size;
    const patientsSeen = uniquePets(apptInRange);
    const prevPatients = uniquePets(apptPrev);

    // New vs returning clients.
    const newClients = clients.filter(c => c.created_at && inRange(c.created_at, range));
    const activePhones = new Set<string>();
    paid.forEach(i => { if (i.ownerPhone) activePhones.add(normPhone(i.ownerPhone)); });
    apptInRange.forEach(a => { if (a.ownerPhone) activePhones.add(normPhone(a.ownerPhone)); });
    const newPhones = new Set(newClients.map(c => normPhone(c.primary_phone)));
    let newActive = 0; let returningActive = 0;
    activePhones.forEach(p => { if (newPhones.has(p)) newActive++; else returningActive++; });
    const totalActive = newActive + returningActive;

    const avgTxn = paid.length ? grossRevenue / paid.length : 0;
    const prevAvgTxn = paidPrev.length ? prevRevenue / paidPrev.length : 0;

    // Busiest weekday / hour.
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayCounts = new Array(7).fill(0);
    const hourCounts = new Array(24).fill(0);
    apptInRange.forEach(a => {
      const d = parseApptDate(a);
      if (d) { dayCounts[d.getDay()]++; hourCounts[d.getHours()]++; }
    });
    const busiestDayIdx = dayCounts.reduce((mi, v, i, arr) => v > arr[mi] ? i : mi, 0);
    const busiestHourIdx = hourCounts.reduce((mi, v, i, arr) => v > arr[mi] ? i : mi, 0);
    const busiestDay = dayCounts[busiestDayIdx] > 0 ? dayNames[busiestDayIdx] : '—';
    const busiestHour = hourCounts[busiestHourIdx] > 0 ? `${String(busiestHourIdx).padStart(2, '0')}:00` : '—';

    // Top items.
    const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    paid.forEach(inv => (inv.items || []).forEach(it => {
      const key = it.itemId || it.name || 'unknown';
      if (!itemMap[key]) itemMap[key] = { name: it.name || key, qty: 0, revenue: 0 };
      itemMap[key].qty += it.quantity || 0;
      itemMap[key].revenue += it.totalPrice != null ? it.totalPrice : (it.unitPrice || 0) * (it.quantity || 0);
    }));
    const itemArr = Object.values(itemMap);
    const topByRevenue = [...itemArr].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const topByQty = [...itemArr].sort((a, b) => b.qty - a.qty).slice(0, 10);

    // Vet productivity.
    const vetMap: Record<string, number> = {};
    completed.forEach(a => { const v = a.veterinarian || a.assignedVet || 'Unassigned'; vetMap[v] = (vetMap[v] || 0) + 1; });
    const vetProductivity = Object.entries(vetMap).map(([vet, count]) => ({ vet, count })).sort((a, b) => b.count - a.count);

    // ---- Z-REPORT (payment methods, floats, voids, discounts) ----
    const methodTotals: Record<string, number> = { cash: 0, card: 0, bank_transfer: 0, e_wallet: 0, deposit: 0, unknown: 0 };
    paid.forEach(inv => {
      const total = invTotal(inv);
      const m = (inv.paymentMethod || inv.method || '').toLowerCase();
      if (m === 'split') {
        let dist = 0;
        (inv.splitPayments || []).forEach(sp => {
          const amt = sp.amount || (sp.amountCents ? sp.amountCents / 100 : 0);
          const mm = (sp.method || '').toLowerCase();
          if (methodTotals[mm] != null) methodTotals[mm] += amt; else methodTotals.unknown += amt;
          dist += amt;
        });
        const rem = total - dist;
        if (Math.abs(rem) > 0.005) methodTotals.unknown += rem; // reconcile so buckets == total
      } else if (methodTotals[m] != null) {
        methodTotals[m] += total;
      } else {
        methodTotals.unknown += total;
      }
    });
    const methodSum = Object.values(methodTotals).reduce((s, v) => s + v, 0);

    const voided = invoices.filter(i => i.paymentStatus === 'void' && inRange(i.date, range));
    const voidedValue = voided.reduce((s, i) => s + invTotal(i), 0);
    const discountInvoices = paid.filter(i => (i.discount || 0) > 0);
    const discountTotal = discountInvoices.reduce((s, i) => s + (i.discount || 0), 0);

    const reconsInRange = shiftRecons.filter(r => inRange(r.timestamp, range));
    const openingFloat = reconsInRange.reduce((s, r) => s + (r.openingFloat || 0), 0);
    const expectedClosing = reconsInRange.reduce((s, r) => s + (r.expectedClosing || 0), 0);
    const actualClosing = reconsInRange.reduce((s, r) => s + (r.actualClosing || 0), 0);
    const reconDiscrepancy = reconsInRange.reduce((s, r) => s + (r.discrepancy || 0), 0);
    const adjustmentsInRange = adjustments.filter(a => inRange(a.date, range));
    const cashInRange = adjustmentsInRange.filter(a => a.type === 'IN').reduce((s, a) => s + a.amount, 0);
    const cashOutRange = adjustmentsInRange.filter(a => a.type === 'OUT').reduce((s, a) => s + a.amount, 0);

    return {
      grossRevenue, prevRevenue, cogs, grossProfit, grossMargin, staffCost, netProfit,
      categories, catTotal, categoryPctSum,
      rev: pctChange(grossRevenue, prevRevenue),
      patientsSeen, prevPatients, patients: pctChange(patientsSeen, prevPatients),
      avgTxn, prevAvgTxn, avgTxnTrend: pctChange(avgTxn, prevAvgTxn),
      txnCount: paid.length,
      newClients: newClients.length, newActive, returningActive, totalActive,
      completed: completed.length, cancelled: cancelled.length, emergency: emergency.length,
      busiestDay, busiestHour,
      topByRevenue, topByQty, vetProductivity,
      methodTotals, methodSum, voidedCount: voided.length, voidedValue,
      discountCount: discountInvoices.length, discountTotal,
      openingFloat, expectedClosing, actualClosing, reconDiscrepancy, reconsCount: reconsInRange.length,
      adjustmentsInRange, cashInRange, cashOutRange,
    };
  }, [invoices, appointments, clients, payslips, adjustments, shiftRecons, range, prevRange]);

  // --- CSV export of the full report ---
  const exportReportCSV = () => {
    const lines: string[] = [];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    lines.push(`CeylonPets Business Report`);
    lines.push(`Range,${esc(range.label)},${range.start.toISOString().slice(0, 10)},${range.end.toISOString().slice(0, 10)}`);
    lines.push('');
    lines.push('SUMMARY');
    lines.push(`Gross Revenue,${report.grossRevenue.toFixed(2)}`);
    lines.push(`COGS,${report.cogs.toFixed(2)}`);
    lines.push(`Gross Profit,${report.grossProfit.toFixed(2)}`);
    lines.push(`Gross Margin %,${report.grossMargin.toFixed(1)}`);
    lines.push(`Staff Cost,${report.staffCost.toFixed(2)}`);
    lines.push(`Estimated Net Profit,${report.netProfit.toFixed(2)}`);
    lines.push(`Transactions,${report.txnCount}`);
    lines.push(`Avg Transaction Value,${report.avgTxn.toFixed(2)}`);
    lines.push('');
    lines.push('REVENUE BY CATEGORY,Revenue,% of total');
    report.categories.forEach(c => lines.push(`${esc(c.name)},${c.rev.toFixed(2)},${c.pct.toFixed(1)}`));
    lines.push('');
    lines.push('OPERATIONAL');
    lines.push(`Patients Seen,${report.patientsSeen}`);
    lines.push(`New Clients,${report.newClients}`);
    lines.push(`Returning Active Clients,${report.returningActive}`);
    lines.push(`Appointments Completed,${report.completed}`);
    lines.push(`Appointments Cancelled,${report.cancelled}`);
    lines.push(`Emergency Intakes,${report.emergency}`);
    lines.push(`Busiest Day,${esc(report.busiestDay)}`);
    lines.push(`Busiest Hour,${esc(report.busiestHour)}`);
    lines.push('');
    lines.push('TOP ITEMS BY REVENUE,Qty,Revenue');
    report.topByRevenue.forEach(i => lines.push(`${esc(i.name)},${i.qty},${i.revenue.toFixed(2)}`));
    lines.push('');
    lines.push('PAYMENT METHODS');
    Object.entries(report.methodTotals as Record<string, number>).forEach(([m, v]) => lines.push(`${esc(m)},${v.toFixed(2)}`));

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `ceylonpets_report_${range.label.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('Full report exported to CSV.', 'success');
  };

  // --- Z-Report print / email ---
  const buildZReportText = () => {
    const l: string[] = [];
    l.push(`Z-REPORT — ${range.label}`);
    l.push(`${range.start.toLocaleDateString()} → ${range.end.toLocaleDateString()}`);
    l.push(`Generated by ${currentUser?.name || 'Unknown'} at ${new Date().toLocaleString()}`);
    l.push('');
    l.push(`Total Sales: ${formatCurrency(report.grossRevenue)} (${report.txnCount} txns)`);
    Object.entries(report.methodTotals as Record<string, number>).forEach(([m, v]) => { if (v) l.push(`  ${m}: ${formatCurrency(v)}`); });
    l.push('');
    l.push(`Opening Float: ${formatCurrency(report.openingFloat)}`);
    l.push(`Expected Closing: ${formatCurrency(report.expectedClosing)}`);
    l.push(`Actual Closing: ${formatCurrency(report.actualClosing)}`);
    l.push(`Discrepancy: ${formatCurrency(report.reconDiscrepancy)}`);
    l.push(`Cash In: ${formatCurrency(report.cashInRange)}  Cash Out: ${formatCurrency(report.cashOutRange)}`);
    l.push(`Voided: ${report.voidedCount} (${formatCurrency(report.voidedValue)})`);
    l.push(`Discounts: ${report.discountCount} (${formatCurrency(report.discountTotal)})`);
    return l.join('\n');
  };

  const handlePrintZReport = () => { window.print(); };

  const handleEmailZReport = async () => {
    const sid = config?.emailjsServiceId?.trim();
    const tid = config?.emailjsTemplateId?.trim();
    const pk = config?.emailjsPublicKey?.trim();
    if (!sid || !tid || !pk) {
      showToast('Email not configured — set up EmailJS credentials in System Settings', 'error');
      return;
    }
    const recipients = ((config?.recipientEmails && config.recipientEmails.length ? config.recipientEmails : [config?.hospitalEmail]).filter(Boolean) as string[]).join(',');
    if (!recipients) {
      showToast('No recipient email set. Add a Public Email in System Settings.', 'error');
      return;
    }
    try {
      const mod: any = await import('@emailjs/browser');
      const emailjs = mod.default || mod;
      await emailjs.send(sid, tid, { to_email: recipients, subject: `Z-Report — ${range.label}`, message: buildZReportText() }, { publicKey: pk });
      showToast('Z-Report emailed successfully.', 'success');
    } catch (err: any) {
      showToast(`Email failed: ${err?.message || err}`, 'error');
    }
  };

  const rangeOptions: { key: RangePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'this_week', label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'this_year', label: 'This Year' },
    { key: 'custom', label: 'Custom' },
  ];

  const Trend = ({ t }: { t: { pct: number; isNew: boolean } }) => {
    const up = t.pct >= 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-black ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {t.isNew ? 'new' : `${Math.abs(t.pct).toFixed(0)}%`}
      </span>
    );
  };

  if (loading) return <div className="h-full flex items-center justify-center bg-slate-50"><div className="animate-pulse font-black tracking-widest text-slate-400 uppercase">Unlocking Vault...</div></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-slate-50 w-full overflow-hidden font-sans relative">

      {/* Executive Header + Range Selector */}
      <header className="flex-none px-8 py-6 bg-slate-900 shrink-0 z-10 shadow-lg relative overflow-hidden no-print">
        <div className="absolute top-0 right-0 p-8 opacity-5"><ShieldCheck className="w-32 h-32 text-white" /></div>
        <div className="relative z-10 flex flex-wrap gap-4 justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Owner's Vault</h1>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Business Intelligence — {range.label}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {rangeOptions.map(o => (
              <button
                key={o.key}
                data-testid={`range-${o.key}`}
                onClick={() => setRangePreset(o.key)}
                className={`px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer ${rangePreset === o.key ? 'bg-indigo-500 text-white shadow' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >{o.label}</button>
            ))}
            {rangePreset === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <input data-testid="custom-start" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="px-2 py-1.5 rounded-xl text-[10px] font-bold bg-slate-800 text-white border border-slate-700" />
                <span className="text-slate-500 text-xs">→</span>
                <input data-testid="custom-end" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="px-2 py-1.5 rounded-xl text-[10px] font-bold bg-slate-800 text-white border border-slate-700" />
              </div>
            )}
            <button onClick={exportReportCSV} className="ml-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> CSV</button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">

        {/* PROFIT ANALYSIS */}
        <section>
          <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase mb-4"><TrendingUp className="w-4 h-4 text-indigo-500" /> Profit Analysis — {range.label}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Gross Revenue</span>
              <span data-testid="metric-total-revenue" data-value={report.grossRevenue} className="text-xl font-black text-slate-900 font-mono tracking-tight">{formatCurrency(report.grossRevenue)}</span>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">COGS</span>
              <span className="text-xl font-black text-slate-700 font-mono tracking-tight">{formatCurrency(report.cogs)}</span>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block mb-2">Gross Profit</span>
              <span data-testid="metric-gross-profit" className="text-xl font-black text-emerald-600 font-mono tracking-tight">{formatCurrency(report.grossProfit)}</span>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Gross Margin</span>
              <span className="text-xl font-black text-slate-900 font-mono tracking-tight">{report.grossMargin.toFixed(1)}%</span>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Staff Cost</span>
              <span className="text-xl font-black text-rose-600 font-mono tracking-tight">{formatCurrency(report.staffCost)}</span>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-1.5 h-full bg-indigo-500"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 block mb-2">Est. Net Profit</span>
              <span data-testid="metric-net-profit" className={`text-xl font-black font-mono tracking-tight ${report.netProfit >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>{formatCurrency(report.netProfit)}</span>
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-2">* Estimated net profit = gross profit − staff cost. Excludes rent, utilities, and other fixed costs not tracked in this system. COGS derived from recorded cost/profit per invoice.</p>
        </section>

        {/* TREND COMPARISON */}
        <section>
          <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase mb-4"><TrendingUp className="w-4 h-4 text-emerald-500" /> Trend vs {prevRange.label}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div data-testid="trend-revenue" className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Revenue</span>
              <div className="flex items-baseline gap-2"><span className="text-2xl font-black text-slate-900 font-mono">{formatCurrency(report.grossRevenue)}</span><Trend t={report.rev} /></div>
              <span className="text-[10px] font-bold text-slate-400 mt-1 block">vs {formatCurrency(report.prevRevenue)} prior</span>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Patients Seen</span>
              <div className="flex items-baseline gap-2"><span className="text-2xl font-black text-slate-900 font-mono">{report.patientsSeen}</span><Trend t={report.patients} /></div>
              <span className="text-[10px] font-bold text-slate-400 mt-1 block">vs {report.prevPatients} prior</span>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Avg Transaction</span>
              <div className="flex items-baseline gap-2"><span className="text-2xl font-black text-slate-900 font-mono">{formatCurrency(report.avgTxn)}</span><Trend t={report.avgTxnTrend} /></div>
              <span className="text-[10px] font-bold text-slate-400 mt-1 block">vs {formatCurrency(report.prevAvgTxn)} prior</span>
            </div>
          </div>
        </section>

        {/* REVENUE BY CATEGORY */}
        <section>
          <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase mb-4"><PieChart className="w-4 h-4 text-amber-500" /> Revenue by Service Category</h2>
          <div data-testid="category-breakdown" className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            {report.categories.length === 0 ? (
              <div className="text-center py-8 text-slate-400 font-bold text-xs">No revenue in this range.</div>
            ) : (
              <div className="space-y-3">
                {report.categories.map(c => (
                  <div key={c.name} data-testid={`category-row-${c.name.replace(/[^a-z]/gi, '').toLowerCase()}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-slate-700">{c.name}</span>
                      <span className="text-xs font-mono font-black text-slate-800">{formatCurrency(c.rev)} <span className="text-slate-400 font-bold ml-1">{c.pct.toFixed(1)}%</span></span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${c.pct}%` }}></div>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-100 flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <span>Total</span>
                  <span data-testid="category-total-pct" data-value={report.categoryPctSum}>{report.categoryPctSum.toFixed(0)}%</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* OPERATIONAL METRICS */}
        <section>
          <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase mb-4"><Users className="w-4 h-4 text-indigo-500" /> Operational Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Patients Seen', value: report.patientsSeen },
              { label: 'New Clients', value: report.newClients },
              { label: 'Returning / New', value: report.totalActive ? `${Math.round(report.returningActive / report.totalActive * 100)}% / ${Math.round(report.newActive / report.totalActive * 100)}%` : '—' },
              { label: 'Avg Transaction', value: formatCurrency(report.avgTxn) },
              { label: 'Busiest Day', value: report.busiestDay },
              { label: 'Busiest Hour', value: report.busiestHour },
              { label: 'Completed', value: report.completed },
              { label: 'Cancelled', value: report.cancelled },
              { label: 'No-Show', value: 'n/a' },
              { label: 'Emergency Intakes', value: report.emergency },
              { label: 'Transactions', value: report.txnCount },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">{s.label}</span>
                <span className="text-lg font-black text-slate-800 font-mono">{s.value}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-2">* No-show is not a tracked appointment status in this system, so it cannot be reported.</p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            {/* Top by revenue */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2"><Package className="w-3.5 h-3.5" /> Top Items — Revenue</h3>
              {report.topByRevenue.length === 0 ? <div className="text-[10px] text-slate-400 font-bold">No sales.</div> : report.topByRevenue.map((it, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-[10px] font-bold text-slate-700 truncate pr-2">{i + 1}. {it.name}</span>
                  <span className="text-[10px] font-mono font-black text-slate-800 shrink-0">{formatCurrency(it.revenue)}</span>
                </div>
              ))}
            </div>
            {/* Top by qty */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2"><Package className="w-3.5 h-3.5" /> Top Items — Quantity</h3>
              {report.topByQty.length === 0 ? <div className="text-[10px] text-slate-400 font-bold">No sales.</div> : report.topByQty.map((it, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-[10px] font-bold text-slate-700 truncate pr-2">{i + 1}. {it.name}</span>
                  <span className="text-[10px] font-mono font-black text-slate-800 shrink-0">{it.qty}</span>
                </div>
              ))}
            </div>
            {/* Vet productivity */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2"><Stethoscope className="w-3.5 h-3.5" /> Vet Productivity (completed)</h3>
              {report.vetProductivity.length === 0 ? <div className="text-[10px] text-slate-400 font-bold">No completed appointments.</div> : report.vetProductivity.map((v, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-[10px] font-bold text-slate-700 truncate pr-2">{v.vet}</span>
                  <span className="text-[10px] font-mono font-black text-slate-800 shrink-0">{v.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Z-REPORT */}
        <section id="z-report-section">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 bg-slate-900 flex flex-wrap gap-3 justify-between items-center">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2 className="text-sm font-black text-white tracking-tight uppercase">Z-Report — End of Day</h2>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">{range.label} • {range.start.toLocaleDateString()} → {range.end.toLocaleDateString()} • {report.reconsCount} shift(s)</p>
                </div>
              </div>
              <div className="flex items-center gap-2 no-print">
                <button data-testid="btn-print-zreport" onClick={handlePrintZReport} className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> Print Z-Report</button>
                <button data-testid="btn-email-zreport" onClick={handleEmailZReport} className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-indigo-500 text-white hover:bg-indigo-600 transition-colors cursor-pointer flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email Z-Report</button>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Payment methods */}
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Sales by Payment Method</h3>
                <div className="space-y-1.5">
                  {Object.entries(report.methodTotals as Record<string, number>).filter(([, v]) => v !== 0).map(([m, v]) => (
                    <div key={m} className="flex justify-between text-xs font-bold text-slate-700"><span className="capitalize">{m.replace('_', ' ')}</span><span className="font-mono">{formatCurrency(v)}</span></div>
                  ))}
                  <div className="flex justify-between text-xs font-black text-slate-900 pt-2 border-t border-slate-100">
                    <span>Total Sales</span>
                    <span className="font-mono" data-testid="zreport-method-sum" data-value={report.methodSum}>{formatCurrency(report.methodSum)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400">
                    <span>Invoiced total</span>
                    <span className="font-mono" data-testid="zreport-total-sales" data-value={report.grossRevenue}>{formatCurrency(report.grossRevenue)}</span>
                  </div>
                </div>
              </div>

              {/* Floats + counts */}
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Cash Reconciliation</h3>
                <div className="space-y-1.5 text-xs font-bold text-slate-700">
                  <div className="flex justify-between"><span>Opening Float</span><span className="font-mono">{formatCurrency(report.openingFloat)}</span></div>
                  <div className="flex justify-between"><span>Expected Closing</span><span className="font-mono">{formatCurrency(report.expectedClosing)}</span></div>
                  <div className="flex justify-between"><span>Actual Closing</span><span className="font-mono">{formatCurrency(report.actualClosing)}</span></div>
                  <div className={`flex justify-between ${report.reconDiscrepancy !== 0 ? 'text-rose-600' : ''}`}><span>Discrepancy</span><span className="font-mono">{formatCurrency(report.reconDiscrepancy)}</span></div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-100"><span>Cash In / Out</span><span className="font-mono">{formatCurrency(report.cashInRange)} / {formatCurrency(report.cashOutRange)}</span></div>
                  <div className="flex justify-between"><span>Transactions</span><span className="font-mono">{report.txnCount}</span></div>
                  <div className="flex justify-between"><span>Voided</span><span className="font-mono">{report.voidedCount} ({formatCurrency(report.voidedValue)})</span></div>
                  <div className="flex justify-between"><span>Discounts Given</span><span className="font-mono">{report.discountCount} ({formatCurrency(report.discountTotal)})</span></div>
                </div>
              </div>
            </div>

            {report.adjustmentsInRange.length > 0 && (
              <div className="px-6 pb-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Cash Adjustments (with reasons)</h3>
                <div className="space-y-1">
                  {report.adjustmentsInRange.map(a => (
                    <div key={a.id} className="flex justify-between text-[10px] font-bold text-slate-600"><span>{a.category} — {a.reason}</span><span className={`font-mono ${a.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>{a.type === 'IN' ? '+' : '-'}{formatCurrency(a.amount)}</span></div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-[10px] font-bold text-slate-400">
              Generated by {currentUser?.name || 'Unknown'} • {new Date().toLocaleString()}
            </div>
          </div>
        </section>

        {/* VAULT (all-time cash position) + CASH ADJUSTMENT HISTORY — unchanged */}
        <section className="no-print">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
              <div className="p-6 bg-slate-900 border-b border-slate-800 shrink-0 text-center">
                <Wallet className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Physical Cash Vault (All-Time)</span>
                <span className="text-4xl font-black text-white font-mono tracking-tight">{formatCurrency(metrics.vaultBalance)}</span>
                <div className="flex justify-center gap-4 mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <span className="flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-emerald-400" /> {formatCurrency(metrics.cashSales + metrics.cashIn)} IN</span>
                  <span className="flex items-center gap-1"><ArrowDownRight className="w-3 h-3 text-rose-400" /> {formatCurrency(metrics.cashOut)} OUT</span>
                </div>
              </div>
            </div>

            <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cash Adjustment History (All-Time)</h3>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 max-h-[300px]">
                {adjustments.length === 0 ? (
                  <div className="p-8 flex flex-col items-center justify-center text-slate-300">
                    <span className="text-[10px] uppercase tracking-widest font-black text-center">No manual cash adjustments logged.</span>
                  </div>
                ) : (
                  <div className="space-y-2 p-2">
                    {adjustments.map(adj => (
                      <div key={adj.id} className="p-4 bg-white border border-slate-100 rounded-xl shadow-xs flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${adj.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{adj.category}</span>
                            <span className="text-[10px] font-mono text-slate-400">{formatDate(adj.date)}</span>
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
        </section>

        {/* F-3: DELETION AUDIT LOG — read-only owner oversight */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden no-print">
          <div className="p-6 bg-slate-900 border-b border-slate-800 flex items-center gap-3">
            <Trash2 className="w-5 h-5 text-rose-400" />
            <div>
              <h2 className="text-sm font-black text-white tracking-tight uppercase">Deletion Audit Log</h2>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">Every client / pet deletion is permanently recorded</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table data-testid="deletion-audit-table" className="w-full text-left text-xs border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase tracking-widest font-black text-[10px]">
                  <th className="py-4 px-4">Type</th>
                  <th className="py-4 px-4">Name</th>
                  <th className="py-4 px-4">Deleted By</th>
                  <th className="py-4 px-4">When</th>
                  <th className="py-4 px-4">History</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deletions.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center text-slate-400 font-bold">No deletions recorded.</td></tr>
                ) : (
                  deletions.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${d.entity_type === 'client' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>{d.entity_type}</span>
                      </td>
                      <td className="py-4 px-4 font-black text-slate-800">{d.entity_name || d.entity_id}</td>
                      <td className="py-4 px-4 font-bold text-slate-600">{d.deleted_by}</td>
                      <td className="py-4 px-4 font-mono text-slate-500">{formatDate(d.deleted_at)}</td>
                      <td className="py-4 px-4">
                        {d.had_history ? (
                          <span className="text-[10px] font-bold text-rose-600" title={d.history_summary || ''}>Had history{d.history_summary ? ` — ${d.history_summary}` : ''}</span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400">None</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        @media print {
          body * { visibility: hidden !important; }
          #z-report-section, #z-report-section * { visibility: visible !important; }
          #z-report-section { position: absolute !important; left: 0; top: 0; width: 100% !important; padding: 16px !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
