import React, { useState } from 'react';
import { User, StaffProfile, TimeEntry, ScheduleEntry, Payslip, PayslipDeduction } from '../types';
import { UserCog, Plus, X, Edit, Trash2, Link, Unlink, ChevronDown, ChevronUp, CheckCircle2, Clock, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Wallet, FileText } from 'lucide-react';
import { showToast } from './Toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { stampRecord } from '../lib/localDb';
import { createPortal } from 'react-dom';

interface StaffManagerProps {
  staffProfiles: StaffProfile[];
  users: User[];
  currentUser: User;
  timeEntries: TimeEntry[];
  scheduleEntries: ScheduleEntry[];
  payslips: Payslip[];
  onSaveTimeEntry: (entry: TimeEntry) => Promise<void>;
  onSaveScheduleEntry: (entry: ScheduleEntry) => Promise<void>;
  onDeleteScheduleEntry: (id: string) => Promise<void>;
  onSaveProfile: (p: StaffProfile) => Promise<void>;
  onDeactivateProfile: (id: string) => Promise<void>;
  onSavePayslip: (p: Payslip) => Promise<void>;
}

export default function StaffManager({ staffProfiles, users, currentUser, timeEntries, scheduleEntries, payslips, onSaveTimeEntry, onSaveScheduleEntry, onDeleteScheduleEntry, onSaveProfile, onDeactivateProfile, onSavePayslip }: StaffManagerProps) {
  const [activeTab, setActiveTab] = useState<'roster' | 'link' | 'clock' | 'schedule' | 'payslips'>('roster');
  
  // Roster Tab State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<StaffProfile>>({ active: true, employmentType: 'hourly' });
  const [showInactive, setShowInactive] = useState(false);

  const activeProfiles = staffProfiles.filter(p => p.active);
  const inactiveProfiles = staffProfiles.filter(p => !p.active);

  const linkedProfiles = staffProfiles.filter(p => p.userId);
  const unlinkedProfiles = staffProfiles.filter(p => !p.userId && p.active);

  // Link Tab state
  const [selectedUserIds, setSelectedUserIds] = useState<Record<string, string>>({}); // profileId -> userId

  const linkedUserIds = linkedProfiles.map(p => p.userId);
  const availableUsers = users.filter(u => !linkedUserIds.includes(u.id));

  // Time Clock State
  const [clockSelectedStaff, setClockSelectedStaff] = useState<string>('');
  const [manualClockData, setManualClockData] = useState({ staffId: '', date: new Date().toISOString().split('T')[0], clockIn: '', clockOut: '', notes: '' });

  const todayISO = new Date().toISOString().split('T')[0];
  const todaysEntries = timeEntries ? timeEntries.filter(t => t.date.startsWith(todayISO)).sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime()) : [];
  const selectedStaffOpenEntry = timeEntries ? timeEntries.find(t => t.staffId === clockSelectedStaff && t.date.startsWith(todayISO) && !t.clockOut) : undefined;

  // Schedule State
  const [scheduleWeekStart, setScheduleWeekStart] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff));
  });
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleData, setScheduleData] = useState({ staffId: '', date: new Date().toISOString().split('T')[0], startTime: '09:00', endTime: '17:00', role: '', notes: '' });

  // Payslips State
  const [payslipStaffId, setPayslipStaffId] = useState<string>('');
  const [payslipPeriodStart, setPayslipPeriodStart] = useState<string>(todayISO);
  const [payslipPeriodEnd, setPayslipPeriodEnd] = useState<string>(todayISO);
  const [payslipCalculated, setPayslipCalculated] = useState<{ grossPayCents: number; entries: TimeEntry[]; totalMinutes: number; isHourly: boolean } | null>(null);
  const [payslipDeductions, setPayslipDeductions] = useState<Array<{ label: string; amountRs: string }>>([]);

  const selectedPayslipStaff = staffProfiles.find(p => p.id === payslipStaffId);

  const handleCalculatePayslip = () => {
    if (!payslipStaffId) return showToast('Select a staff member first', 'error');
    if (!payslipPeriodStart || !payslipPeriodEnd) return showToast('Select a period', 'error');
    const staff = staffProfiles.find(p => p.id === payslipStaffId);
    if (!staff) return showToast('Staff not found', 'error');

    if (staff.employmentType === 'hourly') {
      if (!staff.hourlyRate) return showToast('Staff has no hourly rate set', 'error');
      const inPeriod = (timeEntries || []).filter(t =>
        t.staffId === payslipStaffId &&
        t.date >= payslipPeriodStart &&
        t.date <= payslipPeriodEnd &&
        t.clockOut &&
        typeof t.durationMinutes === 'number'
      );
      const totalMinutes = inPeriod.reduce((sum, t) => sum + (t.durationMinutes || 0), 0);
      const totalHours = totalMinutes / 60;
      const grossPayCents = Math.round(totalHours * staff.hourlyRate);
      setPayslipCalculated({ grossPayCents, entries: inPeriod, totalMinutes, isHourly: true });
    } else {
      const grossPayCents = staff.monthlySalary || 0;
      if (!grossPayCents) return showToast('Staff has no monthly salary set', 'error');
      setPayslipCalculated({ grossPayCents, entries: [], totalMinutes: 0, isHourly: false });
    }
    setPayslipDeductions([]);
  };

  const totalDeductionsCents = payslipDeductions.reduce((sum, d) => {
    const rs = parseFloat(d.amountRs);
    if (isNaN(rs)) return sum;
    return sum + Math.round(rs * 100);
  }, 0);
  const netPayCents = payslipCalculated ? payslipCalculated.grossPayCents - totalDeductionsCents : 0;

  const handleSavePayslipDraft = async () => {
    if (!payslipCalculated || !selectedPayslipStaff) return showToast('Calculate first', 'error');
    const deductionsClean: PayslipDeduction[] = payslipDeductions
      .filter(d => d.label.trim() && !isNaN(parseFloat(d.amountRs)))
      .map(d => ({ label: d.label.trim(), amountCents: Math.round(parseFloat(d.amountRs) * 100) }));
    const nowIso = new Date().toISOString();
    const payslip: Payslip = {
      id: crypto.randomUUID(),
      staffId: selectedPayslipStaff.id,
      periodStart: payslipPeriodStart,
      periodEnd: payslipPeriodEnd,
      grossPayCents: payslipCalculated.grossPayCents,
      deductions: deductionsClean,
      netPayCents: payslipCalculated.grossPayCents - deductionsClean.reduce((s, d) => s + d.amountCents, 0),
      status: 'draft',
      generatedBy: currentUser.id,
      generatedAt: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
      is_deleted: false,
      _dirty: true
    };
    try {
      await onSavePayslip(stampRecord(payslip) as Payslip);
      showToast('Payslip saved as draft', 'success');
      setPayslipCalculated(null);
      setPayslipDeductions([]);
    } catch (e: any) {
      showToast(`Error saving payslip: ${e.message}`, 'error');
    }
  };

  const handleUpdatePayslipStatus = async (p: Payslip, newStatus: 'finalized' | 'paid') => {
    const updated: Payslip = {
      ...p,
      status: newStatus,
      paidAt: newStatus === 'paid' ? new Date().toISOString() : p.paidAt
    };
    try {
      await onSavePayslip(stampRecord(updated) as Payslip);
      showToast(`Payslip marked as ${newStatus}`, 'success');
    } catch (e: any) {
      showToast(`Error updating payslip: ${e.message}`, 'error');
    }
  };

  const generatePayslipPDF = (payslip: Payslip, staff: StaffProfile) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(30, 58, 138); // indigo-900
    doc.text('PAYSLIP', 14, 20);
    
    doc.setFontSize(12);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text('Kandy Pets Animal Hospital', 14, 30);
    doc.setFontSize(10);
    doc.text(`Pay Period: ${payslip.periodStart} to ${payslip.periodEnd}`, 14, 38);
    doc.text(`Generated: ${new Date(payslip.generatedAt || new Date()).toLocaleString()}`, 14, 44);
    
    // Staff Info
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text('Staff Details', 14, 58);
    
    autoTable(doc, {
      startY: 62,
      theme: 'plain',
      styles: { cellPadding: 1, fontSize: 10 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
      body: [
        ['Name:', staff.fullName],
        ['Position:', `${staff.position || 'N/A'} ${staff.department ? `(${staff.department})` : ''}`],
        ['Employment Type:', staff.employmentType.charAt(0).toUpperCase() + staff.employmentType.slice(1)],
      ],
    });
    
    // Earnings
    let currentY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text('Earnings', 14, currentY);
    
    const earningsBody = [];
    if (staff.employmentType === 'hourly') {
        const rateRs = (staff.hourlyRate || 0) / 100;
        const grossRs = payslip.grossPayCents / 100;
        const totalHours = rateRs > 0 ? (grossRs / rateRs).toFixed(1) : '0';
        
        earningsBody.push(['Total Hours Worked', totalHours]);
        earningsBody.push(['Hourly Rate', `Rs. ${rateRs.toFixed(2)}`]);
        earningsBody.push(['Gross Pay', `Rs. ${grossRs.toFixed(2)}`]);
    } else {
        const grossRs = payslip.grossPayCents / 100;
        earningsBody.push(['Monthly Salary', `Rs. ${grossRs.toFixed(2)}`]);
        earningsBody.push(['Gross Pay', `Rs. ${grossRs.toFixed(2)}`]);
    }
    
    autoTable(doc, {
      startY: currentY + 4,
      theme: 'striped',
      headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105] }, // slate-100/slate-600
      head: [['Description', 'Amount']],
      body: earningsBody,
    });
    
    currentY = (doc as any).lastAutoTable.finalY + 10;
    
    // Deductions
    const deductions = payslip.deductions || [];
    if (deductions.length > 0) {
      doc.setFontSize(14);
      doc.text('Deductions', 14, currentY);
      
      const deductionsBody = deductions.map(d => [d.label, `Rs. ${(d.amountCents/100).toFixed(2)}`]);
      const totalDeductionsCents = deductions.reduce((sum, d) => sum + d.amountCents, 0);
      deductionsBody.push(['Total Deductions', `Rs. ${(totalDeductionsCents/100).toFixed(2)}`]);
      
      autoTable(doc, {
        startY: currentY + 4,
        theme: 'striped',
        headStyles: { fillColor: [254, 226, 226], textColor: [153, 27, 27] }, // rose-100/rose-800
        head: [['Description', 'Amount']],
        body: deductionsBody,
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    }
    
    // Net Pay
    doc.setFontSize(18);
    doc.setTextColor(6, 95, 70); // emerald-800
    doc.text(`NET PAY: Rs. ${(payslip.netPayCents/100).toFixed(2)}`, 14, currentY + 10);
    
    // Footer
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // slate-400
    const pageHeight = doc.internal.pageSize.height;
    doc.text('This is a computer-generated payslip.', 14, pageHeight - 20);
    doc.text(`Generated by: ${currentUser.name || currentUser.username}`, 14, pageHeight - 15);
    doc.text(`Status: ${payslip.status.toUpperCase()}`, 14, pageHeight - 10);
    
    const safeName = staff.fullName.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`payslip_${safeName}_${payslip.periodStart}_${payslip.periodEnd}.pdf`);
  };

  const payslipHistorySorted = [...(payslips || [])].sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''));

  const openNew = () => {
    setFormData({ active: true, employmentType: 'hourly' });
    setIsEditing(false);
    setShowModal(true);
  };

  const openEdit = (profile: StaffProfile) => {
    setFormData({
      ...profile,
      hourlyRate: profile.hourlyRate ? profile.hourlyRate / 100 : undefined,
      monthlySalary: profile.monthlySalary ? profile.monthlySalary / 100 : undefined
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName) return showToast('Full name is required', 'error');

    const p: StaffProfile = {
      id: isEditing && formData.id ? formData.id : crypto.randomUUID(),
      fullName: formData.fullName,
      position: formData.position || '',
      department: formData.department || '',
      employmentType: formData.employmentType as 'hourly' | 'monthly',
      hourlyRate: formData.employmentType === 'hourly' && formData.hourlyRate ? Math.round(Number(formData.hourlyRate) * 100) : undefined,
      monthlySalary: formData.employmentType === 'monthly' && formData.monthlySalary ? Math.round(Number(formData.monthlySalary) * 100) : undefined,
      hireDate: formData.hireDate || '',
      active: formData.active ?? true,
      userId: formData.userId,
    } as StaffProfile;

    try {
      await onSaveProfile(stampRecord(p));
      setShowModal(false);
      showToast('Staff profile saved.', 'success');
    } catch (e: any) {
      showToast(`Error saving profile: ${e.message}`, 'error');
    }
  };

  const handleLink = async (profile: StaffProfile) => {
    const userId = selectedUserIds[profile.id];
    if (!userId) return showToast('Select a user account first.', 'error');
    
    try {
      const updated = stampRecord({ ...profile, userId });
      await onSaveProfile(updated);
      setSelectedUserIds(prev => {
        const next = { ...prev };
        delete next[profile.id];
        return next;
      });
      showToast('Profile linked to user account.', 'success');
    } catch (e: any) {
      showToast(`Error linking profile: ${e.message}`, 'error');
    }
  };

  const handleUnlink = async (profile: StaffProfile) => {
    try {
      const updated = stampRecord({ ...profile, userId: undefined });
      await onSaveProfile(updated);
      showToast('Profile unlinked successfully.', 'success');
    } catch (e: any) {
      showToast(`Error unlinking profile: ${e.message}`, 'error');
    }
  };

  const handleClockIn = async () => {
    if (!clockSelectedStaff) return showToast('Select a staff member first', 'error');
    if (selectedStaffOpenEntry) return showToast('Staff member is already clocked in', 'error');

    const profile = staffProfiles.find(p => p.id === clockSelectedStaff);
    const source = profile?.userId === currentUser.id ? 'self' : 'manager';

    const newEntry: TimeEntry = {
      id: crypto.randomUUID(),
      staffId: clockSelectedStaff,
      date: todayISO,
      clockIn: new Date().toISOString(),
      enteredBy: currentUser.id,
      source,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      _dirty: true
    };

    try {
      await onSaveTimeEntry(stampRecord(newEntry) as TimeEntry);
      showToast('Clocked in successfully', 'success');
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    }
  };

  const handleClockOut = async () => {
    if (!clockSelectedStaff || !selectedStaffOpenEntry) return showToast('No open time entry found', 'error');

    const clockOutTime = new Date();
    const clockInTime = new Date(selectedStaffOpenEntry.clockIn);
    const durationMinutes = Math.round((clockOutTime.getTime() - clockInTime.getTime()) / 60000);

    const updatedEntry: TimeEntry = {
      ...selectedStaffOpenEntry,
      clockOut: clockOutTime.toISOString(),
      durationMinutes
    };

    try {
      await onSaveTimeEntry(stampRecord(updatedEntry) as TimeEntry);
      showToast('Clocked out successfully', 'success');
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    }
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualClockData.staffId || !manualClockData.date || !manualClockData.clockIn) {
      return showToast('Staff, Date, and Clock In time are required.', 'error');
    }

    const clockInIso = new Date(`${manualClockData.date}T${manualClockData.clockIn}:00`).toISOString();
    let clockOutIso = undefined;
    let durationMinutes = undefined;
    
    if (manualClockData.clockOut) {
      clockOutIso = new Date(`${manualClockData.date}T${manualClockData.clockOut}:00`).toISOString();
      durationMinutes = Math.round((new Date(clockOutIso).getTime() - new Date(clockInIso).getTime()) / 60000);
    }

    const newEntry: TimeEntry = {
      id: crypto.randomUUID(),
      staffId: manualClockData.staffId,
      date: manualClockData.date,
      clockIn: clockInIso,
      clockOut: clockOutIso,
      durationMinutes,
      enteredBy: currentUser.id,
      source: 'manager',
      notes: manualClockData.notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      _dirty: true
    };

    try {
      await onSaveTimeEntry(stampRecord(newEntry) as TimeEntry);
      showToast('Manual entry saved', 'success');
      setManualClockData({ staffId: '', date: todayISO, clockIn: '', clockOut: '', notes: '' });
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    }
  };

  const getRoleColor = (role: string) => {
    const r = role.toLowerCase();
    if (r.includes('admin') || r.includes('owner') || r.includes('vet on call')) return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (r.includes('veterinarian') || r.includes('vet')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (r.includes('cashier')) return 'bg-sky-100 text-sky-700 border-sky-200';
    if (r.includes('groomer')) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleData.staffId || !scheduleData.date || !scheduleData.startTime || !scheduleData.endTime || !scheduleData.role) {
      return showToast('All fields are required', 'error');
    }

    let shiftStart = new Date(`${scheduleData.date}T${scheduleData.startTime}:00`);
    let shiftEnd = new Date(`${scheduleData.date}T${scheduleData.endTime}:00`);
    
    if (shiftEnd < shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    const newEntry: ScheduleEntry = {
      id: crypto.randomUUID(),
      staffId: scheduleData.staffId,
      shiftStart: shiftStart.toISOString(),
      shiftEnd: shiftEnd.toISOString(),
      role: scheduleData.role,
      notes: scheduleData.notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      _dirty: true
    };

    try {
      await onSaveScheduleEntry(stampRecord(newEntry) as ScheduleEntry);
      setShowScheduleModal(false);
      showToast('Shift added', 'success');
    } catch (e: any) {
      showToast(`Error saving shift: ${e.message}`, 'error');
    }
  };

  const weekDays = Array.from({length: 7}).map((_, i) => {
    const d = new Date(scheduleWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-slate-50 w-full overflow-hidden font-sans relative">
      <header className="flex-none px-8 py-6 bg-white border-b border-slate-200 shrink-0 z-10 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2"><UserCog className="w-7 h-7 text-indigo-600"/> Staff & Payroll</h1>
            <p className="text-sm font-bold text-slate-500 mt-1">Manage team members and user access links</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setActiveTab('roster')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'roster' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Roster</button>
            <button onClick={() => setActiveTab('schedule')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'schedule' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Schedule</button>
            <button onClick={() => setActiveTab('clock')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'clock' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Time Clock</button>
            <button onClick={() => setActiveTab('link')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'link' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Link to Login</button>
            <button onClick={() => setActiveTab('payslips')} data-testid="tab-payslips" className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'payslips' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Payslips</button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {activeTab === 'roster' ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">Active Roster</h2>
              <button onClick={openNew} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] uppercase tracking-widest font-black rounded-xl shadow-md flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap">
                <Plus className="w-4 h-4"/> Add Staff Member
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {activeProfiles.map(p => (
                <div key={p.id} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between relative group hover:border-indigo-300 transition-colors">
                  <div className="space-y-2">
                    <h3 className="text-lg font-black text-slate-800 tracking-tight">{p.fullName}</h3>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{p.position} {p.department ? `• ${p.department}` : ''}</div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${p.employmentType === 'hourly' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                        {p.employmentType}
                      </span>
                      {p.userId && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700">
                          Linked to Login
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-[10px] font-bold text-slate-400 font-mono">Hired: {p.hireDate || 'N/A'}</div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(p)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer" title="Edit Profile"><Edit className="w-4 h-4"/></button>
                      <button onClick={() => onDeactivateProfile(p.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer" title="Deactivate"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                </div>
              ))}
              {activeProfiles.length === 0 && (
                 <div className="col-span-full py-12 text-center text-slate-400 font-bold text-sm">No active staff profiles.</div>
              )}
            </div>

            {inactiveProfiles.length > 0 && (
              <div className="mt-12 pt-6 border-t border-slate-200">
                <button onClick={() => setShowInactive(!showInactive)} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer">
                  {showInactive ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>} Inactive Staff ({inactiveProfiles.length})
                </button>
                {showInactive && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6 opacity-60">
                    {inactiveProfiles.map(p => (
                      <div key={p.id} className="bg-slate-50 border border-slate-200 p-6 rounded-2xl flex flex-col justify-between">
                        <div className="space-y-2">
                          <h3 className="text-lg font-black text-slate-600 tracking-tight">{p.fullName}</h3>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{p.position} {p.department ? `• ${p.department}` : ''}</div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-slate-200 text-slate-500">Inactive</span>
                          <button onClick={() => openEdit(p)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"><Edit className="w-4 h-4"/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : activeTab === 'schedule' ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center gap-4">
                <button onClick={() => setScheduleWeekStart(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"><ChevronLeft className="w-5 h-5"/></button>
                <div className="text-sm font-bold text-slate-800">
                  {weekDays[0].toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})} - {weekDays[6].toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'})}
                </div>
                <button onClick={() => setScheduleWeekStart(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"><ChevronRight className="w-5 h-5"/></button>
              </div>
              <button onClick={() => setShowScheduleModal(true)} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] uppercase tracking-widest font-black rounded-xl shadow-md flex items-center gap-2 transition-colors cursor-pointer">
                <CalendarIcon className="w-4 h-4"/> Add Shift
              </button>
            </div>
            
            <div className="grid grid-cols-7 gap-4">
              {weekDays.map((date, i) => {
                const dayISO = date.toISOString().split('T')[0];
                const dayShifts = scheduleEntries ? scheduleEntries.filter(e => e.shiftStart.startsWith(dayISO)).sort((a,b) => new Date(a.shiftStart).getTime() - new Date(b.shiftStart).getTime()) : [];
                return (
                  <div key={i} className="flex flex-col gap-3 min-h-[500px] bg-slate-100/50 rounded-2xl p-3 border border-slate-200">
                    <div className="text-center pb-2 border-b border-slate-200">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{date.toLocaleDateString('en-US', {weekday: 'short'})}</div>
                      <div className="text-lg font-bold text-slate-800">{date.getDate()} {date.toLocaleDateString('en-US', {month: 'short'})}</div>
                    </div>
                    {dayShifts.map(shift => {
                      const p = staffProfiles.find(s => s.id === shift.staffId);
                      const colorClass = getRoleColor(shift.role);
                      return (
                        <div key={shift.id} className={`p-3 rounded-xl border relative group ${colorClass}`}>
                          <button onClick={() => onDeleteScheduleEntry(shift.id)} className="absolute top-1 right-1 p-1 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/10"><X className="w-3 h-3"/></button>
                          <div className="font-bold text-xs">{p?.fullName || 'Unknown'}</div>
                          <div className="text-[10px] font-black uppercase tracking-widest opacity-80 mt-1">{shift.role}</div>
                          <div className="text-xs font-mono font-bold mt-2 pt-2 border-t border-black/10">
                            {new Date(shift.shiftStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}–{new Date(shift.shiftEnd).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeTab === 'link' ? (
          <div className="space-y-8 max-w-4xl">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Link className="w-4 h-4 text-indigo-500"/> Connect Staff to System Logins</h3>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Profiles without an attached user account cannot sign in to the POS or Vault.</p>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-widest font-black text-slate-500">
                  <tr><th className="p-4">Staff Profile</th><th className="p-4">System User Account</th><th className="p-4 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unlinkedProfiles.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{p.fullName}</div>
                        <div className="text-[10px] font-bold text-slate-400">{p.position}</div>
                      </td>
                      <td className="p-4">
                        <select value={selectedUserIds[p.id] || ''} onChange={(e) => setSelectedUserIds(prev => ({...prev, [p.id]: e.target.value}))} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500">
                          <option value="">-- Select User Account --</option>
                          {availableUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}
                        </select>
                      </td>
                      <td className="p-4 text-right">
                        <button onClick={() => handleLink(p)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer shadow-sm">Link</button>
                      </td>
                    </tr>
                  ))}
                  {unlinkedProfiles.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-slate-400 font-bold text-sm">All active staff profiles are linked to user accounts.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden opacity-80">
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500"/> Linked Profiles</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-widest font-black text-slate-500">
                  <tr><th className="p-4">Staff Profile</th><th className="p-4">Linked User Username</th><th className="p-4 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linkedProfiles.map(p => {
                    const u = users.find(u => u.id === p.userId);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="p-4 font-bold text-slate-800">{p.fullName}</td>
                        <td className="p-4 font-mono text-xs text-slate-600">{u ? u.username : 'Unknown (Invalid ID)'}</td>
                        <td className="p-4 text-right">
                          <button onClick={() => handleUnlink(p)} className="px-3 py-1.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer flex items-center gap-1 ml-auto"><Unlink className="w-3 h-3"/> Unlink</button>
                        </td>
                      </tr>
                    );
                  })}
                  {linkedProfiles.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-slate-400 font-bold text-sm">No linked profiles found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'clock' ? (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center">
                <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2 mb-6"><Clock className="w-5 h-5 text-indigo-500"/> Quick Clock Panel</h2>
                <div className="w-full max-w-sm space-y-6">
                  <select value={clockSelectedStaff} onChange={e => setClockSelectedStaff(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="">-- Select Staff Member --</option>
                    {activeProfiles.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                  </select>
                  
                  <div className="flex gap-4">
                    <button onClick={handleClockIn} disabled={!!selectedStaffOpenEntry} className={`flex-1 py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all ${!!selectedStaffOpenEntry ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md'}`}>Clock In</button>
                    <button onClick={handleClockOut} disabled={!selectedStaffOpenEntry} className={`flex-1 py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all ${!selectedStaffOpenEntry ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-rose-600 text-white hover:bg-rose-700 shadow-md'}`}>Clock Out</button>
                  </div>
                  
                  <div className="text-center">
                    {clockSelectedStaff ? (
                      selectedStaffOpenEntry ? (
                        <p className="text-sm font-bold text-emerald-600 bg-emerald-50 py-2 rounded-xl border border-emerald-100">{activeProfiles.find(p => p.id === clockSelectedStaff)?.fullName} is currently CLOCKED IN since {new Date(selectedStaffOpenEntry.clockIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      ) : (
                        <p className="text-sm font-bold text-slate-500 bg-slate-50 py-2 rounded-2xl border border-slate-200">{activeProfiles.find(p => p.id === clockSelectedStaff)?.fullName} is not clocked in today.</p>
                      )
                    ) : (
                       <p className="text-sm font-bold text-slate-400">Select a profile to view status</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 tracking-tight mb-6">Manager Override — Edit / Add Entry</h2>
                <form onSubmit={handleManualSave} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Staff Profile</label>
                      <select required value={manualClockData.staffId} onChange={e => setManualClockData({...manualClockData, staffId: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500">
                        <option value="">-- Select --</option>
                        {activeProfiles.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Date</label>
                      <input required type="date" value={manualClockData.date} onChange={e => setManualClockData({...manualClockData, date: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Clock In Time</label>
                      <input required type="time" value={manualClockData.clockIn} onChange={e => setManualClockData({...manualClockData, clockIn: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Clock Out Time (Optional)</label>
                      <input type="time" value={manualClockData.clockOut} onChange={e => setManualClockData({...manualClockData, clockOut: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes (Optional)</label>
                    <input type="text" value={manualClockData.notes} onChange={e => setManualClockData({...manualClockData, notes: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="Reason for override..." />
                  </div>
                  <div className="pt-2 flex justify-end">
                    <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Save Entry</button>
                  </div>
                </form>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">Today's Entries</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-widest font-black text-slate-500">
                  <tr><th className="p-4">Staff Member</th><th className="p-4">Time In / Out</th><th className="p-4">Duration</th><th className="p-4">Source</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todaysEntries.map(entry => {
                    const profile = staffProfiles.find(p => p.id === entry.staffId);
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/50">
                        <td className="p-4 font-bold text-slate-800">{profile?.fullName || 'Unknown'}</td>
                        <td className="p-4 font-mono text-xs text-slate-600">
                          {new Date(entry.clockIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {entry.clockOut ? new Date(entry.clockOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : <span className="text-emerald-600 font-bold bg-emerald-50 px-1 py-0.5 rounded">Still in</span>}
                        </td>
                        <td className="p-4 text-slate-600 font-bold text-xs">{entry.durationMinutes !== undefined ? `${Math.floor(entry.durationMinutes/60)}h ${entry.durationMinutes%60}m` : '--'}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${entry.source === 'manager' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{entry.source}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {todaysEntries.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400 font-bold text-sm">No time entries recorded today.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'payslips' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT — Generate New Payslip */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2"><Wallet className="w-5 h-5 text-indigo-500"/> Generate New Payslip</h2>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Staff Member</label>
                <select data-testid="payslip-staff-select" value={payslipStaffId} onChange={e => { setPayslipStaffId(e.target.value); setPayslipCalculated(null); }} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  <option value="">-- Select Staff --</option>
                  {activeProfiles.map(p => <option key={p.id} value={p.id}>{p.fullName} ({p.employmentType})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Period Start</label>
                  <input data-testid="payslip-period-start" type="date" value={payslipPeriodStart} onChange={e => setPayslipPeriodStart(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Period End</label>
                  <input data-testid="payslip-period-end" type="date" value={payslipPeriodEnd} onChange={e => setPayslipPeriodEnd(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                </div>
              </div>

              <button data-testid="payslip-calculate-btn" onClick={handleCalculatePayslip} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] uppercase tracking-widest font-black rounded-xl shadow-md transition-colors cursor-pointer">Calculate</button>

              {payslipCalculated && selectedPayslipStaff && (
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Breakdown</div>
                  {payslipCalculated.isHourly ? (
                    <>
                      <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                        {payslipCalculated.entries.length === 0 && <div className="text-xs text-slate-400 font-bold">No completed time entries in this period.</div>}
                        {payslipCalculated.entries.map(t => {
                          const hours = (t.durationMinutes || 0) / 60;
                          const rowCents = Math.round(hours * (selectedPayslipStaff.hourlyRate || 0));
                          return (
                            <div key={t.id} className="flex justify-between text-xs font-mono bg-white p-2 rounded-xl border border-slate-100">
                              <span className="font-bold text-slate-600">{t.date}</span>
                              <span className="text-slate-500">{new Date(t.clockIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}–{t.clockOut ? new Date(t.clockOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--'}</span>
                              <span className="text-slate-500">{hours.toFixed(2)}h</span>
                              <span className="font-black text-slate-800">Rs. {(rowCents/100).toFixed(2)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-xs font-bold text-slate-600 flex justify-between pt-2 border-t border-slate-200">
                        <span>Total Hours Worked</span>
                        <span data-testid="payslip-total-hours" className="font-mono font-black text-slate-800">{(payslipCalculated.totalMinutes / 60).toFixed(2)}h</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs font-bold text-slate-600 flex justify-between">
                      <span>Monthly flat rate</span>
                      <span className="font-mono font-black text-slate-800">Rs. {((selectedPayslipStaff.monthlySalary || 0)/100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="text-sm font-black text-slate-800 flex justify-between pt-2 border-t border-slate-200">
                    <span>Gross Pay</span>
                    <span data-testid="payslip-gross-pay" className="font-mono">Rs. {(payslipCalculated.grossPayCents/100).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {payslipCalculated && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Deductions</label>
                    <button data-testid="payslip-add-deduction-btn" onClick={() => setPayslipDeductions(prev => [...prev, { label: '', amountRs: '' }])} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors cursor-pointer flex items-center gap-1"><Plus className="w-3 h-3"/> Add Deduction</button>
                  </div>
                  {payslipDeductions.map((d, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input data-testid={`payslip-deduction-label-${i}`} type="text" value={d.label} onChange={e => setPayslipDeductions(prev => prev.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} placeholder="Label (e.g. Advance)" className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      <input data-testid={`payslip-deduction-amount-${i}`} type="number" step="0.01" min="0" value={d.amountRs} onChange={e => setPayslipDeductions(prev => prev.map((x, idx) => idx === i ? { ...x, amountRs: e.target.value } : x))} placeholder="Rs." className="w-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                      <button onClick={() => setPayslipDeductions(prev => prev.filter((_, idx) => idx !== i))} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"><X className="w-4 h-4"/></button>
                    </div>
                  ))}

                  <div className="pt-4 border-t border-slate-200 flex justify-between items-baseline">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-500">Net Pay</span>
                    <span data-testid="payslip-net-pay" className="text-3xl font-black text-emerald-700 font-mono">Rs. {(netPayCents/100).toFixed(2)}</span>
                  </div>

                  <button data-testid="payslip-save-draft-btn" onClick={handleSavePayslipDraft} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] uppercase tracking-widest font-black rounded-xl shadow-md transition-colors cursor-pointer">Save as Draft</button>
                </div>
              )}
            </div>

            {/* RIGHT — Payslip History */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500"/> Payslip History</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {payslipHistorySorted.length === 0 && <div className="p-8 text-center text-slate-400 font-bold text-sm">No payslips generated yet.</div>}
                {payslipHistorySorted.map(p => {
                  const staff = staffProfiles.find(s => s.id === p.staffId);
                  const badgeCls = p.status === 'draft' ? 'bg-slate-200 text-slate-700' : p.status === 'finalized' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700';
                  return (
                    <div key={p.id} data-testid={`payslip-row-${p.id}`} className="p-4 hover:bg-slate-50/50 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate">{staff?.fullName || 'Unknown Staff'}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{p.periodStart} → {p.periodEnd}</div>
                        <div className="text-xs font-mono font-bold text-slate-600 mt-1">Gross Rs. {(p.grossPayCents/100).toFixed(2)} · Net Rs. {(p.netPayCents/100).toFixed(2)}</div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span data-testid={`payslip-status-${p.id}`} className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${badgeCls}`}>{p.status}</span>
                        <div className="flex gap-1">
                          {p.status === 'draft' && (
                            <button data-testid={`payslip-finalize-${p.id}`} onClick={() => handleUpdatePayslipStatus(p, 'finalized')} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors cursor-pointer">Finalize</button>
                          )}
                          {p.status === 'finalized' && (
                            <button data-testid={`payslip-mark-paid-${p.id}`} onClick={() => handleUpdatePayslipStatus(p, 'paid')} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors cursor-pointer">Mark Paid</button>
                          )}
                          {(p.status === 'finalized' || p.status === 'paid') && (
                            <button data-testid={`payslip-download-${p.id}`} onClick={() => staff && generatePayslipPDF(p, staff)} className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors cursor-pointer">Download PDF</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {showModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800">{isEditing ? 'Edit Staff Profile' : 'New Staff Profile'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:bg-slate-200 rounded transition-colors cursor-pointer"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleSave} className="p-6 overflow-y-auto max-h-[80vh] custom-scrollbar space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Full Name *</label>
                <input required type="text" value={formData.fullName || ''} onChange={e => setFormData({...formData, fullName: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Position</label>
                  <input type="text" value={formData.position || ''} onChange={e => setFormData({...formData, position: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Department</label>
                  <input type="text" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Employment Type</label>
                  <select value={formData.employmentType || 'hourly'} onChange={e => setFormData({...formData, employmentType: e.target.value as any})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="hourly">Hourly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Hire Date</label>
                  <input type="date" value={formData.hireDate || ''} onChange={e => setFormData({...formData, hireDate: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                </div>
              </div>
              
              {formData.employmentType === 'hourly' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Hourly Rate (Rs.)</label>
                  <input type="number" step="0.01" min="0" value={formData.hourlyRate || ''} onChange={e => setFormData({...formData, hourlyRate: e.target.value ? Number(e.target.value) : undefined})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                </div>
              )}
              {formData.employmentType === 'monthly' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Monthly Salary (Rs.)</label>
                  <input type="number" step="0.01" min="0" value={formData.monthlySalary || ''} onChange={e => setFormData({...formData, monthlySalary: e.target.value ? Number(e.target.value) : undefined})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="profile-active" checked={formData.active !== false} onChange={e => setFormData({...formData, active: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                <label htmlFor="profile-active" className="text-xs font-bold text-slate-700 select-none cursor-pointer">Active Employee</label>
              </div>

              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Cancel</button>
                <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Save Profile</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showScheduleModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800">Add Shift</h3>
              <button onClick={() => setShowScheduleModal(false)} className="p-1 text-slate-400 hover:bg-slate-200 rounded transition-colors cursor-pointer"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleSaveSchedule} className="p-6 overflow-y-auto max-h-[80vh] custom-scrollbar space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Staff Profile *</label>
                <select required value={scheduleData.staffId} onChange={e => setScheduleData({...scheduleData, staffId: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  <option value="">-- Select --</option>
                  {activeProfiles.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Date *</label>
                  <input required type="date" value={scheduleData.date} onChange={e => setScheduleData({...scheduleData, date: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Role/Capacity *</label>
                  <input required type="text" list="roles-list" value={scheduleData.role} onChange={e => setScheduleData({...scheduleData, role: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="e.g. Vet on Call" />
                  <datalist id="roles-list">
                    <option value="Vet on Call" />
                    <option value="Cashier" />
                    <option value="Groomer" />
                    <option value="Receptionist" />
                    <option value="Kennel" />
                  </datalist>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Start Time *</label>
                  <input required type="time" value={scheduleData.startTime} onChange={e => setScheduleData({...scheduleData, startTime: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">End Time *</label>
                  <input required type="time" value={scheduleData.endTime} onChange={e => setScheduleData({...scheduleData, endTime: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes (Optional)</label>
                <input type="text" value={scheduleData.notes} onChange={e => setScheduleData({...scheduleData, notes: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>

              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 mt-6">
                <button type="button" onClick={() => setShowScheduleModal(false)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Cancel</button>
                <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Save Shift</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
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
