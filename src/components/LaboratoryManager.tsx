/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Modal } from './ui/Modal';
import { createPortal } from 'react-dom';
import { Search, TestTube, User, CheckCircle2, X, ClipboardList, Database, FileText } from 'lucide-react';
import { MedicalRecord, LabResult, InventoryItem, Appointment, Pet, Client, ClinicQueueItem } from '../types';
import { showToast } from './Toast';
import { formatDisplayDate } from '../utils/time';
import { fetchPets, fetchLabResults, upsertLabResult } from '../lib/db';
import { sortQueueByUrgency } from '../lib/queueUtils';
import PageShell from './ui/PageShell';
import MasterDetailLayout from './ui/MasterDetailLayout';
import EmptyState from './ui/EmptyState';
import ClinicQueue from './ui/ClinicQueue';

interface LabProps {
  clients: Client[];
  pets: Pet[];
  records: MedicalRecord[];
  inventory: InventoryItem[];
  appointments?: Appointment[]; // PHASE 1: Added to detect lobby queue
  clinicQueue?: ClinicQueueItem[];
  onUpdateRecord: (record: MedicalRecord) => void;
  onAddRecord?: (record: MedicalRecord) => void; // PHASE 1: Auto-generate charts from labs
}

const normalizeSearchPhone = (p: string) => p ? p.replace(/\D/g, '').slice(-9) : '';

