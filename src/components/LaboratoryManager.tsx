/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, TestTube, Activity, User, PawPrint, CheckCircle2, AlertTriangle, FileText, X } from 'lucide-react';
import { MedicalRecord, LabResult, InventoryItem } from '../types';
import { showToast } from './Toast';
import { CLIENT_LAB_TESTS } from '../lib/clinicalConstants';

interface LabProps {
  records: MedicalRecord[];
  inventory: InventoryItem[];
  onUpdateRecord: (record: MedicalRecord) => void;
}

export default function LaboratoryManager({ records, inventory, onUpdateRecord }: LabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'order' | 'results'>('order');

  const [showResultModal, setShowResultModal] = useState(false);
  const [activeLabResult, setActiveLabResult] = useState<{ result: LabResult, recordId: string } | null>(null);
  const [resultNotes, setResultNotes] = useState('');

  const uniquePatients = useMemo(() => {
    const patientMap = new Map<string, MedicalRecord>();
    records.forEach(r => {
      if (!patientMap.has(r.patientId) || new Date(r.visitDate) > new Date(patientMap.get(r.patientId)!.visitDate)) {
        patientMap.set(r.patientId, r);
      }
    });
    return Array.from(patientMap.values());
  }, [records]);

  const filteredPatients = uniquePatients.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.petName.toLowerCase().includes(q) || p.ownerName.toLowerCase().includes(q);
  });

  const selectedRecord = uniquePatients.find(p => p.patientId === selectedPatientId);
  const allPatientRecords = selectedPatientId ? records.filter(r => r.patientId === selectedPatientId) : [];
  
  const allLabResults = allPatientRecords.flatMap(r => 
    (r.labResults || []).map(lab => ({ ...lab, recordId: r.id }))
  ).sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());

  const handleOrderTest = (testName: string) => {
    if (!selectedRecord) return;
    
    const newLab: LabResult = {
      id: crypto.randomUUID(),
      testName,
      requestDate: new Date().toISOString().split('T')[0],
      status: 'pending'
    };

    const labInventoryItem = inventory.find(i => i.category === 'lab_service' && i.name.toLowerCase() === testName.toLowerCase());

    if (!labInventoryItem) {
      showToast('Warning: Test not found in inventory. It will bill at 0.00.', 'warning');
    }

    const billingItem = {
      itemId: labInventoryItem ? labInventoryItem.id : 'unlinked_lab',
      name: labInventoryItem ? labInventoryItem.name : `[LAB] ${testName}`,
      dosage: '1 Test',
      quantity: 1
    };

    const updatedRecord: MedicalRecord = {
      ...selectedRecord,
      labResults: [...(selectedRecord.labResults || []), newLab],
      prescribedMeds: [...(selectedRecord.prescribedMeds || []), billingItem]
    };

    onUpdateRecord(updatedRecord);
    showToast(`${testName} ordered & billed to POS queue.`, 'success');
    setActiveTab('results');
  };

  const openResultModal = (lab: LabResult, recordId: string) => {
    setActiveLabResult({ result: lab, recordId });
    setResultNotes(lab.notes || '');
    setShowResultModal(true);
  };

  const handleSaveResult = () => {
    if (!activeLabResult) return;
    
    const targetRecord = records.find(r => r.id === activeLabResult.recordId);
    if (!targetRecord) return;

    const updatedLabs = targetRecord.labResults.map(lab => 
      lab.id === activeLabResult.result.id 
        ? { ...lab, status: 'completed' as const, notes: resultNotes, resultDate: new Date().toISOString().split('T')[0] } 
        : lab
    );

    onUpdateRecord({ ...targetRecord, labResults: updatedLabs });
    setShowResultModal(false);
    showToast('Laboratory results finalized.', 'success');
  };

  return (
    <div className="flex h-full w-full gap-4 overflow-hidden" id="laboratory-module-container">
      
      {/* LEFT PANE */}
      <aside className="w-1/3 min-w-[320px] max-w-[400px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0 space-y-4">
          <h2 className="text-sm font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <TestTube className="w-4 h-4 text-indigo-600" /> Laboratory Intake
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" placeholder="Search Patient Directory..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs" 
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {filteredPatients.map(patient => (
            <div 
              key={patient.patientId} onClick={() => setSelectedPatientId(patient.patientId)}
              className={`p-3 rounded-xl cursor-pointer transition-all border ${selectedPatientId === patient.patientId ? 'bg-indigo-50 border-indigo-200 shadow-xs' : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
            >
              <div className="font-extrabold truncate text-sm text-slate-800 mb-1">{patient.petName}</div>
              <div className="text-[10px] font-bold text-slate-500">{patient.petType} • {patient.breed}</div>
              <div className="text-[10px] font-semibold text-slate-400 mt-1.5 pt-1.5 border-t border-slate-100 flex items-center gap-1">
                <User className="w-3 h-3" /> {patient.ownerName}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* RIGHT PANE */}
      <main className="flex-1 bg-slate-50 rounded-2xl flex flex-col border border-slate-200 shadow-sm overflow-hidden relative">
        {!selectedRecord ? (
          <div className="flex-1 flex flex-col items-center justify-center relative opacity-60">
            <Activity className="h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-sm font-extrabold text-slate-500">Select a Patient</h3>
          </div>
        ) : (
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <div className="bg-white p-6 border-b border-slate-200 flex justify-between items-start shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center border border-indigo-200"><TestTube className="w-6 h-6 text-indigo-600" /></div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">{selectedRecord.petName}'s Diagnostics</h2>
                  <p className="text-xs font-bold text-slate-500 mt-0.5">{selectedRecord.ownerName} • {selectedRecord.ownerPhone}</p>
                </div>
              </div>
            </div>

            <div className="flex border-b border-slate-200 bg-white shrink-0 px-6 pt-2">
              <button onClick={() => setActiveTab('order')} className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'order' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>Order New Tests</button>
              <button onClick={() => setActiveTab('results')} className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'results' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>View Results Log</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {activeTab === 'order' && (
                <div className="space-y-6">
                  {CLIENT_LAB_TESTS.map((categoryBlock, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-black text-slate-700 uppercase tracking-widest">
                        {categoryBlock.category}
                      </div>
                      <div className="divide-y divide-slate-100">
                        {categoryBlock.tests.map(test => (
                          <div key={test} className="p-3 flex justify-between items-center hover:bg-slate-50 transition-colors">
                            <span className="text-xs font-bold text-slate-800">{test}</span>
                            <button onClick={() => handleOrderTest(test)} className="px-4 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold uppercase rounded-lg transition-colors cursor-pointer shadow-xs">
                              Order & Bill
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'results' && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-widest font-bold text-[9px]">
                        <th className="py-3 px-4">Request Date</th>
                        <th className="py-3 px-4">Test Name</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allLabResults.length === 0 ? (
                        <tr><td colSpan={4} className="py-6 text-center text-slate-400 font-bold">No diagnostic orders found.</td></tr>
                      ) : (
                        allLabResults.map((lab, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-bold text-slate-600">{lab.requestDate}</td>
                            <td className="py-3 px-4 font-black text-indigo-800">{lab.testName}</td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${lab.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {lab.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {lab.status === 'pending' ? (
                                <button onClick={() => openResultModal(lab, lab.recordId)} className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer">Enter Results</button>
                              ) : (
                                <button onClick={() => openResultModal(lab, lab.recordId)} className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 cursor-pointer">View Report</button>
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
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full flex flex-col shadow-2xl animate-scale-up">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800">Laboratory Results</h3>
                <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">{activeLabResult.result.testName}</p>
              </div>
              <button onClick={() => setShowResultModal(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="space-y-3 mb-6">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Diagnostic Notes / Values</label>
              <textarea 
                rows={5} 
                value={resultNotes} 
                onChange={e => setResultNotes(e.target.value)}
                readOnly={activeLabResult.result.status === 'completed'}
                placeholder="Enter cell counts, values, or pathological findings..."
                className={`w-full px-4 py-3 border rounded-xl text-xs font-semibold focus:outline-none ${activeLabResult.result.status === 'completed' ? 'bg-slate-50 border-slate-200 text-slate-700 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-800 focus:border-indigo-500'}`}
              />
            </div>

            {activeLabResult.result.status === 'pending' && (
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 mt-auto">
                <button onClick={() => setShowResultModal(false)} className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 cursor-pointer text-xs">Cancel</button>
                <button onClick={handleSaveResult} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer shadow-md text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Finalize Results</button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
