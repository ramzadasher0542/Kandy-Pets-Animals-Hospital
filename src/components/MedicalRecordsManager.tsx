/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, Search, Plus, Activity, Edit2, CheckCircle2, X, 
  Stethoscope, HeartPulse, ClipboardList, Pill, History, CalendarClock, ChevronRight, AlertCircle, Save
} from 'lucide-react';
import { MedicalRecord, InventoryItem, Vitals, PatientHistory, SystemicExam, PhysicalExamination, ClinicalAssessment } from '../types';
import { formatDisplayDate } from '../utils/time';

interface RecordsProps {
  records: MedicalRecord[];
  inventory: InventoryItem[];
  onAddRecord: (record: MedicalRecord) => void;
  onUpdateRecord: (record: MedicalRecord) => void;
}

// ============================================================================
// CLINICAL DATA DICTIONARIES (From Excel Matrix)
// ============================================================================
const CLINICAL_TAGS = {
  duration: ['< 24 hours', '1–3 days', '4–7 days', '1–3 weeks', '> 3 weeks'],
  progression: ['Acute (sudden)', 'Chronic (long-term)', 'Improving', 'Worsening', 'Intermittent', 'Static'],
  diet: ['Commercial dry', 'Commercial wet', 'Home-cooked', 'Raw diet', 'Mixed feeding'],
  vax: ['Fully vaccinated', 'Partially vaccinated', 'Not vaccinated', 'Unknown'],
  deworming: ['Regular', 'Irregular', 'Not dewormed', 'Unknown']
};

const SYSTEMIC_SYMPTOMS: Record<keyof PhysicalExamination, string[]> = {
  general: ['Anorexia / Hyporexia', 'Weight loss', 'Lethargy / weakness', 'Fever', 'Dehydration', 'Sudden collapse'],
  gastrointestinal: ['Vomiting', 'Diarrhea', 'Constipation', 'Melena / Hematochezia', 'Abdominal pain', 'Difficulty swallowing', 'Excessive salivation'],
  respiratory: ['Coughing', 'Sneezing', 'Nasal discharge', 'Dyspnea', 'Tachypnea', 'Cyanosis'],
  cardiovascular: ['Murmur', 'Arrhythmia', 'Tachycardia', 'Bradycardia', 'Weak pulses'],
  urogenital: ['Dysuria', 'Pollakiuria', 'Hematuria', 'Inappropriate urination', 'Anuria'],
  skin: ['Pruritus (Itching)', 'Alopecia (Hair loss)', 'Wounds / ulcers', 'Rashes / redness', 'Parasites', 'Lumps / masses'],
  musculoskeletal: ['Lameness', 'Difficulty walking', 'Joint swelling', 'Pain on movement', 'Paralysis / weakness'],
  neurological: ['Seizures', 'Head tilt', 'Ataxia (Loss of balance)', 'Behavioral changes', 'Tremors', 'Blindness'],
  reproductive: ['Vaginal discharge', 'Failure to conceive', 'Dystocia', 'Swollen mammary glands', 'Testicular swelling'],
  eyesAndEars: ['Ear discharge', 'Head shaking', 'Ear scratching', 'Eye discharge', 'Red eye', 'Squinting', 'Cloudiness']
};

const SYSTEM_LABELS: Record<keyof PhysicalExamination, string> = {
  general: 'General / Systemic',
  gastrointestinal: 'Gastrointestinal (GI)',
  respiratory: 'Respiratory',
  cardiovascular: 'Cardiovascular',
  urogenital: 'Urinary / Renal',
  skin: 'Skin / Dermatology',
  musculoskeletal: 'Musculoskeletal',
  neurological: 'Neurological',
  reproductive: 'Reproductive',
  eyesAndEars: 'Eyes & Ears (ENT)'
};

// ============================================================================

