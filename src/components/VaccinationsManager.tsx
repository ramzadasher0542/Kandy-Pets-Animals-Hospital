/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Search, Syringe, ShieldCheck, Activity, User, ShieldAlert, PawPrint } from 'lucide-react';
import { MedicalRecord, InventoryItem } from '../types';
import { showToast } from './Toast';

interface VaccinationsProps {
  records: MedicalRecord[];
  inventory: InventoryItem[];
  onUpdateRecord: (record: MedicalRecord) => void;
  onUpdateStock: (itemId: string, qtyDelta: number) => Promise<void>;
}

export default function VaccinationsManager({ records, inventory, onUpdateRecord, onUpdateStock }: VaccinationsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const vaccineInventory = useMemo(() => inventory.filter(i => i.category === 'vaccine'), [inventory]);

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
  const allPatientRecords = selectedPatientId ? records.filter(r => r.patientId === selectedPatientId) : [];
  
  // Flatten all historical vaccinations for the active passport
  const historicalVaccines = allPatientRecords.flatMap(r => r.vaccinations || []).sort((a, b) => new Date(b.dateAdministered).getTime() - new Date(a.dateAdministered).getTime());

  const handleAdminister = async (vaccine: InventoryItem) => {
    if (!selectedRecord) return;
    if (vaccine.stock <= 0) {
      showToast('Cannot administer: Out of stock.', 'error');
      return;
    }

    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    const newVaccination = {
      itemId: vaccine.id,
      name: vaccine.name,
      price: vaccine.price,
      billed: false,
      dateAdministered: new Date().toISOString().split('T')[0],
      nextDueDate: nextYear.toISOString().split('T')[0],
      status: 'active' as const
    };

    const billingItem = {
      itemId: vaccine.id,
      name: `[VACCINE] ${vaccine.name}`,
      dosage: '1 Dose',
      quantity: 1
    };

    const updatedRecord: MedicalRecord = {
      ...selectedRecord,
      vaccinations: [...(selectedRecord.vaccinations || []), newVaccination],
      prescribedMeds: [...(selectedRecord.prescribedMeds || []), billingItem]
    };

    // Bug #1 Fix: Stock deduction removed. POSRegister.tsx exclusively handles
    // inventory deduction at the moment of financial checkout to prevent double-deduction.
    onUpdateRecord(updatedRecord);
    showToast(`${vaccine.name} administered & billed to POS.`, 'success');
  };

  return (
    <div className="flex h-full w-full gap-4 overflow-hidden" id="vaccinations-module-container">
      
      {/* LEFT PANE: Patient Directory */}
      <aside className="w-1/3 min-w-[320px] max-w-[400px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Immunization Ops
            </h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" placeholder="Search by Patient or Owner..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-xs" 
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {filteredPatients.map(patient => (
            <div 
              key={patient.patientId} onClick={() => setSelectedPatientId(patient.patientId)}
              className={`p-3 rounded-xl cursor-pointer transition-all border ${selectedPatientId === patient.patientId ? 'bg-emerald-50 border-emerald-200 shadow-xs' : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
            >
              <div className="flex justify-between items-start mb-1">
                <div className={`font-extrabold truncate text-sm ${selectedPatientId === patient.patientId ? 'text-emerald-900' : 'text-slate-800'}`}>{patient.petName}</div>
              </div>
              <div className="text-[10px] font-bold text-slate-500">{patient.petType} • {patient.breed}</div>
              <div className="text-[10px] font-semibold text-slate-400 mt-1.5 pt-1.5 border-t border-slate-100 flex items-center gap-1">
                <User className="w-3 h-3" /> {patient.ownerName}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* RIGHT PANE: Vaccine Passport */}
      <main className="flex-1 bg-slate-50 rounded-2xl flex flex-col border border-slate-200 shadow-sm overflow-hidden relative">
        {!selectedRecord ? (
          <div className="flex-1 flex flex-col items-center justify-center relative opacity-60">
            <Syringe className="h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-sm font-extrabold text-slate-500">Select a Patient</h3>
            <p className="text-xs font-medium mt-1 text-slate-400">View vaccine passports and administer new doses.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
            <div className="bg-white p-6 border-b border-slate-200 flex justify-between items-start shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center border border-emerald-200"><PawPrint className="w-6 h-6 text-emerald-600" /></div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">{selectedRecord.petName}'s Passport</h2>
                  <p className="text-xs font-bold text-slate-500 mt-0.5">{selectedRecord.ownerName} • {selectedRecord.ownerPhone}</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              
              <div className="space-y-3">
                <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Syringe className="w-4 h-4 text-emerald-600" /> Available Inventory (Administer & Auto-Bill)
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {vaccineInventory.map(item => {
                    const outOfStock = item.stock <= 0;
                    return (
                      <div key={item.id} className={`bg-white border rounded-xl p-3 flex flex-col justify-between h-full ${outOfStock ? 'border-rose-200 opacity-60' : 'border-slate-200 shadow-sm'}`}>
                        <div>
                          <div className="text-xs font-extrabold text-slate-800 leading-tight mb-1">{item.name}</div>
                          <div className="text-[10px] font-bold text-slate-400 flex justify-between">
                            <span>Stock: <span className={outOfStock ? 'text-rose-600' : 'text-emerald-600'}>{item.stock}</span></span>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleAdminister(item)} disabled={outOfStock}
                          className={`mt-3 w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${outOfStock ? 'bg-rose-50 text-rose-500 cursor-not-allowed' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 border border-emerald-200 cursor-pointer shadow-xs'}`}
                        >
                          {outOfStock ? 'Out of Stock' : 'Administer Dose'}
                        </button>
                      </div>
                    )
                  })}
                  {vaccineInventory.length === 0 && <div className="col-span-full text-xs font-bold text-slate-400 text-center py-4">No vaccines available in inventory.</div>}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 border-b border-slate-200 pb-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" /> Historical Passport
                </h3>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-widest font-bold text-[9px]">
                        <th className="py-3 px-4">Date Administered</th>
                        <th className="py-3 px-4">Vaccine Name</th>
                        <th className="py-3 px-4 text-right">Next Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historicalVaccines.length === 0 ? (
                        <tr><td colSpan={3} className="py-6 text-center text-slate-400 font-bold">No historical vaccinations recorded.</td></tr>
                      ) : (
                        historicalVaccines.map((v, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-bold text-slate-700">{v.dateAdministered}</td>
                            <td className="py-3 px-4 font-black text-indigo-700">{v.name}</td>
                            <td className="py-3 px-4 text-right font-bold text-slate-500">{v.nextDueDate}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
