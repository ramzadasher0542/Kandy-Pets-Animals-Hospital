/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Syringe, ShieldCheck, User, PawPrint } from 'lucide-react';
import { MedicalRecord, InventoryItem, Pet, Vaccination, ClinicQueueItem, Client } from '../types';
import { showToast } from './Toast';
import { fetchVaccinations, upsertVaccination } from '../lib/db';
import { sortQueueByUrgency } from '../lib/queueUtils';
import PageShell from './ui/PageShell';
import { EmptyState } from './ui/EmptyState';
import MasterDetailLayout from './ui/MasterDetailLayout';
import ClinicQueue from './ui/ClinicQueue';

interface VaccinationsProps {
  clients: Client[];
  pets: Pet[];
  records: MedicalRecord[];
  inventory: InventoryItem[];
  clinicQueue?: ClinicQueueItem[];
  onUpdateRecord: (record: MedicalRecord) => void;
  onUpdateStock: (itemId: string, qtyDelta: number) => Promise<void>;
}

export default function VaccinationsManager({ clients, pets, records, inventory, clinicQueue = [], onUpdateRecord, onUpdateStock }: VaccinationsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);

  React.useEffect(() => {
    fetchVaccinations().then(setVaccinations).catch((e) => { if (import.meta.env.DEV) console.error(e); });
  }, []);

  const vaccineInventory = useMemo(() => inventory.filter(i => i.category === 'vaccine'), [inventory]);

  const normalizePhone = (p: string) => (p || '').replace(/\D/g, '');

  const filteredPatients = useMemo(() => {
    return pets.map(p => {
      const client = clients.find(c => c.client_id === p.clientId);
      return {
        patientId: p.id,
        pet: p,
        ownerName: client?.full_name || 'Unknown',
        ownerPhone: client?.primary_phone || ''
      };
    }).filter(p => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (p.pet?.name || 'Unknown').toLowerCase().includes(q) || 
             p.ownerName.toLowerCase().includes(q) || 
             normalizePhone(p.ownerPhone).includes(normalizePhone(q));
    });
  }, [pets, clients, searchQuery]);

  const selectedPatient = filteredPatients.find(p => p.patientId === selectedPatientId);
  const selectedPet = selectedPatient?.pet;
  
  // Flatten all historical vaccinations for the active passport
  const historicalVaccines = selectedPatientId ? vaccinations.filter(v => v.petId === selectedPatientId).sort((a, b) => new Date(b.dateAdministered).getTime() - new Date(a.dateAdministered).getTime()) : [];

  const handleAdminister = async (vaccine: InventoryItem) => {
    if (!selectedPatient) return;
    if (vaccine.stock <= 0) {
      showToast('Cannot administer: Out of stock.', 'error');
      return;
    }

    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    const newVaccination: Vaccination = {
      id: crypto.randomUUID(),
      petId: selectedPatientId!,
      itemId: vaccine.id,
      name: vaccine.name,
      price: vaccine.price,
      billed: false,
      dateAdministered: new Date().toISOString().split('T')[0],
      nextDueDate: nextYear.toISOString().split('T')[0],
      status: 'active' as const
    };

    try {
      await upsertVaccination(newVaccination);
      setVaccinations(prev => [...prev, newVaccination]);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      showToast(`Failed to save ${vaccine.name}.`, 'error');
      return;
    }
    
    // Bug #1 Fix: Stock deduction removed. POSRegister.tsx exclusively handles
    // inventory deduction at the moment of financial checkout to prevent double-deduction.
    showToast(`${vaccine.name} administered & billed to POS.`, 'success');
  };

  const renderActiveQueue = () => {
    const activeQueue = sortQueueByUrgency(clinicQueue.filter(q =>
      (q.serviceType === 'Vaccination' || q.serviceType === 'vaccination') &&
      q.status === 'active'
    ));

    return (
      <ClinicQueue
        title="Active Vaccination Queue"
        items={activeQueue}
        isSelected={q => selectedPatientId === q.petId}
        onSelect={q => setSelectedPatientId(q.petId)}
        statusLabel={() => 'Waiting'}
      />
    );
  };

  return (
    <PageShell
      title="Immunization Ops"
      subtitle="Manage patient vaccines"
      search={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: "Search by Patient or Owner..."
      }}
    >
      <div id="vaccinations-module-container" className="h-full w-full">
        <MasterDetailLayout
          listHeader={renderActiveQueue()}
          list={
            <>
              {filteredPatients.length === 0 ? (
                <EmptyState title="No patients found" />
              ) : (
                filteredPatients.map(patient => (
                  <div 
                    key={patient.patientId} onClick={() => setSelectedPatientId(patient.patientId)}
                    className={`p-4 rounded-2xl cursor-pointer transition-all border ${selectedPatientId === patient.patientId ? 'bg-indigo-600 border-indigo-700 shadow-md text-white' : 'bg-white border-slate-200 hover:border-indigo-300 shadow-sm'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className={`font-black truncate text-sm ${selectedPatientId === patient.patientId ? 'text-white' : 'text-slate-800'}`}>{patient.pet?.name || 'Unknown'}</div>
                    </div>
                    <div className={`text-[10px] font-bold ${selectedPatientId === patient.patientId ? 'text-indigo-200' : 'text-slate-500'}`}>{patient.pet?.petType} • {patient.pet?.breed}</div>
                    <div className={`text-[10px] font-black mt-2 pt-2 border-t flex items-center gap-1.5 ${selectedPatientId === patient.patientId ? 'text-indigo-100 border-indigo-500' : 'text-slate-400 border-slate-100'}`}>
                      <User className="w-3 h-3" /> {patient.ownerName}
                    </div>
                  </div>
                ))
              )}
            </>
          }
          isEmpty={!selectedPatient}
          detailEmptyIcon={<Syringe className="h-16 w-16 text-slate-300" />}
          detailEmptyTitle="Select a Patient"
          detailEmptyMessage="View vaccine passports and administer new doses."
          detail={
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
              <div className="bg-white p-6 border-b border-slate-200 flex justify-between items-start shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center border border-emerald-200"><PawPrint className="w-6 h-6 text-emerald-600" /></div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">{selectedPet?.name || 'Unknown'}'s Immunization Profile</h2>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">{selectedPatient?.ownerName} • {selectedPatient?.ownerPhone}</p>
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
                            <div className="text-xs font-bold text-slate-800 leading-tight mb-1">{item.name}</div>
                            <div className="text-[10px] font-bold text-slate-400 flex justify-between">
                              <span>Stock: <span className={outOfStock ? 'text-rose-600' : 'text-emerald-600'}>{item.stock}</span></span>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleAdminister(item)} disabled={outOfStock}
                            className={`mt-3 w-full py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-colors ${outOfStock ? 'bg-rose-50 text-rose-500 cursor-not-allowed' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 border border-emerald-200 cursor-pointer shadow-xs'}`}
                          >
                            {outOfStock ? 'Out of Stock' : 'Administer Dose'}
                          </button>
                        </div>
                      )
                    })}
                    {vaccineInventory.length === 0 && <div className="col-span-full"><EmptyState title="No vaccines in inventory" /></div>}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 border-b border-slate-200 pb-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" /> Historical Passport
                  </h3>
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-widest font-bold text-[10px]">
                          <th className="py-3 px-4">Date Administered</th>
                          <th className="py-3 px-4">Vaccine Name</th>
                          <th className="py-3 px-4 text-right">Next Due</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historicalVaccines.length === 0 ? (
                          <tr><td colSpan={3}><EmptyState title="No vaccinations recorded" /></td></tr>
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
          }
        />
      </div>
    </PageShell>
  );
}
