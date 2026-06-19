/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Calendar as CalendarIcon, Clock, Search, Plus, User, CheckCircle2, 
  Activity, X, ChevronLeft, ChevronRight, List as ListIcon, 
  Edit2, Trash2, Lock, Stethoscope, Phone, PenTool
} from 'lucide-react';
import { Appointment, AppointmentStatus, MedicalRecord, PetClassification } from '../types';
import { showToast } from './Toast';
import { formatDisplayDate, formatDisplayTime } from '../utils/time';

interface AppointmentsProps {
  appointments: Appointment[];
  records: MedicalRecord[];
  isOnline: boolean;
  onAddAppointment: (appointment: Appointment) => void;
  onUpdateStatus: (id: string, status: AppointmentStatus) => void;
  onAddRecord: (record: MedicalRecord) => void;
  onUpdateAppointment?: (appointment: Appointment) => void;
  preFilledClient?: any;
  preFilledPet?: any;
  onGenerateConsent?: (clientName: string, petName: string) => void;
}

export default function AppointmentsManager({ 
  appointments,
  records,
  isOnline, 
  onAddAppointment, 
  onUpdateStatus,
  onAddRecord,
  onUpdateAppointment,
  preFilledClient,
  preFilledPet,
  onGenerateConsent
}: AppointmentsProps) {
  
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>('week');
  const [doctorFilter, setDoctorFilter] = useState('All Doctors');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const listFilters = ['All', 'Pending', 'Confirmed', 'Completed', 'Cancelled', 'No show'];

  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    // Bug #6 Fix: Removed legacy localStorage.getItem('ceylon_history_v2') read.
    // The appointments prop (hydrated from IndexedDB vault) is the single source of truth.
    const sorted = [...appointments].sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time}`);
      const dateB = new Date(`${b.date}T${b.time}`);
      return dateB.getTime() - dateA.getTime();
    });

    setAllAppointments(sorted);
  }, [appointments]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAptId, setEditingAptId] = useState<string | null>(null);
  
  const [petName, setPetName] = useState('');
  const [petType, setPetType] = useState<PetClassification>('Canine');
  const [breed, setBreed] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [date, setDate] = useState(formatDisplayDate(new Date()));
  const [time, setTime] = useState(formatDisplayTime(new Date()));
  const [veterinarian, setVeterinarian] = useState('Dr. Bandara');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  
  const [admissionType, setAdmissionType] = useState('OPD');
  const [phone2, setPhone2] = useState('');
  const [address, setAddress] = useState('');
  const [sex, setSex] = useState('Unknown');

  const [selectedPopoverApt, setSelectedPopoverApt] = useState<Appointment | null>(null);
  const [overflowPopover, setOverflowPopover] = useState<{date: string, apts: Appointment[]} | null>(null);

  useEffect(() => {
    if (preFilledClient || preFilledPet) {
      if (preFilledClient) {
        setOwnerName(preFilledClient.full_name || preFilledClient.name || '');
        setOwnerPhone(preFilledClient.primary_phone || preFilledClient.phone || '');
        if (preFilledClient.email_address) setOwnerEmail(preFilledClient.email_address);
        if (preFilledClient.physical_address) setAddress(preFilledClient.physical_address);
      }
      if (preFilledPet) {
        setPetName(preFilledPet.petName || '');
        setPetType(preFilledPet.petType || 'Canine');
        setBreed(preFilledPet.breed || '');
      }
      setShowAddModal(true);
    }
  }, [preFilledClient, preFilledPet]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddModal) { setShowAddModal(false); resetForm(); }
        if (selectedPopoverApt) setSelectedPopoverApt(null);
        if (overflowPopover) setOverflowPopover(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showAddModal, selectedPopoverApt, overflowPopover]);

  const resetForm = () => {
    setEditingAptId(null);
    setPetName(''); setBreed(''); setOwnerName(''); setOwnerPhone(''); setOwnerEmail('');
    setReason(''); setFormError(''); setAdmissionType('OPD'); setPhone2(''); setAddress('');
    setSex('Unknown'); setDate(formatDisplayDate(new Date())); setTime(formatDisplayTime(new Date()));
  };

  const handleEditClick = (apt: Appointment) => {
    if (apt.status === 'completed' || apt.status === 'cancelled') return;
    setEditingAptId(apt.id);
    setPetName(apt.petName);
    setPetType(apt.petType);
    setBreed(apt.breed);
    setOwnerName(apt.ownerName);
    setOwnerPhone(apt.ownerPhone);
    setOwnerEmail(apt.ownerEmail || '');
    setDate(apt.date);
    setTime(apt.time);
    setVeterinarian(apt.veterinarian);
    setAdmissionType(apt.admissionType || 'OPD');
    
    let displayReason = apt.reason;
    const match = apt.reason.match(/:::METADATA(.*?):::/);
    if (match) {
      try {
        const meta = JSON.parse(match[1]);
        setPhone2(meta.phone2 || '');
        setAddress(meta.address || '');
        setSex(meta.sex || 'Unknown');
        displayReason = apt.reason.replace(match[0], '').trim();
      } catch(e){}
    } else {
      setPhone2(''); setAddress(''); setSex('Unknown');
    }
    
    setReason(displayReason);
    setSelectedPopoverApt(null);
    setShowAddModal(true);
  };

  const handleCreateAppointment = (e: React.FormEvent | React.KeyboardEvent) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!petName || !date || !time) {
      setFormError('Patient Name, Visit Date, and Time are required.');
      return;
    }

    const metadata = JSON.stringify({ phone2, address, sex });
    const tokenBlock = `:::METADATA${metadata}:::`;
    const packedReason = `${tokenBlock}\n${reason}`;
    const now = new Date().toISOString();

    if (editingAptId) {
      const existingApt = allAppointments.find(a => a.id === editingAptId);
      const updatedApt = {
        ...existingApt,
        id: editingAptId,
        petName,
        petType,
        breed: breed || 'Mixed breed',
        ownerName,
        ownerPhone,
        ownerEmail: ownerEmail || 'not-provided@example.com',
        date: formatDisplayDate(date),
        time: formatDisplayTime(time),
        veterinarian,
        assignedVet: veterinarian,
        admissionType: admissionType as any,
        reason: packedReason,
        updated_at: now
      } as any;
      
      if (onUpdateAppointment) {
        onUpdateAppointment(updatedApt);
      }
    } else {
      const aptNumber = 'APT-' + Date.now().toString().slice(-4);
      const newApt = {
        id: crypto.randomUUID(),
        aptNumber,
        petName,
        petType,
        breed: breed || 'Mixed breed',
        ownerName,
        ownerPhone,
        ownerEmail: ownerEmail || 'not-provided@example.com',
        date: formatDisplayDate(date),
        time: formatDisplayTime(time),
        veterinarian,
        assignedVet: veterinarian,
        admissionType: admissionType as any,
        reason: packedReason,
        status: 'booked',
        created_at: now,
        updated_at: now,
        is_deleted: false
      } as any;
      onAddAppointment(newApt);
    }

    setShowAddModal(false);
    resetForm();
  };

  const handleCheckIn = (apt: Appointment) => {
    if (apt.status === 'completed' || apt.status === 'cancelled') return;
    const normalizedPhone = apt.ownerPhone.replace(/\D/g, '');
    const patientExists = records.some(r => r.ownerPhone.replace(/\D/g, '') === normalizedPhone && r.petName.toLowerCase() === apt.petName.toLowerCase());
    
    if (!patientExists) {
      const newRecord: MedicalRecord = {
        id: crypto.randomUUID(), // Bug #4 Fix: Use UUID instead of Date.now() to prevent multi-terminal collisions
        patientId: `${apt.petName}_${normalizedPhone}`,
        petName: apt.petName,
        petType: apt.petType,
        breed: apt.breed || 'Mixed breed',
        age: 'Unknown',
        weight: 0,
        ownerName: apt.ownerName,
        ownerPhone: apt.ownerPhone,
        ownerEmail: apt.ownerEmail || 'not-provided@example.com',
        visitDate: apt.date,
        attendingVet: apt.veterinarian,
        symptoms: '',
        diagnosis: '',
        treatmentNotes: '',
        prescribedMeds: [],
        vaccinations: [],
        labResults: [],
        createdDate: new Date().toISOString().split('T')[0]
      };
      onAddRecord(newRecord);
    }
    onUpdateStatus(apt.id, 'in-progress');
    setSelectedPopoverApt(null);
  };

  const handleCancelApt = (apt: Appointment) => {
    if (apt.status === 'completed' || apt.status === 'cancelled') return;
    onUpdateStatus(apt.id, 'cancelled');
    setSelectedPopoverApt(null);
  };

  const toLocalISODate = (d: Date) => {
    const z = (n: number) => ('0' + n).slice(-2);
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  };

  const getWeekDays = (baseDate: Date) => {
    const d = new Date(baseDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  };

  const nextPeriod = () => {
    const d = new Date(currentDate);
    if (timeframe === 'week') d.setDate(d.getDate() + 7);
    else if (timeframe === 'day') d.setDate(d.getDate() + 1);
    else d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  const prevPeriod = () => {
    const d = new Date(currentDate);
    if (timeframe === 'week') d.setDate(d.getDate() - 7);
    else if (timeframe === 'day') d.setDate(d.getDate() - 1);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const baseFilteredApts = allAppointments.filter(apt => {
    if (doctorFilter !== 'All Doctors' && apt.veterinarian !== doctorFilter) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        apt.petName.toLowerCase().includes(q) || 
        apt.ownerName.toLowerCase().includes(q) || 
        apt.ownerPhone.toLowerCase().includes(q) ||
        (apt.aptNumber && apt.aptNumber.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }
    return true;
  });

  const listFilteredApts = baseFilteredApts.filter(apt => {
    if (statusFilter === 'All') return true;
    if (statusFilter === 'Pending') return apt.status === 'booked';
    if (statusFilter === 'Confirmed') return apt.status === 'in-progress';
    if (statusFilter === 'Completed') return apt.status === 'completed';
    if (statusFilter === 'Cancelled' || statusFilter === 'No show') return apt.status === 'cancelled';
    return true;
  });

  const todayStr = toLocalISODate(currentDate);
  const todaysApts = allAppointments.filter(a => a.date === todayStr);
  const todayVolume = todaysApts.length;
  const awaitingTriage = todaysApts.filter(a => a.status === 'booked').length;
  const inTreatment = todaysApts.filter(a => a.status === 'in-progress').length;

  const getStatusPill = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'booked') return <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-md text-[10px] font-bold uppercase border border-amber-100">Pending</span>;
    if (s === 'in-progress') return <span className="px-2.5 py-1 bg-sky-50 text-sky-600 rounded-md text-[10px] font-bold uppercase border border-sky-100 flex items-center gap-1 w-max"><Activity className="h-3 w-3 animate-pulse" /> In Treatment</span>;
    if (s === 'completed') return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-md text-[10px] font-bold uppercase border border-emerald-100">Completed</span>;
    if (s === 'cancelled') return <span className="px-2.5 py-1 bg-rose-50 text-rose-600 rounded-md text-[10px] font-bold uppercase border border-rose-100">Cancelled</span>;
    return <span className="px-2.5 py-1 bg-slate-50 text-slate-600 rounded-md text-[10px] font-bold uppercase border border-slate-200">{status}</span>;
  };

  const getServicePill = (apt: Appointment) => {
    const type = apt.admissionType || 'OPD';
    let colors = 'bg-slate-50 text-slate-700 border-slate-200';
    if (type === 'OPD') colors = 'bg-blue-50 text-blue-700 border-blue-200';
    else if (type === 'Vaccination') colors = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    else if (type === 'Hospital Admission') colors = 'bg-rose-50 text-rose-700 border-rose-200';
    else if (type === 'Pet Boarding') colors = 'bg-amber-50 text-amber-700 border-amber-200';
    return <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-block ${colors}`}>{type}</span>;
  };

  const currentDisplayAptNumber = editingAptId 
    ? allAppointments.find(a => a.id === editingAptId)?.aptNumber || 'N/A'
    : 'APT-' + Date.now().toString().slice(-4);

  const renderCalendarView = () => {
    if (timeframe === 'month') {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const days = [];
      for(let i=0; i<start.getDay(); i++) days.push(null);
      for(let i=1; i<=end.getDate(); i++) days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
      
      return (
        <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm h-full overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="p-3 text-center text-[10px] uppercase font-bold text-slate-500">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 flex-1 bg-slate-200 gap-px border-t border-slate-200 overflow-y-auto custom-scrollbar h-full">
            {days.map((d, i) => {
              if(!d) return <div key={`empty-${i}`} className="bg-slate-50/50 min-h-[100px] h-full" />;
              const dayStr = toLocalISODate(d);
              const apts = baseFilteredApts.filter(a => a.date === dayStr);
              const displayApts = apts.slice(0, 3);
              const hasOverflow = apts.length > 3;

              return (
                <div 
                  key={dayStr} 
                  className="bg-white p-2 min-h-[100px] h-full hover:bg-slate-50 transition-colors cursor-pointer flex flex-col relative"
                  onClick={() => { setCurrentDate(d); setTimeframe('day'); }}
                >
                  <div className={`text-xs font-bold mb-1.5 z-10 ${d.toDateString() === new Date().toDateString() ? 'text-indigo-600 bg-indigo-50 w-6 h-6 flex items-center justify-center rounded-full' : 'text-slate-600'}`}>{d.getDate()}</div>
                  <div className="space-y-1 flex-1 z-10 overflow-hidden">
                    {apts.length === 0 ? (
                      <div className="absolute inset-0 opacity-[0.03] bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#000_10px,#000_20px)] pointer-events-none"></div>
                    ) : (
                      <>
                        {displayApts.map(a => {
                          const isLocked = ['completed', 'cancelled'].includes(a.status);
                          return (
                            <div 
                              key={a.id} 
                              onClick={(e) => { e.stopPropagation(); setSelectedPopoverApt(a); }}
                              className={`text-[10px] p-1.5 rounded-lg truncate shadow-xs font-medium transition-colors flex items-center justify-between ${
                                isLocked 
                                  ? 'bg-slate-50 text-slate-500 border border-slate-200' 
                                  : 'bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100'
                              }`}
                            >
                              <div className="flex items-center gap-1 truncate">
                                {getServicePill(a)} <span className="truncate">{a.time} - {a.petName}</span>
                              </div>
                              {isLocked && <Lock className="w-2.5 h-2.5 ml-1 opacity-50 shrink-0" />}
                            </div>
                          )
                        })}
                        {hasOverflow && (
                          <div 
                            onClick={(e) => { e.stopPropagation(); setOverflowPopover({ date: dayStr, apts }); }}
                            className="text-[9px] font-bold text-slate-500 hover:text-indigo-600 mt-1 cursor-pointer w-full text-center py-1 bg-slate-50 hover:bg-indigo-50 rounded-lg transition-colors border border-slate-100"
                          >
                            +{apts.length - 3} more
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      );
    }

    const days = timeframe === 'day' ? [currentDate] : getWeekDays(currentDate);
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="flex-1 flex flex-col border border-slate-200 rounded-2xl bg-white shadow-sm h-full overflow-hidden">
        <div className="grid border-b border-slate-200 bg-slate-50 sticky top-0 z-10" style={{ gridTemplateColumns: `70px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="p-3 border-r border-slate-200 flex items-end justify-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time</div>
          {days.map(d => (
            <div 
              key={d.toISOString()} 
              className="p-3 text-center border-r border-slate-200 last:border-r-0 cursor-pointer hover:bg-slate-100 transition-colors"
              onClick={() => { setCurrentDate(d); setTimeframe('day'); }}
            >
              <div className="text-[10px] uppercase font-bold text-slate-400">{d.toLocaleDateString('en-US', {weekday:'short'})}</div>
              <div className={`text-sm font-extrabold mt-0.5 ${d.toDateString()===new Date().toDateString() ? 'text-indigo-600':'text-slate-700'}`}>{d.getDate()}</div>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar relative h-full">
          {hours.map(hour => (
            <div key={hour} className="grid border-b border-slate-100 min-h-[90px]" style={{ gridTemplateColumns: `70px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="p-2 border-r border-slate-200 bg-slate-50 flex items-start justify-center pt-3 text-[10px] font-bold text-slate-400">
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>
              {days.map(d => {
                const dayStr = toLocalISODate(d);
                const apts = baseFilteredApts.filter(a => a.date === dayStr && parseInt(a.time.split(':')[0], 10) === hour);
                
                return (
                  <div key={dayStr} className="p-1.5 border-r border-slate-100 last:border-r-0 relative hover:bg-slate-50/50 transition-colors z-10">
                    {apts.length === 0 && (
                      <div className="absolute inset-0 opacity-[0.03] bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#000_10px,#000_20px)] pointer-events-none"></div>
                    )}
                    {apts.map(a => {
                      const isLocked = ['completed', 'cancelled'].includes(a.status);
                      return (
                        <div 
                          key={a.id} 
                          onClick={(e) => { e.stopPropagation(); setSelectedPopoverApt(a); }}
                          className={`mb-1.5 p-2 border rounded-xl text-[10px] leading-tight shadow-xs cursor-pointer hover:shadow-sm transition-all group relative z-20 ${
                            isLocked 
                              ? 'bg-slate-50 border-slate-200 text-slate-500' 
                              : 'bg-indigo-50 border-indigo-100 text-indigo-800 hover:border-indigo-300'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-1 font-bold truncate">
                              {getServicePill(a)} {a.petName}
                            </div>
                            {isLocked && <Lock className="w-2.5 h-2.5 ml-1 opacity-50 shrink-0" />}
                          </div>
                          <div className="truncate opacity-80 mt-0.5 font-medium">{a.ownerName}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderListView = () => (
    <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm h-full overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center gap-4 overflow-x-auto custom-scrollbar">
        {listFilters.map(filter => (
          <button 
            key={filter} 
            onClick={() => setStatusFilter(filter)}
            className={`px-4 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${statusFilter === filter ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            {filter}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar h-full">
        <table className="w-full min-w-[1200px] text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-wider font-bold text-[10px]">
              <th className="py-4 px-4 w-40">Time</th>
              <th className="py-4 px-4">Pet Details</th>
              <th className="py-4 px-4">Owner Info</th>
              <th className="py-4 px-4">Service & Provider</th>
              <th className="py-4 px-4">Status</th>
              <th className="py-4 px-4 text-right w-32">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {listFilteredApts.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                  <CalendarIcon className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                  No appointments found.
                </td>
              </tr>
            ) : listFilteredApts.map((apt) => {
              const isLocked = ['completed', 'cancelled'].includes(apt.status);
              return (
              <tr key={apt.id} className="hover:bg-slate-50 transition-colors group">
                <td className="py-4 px-4">
                  <div className="font-bold text-slate-800">{formatDisplayDate(apt.date)}</div>
                  <div className="text-[10px] text-slate-500 font-medium">{formatDisplayTime(apt.time)}</div>
                </td>
                <td className="py-4 px-4">
                  <div className="flex flex-col items-start gap-1">
                    <div className="font-bold text-slate-800">{apt.petName}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shadow-xs border border-slate-200">{apt.aptNumber || 'N/A'}</span>
                      <span className="text-[10px] text-slate-500 font-medium">{apt.petType} - {apt.breed || 'Mixed'}</span>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-4">
                  <div className="font-bold text-slate-700">{apt.ownerName}</div>
                  <div className="text-[10px] text-slate-500 font-medium font-mono mt-0.5 flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" /> {apt.ownerPhone}
                  </div>
                </td>
                <td className="py-4 px-4">
                  <div className="flex flex-col items-start gap-1.5">
                    {getServicePill(apt)}
                    <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
                      <Stethoscope className="w-3 h-3 text-slate-400" /> {apt.assignedVet || apt.veterinarian}
                    </div>
                  </div>
                </td>
                <td className="py-4 px-4">
                  {getStatusPill(apt.status)}
                </td>
                <td className="py-4 px-4 text-right w-32">
                  <div className="flex items-center justify-end gap-1">
                    {apt.status === 'booked' && (
                      <button onClick={() => !isLocked && handleCheckIn(apt)} disabled={isLocked} title="Check In" className={`p-1.5 rounded-lg transition-colors ${isLocked ? 'text-slate-300 opacity-50 cursor-not-allowed' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer'}`}>
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => !isLocked && handleEditClick(apt)} disabled={isLocked} title={isLocked ? "Record Locked" : "Edit Details"} className={`p-1.5 rounded-lg transition-colors ${isLocked ? 'text-slate-300 opacity-50 cursor-not-allowed' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer'}`}>
                      {isLocked ? <Lock className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
                    </button>
                    <button onClick={() => !isLocked && handleCancelApt(apt)} disabled={isLocked} title={isLocked ? "Record Locked" : "Cancel Appointment"} className={`p-1.5 rounded-lg transition-colors ${isLocked ? 'text-slate-300 opacity-50 cursor-not-allowed' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-4" id="appointments-tab-system">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4 shrink-0">
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
          <h2 className="text-lg font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            Appointment Calendar
          </h2>
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            <button onClick={() => setViewMode('calendar')} className={`p-1.5 px-3 rounded-lg flex items-center gap-2 text-[10px] font-bold transition-all ${viewMode === 'calendar' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700 cursor-pointer'}`}>
              <CalendarIcon className="h-4 w-4" /> Calendar
            </button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 px-3 rounded-lg flex items-center gap-2 text-[10px] font-bold transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700 cursor-pointer'}`}>
              <ListIcon className="h-4 w-4" /> List
            </button>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-4 flex-1 justify-center px-4">
          <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[10px] font-extrabold shadow-xs flex items-center gap-1.5 uppercase tracking-wider">
            Today's Volume <span className="bg-white px-2 py-0.5 rounded-md border border-slate-100 text-slate-800">{todayVolume}</span>
          </div>
          <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-[10px] font-extrabold shadow-xs flex items-center gap-1.5 uppercase tracking-wider">
            Awaiting Triage <span className="bg-white px-2 py-0.5 rounded-md border border-amber-100 text-amber-900">{awaitingTriage}</span>
          </div>
          <div className="px-3 py-1.5 bg-sky-50 border border-sky-200 text-sky-700 rounded-xl text-[10px] font-extrabold shadow-xs flex items-center gap-1.5 uppercase tracking-wider">
            In-Treatment <span className="bg-white px-2 py-0.5 rounded-md border border-sky-100 text-sky-900">{inTreatment}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 w-full md:w-auto justify-center">
          <button onClick={prevPeriod} className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 shadow-xs transition-colors cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-[10px] font-extrabold text-slate-700 shadow-xs transition-colors cursor-pointer">
            Today
          </button>
          <button onClick={nextPeriod} className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 shadow-xs transition-colors cursor-pointer">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="px-3 text-[11px] font-extrabold text-slate-800 min-w-[140px] text-center">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
        </div>

        <div className="flex items-center gap-4 w-full xl:w-auto justify-end flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search apts, names..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500" 
            />
          </div>

          {viewMode === 'calendar' && (
            <div className="flex bg-slate-100 p-1 rounded-xl hidden sm:flex gap-1">
              {['day', 'week', 'month'].map(t => (
                <button key={t} onClick={() => setTimeframe(t as any)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold capitalize transition-all cursor-pointer ${timeframe === t ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
          
          <select value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)} className="hidden md:block px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer">
            <option>All Doctors</option>
            <option>Dr. Bandara</option>
            <option>Dr. Ismail</option>
          </select>

          <button onClick={() => { resetForm(); setShowAddModal(true); }} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs whitespace-nowrap">
            <Plus className="h-4 w-4" /> New Appointment
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? renderCalendarView() : renderListView()}

      {/* Overflow Appointments Mini-Popover */}
      {overflowPopover && createPortal(
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOverflowPopover(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 max-w-sm w-full animate-fade-in relative max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <button onClick={() => setOverflowPopover(null)} className="absolute top-3 right-3 p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"><X className="h-4 w-4" /></button>
            <h3 className="text-sm font-extrabold text-slate-800 mb-1">Appointments Overflow</h3>
            <p className="text-[10px] text-slate-500 font-medium mb-4">{overflowPopover.date}</p>
            
            <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 pr-1">
              {overflowPopover.apts.map(a => {
                const isLocked = ['completed', 'cancelled'].includes(a.status);
                return (
                  <div 
                    key={a.id} 
                    onClick={() => { setOverflowPopover(null); setSelectedPopoverApt(a); }}
                    className={`p-2.5 rounded-xl text-xs shadow-xs cursor-pointer hover:shadow-sm transition-all group border ${
                      isLocked 
                        ? 'bg-slate-50 border-slate-200 text-slate-500' 
                        : 'bg-indigo-50 border-indigo-100 text-indigo-800 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-0.5">
                      <div className="font-bold truncate">{a.petName}</div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{a.time}</span>
                        {isLocked && <Lock className="w-3 h-3 opacity-50 shrink-0" />}
                      </div>
                    </div>
                    <div className="truncate opacity-80 text-[10px] font-medium">{a.ownerName} - {a.reason.replace(/:::METADATA(.*?):::/, '').substring(0, 30)}...</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Calendar Quick Action Popover Modal */}
      {selectedPopoverApt && createPortal(
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedPopoverApt(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 max-w-sm w-full animate-fade-in relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedPopoverApt(null)} className="absolute top-3 right-3 p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"><X className="h-4 w-4" /></button>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-extrabold text-slate-800">{selectedPopoverApt.petName}</h3>
              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">{selectedPopoverApt.aptNumber}</span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mb-4">{selectedPopoverApt.date} at {selectedPopoverApt.time}</p>
            
            <div className="space-y-2">
              {selectedPopoverApt.status === 'booked' && (
                <button onClick={() => handleCheckIn(selectedPopoverApt)} className="w-full py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-250 font-bold rounded-xl text-[10px] uppercase tracking-wide flex justify-center items-center gap-2 cursor-pointer transition-colors">
                  <CheckCircle2 className="h-4 w-4" /> Check In Patient
                </button>
              )}

              {onGenerateConsent && (
                <button onClick={() => {
                  onGenerateConsent(selectedPopoverApt.ownerName, selectedPopoverApt.petName);
                  setSelectedPopoverApt(null);
                }} className="w-full py-2 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 font-bold rounded-xl text-[10px] uppercase tracking-wide flex justify-center items-center gap-2 cursor-pointer transition-colors">
                  <PenTool className="h-4 w-4" /> Generate Admission Consent
                </button>
              )}
              
              {!['completed', 'cancelled'].includes(selectedPopoverApt.status) ? (
                <>
                  <button onClick={() => handleEditClick(selectedPopoverApt)} className="w-full py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-bold rounded-xl text-[10px] uppercase tracking-wide flex justify-center items-center gap-2 cursor-pointer transition-colors">
                    <Edit2 className="h-4 w-4" /> Edit Details
                  </button>
                  <button onClick={() => handleCancelApt(selectedPopoverApt)} className="w-full py-2 bg-white text-rose-600 hover:bg-rose-50 border border-slate-200 font-bold rounded-xl text-[10px] uppercase tracking-wide flex justify-center items-center gap-2 cursor-pointer transition-colors">
                    <Trash2 className="h-4 w-4" /> Cancel Appointment
                  </button>
                </>
              ) : (
                <div className="w-full py-2 bg-slate-50 text-slate-400 border border-slate-200 font-bold rounded-xl text-[10px] uppercase tracking-wide flex justify-center items-center gap-2 cursor-not-allowed opacity-70">
                  <Lock className="h-4 w-4" /> Record Locked
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Main Appointment Form Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-sky-100 max-w-xl w-full text-[10px] shadow-xl animate-fade-in flex flex-col overflow-hidden max-h-[calc(100vh-40px)]">
            <div className="flex justify-between items-start shrink-0 p-6 pb-4 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-extrabold text-slate-800 leading-none">{editingAptId ? 'Edit Appointment Details' : 'Schedule Veterinary Check-up'}</h4>
                <p className="text-[10px] text-slate-400 mt-1">Update patient details and primary clinic complaint</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-100 text-slate-400 rounded-lg cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleCreateAppointment} className="flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
                {formError && <div className="text-red-600 bg-red-50 p-2 rounded mb-4 border border-red-200">{formError}</div>}
                
                <div className="grid grid-cols-3 gap-4 text-[11px]">
                  <div className="col-span-3 pb-2 border-b border-slate-100 mb-2 flex items-center gap-4">
                    <div className="flex-1 max-w-[150px]">
                      <label className="font-bold text-slate-600 block text-[10px] mb-1">Appointment Number</label>
                      <input type="text" readOnly value={currentDisplayAptNumber} className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono font-bold cursor-not-allowed focus:outline-none text-xs" />
                    </div>
                    <div className="flex-1 max-w-[200px]">
                      <label className="font-bold text-slate-600 block text-[10px] mb-1" htmlFor="admission-type">Admission Type</label>
                      <select name="admissionType" id="admission-type" value={admissionType} onChange={(e) => setAdmissionType(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-xs">
                        <option value="OPD">OPD</option>
                        <option value="Pet Boarding">Pet Boarding</option>
                        <option value="Hospital Admission">Hospital Admission</option>
                        <option value="Vaccination">Vaccination</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]" htmlFor="patient-name">Patient Name *</label>
                    <input name="patientName" id="patient-name" type="text" required maxLength={100} value={petName} onChange={(e) => { setPetName(e.target.value); if (formError) setFormError(''); }} className={`w-full px-3 py-2 bg-slate-50 border ${formError && !petName ? 'border-red-500' : 'border-slate-200'} rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-xs`} />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]" htmlFor="animal-classification">Animal Classification</label>
                    <select name="animalClassification" id="animal-classification" value={petType} onChange={(e) => setPetType(e.target.value as any)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-xs">
                      <option value="Canine">Canine (Dog)</option>
                      <option value="Feline">Feline (Cat)</option>
                      <option value="Avian">Avian (Bird)</option>
                      <option value="Reptile">Reptile</option>
                      <option value="Small Mammal">Small Mammal</option>
                      <option value="Exotic">Exotic</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]" htmlFor="breed-description">Breed / Description</label>
                    <input name="breedDescription" id="breed-description" type="text" maxLength={100} value={breed} onChange={(e) => setBreed(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-xs" />
                  </div>

                  <div className="space-y-1 col-span-3 border-t border-slate-100 pt-3 mt-1" />
                  
                  {preFilledClient && !editingAptId ? (
                    <div className="col-span-3 bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 text-white p-2 rounded-lg shadow-sm"><User className="w-4 h-4" /></div>
                        <div>
                          <div className="text-xs font-black text-indigo-900 leading-tight">{ownerName}</div>
                          <div className="text-[10px] text-indigo-700 font-mono mt-0.5">{ownerPhone}</div>
                        </div>
                      </div>
                      <div className="px-2 py-1 bg-white rounded-md shadow-sm text-[9px] font-bold text-slate-500 flex items-center gap-1 uppercase tracking-widest border border-slate-100">
                        <Lock className="w-3 h-3" /> Identity Locked
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1 col-span-1">
                        <label className="font-bold text-slate-600 block text-[10px]" htmlFor="owner-name">Owner Name *</label>
                        <input name="ownerName" id="owner-name" type="text" required maxLength={100} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-xs" />
                      </div>
                      <div className="space-y-1 col-span-1">
                        <label className="font-bold text-slate-600 block text-[10px]" htmlFor="owner-phone">Owner Phone *</label>
                        <div className="flex relative items-center">
                          <span className="absolute left-3 font-mono font-bold text-slate-400 text-[10px]">+94</span>
                          <input name="ownerPhone" id="owner-phone" type="text" required maxLength={15} value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold font-mono text-xs" />
                        </div>
                      </div>
                      <div className="space-y-1 col-span-1">
                        <label className="font-bold text-slate-600 block text-[10px]" htmlFor="owner-email">Owner Email</label>
                        <input name="ownerEmail" id="owner-email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-xs" placeholder="email@example.com" />
                      </div>
                    </>
                  )}

                  <div className="space-y-1 col-span-3 border-t border-slate-100 pt-3 mt-1" />
                  
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]" htmlFor="visit-date">Visit Date</label>
                    <input name="visitDate" id="visit-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); if (formError) setFormError(''); }} className={`w-full px-3 py-2 bg-slate-50 border ${formError && !date ? 'border-red-500' : 'border-slate-200'} rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-xs`} />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]" htmlFor="hour-slot">Hour Slot</label>
                    <input name="hourSlot" id="hour-slot" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-xs" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]" htmlFor="assigned-doctor-vet">Assigned Doctor/Vet</label>
                    <select name="assignedDoctorVet" id="assigned-doctor-vet" value={veterinarian} onChange={(e) => setVeterinarian(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-xs">
                      <option value="Dr. Bandara">Dr. Bandara</option>
                      <option value="Dr. Ismail">Dr. Ismail</option>
                      <option value="Residential Doctor">Residential Doctor</option>
                      <option value="OPD Doctor">OPD Doctor</option>
                      <option value="Emergency Doctor">Emergency Doctor</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-3">
                    <label className="font-bold text-slate-600 block text-[10px]" htmlFor="reason-for-care">Chief Complaint / Notes *</label>
                    <textarea name="reasonForCare" id="reason-for-care" required maxLength={1000} rows={2} placeholder="e.g. Coughing, rabies vaccines booster need..." value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 leading-normal focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-xs" />
                  </div>
                </div>
              </div>
              <div className="shrink-0 flex gap-2 p-6 pt-4 justify-end border-t border-slate-100 bg-white">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-1.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 cursor-pointer transition-colors text-[10px] uppercase tracking-wide">Close</button>
                <button type="submit" className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer shadow-xs transition-colors text-[10px] uppercase tracking-wide">{editingAptId ? 'Save Changes' : 'Create Appointment Slot'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
