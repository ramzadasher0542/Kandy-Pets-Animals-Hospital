/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Search, Scissors, User, PawPrint, Activity, CheckSquare, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { MedicalRecord, InventoryItem, GroomingLog } from '../types';
import { showToast } from './Toast';

interface GroomingProps {
  records: MedicalRecord[];
  inventory: InventoryItem[];
  onUpdateRecord: (record: MedicalRecord) => void;
}

const GROOMING_SERVICES = [
  { category: 'Main Actions', items: ['Full Grooming', 'Bath & Dry', 'Trimming / Scissors Work'] },
  { category: 'Sanitary Add-Ons', items: ['Nail Clipping', 'Ear Cleaning', 'Styling', 'Shaving'] },
  { category: 'Medical Add-Ons', items: ['Medicated Bath'] }
];

export default function GroomingManager({ records, inventory, onUpdateRecord }: GroomingProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'new_session' | 'history'>('new_session');

  // Derive unique patients (keeping the latest record)
  const uniquePatients = useMemo(() => {
    const patientMap = new Map<string, MedicalRecord>();
    records.forEach(r => {
      if (!patientMap.has(r.patientId) || new Date(r.visitDate) > new Date(patientMap.get(r.patientId)!.visitDate)) {
        patientMap.set(r.patientId, r);
      }
    });
    return Array.from(patientMap.values());
  }, [records]);

  const normalizePhone = (p: string) => p.replace(/\D/g, '');

  const filteredPatients = uniquePatients.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.petName.toLowerCase().includes(q) || 
           p.ownerName.toLowerCase().includes(q) || 
           normalizePhone(p.ownerPhone).includes(normalizePhone(q));
  });

  const selectedRecord = uniquePatients.find(p => p.patientId === selectedPatientId);
  
  // Aggregate history across all versions of the patient's records
  const patientHistory = selectedPatientId ? records.filter(r => r.patientId === selectedPatientId) : [];
  const historicalGroomingLogs = patientHistory.flatMap(r => r.groomingRecords || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const toggleService = (service: string) => {
    setSelectedServices(prev => prev.includes(service) ? prev.filter(s => s !== service) : [...prev, service]);
  };

  const handleFinalizeAndBill = () => {
    if (!selectedRecord || selectedServices.length === 0) return;

    let totalBilled = 0;
    const missingServices: string[] = [];

    // Map selected services to inventory items for billing
    const billingItems = selectedServices.map(serviceName => {
      // Attempt to find the service in inventory (flexible match)
      const invItem = inventory.find(i => 
        (i.category === 'service' || (i.category as string) === 'other' || i.name.toLowerCase().includes('grooming')) && 
        i.name.toLowerCase().includes(serviceName.toLowerCase())
      );

      if (!invItem) {
        missingServices.push(serviceName);
      } else {
        totalBilled += invItem.price;
      }

      return {
        itemId: invItem ? invItem.id : 'unlinked_grooming',
        name: invItem ? invItem.name : `[GROOMING] ${serviceName}`,
        dosage: '1 Session',
        quantity: 1
      };
    });

    if (missingServices.length > 0) {
      showToast(`Warning: ${missingServices.join(', ')} not found in inventory. Billed at 0.00.`, 'warning');
    }

    const newLog: GroomingLog = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      services: selectedServices,
      totalBilled: totalBilled,
      status: 'completed'
    };

    const updatedRecord: MedicalRecord = {
      ...selectedRecord,
      groomingRecords: [...(selectedRecord.groomingRecords || []), newLog],
      prescribedMeds: [...(selectedRecord.prescribedMeds || []), ...billingItems]
    };

    onUpdateRecord(updatedRecord);
    showToast(`Grooming session completed & pushed to POS Queue.`, 'success');
    setSelectedServices([]);
    setActiveTab('history');
  };

  return (
    <div className="flex h-[calc(100vh-140px)] w-full gap-4 overflow-hidden" id="grooming-module-container">
      
      {/* LEFT PANE: Patient Directory */}
      <aside className="w-1/3 min-w-[320px] max-w-[400px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0 space-y-4">
          <h2 className="text-sm font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Scissors className="w-5 h-5 text-indigo-600" /> Salon Intake Directory
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" placeholder="Search Patient or Owner..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs" 
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {filteredPatients.map(patient => (
            <div 
              key={patient.patientId} onClick={() => { setSelectedPatientId(patient.patientId); setSelectedServices([]); setActiveTab('new_session'); }}
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

      {/* RIGHT PANE: Grooming Dashboard */}
      <main className="flex-1 bg-slate-50 rounded-2xl flex flex-col border border-slate-200 shadow-sm overflow-hidden relative">
        {!selectedRecord ? (
          <div className="flex-1 flex flex-col items-center justify-center relative opacity-60">
            <Scissors className="h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-sm font-extrabold text-slate-500">Select a Patient</h3>
            <p className="text-xs font-medium mt-1 text-slate-400">Choose a patient to begin a new grooming session.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col relative overflow-hidden">
            {/* Identity Header */}
            <div className="bg-white p-6 border-b border-slate-200 flex justify-between items-start shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center border border-indigo-200"><PawPrint className="w-6 h-6 text-indigo-600" /></div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">{selectedRecord.petName}'s Salon Dashboard</h2>
                  <p className="text-xs font-bold text-slate-500 mt-0.5">{selectedRecord.ownerName} • {selectedRecord.ownerPhone}</p>
                </div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-slate-200 bg-white shrink-0 px-6 pt-2">
              <button onClick={() => setActiveTab('new_session')} className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2 ${activeTab === 'new_session' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}><CheckSquare className="w-4 h-4"/> New Session</button>
              <button onClick={() => setActiveTab('history')} className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2 ${activeTab === 'history' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}><FileText className="w-4 h-4"/> Grooming History</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              
              {/* TAB: New Session */}
              {activeTab === 'new_session' && (
                <div className="flex flex-col h-full space-y-6">
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1">
                    {GROOMING_SERVICES.map(group => (
                      <div key={group.category} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm h-fit">
                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">{group.category}</h3>
                        <div className="space-y-3">
                          {group.items.map(item => {
                            const isChecked = selectedServices.includes(item);
                            return (
                              <label key={item} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer select-none ${isChecked ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}>
                                <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${isChecked ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300'}`}>
                                  {isChecked && <CheckCircle2 className="w-4 h-4" />}
                                </div>
                                <span className={`text-xs font-bold transition-colors ${isChecked ? 'text-indigo-900' : 'text-slate-600'}`}>{item}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Checkout Footer */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 flex items-center justify-between shrink-0">
                    <div>
                      <h4 className="text-sm font-black text-indigo-900 flex items-center gap-2"><Activity className="w-4 h-4" /> Ready for POS Billing</h4>
                      <p className="text-xs text-indigo-700 font-semibold mt-1">Selected services will be mapped to inventory prices and pushed to the patient's checkout queue.</p>
                      <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-2">
                        {selectedServices.length} Services Selected
                      </div>
                    </div>
                    <button 
                      onClick={handleFinalizeAndBill} 
                      disabled={selectedServices.length === 0}
                      className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors shadow-md cursor-pointer"
                    >
                      Finalize & Send to Billing
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: Grooming History */}
              {activeTab === 'history' && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-widest font-bold text-[9px]">
                        <th className="py-3 px-4 w-40">Date</th>
                        <th className="py-3 px-4">Services Rendered</th>
                        <th className="py-3 px-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historicalGroomingLogs.length === 0 ? (
                        <tr><td colSpan={3} className="py-8 text-center text-slate-400 font-bold">No historical grooming sessions found.</td></tr>
                      ) : (
                        historicalGroomingLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="py-4 px-4 font-bold text-slate-600">{log.date}</td>
                            <td className="py-4 px-4">
                              <div className="flex flex-wrap gap-1.5">
                                {log.services.map((svc, i) => (
                                  <span key={i} className="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-1 rounded text-[10px] font-bold">
                                    {svc}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-4 px-4 text-right">
                              <span className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700">
                                {log.status}
                              </span>
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
    </div>
  );
}
