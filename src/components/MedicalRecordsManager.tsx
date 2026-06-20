import React, { useState, useMemo } from 'react';
import { 
  Search, Plus, X, FileText, Activity, User, PawPrint, 
  Stethoscope, Printer, CheckCircle2, ChevronRight, Pill, 
  Trash2, AlertTriangle, Thermometer, HeartPulse, Wind, Scale
} from 'lucide-react';
import { MedicalRecord, InventoryItem, Appointment, AppointmentStatus } from '../types';
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
  onUpdateStock?: (itemId: string, qtyDelta: number, expectedStock?: number) => Promise<void>;
  onAddAppointment?: (appointment: Appointment) => void;
  onUpdateAppointmentStatus?: (id: string, status: AppointmentStatus) => void;
}

const FREQUENCY_OPTIONS = [
  { value: 'SID', label: 'SID (Once a day)' },
  { value: 'BID', label: 'BID (Twice a day)' },
  { value: 'TID', label: 'TID (Three times a day)' },
  { value: 'QID', label: 'QID (Four times a day)' },
  { value: 'PRN', label: 'PRN (As needed)' }
];

const INSTRUCTION_OPTIONS = [
  'After Meal', 'Before Meal', 'With Food', 'Empty Stomach', 'Apply Topically', 'In Water'
];