export default function LaboratoryManager({ clients, pets, records, inventory, appointments, clinicQueue = [], onUpdateRecord, onAddRecord }: LabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'order' | 'results'>('order');
  const [showQueueOnly, setShowQueueOnly] = useState(true);

  const [labResults, setLabResults] = useState<LabResult[]>([]);

  React.useEffect(() => {
    fetchLabResults().then(setLabResults).catch(console.error);
  }, []);

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
        const p = pets.find(pet => pet.id === r.patientId);
        patientMap.set(r.patientId, {
          patientId: r.patientId,
          petName: p?.name || 'Unknown',
          petType: p?.petType || 'Canine',
          breed: p?.breed || '',
          weight: p?.weight || 0,
          sex: p?.sex || 'Unknown',
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
        const isActiveInQueue = (clinicQueue || []).some(q => q.petId === p.patientId && q.status === 'active');
        const hasPendingAppt = (appointments || []).some(a => 
          `${(a.petName || '').trim().toLowerCase()}_${normalizeSearchPhone(a.ownerPhone)}` === p.patientId && 
          a.date === todayStr && 
          a.status === 'booked'
        );
        return isActiveInQueue || hasPendingAppt;
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
  
  const allLabResults = selectedPatientId ? labResults.filter(l => l.petId === selectedPatientId).sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime()) : [];

  // PHASE 1: Phantom Chart Generation Logic
  const handleOrderTest = async (testItem: InventoryItem) => {
    if (!selectedPatientId) return;
    
    let activeRecord = records.find(r => r.patientId === selectedPatientId && r.visitDate === todayStr);
    let isNewRecord = false;

    if (!activeRecord) {
      const stub = displayPatients.find(p => p.patientId === selectedPatientId);
      if (!stub) return;
      activeRecord = {
        id: crypto.randomUUID(),
        patientId: stub.patientId,
        ownerName: stub.ownerName,
        ownerPhone: stub.ownerPhone,
        ownerEmail: 'not-provided@example.com',
        visitDate: todayStr,
        attendingVet: 'System / Lab Tech',
        symptoms: '',
        diagnosis: 'Direct Lab Intake',
        treatmentNotes: '',
        prescribedMeds: [],
        createdDate: new Date().toISOString().split('T')[0]
      };
      isNewRecord = true;
    }

    const billingItem = {
      itemId: testItem.id,
      name: testItem.name,
      dosage: '1 Test',
      quantity: 1
    };

    const newLab: LabResult = {
      id: crypto.randomUUID(),
      petId: selectedPatientId,
      testName: testItem.name,
      requestDate: todayStr,
      status: 'pending',
      billingItems: [billingItem]
    };

    await upsertLabResult(newLab);
    setLabResults(prev => [...prev, newLab]);

    if (isNewRecord && onAddRecord) {
      await onAddRecord(activeRecord);
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

  const handleSaveResult = async () => {
    if (!activeLabResult) return;

    const stringifiedValues = JSON.stringify(parameterValues);
    const updatedLab = { 
      ...activeLabResult.result, 
      status: 'completed' as const, 
      notes: resultNotes, 
      value: stringifiedValues, 
      resultDate: todayStr 
    };

    await upsertLabResult(updatedLab);
    setLabResults(prev => prev.map(l => l.id === updatedLab.id ? updatedLab : l));

    setShowResultModal(false);
    showToast('Laboratory results finalized & locked.', 'success');
  };

  const activeTestSchema = activeLabResult 
    ? inventory.find(i => i.name === activeLabResult.result.testName)?.labParameters 
    : undefined;

  const renderActiveQueue = () => {
    const activeQueue = sortQueueByUrgency(clinicQueue.filter(q =>
      q.serviceType === 'Examination' &&
      q.status === 'active' &&
      labResults.some(l => l.petId === q.petId && l.status === 'pending')
    ));

    return (
      <ClinicQueue
        title="Active Lab Queue"
        items={activeQueue}
        isSelected={q => selectedPatientId === q.petId}
        onSelect={q => setSelectedPatientId(q.petId)}
        statusLabel={() => 'Pending Labs'}
      />
    );
  };

  return (
    <PageShell
      title="Diagnostics & Lab"
      search={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: "Search Pet or Owner..."
      }}
      filters={{
        options: [
          { id: 'clinic', label: 'In Clinic' },
          { id: 'all', label: 'All' }
        ],
        active: showQueueOnly ? 'clinic' : 'all',
        onChange: (id) => setShowQueueOnly(id === 'clinic')
      }}
    >
      <div className="h-full w-full" id="laboratory-module-container">
        <MasterDetailLayout
          listHeader={renderActiveQueue()}
          list={
            <>
              {displayPatients.length === 0 ? (
                <div className="py-8"><EmptyState icon={<TestTube className="w-8 h-8" />} title="No Patients" description="No patients found in this view." /></div>
              ) : (
                displayPatients.map(patient => (
                  <div 
                    key={patient.patientId} onClick={() => setSelectedPatientId(patient.patientId)}
                    className={`p-4 rounded-2xl cursor-pointer transition-all border ${selectedPatientId === patient.patientId ? 'bg-indigo-600 border-indigo-700 shadow-md text-white' : 'bg-white border-slate-200 hover:border-indigo-300 shadow-sm'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className={`font-black truncate text-sm ${selectedPatientId === patient.patientId ? 'text-white' : 'text-slate-800'}`}>{patient.petName}</div>
                      {showQueueOnly && <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${selectedPatientId === patient.patientId ? 'bg-indigo-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>Queued</span>}
                    </div>
                    <div className={`text-[10px] font-bold ${selectedPatientId === patient.patientId ? 'text-indigo-200' : 'text-slate-500'}`}>{patient.petType} • {patient.breed}</div>
                    <div className={`text-[10px] font-black mt-2 pt-2 border-t flex items-center gap-1.5 ${selectedPatientId === patient.patientId ? 'text-indigo-100 border-indigo-500' : 'text-slate-400 border-slate-100'}`}>
                      <User className="w-3 h-3" /> {patient.ownerName}
                    </div>
                  </div>
                ))
              )}
            </>
          }
          isEmpty={!selectedRecord}
          detailEmptyIcon={<Database className="h-16 w-16 text-slate-300" />}
          detailEmptyTitle="Select a Patient to view Laboratory"
          detail={
            <div className="flex-1 flex flex-col relative overflow-hidden">
              <div className="bg-white p-6 border-b border-slate-200 flex justify-between items-start shrink-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100"><TestTube className="w-7 h-7 text-indigo-600" /></div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">{selectedRecord?.petName}'s Lab Matrix</h2>
                    <p className="text-xs font-bold text-slate-500 mt-0.5 uppercase tracking-widest">{selectedRecord?.ownerName} • {selectedRecord?.ownerPhone}</p>
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
                        <p className="text-xs text-rose-600 mt-2 font-bold">Go to Inventory Manager and create items with category 'Lab Service' to populate this matrix.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {availableLabTests.map(test => (
                          <div key={test.id} className="bg-white p-4 border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
                            <div className="font-black text-slate-800 text-sm mb-1">{test.name}</div>
                            <div className="text-[10px] font-bold text-slate-400 font-mono mb-4">Rs. {test.price.toFixed(2)}</div>
                            
                            {test.labParameters && test.labParameters.length > 0 && (
                              <div className="mb-4 flex flex-wrap gap-1">
                                {test.labParameters.slice(0,3).map(p => <span key={p.name} className="bg-slate-100 text-slate-500 text-[10px] font-black px-1.5 py-0.5 rounded">{p.name}</span>)}
                                {test.labParameters.length > 3 && <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-1.5 py-0.5 rounded">+{test.labParameters.length - 3}</span>}
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
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase tracking-widest font-black text-[10px]">
                          <th className="py-4 px-6">Request Date</th>
                          <th className="py-4 px-6">Diagnostic Test</th>
                          <th className="py-4 px-6">Status</th>
                          <th className="py-4 px-6 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allLabResults.length === 0 ? (
                          <tr><td colSpan={4} className="py-12 text-center text-slate-400 font-bold">No diagnostic orders found for this patient.</td></tr>
                        ) : (
                          allLabResults.map((lab, i) => (
                            <tr key={i} className="hover:bg-slate-50 transition-colors group">
                              <td className="py-4 px-6 font-bold text-slate-600">{formatDisplayDate(lab.requestDate)}</td>
                              <td className="py-4 px-6 font-black text-slate-800">{lab.testName}</td>
                              <td className="py-4 px-6">
                                <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${lab.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                  {lab.status}
                                </span>
                              </td>
                              <td className="py-4 px-6 text-right">
                                {lab.status === 'pending' ? (
                                  <button onClick={() => openResultModal(lab, lab.recordId)} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-xs cursor-pointer inline-flex items-center gap-1.5">
                                    <ClipboardList className="w-3 h-3"/> Enter Data
                                  </button>
                                ) : (
                                  <button onClick={() => openResultModal(lab, lab.recordId)} className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer inline-flex items-center gap-1.5">
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
          }
        />

        {activeLabResult && (
          <Modal
            open={showResultModal}
            onClose={() => setShowResultModal(false)}
            size="lg"
            title={
              <div>
                <div className="text-lg font-black text-slate-800 tracking-tight">Diagnostic Report</div>
                <div className="text-[10px] text-indigo-600 font-black mt-1 uppercase tracking-widest">{activeLabResult.result.testName}</div>
              </div>
            }
            footer={activeLabResult.result.status === 'pending' ? (
              <>
                <button onClick={() => setShowResultModal(false)} className="px-6 py-2.5 border border-slate-200 text-slate-600 font-black uppercase tracking-widest rounded-xl hover:bg-slate-50 cursor-pointer text-[10px] transition-colors">Cancel</button>
                <button onClick={handleSaveResult} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-xl shadow-md cursor-pointer flex items-center gap-2 text-[10px] transition-colors">
                  <CheckCircle2 className="w-4 h-4"/> Sign & Finalize Report
                </button>
              </>
            ) : null}
          >
            <div className="space-y-6">
                {activeTestSchema && activeTestSchema.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Measured Parameters</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {activeTestSchema.map(param => (
                        <div key={param.name} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                          <div className="flex justify-between items-end mb-2">
                            <label className="text-xs font-black text-slate-800">{param.name}</label>
                            <span className="text-[10px] font-bold text-slate-400 font-mono">Range: {param.referenceRange}</span>
                          </div>
                          <div className="relative">
                            <input 
                              type="text" 
                              value={parameterValues[param.name] || ''} 
                              onChange={e => setParameterValues({...parameterValues, [param.name]: e.target.value})}
                              readOnly={activeLabResult.result.status === 'completed'}
                              className={`w-full px-3 py-2 border rounded-xl text-sm font-bold font-mono focus:outline-none pr-12 ${activeLabResult.result.status === 'completed' ? 'bg-slate-50 border-transparent text-slate-700 cursor-not-allowed' : 'bg-white border-slate-200 text-indigo-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'}`}
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
                    className={`w-full px-4 py-3 border rounded-2xl text-xs font-bold focus:outline-none resize-none ${activeLabResult.result.status === 'completed' ? 'bg-slate-50 border-slate-200 text-slate-700 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm'}`}
                  />
                </div>

              </div>
        </Modal>
        )}
      </div>
    </PageShell>
  );
}