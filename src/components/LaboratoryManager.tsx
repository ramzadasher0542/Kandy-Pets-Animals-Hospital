/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, TestTube, Activity, User, CheckCircle2, X, ClipboardList, Database, FileText } from 'lucide-react';
import { MedicalRecord, LabResult, InventoryItem, Appointment } from '../types';
import { showToast } from './Toast';
import { formatDisplayDate } from '../utils/time';

interface LabProps {
  records: MedicalRecord[];
  inventory: InventoryItem[];
  appointments?: Appointment[]; // PHASE 1: Added to detect lobby queue
  onUpdateRecord: (record: MedicalRecord) => void;
  onAddRecord?: (record: MedicalRecord) => void; // PHASE 1: Auto-generate charts from labs
}

const normalizeSearchPhone = (p: string) => p ? p.replace(/\D/g, '').slice(-9) : '';

export default function LaboratoryManager({ records, inventory, appointments, onUpdateRecord, onAddRecord }: LabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'order' | 'results'>('order');
  const [showQueueOnly, setShowQueueOnly] = useState(true);

  const [showResultModal, setShowResultModal] = useState(false);
  const [activeLabResult, setActiveLabResult] = useState<{ result: LabResult, recordId: string } | null>(null);
  const [resultNotes, setResultNotes] = useState('');
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});

  const availableLabTests = useMemo(() => {
    return inventory.filter(i => i.category === 'lab_service').sort((a, b) => a.name.localeCompare(b.name));
  }, [inventory]);

  const todayStr = formatDisplayDate(new Date());

  // PHASE 1: The "True Queue" Dual-Matrix Aggregator
  const displayPatients = useMemo(() => {
    const patientMap = new Map<string, any>();

    // Pass 1: Load from Medical Records
    records.forEach(r => {
      if (!patientMap.has(r.patientId) || new Date(r.visitDate) > new Date(patientMap.get(r.patientId).visitDate)) {
        patientMap.set(r.patientId, {
          patientId: r.patientId,
          petName: r.petName,
          petType: r.petType,
          breed: r.breed,
          weight: r.weight,
          sex: r.sex,
          ownerName: r.ownerName,
          ownerPhone: r.ownerPhone,
          visitDate: r.visitDate,
          source: 'record'
        });
      }
    });

    // Pass 2: Load from Appointments (Catching un-charted pets in the lobby)
    (appointments || []).forEach(a => {
      const pid = `${(a.petName || '').trim().toLowerCase()}_${normalizeSearchPhone(a.ownerPhone)}`;
      if (!patientMap.has(pid)) {
        patientMap.set(pid, {
          patientId: pid,
          petName: a.petName,
          petType: a.petType,
          breed: a.breed,
          weight: a.weight,
          sex: a.sex,
          ownerName: a.ownerName,
          ownerPhone: a.ownerPhone,
          visitDate: a.date,
          source: 'appointment'
        });
      }
    });

    let activeList = Array.from(patientMap.values());

    if (showQueueOnly) {
      activeList = activeList.filter(p => {
        const hasRecordToday = records.some(r => r.patientId === p.patientId && r.visitDate === todayStr);
        const hasApptToday = (appointments || []).some(a => 
          `${(a.petName || '').trim().toLowerCase()}_${normalizeSearchPhone(a.ownerPhone)}` === p.patientId && 
          a.date === todayStr && 
          ['booked', 'in-progress'].includes(a.status)
        );
        return hasRecordToday || hasApptToday;
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      activeList = activeList.filter(p => p.petName.toLowerCase().includes(q) || p.ownerName.toLowerCase().includes(q));
    }

    return activeList.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
  }, [records, appointments, showQueueOnly, searchQuery, todayStr]);

  const selectedRecord = displayPatients.find(p => p.patientId === selectedPatientId);
  const allPatientRecords = selectedPatientId ? records.filter(r => r.patientId === selectedPatientId) : [];
  
  const allLabResults = allPatientRecords.flatMap(r => 
    (r.labResults || []).map(lab => ({ ...lab, recordId: r.id }))
  ).sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());

  // PHASE 1: Phantom Chart Generation Logic
  const handleOrderTest = (testItem: InventoryItem) => {
    if (!selectedPatientId) return;
    
    let activeRecord = records.find(r => r.patientId === selectedPatientId && r.visitDate === todayStr);
    let isNewRecord = false;

    if (!activeRecord) {
      const stub = displayPatients.find(p => p.patientId === selectedPatientId);
      if (!stub) return;
      activeRecord = {
        id: crypto.randomUUID(),
        patientId: stub.patientId,
        petName: stub.petName,
        petType: stub.petType as any,
        breed: stub.breed || 'Mixed',
        age: 'Unknown',
        weight: stub.weight || 0,
        sex: stub.sex || 'Unknown',
        ownerName: stub.ownerName,
        ownerPhone: stub.ownerPhone,
        ownerEmail: 'not-provided@example.com',
        visitDate: todayStr,
        attendingVet: 'System / Lab Tech',
        symptoms: '',
        diagnosis: 'Direct Lab Intake',
        treatmentNotes: '',
        prescribedMeds: [],
        vaccinations: [],
        labResults: [],
        createdDate: new Date().toISOString().split('T')[0]
      };
      isNewRecord = true;
    }

    const newLab: LabResult = {
      id: crypto.randomUUID(),
      testName: testItem.name,
      requestDate: todayStr,
      status: 'pending'
    };

    const billingItem = {
      itemId: testItem.id,
      name: testItem.name,
      dosage: '1 Test',
      quantity: 1
    };

    const updatedRecord = {
      ...activeRecord,
      labResults: [...(activeRecord.labResults || []), newLab],
      prescribedMeds: [...(activeRecord.prescribedMeds || []), billingItem]
    };

    if (isNewRecord && onAddRecord) {
      onAddRecord(updatedRecord);
    } else {
      onUpdateRecord(updatedRecord);
    }

    showToast(`${testItem.name} ordered & billed to POS queue.`, 'success');
    setActiveTab('results');
  };

  const openResultModal = (lab: LabResult, recordId: string) => {
    setActiveLabResult({ result: lab, recordId });
    setResultNotes(lab.notes || '');
    try {
      if (lab.value && lab.value.startsWith('{')) setParameterValues(JSON.parse(lab.value));
      else setParameterValues({});
    } catch(e) { setParameterValues({}); }
    setShowResultModal(true);
  };

  const handleSaveResult = () => {
    if (!activeLabResult) return;
    const targetRecord = records.find(r => r.id === activeLabResult.recordId);
    if (!targetRecord) return;

    const stringifiedValues = JSON.stringify(parameterValues);
    const updatedLabs = targetRecord.labResults.map(lab => 
      lab.id === activeLabResult.result.id 
        ? { ...lab, status: 'completed' as const, notes: resultNotes, value: stringifiedValues, resultDate: todayStr } 
        : lab
    );

    onUpdateRecord({ ...targetRecord, labResults: updatedLabs });
    setShowResultModal(false);
    showToast('Laboratory results finalized & locked.', 'success');
  };

  const activeTestSchema = activeLabResult 
    ? inventory.find(i => i.name === activeLabResult.result.testName)?.labParameters 
    : undefined;

  return (
    <div className="flex h-full w-full gap-4 overflow-hidden" id="laboratory-module-container">
      
      <aside className="w-1/3 min-w-[320px] max-w-[400px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
        <div className="p-5 border-b border-slate-100 bg-slate-50 shrink-0 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
              <TestTube className="w-4 h-4 text-indigo-600" /> Lab Patients
            </h2>
            <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 shadow-xs">
              <button onClick={() => setShowQueueOnly(true)} className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-colors ${showQueueOnly ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>In Clinic</button>
              <button onClick={() => setShowQueueOnly(false)} className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-colors ${!showQueueOnly ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>All</button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" placeholder="Search Pet or Owner..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-xs" 
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-slate-50/30">
          {displayPatients.length === 0 ? (
            <div className="text-center py-10 text-slate-400 font-bold text-xs">No patients found in this view.</div>
          ) : (
            displayPatients.map(patient => (
              <div 
                key={patient.patientId} onClick={() => setSelectedPatientId(patient.patientId)}
                className={`p-4 rounded-2xl cursor-pointer transition-all border ${selectedPatientId === patient.patientId ? 'bg-indigo-600 border-indigo-700 shadow-md text-white' : 'bg-white border-slate-200 hover:border-indigo-300 shadow-sm'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className={`font-black truncate text-sm ${selectedPatientId === patient.patientId ? 'text-white' : 'text-slate-800'}`}>{patient.petName}</div>
                  {showQueueOnly && <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${selectedPatientId === patient.patientId ? 'bg-indigo-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>Queued</span>}
                </div>
                <div className={`text-[10px] font-bold ${selectedPatientId === patient.patientId ? 'text-indigo-200' : 'text-slate-500'}`}>{patient.petType} • {patient.breed}</div>
                <div className={`text-[10px] font-semibold mt-2 pt-2 border-t flex items-center gap-1.5 ${selectedPatientId === patient.patientId ? 'text-indigo-100 border-indigo-500' : 'text-slate-400 border-slate-100'}`}>
                  <User className="w-3 h-3" /> {patient.ownerName}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="flex-1 bg-slate-50 rounded-2xl flex flex-col border border-slate-200 shadow-sm overflow-hidden relative">
        {!selectedRecord ? (
          <div className="flex-1 flex flex-col items-center justify-center relative opacity-50">
            <Database className="h-16 w-16 text-slate-300 mb-4" />
            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Select a Patient to view Laboratory</h3>
          </div>
        ) : (
          <div className="flex-1 flex flex-col relative overflow-hidden">
            
            <div className="bg-white p-6 border-b border-slate-200 flex justify-between items-start shrink-0 z-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100"><TestTube className="w-7 h-7 text-indigo-600" /></div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">{selectedRecord.petName}'s Lab Matrix</h2>
                  <p className="text-xs font-bold text-slate-500 mt-0.5 uppercase tracking-widest">{selectedRecord.ownerName} • {selectedRecord.ownerPhone}</p>
                </div>
              </div>
            </div>

            {/* PHASE 2 UI SYNC: Standardized Tabs */}
            <div className="flex border-b border-slate-200 bg-white shrink-0 px-6 pt-2 gap-4">
              <button onClick={() => setActiveTab('order')} className={`pb-3 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 ${activeTab === 'order' ? 'text-indigo-600 border-indigo-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>Order / Bill Tests</button>
              <button onClick={() => setActiveTab('results')} className={`pb-3 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'results' ? 'text-indigo-600 border-indigo-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>
                Results Log
                {allLabResults.some(l => l.status === 'pending') && <span className="bg-amber-500 w-2 h-2 rounded-full animate-pulse"></span>}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              
              {activeTab === 'order' && (
                <div className="space-y-4 animate-fade-in max-w-4xl mx-auto">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">Available Inventory Lab Services</h3>
                  
                  {availableLabTests.length === 0 ? (
                    <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center shadow-sm">
                      <TestTube className="w-10 h-10 text-rose-300 mx-auto mb-3"/>
                      <h4 className="text-sm font-black text-rose-800">No Lab Services Configured</h4>
                      <p className="text-xs text-rose-600 mt-2 font-medium">Go to Inventory Manager and create items with category 'Lab Service' to populate this matrix.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {availableLabTests.map(test => (
                        <div key={test.id} className="bg-white p-4 border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
                          <div className="font-black text-slate-800 text-sm mb-1">{test.name}</div>
                          <div className="text-[10px] font-bold text-slate-400 font-mono mb-4">LKR {test.price.toFixed(2)}</div>
                          
                          {test.labParameters && test.labParameters.length > 0 && (
                            <div className="mb-4 flex flex-wrap gap-1">
                              {test.labParameters.slice(0,3).map(p => <span key={p.name} className="bg-slate-100 text-slate-500 text-[8px] font-black px-1.5 py-0.5 rounded">{p.name}</span>)}
                              {test.labParameters.length > 3 && <span className="bg-slate-100 text-slate-500 text-[8px] font-black px-1.5 py-0.5 rounded">+{test.labParameters.length - 3}</span>}
                            </div>
                          )}

                          <div className="mt-auto pt-3 border-t border-slate-100">
                            <button onClick={() => handleOrderTest(test)} className="w-full py-2 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 border border-indigo-100 hover:border-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-xs">
                              Order & Bill POS
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'results' && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-fade-in max-w-5xl mx-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase tracking-widest font-black text-[9px]">
                        <th className="py-4 px-5">Request Date</th>
                        <th className="py-4 px-5">Diagnostic Test</th>
                        <th className="py-4 px-5">Status</th>
                        <th className="py-4 px-5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allLabResults.length === 0 ? (
                        <tr><td colSpan={4} className="py-12 text-center text-slate-400 font-bold">No diagnostic orders found for this patient.</td></tr>
                      ) : (
                        allLabResults.map((lab, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors group">
                            <td className="py-4 px-5 font-bold text-slate-600">{formatDisplayDate(lab.requestDate)}</td>
                            <td className="py-4 px-5 font-black text-slate-800">{lab.testName}</td>
                            <td className="py-4 px-5">
                              <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${lab.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                {lab.status}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-right">
                              {lab.status === 'pending' ? (
                                <button onClick={() => openResultModal(lab, lab.recordId)} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-xs cursor-pointer inline-flex items-center gap-1.5">
                                  <ClipboardList className="w-3 h-3"/> Enter Data
                                </button>
                              ) : (
                                <button onClick={() => openResultModal(lab, lab.recordId)} className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer inline-flex items-center gap-1.5">
                                  <FileText className="w-3 h-3"/> View Report
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {showResultModal && activeLabResult && createPortal(
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-2xl w-full flex flex-col shadow-2xl animate-scale-up max-h-[90vh]">
            
            <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-5 shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Diagnostic Report</h3>
                <p className="text-[11px] text-indigo-600 font-black mt-1 uppercase tracking-widest">{activeLabResult.result.testName}</p>
              </div>
              <button onClick={() => setShowResultModal(false)} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
              {activeTestSchema && activeTestSchema.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Measured Parameters</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {activeTestSchema.map(param => (
                      <div key={param.name} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                        <div className="flex justify-between items-end mb-2">
                          <label className="text-xs font-black text-slate-800">{param.name}</label>
                          <span className="text-[9px] font-bold text-slate-400 font-mono">Range: {param.referenceRange}</span>
                        </div>
                        <div className="relative">
                          <input 
                            type="text" 
                            value={parameterValues[param.name] || ''} 
                            onChange={e => setParameterValues({...parameterValues, [param.name]: e.target.value})}
                            readOnly={activeLabResult.result.status === 'completed'}
                            className={`w-full px-3 py-2 border rounded-lg text-sm font-bold font-mono focus:outline-none pr-12 ${activeLabResult.result.status === 'completed' ? 'bg-slate-50 border-transparent text-slate-700 cursor-not-allowed' : 'bg-white border-slate-200 text-indigo-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'}`}
                          />
                          <span className="absolute right-3 top-2.5 text-[10px] font-black text-slate-400">{param.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Pathologist Notes / Remarks</label>
                <textarea 
                  rows={4} 
                  value={resultNotes} 
                  onChange={e => setResultNotes(e.target.value)}
                  readOnly={activeLabResult.result.status === 'completed'}
                  placeholder="Enter morphological findings, cellular observations, or general remarks..."
                  className={`w-full px-4 py-3 border rounded-2xl text-xs font-semibold focus:outline-none resize-none ${activeLabResult.result.status === 'completed' ? 'bg-slate-50 border-slate-200 text-slate-700 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm'}`}
                />
              </div>

            </div>

            {activeLabResult.result.status === 'pending' && (
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-5 mt-4 shrink-0">
                <button onClick={() => setShowResultModal(false)} className="px-5 py-2.5 border border-slate-200 text-slate-600 font-black uppercase tracking-widest rounded-xl hover:bg-slate-50 cursor-pointer text-[10px] transition-colors">Cancel</button>
                <button onClick={handleSaveResult} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-xl cursor-pointer shadow-md text-[10px] transition-colors flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4"/> Lock Results & Finalize
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}