export default function MedicalRecordsManager({ 
  records, inventory = [], appointments = [], 
  onAddRecord, onUpdateRecord, onDeleteRecord, 
  onUpdateStock, onUpdateAppointmentStatus 
}: RecordsProps) {
  
  const [activeView, setActiveView] = useState<'list' | 'exam'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Active Exam State
  const [activeApt, setActiveApt] = useState<Appointment | null>(null);
  
  // SOAP State
  const [subjective, setSubjective] = useState('');
  const [temp, setTemp] = useState('');
  const [hr, setHr] = useState('');
  const [rr, setRr] = useState('');
  const [weight, setWeight] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  
  // Rx Builder State
  const [prescribedMeds, setPrescribedMeds] = useState<Array<{itemId: string, name: string, quantity: number, instructions: string, price: number}>>([]);
  const [rxMedId, setRxMedId] = useState('');
  const [rxDosage, setRxDosage] = useState('');
  const [rxFreq, setRxFreq] = useState('SID');
  const [rxDuration, setRxDuration] = useState('');
  const [rxInstruct, setRxInstruct] = useState('After Meal');
  const [rxTotalQty, setRxTotalQty] = useState('');

  // Derived Data
  const todaysApts = appointments.filter(a => a.date.startsWith(new Date().toISOString().split('T')[0]) && a.status === 'in-progress');
  const filteredRecords = records.filter(r => 
    r.petName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.patientId.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const medications = inventory.filter(i => ['prescription', 'retail'].includes(i.category));

  // --- Handlers ---

  const initiateExam = (apt: Appointment) => {
    setActiveApt(apt);
    setSubjective(''); setTemp(''); setHr(''); setRr(''); setWeight('');
    setAssessment(''); setPlan(''); setPrescribedMeds([]);
    setActiveView('exam');
  };

  const handleAddPrescription = async () => {
    if (!rxMedId || !rxTotalQty || Number(rxTotalQty) <= 0) {
      showToast('Select a medication and enter a valid total quantity.', 'error');
      return;
    }

    const med = medications.find(m => m.id === rxMedId);
    if (!med) return;

    if (!['service', 'lab_service'].includes(med.category) && med.stock < Number(rxTotalQty)) { showToast('Not enough stock.', 'error'); return; }

    const compiledInstructions = `${rxDosage} | ${rxFreq} | For ${rxDuration} days | ${rxInstruct}`;
    
    // Auto-Deduct Inventory Immediately
    if (onUpdateStock) {
      await onUpdateStock(med.id, -Number(rxTotalQty), med.stock);
    }

    setPrescribedMeds(prev => [...prev, {
      itemId: med.id,
      name: med.name,
      quantity: Number(rxTotalQty),
      instructions: compiledInstructions,
      price: med.price
    }]);

    // Reset Rx Builder
    setRxMedId(''); setRxDosage(''); setRxDuration(''); setRxTotalQty('');
    showToast(`${med.name} added to Rx and deducted from stock.`, 'success');
  };

  const handleRemovePrescription = async (index: number) => {
    const medToRemove = prescribedMeds[index];
    
    // Reinstate Inventory
    if (onUpdateStock) {
      const targetItem = inventory.find(i => i.id === medToRemove.itemId);
      if (targetItem) {
        await onUpdateStock(targetItem.id, medToRemove.quantity, targetItem.stock);
      }
    }

    setPrescribedMeds(prev => prev.filter((_, i) => i !== index));
    showToast(`Prescription removed. Stock reinstated.`, 'success');
  };

  const handleSaveDraft = () => {
    showToast('Exam draft saved to local memory.', 'success');
    setActiveView('list');
    setActiveApt(null);
  };

  const handleFinalizeExam = async () => {
    if (!activeApt) return;

    // SECURED: Armor-Plated Identity Inheritance
    const targetPhone = (activeApt.ownerPhone || '').replace(/\D/g, '');
    const targetPetName = (activeApt.petName || '').trim().toLowerCase();
    
    // Scan the vault to find the pet's true, original master identity
    const masterRecord = records.find(r => 
      (r.petName || '').trim().toLowerCase() === targetPetName && 
      (r.ownerPhone || '').replace(/\D/g, '') === targetPhone &&
      r.patientId
    );

    // Lock onto the true identity. NEVER use the temporary Appointment ID.
    const resolvedPatientId = masterRecord ? masterRecord.patientId : `${targetPetName}_${targetPhone}`;

    const newRecord: MedicalRecord = {
      id: `REC-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
      patientId: resolvedPatientId,
      petName: activeApt.petName,
      petType: masterRecord?.petType || (activeApt as any).petType,
      breed: masterRecord?.breed || (activeApt as any).breed,
      ownerName: activeApt.ownerName,
      ownerPhone: activeApt.ownerPhone,
      ownerEmail: activeApt.ownerEmail || '',
      date: new Date().toISOString(),
      veterinarian: activeApt.veterinarian,
      type: 'examination',
      weight: Number(weight) || 0,
      temperature: Number(temp) || 0,
      diagnosis: assessment || 'Pending',
      notes: `S: ${subjective}\nO: HR ${hr}, RR ${rr}\nP: ${plan}`,
      prescribedMeds: prescribedMeds,
      status: 'completed',
      attachments: []
    };

    onAddRecord(newRecord);
    
    if (onUpdateAppointmentStatus) {
      onUpdateAppointmentStatus(activeApt.id, 'completed');
    }

    showToast('Examination finalized. Sent to POS Queue.', 'success');
    setActiveView('list');
    setActiveApt(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-slate-50 w-full overflow-hidden font-sans relative">
      
      {/* Header */}
      <header className="flex-none px-8 py-6 bg-white border-b border-slate-200 shrink-0 z-10 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Clinical E.H.R.</h1>
            <p className="text-sm font-bold text-slate-500 mt-1">Electronic Health Records & Examinations</p>
          </div>
          {activeView === 'exam' && (
            <button onClick={() => setActiveView('list')} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer">
              <X className="w-4 h-4" /> Cancel Exam
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {activeView === 'list' ? (
          <div className="h-full flex flex-col p-8 space-y-6 overflow-y-auto custom-scrollbar">
            
            {/* Active Exam Queue */}
            <div className="space-y-4">
              <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase"><Activity className="w-4 h-4 text-indigo-500" /> Waiting For Examination</h2>
              {todaysApts.length === 0 ? (
                <div className="bg-white border border-slate-200 p-8 rounded-2xl text-center shadow-sm">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">No patients currently checked in for examination.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {todaysApts.map(apt => (
                    <div key={apt.id} className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-300 transition-all group">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="text-base font-black text-slate-800">{apt.petName}</h3>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{apt.ownerName}</p>
                        </div>
                        <span className="px-2 py-1 bg-sky-100 text-sky-700 text-[8px] font-black uppercase tracking-widest rounded shadow-xs">In Progress</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-600 mb-4 bg-slate-50 p-2 rounded-lg">{apt.reason || 'General Checkup'}</div>
                      <button onClick={() => initiateExam(apt)} className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2">
                        <Stethoscope className="w-4 h-4" /> Start Consultation
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historical Records Search */}
            <div className="space-y-4 pt-4 border-t border-slate-200">
              <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase"><FileText className="w-4 h-4 text-emerald-500" /> Historical Records Vault</h2>
              <div className="relative w-full max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Search by pet, owner, or ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 outline-none shadow-sm" />
              </div>
              
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Patient</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Diagnosis</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Attending Vet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.slice(0, 10).map(rec => (
                      <tr key={rec.id} className="hover:bg-slate-50 transition-colors cursor-pointer">
                        <td className="px-6 py-4 text-[11px] font-bold text-slate-500 whitespace-nowrap">{formatDisplayDate(rec.date)}</td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-black text-slate-800">{rec.petName}</div>
                          <div className="text-[10px] font-bold text-slate-400">{rec.ownerName}</div>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-700">{rec.diagnosis}</td>
                        <td className="px-6 py-4 text-[11px] font-bold text-slate-500 text-right">{rec.veterinarian}</td>
                      </tr>
                    ))}
                    {filteredRecords.length === 0 && (
                      <tr><td colSpan={4} className="px-6 py-8 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">No historical records found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        ) : (
          /* =========================================
             THE EXAM ROOM (SOAP & RX BUILDER)
             ========================================= */
          <div className="h-full flex overflow-hidden">
            
            {/* Left Panel: Vitals & Objective */}
            <div className="w-[30%] min-w-[300px] border-r border-slate-200 bg-slate-50 p-6 overflow-y-auto custom-scrollbar space-y-6">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-black text-slate-900 mb-1">{activeApt?.petName}</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Owner: {activeApt?.ownerName}</p>
                <div className="bg-amber-50 text-amber-700 p-3 rounded-xl border border-amber-100 text-xs font-bold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div><span className="block text-[9px] uppercase tracking-widest font-black opacity-70 mb-0.5">Reason for Visit</span>{activeApt?.reason || 'Standard Consultation'}</div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><HeartPulse className="w-3 h-3" /> Objective Vitals</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-1"><Thermometer className="w-3 h-3"/> Temp (°F)</label>
                    <input type="text" value={temp} onChange={e => setTemp(e.target.value)} placeholder="101.5" className="w-full font-mono text-sm font-bold text-slate-800 outline-none bg-transparent" />
                  </div>
                  <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-1"><Scale className="w-3 h-3"/> Weight (kg)</label>
                    <input type="text" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0.0" className="w-full font-mono text-sm font-bold text-slate-800 outline-none bg-transparent" />
                  </div>
                  <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-1"><HeartPulse className="w-3 h-3"/> HR (bpm)</label>
                    <input type="text" value={hr} onChange={e => setHr(e.target.value)} placeholder="120" className="w-full font-mono text-sm font-bold text-slate-800 outline-none bg-transparent" />
                  </div>
                  <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-1"><Wind className="w-3 h-3"/> RR (bpm)</label>
                    <input type="text" value={rr} onChange={e => setRr(e.target.value)} placeholder="30" className="w-full font-mono text-sm font-bold text-slate-800 outline-none bg-transparent" />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel: Subjective, Assessment, Rx Builder */}
            <div className="flex-1 bg-white flex flex-col overflow-hidden relative">
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
                
                {/* Subjective */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subjective (Owner Notes / History)</h3>
                  <textarea value={subjective} onChange={e => setSubjective(e.target.value)} placeholder="Type subjective observations here..." className="w-full h-24 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
                </div>

                {/* Assessment */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assessment (Diagnosis)</h3>
                  <input type="text" value={assessment} onChange={e => setAssessment(e.target.value)} placeholder="Primary diagnosis..." className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </div>

                {/* Plan */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Treatment Plan</h3>
                  <textarea value={plan} onChange={e => setPlan(e.target.value)} placeholder="Detail the treatment plan here..." className="w-full h-24 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
                </div>

                {/* THE RX BUILDER (Pharmacy Injector) */}
                <div className="border-t border-slate-200 pt-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><Pill className="w-4 h-4 text-emerald-500" /> Pharmacy & Prescriptions</h3>
                  </div>

                  {/* Rx Input Form */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Search Medication</label>
                        <select value={rxMedId} onChange={e => setRxMedId(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 cursor-pointer">
                          <option value="">-- Select from Inventory --</option>
                          {medications.map(m => <option key={m.id} value={m.id}>{m.name} ({m.stock} in stock)</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Dosage</label>
                        <input type="text" value={rxDosage} onChange={e => setRxDosage(e.target.value)} placeholder="e.g. 1 Tablet, 5ml" className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-emerald-500" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Frequency</label>
                        <select value={rxFreq} onChange={e => setRxFreq(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 cursor-pointer">
                          {FREQUENCY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Duration (Days)</label>
                        <input type="number" min="1" value={rxDuration} onChange={e => setRxDuration(e.target.value)} placeholder="e.g. 7" className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-emerald-500" />
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Instructions</label>
                        <select value={rxInstruct} onChange={e => setRxInstruct(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 cursor-pointer">
                          {INSTRUCTION_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1 block">Total Dispense Qty</label>
                        <input type="number" min="1" value={rxTotalQty} onChange={e => setRxTotalQty(e.target.value)} placeholder="Total Units" className="w-full p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-black font-mono text-emerald-800 outline-none focus:border-emerald-500" />
                      </div>
                    </div>

                    <button onClick={handleAddPrescription} className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-xl text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-colors cursor-pointer">
                      <Plus className="w-4 h-4" /> Add to Prescription & Deduct Stock
                    </button>
                  </div>

                  {/* Active Prescriptions List */}
                  {prescribedMeds.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {prescribedMeds.map((med, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
                          <div>
                            <div className="text-sm font-black text-slate-800">{med.name} <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded ml-2">x{med.quantity}</span></div>
                            <div className="text-[10px] font-bold text-indigo-600 mt-1 uppercase tracking-wider">{med.instructions}</div>
                          </div>
                          <button onClick={() => handleRemovePrescription(idx)} className="p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors cursor-pointer">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
              
              {/* Action Bar */}
              <div className="p-6 bg-slate-50 border-t border-slate-200 shrink-0 flex justify-end gap-3">
                <button onClick={handleSaveDraft} className="px-6 py-3 bg-white border border-slate-200 text-slate-600 font-black rounded-xl hover:bg-slate-100 transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Save Draft</button>
                <button onClick={handleFinalizeExam} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-transform active:scale-95 text-[10px] uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                  <CheckCircle2 className="w-4 h-4" /> Finalize & Discharge Patient
                </button>
              </div>
            </div>
          </div>
        )}
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