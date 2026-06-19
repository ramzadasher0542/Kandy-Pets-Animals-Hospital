/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, Plus, X, FileText, Activity, User, PawPrint, 
  ToggleLeft, ToggleRight, Calendar, Stethoscope, Printer, 
  CheckCircle2, ShieldAlert, ChevronDown, ChevronRight 
} from 'lucide-react';
import { MedicalRecord, InventoryItem, Appointment, AppointmentStatus, InpatientLog } from '../types';
import { showToast } from './Toast';
import { formatDisplayDate } from '../utils/time';

interface RecordsProps {
  records: MedicalRecord[];
  inventory?: InventoryItem[];
  appointments?: Appointment[];
  isOnline: boolean;
  onAddRecord: (record: MedicalRecord) => void;
  onUpdateRecord: (record: MedicalRecord) => void;
  onDeleteRecord: (id: string) => void;
  onUpdateStock?: (itemId: string, qtyDelta: number) => Promise<void>;
  onAddAppointment?: (appointment: Appointment) => void;
  onUpdateAppointmentStatus?: (id: string, status: AppointmentStatus) => void;
}

const SYSTEM_TAGS = {
  GI: ['Vomiting', 'Diarrhea', 'Decreased Appetite', 'Constipation'],
  Respiratory: ['Coughing', 'Sneezing', 'Nasal Discharge', 'Panting'],
  General: ['Lethargy', 'Fever', 'Pain', 'Weight Loss', 'Itching']
};

const OBJECTIVE_SYSTEMS = ['Cardiovascular', 'Respiratory', 'Gastrointestinal', 'Urogenital', 'Neurological', 'Musculoskeletal', 'Integumentary (Skin)'];

const SHORTHAND_ROUTES = ['IV', 'IM', 'SC', 'Oral', 'SUPP'];
const SHORTHAND_FREQ = ['TDS', 'BD', 'Nocte', 'Mane', 'PRN'];