export default function MedicalRecordsManager({ records, inventory, onAddRecord, onUpdateRecord }: RecordsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MedicalRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'vitals' | 'exam' | 'assessment' | 'pharmacy' | 'followup'>('vitals');

  // Form State (Flattened for reactivity)
  const [vitals, setVitals] = useState<Vitals>({});
  const [history, setHistory] = useState<PatientHistory>({ diet: [], previousMedicalHistory: [], currentMedications: [] });
  const [exam, setExam] = useState<PhysicalExamination>({
    general: { isNormal: true, abnormalities: [] },
    gastrointestinal: { isNormal: true, abnormalities: [] },
    respiratory: { isNormal: true, abnormalities: [] },
    cardiovascular: { isNormal: true, abnormalities: [] },
    urogenital: { isNormal: true, abnormalities: [] },
    skin: { isNormal: true, abnormalities: [] },
    musculoskeletal: { isNormal: true, abnormalities: [] },
    neurological: { isNormal: true, abnormalities: [] },
    reproductive: { isNormal: true, abnormalities: [] },
    eyesAndEars: { isNormal: true, abnormalities: [] }
  });
  const [assessment, setAssessment] = useState<ClinicalAssessment>({});
  
  // Pharmacy State
  const [prescribedMeds, setPrescribedMeds] = useState<Array<any>>([]);
  const [medSearch, setMedSearch] = useState('');
  const [selectedMed, setSelectedMed] = useState<InventoryItem | null>(null);
  const [medDosage, setMedDosage] = useState('');
  const [medFreq, setMedFreq] = useState('SID (Once a day)');
  const [medDuration, setMedDuration] = useState('');
  const [medInstructions, setMedInstructions] = useState('After Meal');
  const [medQty, setMedQty] = useState(1);

  // Expanded Accordeon State
  const [expandedSystem, setExpandedSystem] = useState<keyof PhysicalExamination | null>('general');

  const resetForm = () => {
    setEditingRecord(null);
    setVitals({});
    setHistory({ diet: [], previousMedicalHistory: [], currentMedications: [] });
    setExam({
      general: { isNormal: true, abnormalities: [] }, gastrointestinal: { isNormal: true, abnormalities: [] },
      respiratory: { isNormal: true, abnormalities: [] }, cardiovascular: { isNormal: true, abnormalities: [] },
      urogenital: { isNormal: true, abnormalities: [] }, skin: { isNormal: true, abnormalities: [] },
      musculoskeletal: { isNormal: true, abnormalities: [] }, neurological: { isNormal: true, abnormalities: [] },
      reproductive: { isNormal: true, abnormalities: [] }, eyesAndEars: { isNormal: true, abnormalities: [] }
    });
    setAssessment({});
    setPrescribedMeds([]);
    setActiveTab('vitals');
  };

  const openRecord = (record: MedicalRecord) => {
    setEditingRecord(record);
    setVitals(record.vitals || {});
    setHistory(record.patientHistory || { diet: [], previousMedicalHistory: [], currentMedications: [] });
    
    // Merge existing exam or use default
    if (record.physicalExam) {
      setExam(record.physicalExam);
    } else {
      // Legacy conversion if needed, but we start clean
      setExam({
        general: { isNormal: true, abnormalities: [] }, gastrointestinal: { isNormal: true, abnormalities: [] },
        respiratory: { isNormal: true, abnormalities: [] }, cardiovascular: { isNormal: true, abnormalities: [] },
        urogenital: { isNormal: true, abnormalities: [] }, skin: { isNormal: true, abnormalities: [] },
        musculoskeletal: { isNormal: true, abnormalities: [] }, neurological: { isNormal: true, abnormalities: [] },
        reproductive: { isNormal: true, abnormalities: [] }, eyesAndEars: { isNormal: true, abnormalities: [] }
      });
    }
    
    setAssessment(record.assessment || {});
    setPrescribedMeds(record.prescribedMeds || []);
    setShowModal(true);
  };

  const saveRecord = () => {
    if (!editingRecord) return;
    
    // Compile legacy strings for backwards compatibility + New schema
    const compiledSymptoms = Object.values(exam).flatMap(sys => sys.abnormalities || []).join(', ');
    const compiledDiagnosis = `${assessment.diagnosisType || 'Diagnosis'}: ${assessment.notes || ''}`;

    const updatedRecord: MedicalRecord = {
      ...editingRecord,
      vitals,
      patientHistory: history,
      physicalExam: exam,
      assessment,
      prescribedMeds,
      symptoms: compiledSymptoms, // Legacy map
      diagnosis: compiledDiagnosis // Legacy map
    };

    onUpdateRecord(updatedRecord);
    setShowModal(false);
  };

  const toggleArrayItem = (array: string[] | undefined, item: string) => {
    const arr = array || [];
    return arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];
  };

  // ============================================================================
  // RENDERERS: TABS
  // ============================================================================

  const renderVitalsTab = () => (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-[11px] font-black text-indigo-600 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4 flex items-center gap-2"><Activity className="w-4 h-4"/> Objective Vitals</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Temp (°C/°F)</label>
            <input type="number" step="0.1" value={vitals.temperature || ''} onChange={e => setVitals({...vitals, temperature: parseFloat(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Pulse (bpm)</label>
            <input type="number" value={vitals.pulse || ''} onChange={e => setVitals({...vitals, pulse: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Resp (bpm)</label>
            <input type="number" value={vitals.respiration || ''} onChange={e => setVitals({...vitals, respiration: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">BCS (1-9)</label>
            <input type="number" min="1" max="9" value={vitals.bcs || ''} onChange={e => setVitals({...vitals, bcs: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none" />
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5">
        <h3 className="text-[11px] font-black text-indigo-600 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2"><History className="w-4 h-4"/> 1-Click Patient History</h3>
        
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Duration of Illness</label>
          <div className="flex flex-wrap gap-2">
            {CLINICAL_TAGS.duration.map(tag => (
              <button key={tag} onClick={() => setHistory({...history, duration: tag})} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${history.duration === tag ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Progression</label>
          <div className="flex flex-wrap gap-2">
            {CLINICAL_TAGS.progression.map(tag => (
              <button key={tag} onClick={() => setHistory({...history, progression: tag})} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${history.progression === tag ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderExamTab = () => (
    <div className="flex flex-col h-full bg-slate-50/50 rounded-2xl overflow-hidden border border-slate-200">
      <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><HeartPulse className="w-5 h-5 text-rose-500"/> Systemic Examination</h3>
          <p className="text-[10px] text-slate-500 font-bold mt-0.5">Select abnormal symptoms. Green indicates normal.</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {(Object.keys(SYSTEM_LABELS) as Array<keyof PhysicalExamination>).map(systemKey => {
          const isExpanded = expandedSystem === systemKey;
          const sysData = exam[systemKey];
          const hasAbnormalities = (sysData.abnormalities?.length || 0) > 0;
          const isNormal = sysData.isNormal && !hasAbnormalities;

          return (
            <div key={systemKey} className={`bg-white border rounded-xl overflow-hidden transition-all shadow-sm ${isNormal ? 'border-emerald-200' : 'border-rose-200'}`}>
              <div 
                onClick={() => setExpandedSystem(isExpanded ? null : systemKey)}
                className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${isNormal ? 'bg-emerald-50/30 hover:bg-emerald-50' : 'bg-rose-50/30 hover:bg-rose-50'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${isNormal ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}></div>
                  <span className={`text-xs font-black uppercase tracking-wider ${isNormal ? 'text-emerald-900' : 'text-rose-900'}`}>{SYSTEM_LABELS[systemKey]}</span>
                  {hasAbnormalities && <span className="bg-rose-100 text-rose-700 text-[9px] px-2 py-0.5 rounded-full font-bold">{sysData.abnormalities?.length} issues</span>}
                </div>
                <ChevronRight className={`w-4 h-4 transition-transform ${isNormal ? 'text-emerald-400' : 'text-rose-400'} ${isExpanded ? 'rotate-90' : ''}`} />
              </div>

              {isExpanded && (
                <div className="p-4 border-t border-slate-100 bg-white">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Quick Tags</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setExam({...exam, [systemKey]: { isNormal: true, abnormalities: [] }}); }}
                      className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-emerald-100 transition-colors flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3"/> Mark All Normal
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {SYSTEMIC_SYMPTOMS[systemKey].map(symptom => {
                      const isSelected = sysData.abnormalities?.includes(symptom);
                      return (
                        <button 
                          key={symptom}
                          onClick={() => {
                            const newAbnormals = toggleArrayItem(sysData.abnormalities, symptom);
                            setExam({...exam, [systemKey]: { isNormal: newAbnormals.length === 0, abnormalities: newAbnormals }});
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${isSelected ? 'bg-rose-600 text-white border-rose-700 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                        >
                          {symptom}
                        </button>
                      )
                    })}
                  </div>
                  
                  <textarea 
                    placeholder={`Additional ${SYSTEM_LABELS[systemKey]} notes...`}
                    value={sysData.notes || ''}
                    onChange={(e) => setExam({...exam, [systemKey]: { ...sysData, notes: e.target.value }})}
                    className="w-full mt-4 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
                    rows={2}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  );

  const renderAssessmentTab = () => (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5">
        <h3 className="text-[11px] font-black text-amber-600 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Clinical Assessment</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Severity</label>
            <select 
              value={assessment.severity || ''} 
              onChange={e => setAssessment({...assessment, severity: e.target.value as any})}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer"
            >
              <option value="">Select...</option>
              <option value="Mild">Mild</option>
              <option value="Moderate">Moderate</option>
              <option value="Severe">Severe</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Prognosis</label>
            <select 
              value={assessment.prognosis || ''} 
              onChange={e => setAssessment({...assessment, prognosis: e.target.value as any})}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer"
            >
              <option value="">Select...</option>
              <option value="Good">Good</option>
              <option value="Guarded">Guarded</option>
              <option value="Poor">Poor</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Diagnosis Type</label>
          <div className="flex bg-slate-100 p-1 rounded-xl w-max">
            <button onClick={() => setAssessment({...assessment, diagnosisType: 'Tentative'})} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${assessment.diagnosisType === 'Tentative' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Tentative</button>
            <button onClick={() => setAssessment({...assessment, diagnosisType: 'Definitive'})} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${assessment.diagnosisType === 'Definitive' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Definitive</button>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Clinical Diagnosis Notes</label>
          <textarea 
            rows={3} 
            value={assessment.notes || ''} 
            onChange={e => setAssessment({...assessment, notes: e.target.value})}
            placeholder="Detailed diagnosis and case evaluation..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
          />
        </div>
      </div>
    </div>
  );

  const renderPharmacyTab = () => {
    const rxInventory = inventory.filter(i => i.category === 'prescription' || i.category === 'retail' || i.category === 'vaccine');
    const filteredSearch = medSearch ? rxInventory.filter(i => i.name.toLowerCase().includes(medSearch.toLowerCase())) : [];

    const handleAddMed = () => {
      if (!selectedMed) return;
      const newMed = {
        itemId: selectedMed.id,
        name: selectedMed.name,
        dosage: medDosage,
        frequency: medFreq,
        duration: medDuration,
        instructions: medInstructions,
        quantity: medQty
      };
      setPrescribedMeds([...prescribedMeds, newMed]);
      setSelectedMed(null); setMedSearch(''); setMedDosage(''); setMedQty(1);
    };

    return (
      <div className="space-y-6 animate-fade-in h-full flex flex-col">
        {/* EXACT PRESERVED PHARMACY BLOCK */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm shrink-0">
          <h3 className="text-[11px] font-black text-indigo-600 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4 flex items-center gap-2"><Pill className="w-4 h-4"/> Pharmacy & Prescriptions</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Search Medication</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={selectedMed ? selectedMed.name : medSearch}
                  onChange={e => { setMedSearch(e.target.value); setSelectedMed(null); }}
                  placeholder="-- Select from Inventory --"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
                {!selectedMed && medSearch && filteredSearch.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                    {filteredSearch.map(item => (
                      <div key={item.id} onClick={() => { setSelectedMed(item); setMedSearch(''); }} className="p-2.5 hover:bg-indigo-50 cursor-pointer text-xs font-bold border-b border-slate-100 last:border-0 flex justify-between">
                        <span>{item.name}</span>
                        <span className="text-slate-400 font-mono text-[10px]">Stock: {item.stock} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Dosage</label>
                <input type="text" placeholder="e.g. 1 Tablet, 5ml" value={medDosage} onChange={e => setMedDosage(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Frequency</label>
                <select value={medFreq} onChange={e => setMedFreq(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer">
                  <option>SID (Once a day)</option>
                  <option>BID (Twice a day)</option>
                  <option>TID (Three times a day)</option>
                  <option>QID (Four times a day)</option>
                  <option>PRN (As needed)</option>
                  <option>STAT (Immediately)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Duration (Days)</label>
                <input type="text" placeholder="e.g. 7" value={medDuration} onChange={e => setMedDuration(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Instructions</label>
                <input type="text" placeholder="After Meal" value={medInstructions} onChange={e => setMedInstructions(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none" />
              </div>
            </div>

            <div className="flex items-end gap-4 pt-2">
              <div className="w-32">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Total Dispense Qty</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="1" value={medQty} onChange={e => setMedQty(parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none" />
                  <span className="text-[10px] font-bold text-slate-400">{selectedMed?.unit || 'Units'}</span>
                </div>
              </div>
              <button 
                type="button"
                onClick={handleAddMed}
                disabled={!selectedMed}
                className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center gap-2 ${selectedMed ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                <Plus className="w-4 h-4"/> Add to Prescription & Deduct Stock
              </button>
            </div>
          </div>
        </div>

        {/* ACTIVE PRESCRIPTIONS LIST */}
        <div className="flex-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm overflow-y-auto custom-scrollbar">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Active Prescriptions List</h4>
          {prescribedMeds.length === 0 ? (
            <div className="text-center py-8 text-slate-400 font-medium text-xs border-2 border-dashed border-slate-100 rounded-xl">No medications prescribed yet.</div>
          ) : (
            <div className="space-y-2">
              {prescribedMeds.map((med, idx) => (
                <div key={idx} className="p-3 border border-indigo-100 bg-indigo-50/50 rounded-xl flex items-center justify-between group">
                  <div>
                    <div className="font-black text-indigo-900 text-xs">{med.name}</div>
                    <div className="text-[10px] font-medium text-indigo-700 mt-0.5">
                      {med.dosage} • {med.frequency} • {med.duration} days • {med.instructions}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="bg-white px-2 py-1 rounded-md text-[10px] font-black text-indigo-600 border border-indigo-100 shadow-sm">Qty: {med.quantity}</span>
                    <button onClick={() => setPrescribedMeds(prescribedMeds.filter((_, i) => i !== idx))} className="p-1.5 text-rose-400 hover:bg-rose-100 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"><X className="w-4 h-4"/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  const filteredRecords = records.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return r.petName.toLowerCase().includes(q) || r.ownerName.toLowerCase().includes(q) || r.ownerPhone.includes(q);
  });

  return (
    <div className="h-full flex flex-col gap-4">
      {/* HEADER & SEARCH */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between shrink-0">
        <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-600"/> Patient Vault</h2>
        <div className="relative w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input 
            type="text" placeholder="Search pets, owners..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" 
          />
        </div>
      </div>

      {/* RECORD LIST */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-y-auto custom-scrollbar flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-wider font-bold text-[10px]">
                <th className="py-3 px-4">Visit Date</th>
                <th className="py-3 px-4">Patient Info</th>
                <th className="py-3 px-4">Owner Info</th>
                <th className="py-3 px-4">Diagnosis summary</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map(record => (
                <tr key={record.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="py-3 px-4 font-bold text-slate-800">{formatDisplayDate(record.visitDate)}</td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-800">{record.petName}</div>
                    <div className="text-[10px] text-slate-500 font-medium">{record.petType} - {record.breed}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-700">{record.ownerName}</div>
                    <div className="text-[10px] text-slate-500 font-medium font-mono">{record.ownerPhone}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-[10px] font-medium text-slate-600 truncate max-w-[200px]">
                      {record.assessment?.diagnosisType ? `${record.assessment.diagnosisType}: ${record.assessment.notes?.substring(0,30)}...` : (record.diagnosis || 'Pending Assessment')}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => openRecord(record)} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold rounded-lg transition-colors text-[10px] flex items-center gap-1.5 ml-auto cursor-pointer">
                      <Edit2 className="w-3 h-3"/> Open E.H.R
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* EHR COMMAND CENTER MODAL */}
      {showModal && editingRecord && createPortal(
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-100 rounded-3xl border border-indigo-100/50 max-w-6xl w-full h-[85vh] shadow-2xl animate-scale-up flex overflow-hidden">
            
            {/* SIDEBAR NAVIGATION */}
            <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
              <div className="p-5 border-b border-slate-100">
                <h2 className="text-base font-black text-slate-800">{editingRecord.petName}</h2>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{editingRecord.petType} • {editingRecord.breed}</div>
              </div>
              <div className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
                
                <button onClick={() => setActiveTab('vitals')} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black transition-all flex items-center gap-3 cursor-pointer ${activeTab === 'vitals' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <Activity className={`w-4 h-4 ${activeTab === 'vitals' ? 'text-indigo-200' : 'text-slate-400'}`}/> Intake & Vitals
                </button>

                <button onClick={() => setActiveTab('exam')} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black transition-all flex items-center gap-3 cursor-pointer ${activeTab === 'exam' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <HeartPulse className={`w-4 h-4 ${activeTab === 'exam' ? 'text-rose-200' : 'text-slate-400'}`}/> Systemic Exam
                </button>

                <button onClick={() => setActiveTab('assessment')} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black transition-all flex items-center gap-3 cursor-pointer ${activeTab === 'assessment' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <AlertCircle className={`w-4 h-4 ${activeTab === 'assessment' ? 'text-amber-200' : 'text-slate-400'}`}/> Assessment
                </button>

                <button onClick={() => setActiveTab('pharmacy')} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black transition-all flex items-center gap-3 cursor-pointer ${activeTab === 'pharmacy' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <Pill className={`w-4 h-4 ${activeTab === 'pharmacy' ? 'text-emerald-200' : 'text-slate-400'}`}/> Pharmacy & Rx
                </button>

              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                 <button onClick={saveRecord} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer">
                    <Save className="w-4 h-4"/> Lock Chart & Save
                 </button>
                 <button onClick={() => setShowModal(false)} className="w-full mt-2 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer">
                    Close Workspace
                 </button>
              </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {activeTab === 'vitals' && renderVitalsTab()}
                {activeTab === 'exam' && renderExamTab()}
                {activeTab === 'assessment' && renderAssessmentTab()}
                {activeTab === 'pharmacy' && renderPharmacyTab()}
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}