export default function MedicalRecordsManager({ 
  records, inventory = [], appointments = [], isOnline, 
  onAddRecord, onUpdateRecord, onDeleteRecord, onUpdateStock, onAddAppointment, onUpdateAppointmentStatus 
}: RecordsProps) {
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  
  // SOAP Form State
  const [patientId, setPatientId] = useState('');
  const [petName, setPetName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [weight, setWeight] = useState('');
  
  // Subjective
  const [subjectiveTags, setSubjectiveTags] = useState<string[]>([]);
  const [otherSymptoms, setOtherSymptoms] = useState('');
  
  // Objective
  const [objectiveFindings, setObjectiveFindings] = useState<Record<string, { isNormal: boolean; notes: string }>>(() => {
    const init: any = {};
    OBJECTIVE_SYSTEMS.forEach(sys => init[sys] = { isNormal: true, notes: '' });
    return init;
  });

  // Assessment & Plan
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentNotes, setTreatmentNotes] = useState('');
  const [prescribedMeds, setPrescribedMeds] = useState<Array<{ itemId: string; name: string; dosage: string; quantity: number }>>([]);
  const [followUpDate, setFollowUpDate] = useState('');
  
  // Inpatient Ward Flowsheet State
  const [inpatientLogs, setInpatientLogs] = useState<InpatientLog[]>([]);
  const [showWardFlowsheet, setShowWardFlowsheet] = useState(false);
  const [newWardLog, setNewWardLog] = useState({ 
    time: new Date().toTimeString().slice(0,5), temp: '', treatment: '', remarks: '' 
  });

  // Search states for Plan
  const [medSearch, setMedSearch] = useState('');

  // Discharge Summary State
  const [dischargeRecord, setDischargeRecord] = useState<MedicalRecord | null>(null);

  const resetForm = () => {
    setEditingRecordId(null);
    setPatientId(''); setPetName(''); setOwnerName(''); setOwnerPhone(''); setWeight('');
    setSubjectiveTags([]); setOtherSymptoms('');
    
    const initObj: any = {};
    OBJECTIVE_SYSTEMS.forEach(sys => initObj[sys] = { isNormal: true, notes: '' });
    setObjectiveFindings(initObj);
    
    setDiagnosis(''); setTreatmentNotes(''); setPrescribedMeds([]); setFollowUpDate('');
    setMedSearch('');
    
    setInpatientLogs([]);
    setShowWardFlowsheet(false);
    setNewWardLog({ time: new Date().toTimeString().slice(0,5), temp: '', treatment: '', remarks: '' });
  };

  const handleEdit = (record: MedicalRecord) => {
    setEditingRecordId(record.id);
    setPatientId(record.patientId);
    setPetName(record.petName);
    setOwnerName(record.ownerName);
    setOwnerPhone(record.ownerPhone);
    setWeight(record.weight ? String(record.weight) : '');
    setSubjectiveTags(record.subjectiveTags || []);
    setOtherSymptoms(record.symptoms || '');
    
    if (record.objectiveFindings) {
      setObjectiveFindings(record.objectiveFindings);
    } else {
      const initObj: any = {};
      OBJECTIVE_SYSTEMS.forEach(sys => initObj[sys] = { isNormal: true, notes: '' });
      setObjectiveFindings(initObj);
    }

    setDiagnosis(record.diagnosis || '');
    setTreatmentNotes(record.treatmentNotes || '');
    setPrescribedMeds(record.prescribedMeds || []);
    setFollowUpDate(record.followUpDate || '');
    setInpatientLogs(record.inpatientLogs || []);
    
    setShowFormModal(true);
  };

  const toggleTag = (tag: string) => {
    setSubjectiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const toggleObjective = (system: string) => {
    setObjectiveFindings(prev => ({
      ...prev,
      [system]: { ...prev[system], isNormal: !prev[system].isNormal }
    }));
  };

  const updateObjectiveNotes = (system: string, notes: string) => {
    setObjectiveFindings(prev => ({
      ...prev,
      [system]: { ...prev[system], notes }
    }));
  };

  const addMed = (item: InventoryItem) => {
    if (prescribedMeds.some(m => m.itemId === item.id)) return;
    setPrescribedMeds(prev => [...prev, { itemId: item.id, name: item.name, dosage: '', quantity: 1 }]);
    setMedSearch('');
  };

  const updateMed = (itemId: string, field: 'dosage' | 'quantity', value: any) => {
    setPrescribedMeds(prev => prev.map(m => m.itemId === itemId ? { ...m, [field]: value } : m));
  };

  const removeMed = (itemId: string) => {
    setPrescribedMeds(prev => prev.filter(m => m.itemId !== itemId));
  };

  const renderShorthand = (field: 'treatmentNotes' | 'wardTreatment') => (
    <div className="flex flex-wrap gap-2 mt-2 select-none">
      <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Route:</span>
        {SHORTHAND_ROUTES.map(route => (
          <button key={route} type="button" onClick={() => {
            if (field === 'treatmentNotes') setTreatmentNotes(prev => prev + (prev ? ' - ' : '') + route);
            else setNewWardLog(prev => ({...prev, treatment: prev.treatment + (prev.treatment ? ' - ' : '') + route}));
          }} className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-extrabold rounded-lg transition-colors border border-blue-200 cursor-pointer shadow-xs active:scale-95">
            {route}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 pl-1">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Freq:</span>
        {SHORTHAND_FREQ.map(freq => (
          <button key={freq} type="button" onClick={() => {
            if (field === 'treatmentNotes') setTreatmentNotes(prev => prev + (prev ? ' - ' : '') + freq);
            else setNewWardLog(prev => ({...prev, treatment: prev.treatment + (prev.treatment ? ' - ' : '') + freq}));
          }} className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-extrabold rounded-lg transition-colors border border-emerald-200 cursor-pointer shadow-xs active:scale-95">
            {freq}
          </button>
        ))}
      </div>
    </div>
  );

  const handleSaveSOAP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!petName || !ownerName || !weight) {
      showToast('Pet Name, Owner Name, and Weight are mandatory.', 'error');
      return;
    }

    // Auto-inject Consultation Fee for Billing Queue ONLY on initial creation
    const finalMeds = [...prescribedMeds];
    if (!editingRecordId && !finalMeds.some(m => m.itemId === 'consult_fee')) {
      finalMeds.push({ itemId: 'consult_fee', name: 'Clinical Consultation Fee', dosage: 'Standard Consult', quantity: 1 });
    }

    const normPhone = ownerPhone.replace(/\D/g, '');
    const finalPatientId = patientId || `${petName}_${normPhone}`;

    const recordPayload: MedicalRecord = {
      id: editingRecordId || crypto.randomUUID(),
      patientId: finalPatientId,
      petName,
      petType: 'Canine', // Base fallback if not synced from prefill
      breed: 'Mixed',
      age: 'Unknown',
      weight: parseFloat(weight) || 0,
      ownerName,
      ownerPhone,
      ownerEmail: 'N/A',
      visitDate: new Date().toISOString().split('T')[0],
      subjectiveTags,
      symptoms: otherSymptoms,
      objectiveFindings,
      diagnosis,
      treatmentNotes,
      prescribedMeds: finalMeds,
      vaccinations: [],
      labResults: [],
      createdDate: new Date().toISOString().split('T')[0],
      followUpDate,
      inpatientLogs
    };

    if (editingRecordId) {
      onUpdateRecord(recordPayload);
    } else {
      onAddRecord(recordPayload);
    }

    // SPIDERWEB SYNC 1: Inventory Deduction 
    // DELIBERATELY REMOVED to prevent Double-Deduction. 
    // Stock is strictly deducted by POSRegister.tsx at the exact moment of financial checkout.

    // SPIDERWEB SYNC 2: Close Appointment (Push to POS)
    if (onUpdateAppointmentStatus) {
      const activeApt = appointments.find(a => a.petName.toLowerCase() === petName.toLowerCase() && a.ownerPhone.replace(/\D/g, '') === normPhone && ['booked', 'in-progress'].includes(a.status));
      if (activeApt) {
        onUpdateAppointmentStatus(activeApt.id, 'completed');
        showToast('Appointment completed and pushed to POS Billing Queue.', 'success');
      }
    }

    // SPIDERWEB SYNC 3: Auto-Book Follow-up
    if (followUpDate && onAddAppointment) {
      onAddAppointment({
        id: crypto.randomUUID(),
        petName,
        petType: 'Canine',
        breed: 'Mixed',
        ownerName,
        ownerPhone,
        ownerEmail: 'N/A',
        date: formatDisplayDate(followUpDate),
        time: '09:00 AM',
        veterinarian: 'Attending Clinician',
        reason: `Follow-up evaluation for: ${diagnosis}`,
        status: 'booked',
        admissionType: 'OPD'
      } as any);
      showToast(`Follow-up automatically scheduled for ${followUpDate}.`, 'success');
    }

    setShowFormModal(false);
    resetForm();
    showToast('Chart saved successfully.', 'success');
  };

  const handlePrintDischarge = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=800');
    if (!printWindow || !dischargeRecord) return;
    
    const html = `
      <html><head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #334155; line-height: 1.6; padding: 40px; }
          .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px; text-align: center; }
          .title { font-size: 24px; font-weight: 900; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
          .subtitle { font-size: 14px; color: #64748b; font-weight: bold; }
          .section { margin-bottom: 24px; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
          .section h3 { font-size: 14px; color: #4338ca; text-transform: uppercase; letter-spacing: 1px; margin-top: 0; border-bottom: 1px solid #c7d2fe; padding-bottom: 8px; margin-bottom: 12px; }
          .grid { display: flex; flex-wrap: wrap; gap: 16px; }
          .col { flex: 1; min-width: 200px; }
          .label { font-size: 10px; font-weight: bold; color: #94a3b8; text-transform: uppercase; display: block; }
          .val { font-size: 14px; font-weight: 600; color: #0f172a; }
          .med-table { w-full; border-collapse: collapse; margin-top: 10px; width: 100%; }
          .med-table th, .med-table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
          .med-table th { font-weight: bold; color: #64748b; text-transform: uppercase; font-size: 10px; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #94a3b8; font-style: italic; }
        </style>
      </head><body>
        <div class="header">
          <h1 class="title">CeylonPets Animal Hospital</h1>
          <div class="subtitle">Official Patient Discharge Summary</div>
        </div>
        
        <div class="grid">
          <div class="section col">
            <h3>Patient Identity</h3>
            <span class="label">Patient Name</span><span class="val">${dischargeRecord.petName}</span><br/><br/>
            <span class="label">Weight</span><span class="val">${dischargeRecord.weight} kg</span>
          </div>
          <div class="section col">
            <h3>Client Information</h3>
            <span class="label">Owner Name</span><span class="val">${dischargeRecord.ownerName}</span><br/><br/>
            <span class="label">Contact</span><span class="val">${dischargeRecord.ownerPhone}</span>
          </div>
        </div>

        <div class="section">
          <h3>Assessment & Plan</h3>
          <span class="label">Primary Diagnosis</span>
          <span class="val">${dischargeRecord.diagnosis || 'General Evaluation'}</span><br/><br/>
          <span class="label">Veterinarian Notes & Instructions</span>
          <span class="val">${dischargeRecord.treatmentNotes || 'Continue standard care as discussed.'}</span>
        </div>

        <div class="section">
          <h3>Prescribed Medications</h3>
          <table class="med-table">
            <thead><tr><th>Medication</th><th>Dosage Instructions</th><th>Qty Dispensed</th></tr></thead>
            <tbody>
              ${dischargeRecord.prescribedMeds.filter(m => m.itemId !== 'consult_fee').map(m => `
                <tr><td><strong>${m.name}</strong></td><td>${m.dosage}</td><td>${m.quantity}</td></tr>
              `).join('')}
              ${dischargeRecord.prescribedMeds.filter(m => m.itemId !== 'consult_fee').length === 0 ? '<tr><td colspan="3">No medications dispensed today.</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        ${dischargeRecord.followUpDate ? `
        <div class="section" style="background: #eff6ff; border-color: #bfdbfe;">
          <h3 style="color: #3730a3; border-color: #a5b4fc;">Next Steps</h3>
          <span class="label">Follow-up Appointment Requested</span>
          <span class="val" style="color: #3730a3; font-size: 16px;">${dischargeRecord.followUpDate}</span>
        </div>` : ''}

        <div class="footer">Thank you for trusting CeylonPets with ${dischargeRecord.petName}'s care.<br/>Please contact us if you have any immediate concerns regarding the treatment plan.</div>
        <script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}</script>
      </body></html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const filteredRecords = records.filter(r => 
    r.petName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.ownerPhone.includes(searchQuery)
  );

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-140px)] gap-4">
      
      {/* Top Action Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4 shrink-0">
        <h2 className="text-lg font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-indigo-600" /> Clinical EHR Engine
        </h2>
        <div className="flex items-center gap-4 flex-1 justify-end">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input type="text" placeholder="Search patient charts..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <button onClick={() => { resetForm(); setShowFormModal(true); }} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer">
            <Plus className="h-4 w-4" /> Start New Chart (SOAP)
          </button>
        </div>
      </div>

      {/* Records Directory Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRecords.map(record => (
            <div key={record.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all group flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-50 p-2.5 rounded-xl"><PawPrint className="w-5 h-5 text-indigo-600" /></div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800 leading-tight group-hover:text-indigo-700 transition-colors">{record.petName}</h3>
                      <p className="text-[10px] text-slate-500 font-bold mt-0.5">{record.ownerName} • {record.ownerPhone}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Diagnosis</span>
                    <span className="text-[9px] font-extrabold bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">{record.visitDate}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 line-clamp-1">{record.diagnosis || 'Pending Evaluation'}</p>
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button onClick={() => handleEdit(record)} className="flex-1 py-2 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-colors cursor-pointer">
                  Open Chart
                </button>
                <button onClick={() => setDischargeRecord(record)} className="px-3 py-2 bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 rounded-xl transition-colors cursor-pointer" title="Generate Discharge Summary">
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {filteredRecords.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-bold">No medical records found.</p>
            </div>
          )}
        </div>
      </div>

      {/* Discharge Summary Print Modal */}
      {dischargeRecord && createPortal(
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDischargeRecord(null)}>
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-scale-up" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto"><FileText className="w-8 h-8" /></div>
            <h3 className="text-base font-black text-slate-800 leading-tight">Discharge Summary Ready</h3>
            <p className="text-slate-500 text-[11px] font-medium px-4">This document hides internal objective notes and highlights care instructions for the client.</p>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setDischargeRecord(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer">Cancel</button>
              <button onClick={handlePrintDischarge} className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md">
                <Printer className="w-4 h-4"/> Print to PDF
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Zero-Friction SOAP Form Modal */}
      {showFormModal && createPortal(
        <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-scale-up overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-xl text-white"><Activity className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-800 leading-none tracking-tight">Clinical Chart (SOAP)</h3>
                  <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">Zero-Friction Entry Pipeline</p>
                </div>
              </div>
              <button onClick={() => setShowFormModal(false)} className="p-1.5 hover:bg-slate-200 text-slate-400 rounded-lg cursor-pointer transition-colors"><X className="w-5 h-5" /></button>
            </div>

            {/* Scrollable SOAP Pipeline */}
            <form onSubmit={handleSaveSOAP} className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white space-y-8">
              
              {/* Mandatory Header */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Patient Name *</label>
                  <input type="text" required value={petName} onChange={e => setPetName(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="e.g. Max" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Owner Name *</label>
                  <input type="text" required value={ownerName} onChange={e => setOwnerName(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="e.g. John Doe" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Owner Phone</label>
                  <input type="text" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none font-mono" placeholder="077 123 4567" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest block flex items-center gap-1"><Activity className="w-3 h-3"/> Weight (kg) *</label>
                  <input type="number" step="0.1" required value={weight} onChange={e => setWeight(e.target.value)} className="w-full px-3 py-2 bg-white border border-rose-200 rounded-xl text-xs font-black text-slate-800 focus:ring-1 focus:ring-rose-500 outline-none font-mono shadow-inner" placeholder="0.0" />
                </div>
              </div>

              {/* STEP 1: SUBJECTIVE (Tag Cloud) */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <div className="w-6 h-6 bg-slate-800 text-white rounded-md flex items-center justify-center font-black text-xs">1</div>
                  <h4 className="text-sm font-black text-slate-800 tracking-tight">Subjective (Intake)</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {Object.entries(SYSTEM_TAGS).map(([category, tags]) => (
                    <div key={category} className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">{category} Issues</span>
                      <div className="flex flex-wrap gap-2">
                        {tags.map(tag => {
                          const active = subjectiveTags.includes(tag);
                          return (
                            <button 
                              key={tag} type="button" onClick={() => toggleTag(tag)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors cursor-pointer border ${active ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <textarea rows={2} placeholder="Additional intake notes or client comments..." value={otherSymptoms} onChange={e => setOtherSymptoms(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none" />
              </div>

              {/* STEP 2: OBJECTIVE (Physical Exam Toggles) */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <div className="w-6 h-6 bg-slate-800 text-white rounded-md flex items-center justify-center font-black text-xs">2</div>
                  <h4 className="text-sm font-black text-slate-800 tracking-tight">Objective (Physical Exam)</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {OBJECTIVE_SYSTEMS.map(sys => {
                    const isNormal = objectiveFindings[sys]?.isNormal;
                    return (
                      <div key={sys} className={`border rounded-2xl transition-colors overflow-hidden ${isNormal ? 'bg-white border-slate-200' : 'bg-rose-50/50 border-rose-200'}`}>
                        <div className="flex justify-between items-center p-3 cursor-pointer select-none" onClick={() => toggleObjective(sys)}>
                          <span className={`text-xs font-black tracking-tight ${isNormal ? 'text-slate-700' : 'text-rose-700'}`}>{sys}</span>
                          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest ${isNormal ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {isNormal ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                            {isNormal ? 'Normal' : 'Abnormal'}
                          </div>
                        </div>
                        {!isNormal && (
                          <div className="px-3 pb-3 pt-1 border-t border-rose-100 animate-fade-in">
                            <textarea 
                              rows={2} placeholder={`Detail abnormal findings for ${sys}...`} 
                              value={objectiveFindings[sys]?.notes || ''} 
                              onChange={e => updateObjectiveNotes(sys, e.target.value)} 
                              className="w-full px-3 py-2 bg-white border border-rose-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-rose-500 outline-none"
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* STEP 3: ASSESSMENT & PLAN */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <div className="w-6 h-6 bg-slate-800 text-white rounded-md flex items-center justify-center font-black text-xs">3</div>
                  <h4 className="text-sm font-black text-slate-800 tracking-tight">Assessment & Plan</h4>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">Primary Diagnosis *</label>
                  <input type="text" required value={diagnosis} onChange={e => setDiagnosis(e.target.value)} className="w-full px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-black text-indigo-900 focus:ring-1 focus:ring-indigo-500 outline-none placeholder-indigo-300" placeholder="Enter definitive or differential diagnosis..." />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Treatment Notes & Prescriptions</label>
                  <textarea rows={3} value={treatmentNotes} onChange={e => setTreatmentNotes(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="Procedures performed, dietary advice, general instructions..." />
                  {renderShorthand('treatmentNotes')}
                </div>

                {/* Ward Flowsheet Injector */}
                <div className="space-y-4 pt-4">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2 cursor-pointer select-none group" onClick={() => setShowWardFlowsheet(!showWardFlowsheet)}>
                    <div className="w-6 h-6 bg-sky-100 text-sky-700 rounded-md flex items-center justify-center font-black text-xs group-hover:bg-sky-200 transition-colors"><Activity className="w-3.5 h-3.5" /></div>
                    <h4 className="text-sm font-black text-slate-800 tracking-tight flex-1 group-hover:text-sky-700 transition-colors">Inpatient Ward Flowsheet</h4>
                    {showWardFlowsheet ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>

                  {showWardFlowsheet && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-5 animate-fade-in shadow-inner">
                      {inpatientLogs.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-widest font-bold text-[9px]">
                              <tr>
                                <th className="py-2.5 px-4">Date/Time</th>
                                <th className="py-2.5 px-4">Temp (°C)</th>
                                <th className="py-2.5 px-4">Treatment Given</th>
                                <th className="py-2.5 px-4">Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {inpatientLogs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-50">
                                  <td className="py-2.5 px-4 font-semibold text-slate-700">{log.date} <span className="text-slate-400 font-mono ml-1">{log.time}</span></td>
                                  <td className="py-2.5 px-4 font-mono font-bold text-rose-600">{log.temperature || '--'}</td>
                                  <td className="py-2.5 px-4 font-bold text-sky-700">{log.treatment}</td>
                                  <td className="py-2.5 px-4 text-slate-600 italic">{log.remarks || '--'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">Log Ward Entry</h5>
                        <div className="grid grid-cols-4 gap-4">
                          <div className="col-span-1 space-y-1">
                            <label className="text-[10px] font-bold text-slate-600">Time</label>
                            <input type="time" value={newWardLog.time} onChange={e => setNewWardLog({...newWardLog, time: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-sky-500 outline-none" />
                          </div>
                          <div className="col-span-1 space-y-1">
                            <label className="text-[10px] font-bold text-slate-600">Temp (°C)</label>
                            <input type="number" step="0.1" value={newWardLog.temp} onChange={e => setNewWardLog({...newWardLog, temp: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-rose-500 outline-none" placeholder="38.5" />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <label className="text-[10px] font-bold text-slate-600">Treatment / Medication</label>
                            <input type="text" value={newWardLog.treatment} onChange={e => setNewWardLog({...newWardLog, treatment: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sky-500 outline-none" placeholder="e.g. Amoxicillin..." />
                          </div>
                        </div>
                        {renderShorthand('wardTreatment')}
                        <div className="space-y-1 pt-2">
                           <label className="text-[10px] font-bold text-slate-600">Remarks / Observations</label>
                           <input type="text" value={newWardLog.remarks} onChange={e => setNewWardLog({...newWardLog, remarks: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sky-500 outline-none" placeholder="Patient resting comfortably..." />
                        </div>
                        <button type="button" onClick={() => {
                          if (!newWardLog.treatment && !newWardLog.remarks && !newWardLog.temp) return;
                          const logEntry: InpatientLog = {
                            id: crypto.randomUUID(),
                            date: new Date().toISOString().split('T')[0],
                            time: newWardLog.time,
                            temperature: newWardLog.temp,
                            treatment: newWardLog.treatment,
                            remarks: newWardLog.remarks,
                            vetId: 'Attending Clinician'
                          };
                          setInpatientLogs(prev => [...prev, logEntry]);
                          setNewWardLog({ time: new Date().toTimeString().slice(0,5), temp: '', treatment: '', remarks: '' });
                        }} className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors shadow-sm cursor-pointer mt-2">
                          Commit Ward Entry
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Medication Builder */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Prescribe Medications (Auto-Syncs to POS)</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input 
                      type="text" placeholder="Search pharmacy inventory..." 
                      value={medSearch} onChange={e => setMedSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-400" 
                    />
                    {medSearch && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl rounded-xl z-20 max-h-48 overflow-y-auto custom-scrollbar">
                        {inventory.filter(i => (i.category === 'prescription' || i.category === 'retail') && i.name.toLowerCase().includes(medSearch.toLowerCase())).map(item => (
                          <div key={item.id} onClick={() => addMed(item)} className="p-3 border-b border-slate-50 hover:bg-indigo-50 cursor-pointer flex justify-between items-center transition-colors">
                            <span className="text-xs font-bold text-slate-800">{item.name}</span>
                            <span className="text-[10px] font-bold text-slate-400">Stock: {item.stock}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {prescribedMeds.length > 0 && (
                    <div className="space-y-2 mt-3">
                      {prescribedMeds.map(med => (
                        <div key={med.itemId} className="flex gap-2 items-start bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                          <div className="flex-1 space-y-2">
                            <div className="text-xs font-black text-slate-800 pl-1">{med.name}</div>
                            <input type="text" placeholder="Dosage (e.g. 1 tab BID for 5 days)" value={med.dosage} onChange={e => updateMed(med.itemId, 'dosage', e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-[11px] font-semibold outline-none focus:border-indigo-300" />
                          </div>
                          <div className="w-20 space-y-2">
                            <div className="text-[9px] font-bold text-slate-400 uppercase text-center">Dispense Qty</div>
                            <input type="number" min="1" value={med.quantity} onChange={e => updateMed(med.itemId, 'quantity', parseInt(e.target.value) || 1)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold font-mono text-center outline-none focus:border-indigo-300" />
                          </div>
                          <button type="button" onClick={() => removeMed(med.itemId)} className="p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-lg mt-5 transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Follow-up Booker */}
                <div className="bg-sky-50 border border-sky-100 p-4 rounded-2xl flex items-center justify-between gap-4">
                  <div>
                    <h5 className="text-xs font-black text-sky-900 flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Schedule Follow-up</h5>
                    <p className="text-[10px] font-semibold text-sky-700 mt-0.5">Automatically blocks the calendar queue for the future date.</p>
                  </div>
                  <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} className="px-3 py-2 bg-white border border-sky-200 rounded-xl text-xs font-bold text-sky-900 focus:outline-none focus:ring-1 focus:ring-sky-500" />
                </div>

              </div>
            </form>
            
            {/* Footer Actions */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0 flex gap-3 justify-end items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-auto flex items-center gap-1"><Activity className="w-3 h-3" /> Auto-syncs to POS & Inventory</span>
              <button type="button" onClick={() => setShowFormModal(false)} className="px-6 py-3 bg-white border border-slate-200 text-slate-600 font-black rounded-xl hover:bg-slate-100 cursor-pointer transition-colors text-xs uppercase tracking-wide">Cancel</button>
              <button onClick={handleSaveSOAP} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl cursor-pointer shadow-md transition-colors text-xs uppercase tracking-wide">Save & Complete Chart</button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
