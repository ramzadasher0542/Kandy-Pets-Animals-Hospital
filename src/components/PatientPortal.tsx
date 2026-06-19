/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, PawPrint, Activity, Calendar, 
  ShieldAlert, Award, FileText, User, 
  Syringe, Weight, Lock, Edit3
} from 'lucide-react';
import { MedicalRecord, Appointment, PetClassification } from '../types';
import { showToast } from './Toast';

interface PortalProps {
  records: MedicalRecord[];
  appointments: Appointment[];
  isOnline: boolean;
  onBookAppointment: (appointment: Appointment) => void;
  systemConfig?: any;
  viewPayload?: any;
  onGoToCustomers?: (phone: string) => void;
  onGoToAppointments?: (client: any, pet: any) => void;
  onAddRecord?: (record: MedicalRecord) => void;
  onUpdatePet?: (oldPatientId: string, newPetName: string, newDetails: any) => void;
}

export default function PatientPortal({ 
  records, appointments, viewPayload,
  onGoToCustomers, onGoToAppointments, onAddRecord, onUpdatePet
}: PortalProps) {
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'All' | PetClassification>('All');
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'history' | 'preventatives' | 'vitals'>('history');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  const [formData, setFormData] = useState({
    petName: '', petType: 'Canine' as PetClassification, breed: '', sex: 'Unknown', age: '', weight: '', microchipId: '', allergies: ''
  });

  const [uniquePets, setUniquePets] = useState<any[]>([]);

  useEffect(() => {
    const petMap = new Map();
    records.forEach(r => {
      if (!petMap.has(r.patientId)) {
        petMap.set(r.patientId, { ...r, visitHistory: [r] });
      } else {
        const existing = petMap.get(r.patientId);
        existing.visitHistory.push(r);
        existing.visitHistory.sort((a: any, b: any) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
        if (new Date(r.visitDate) > new Date(existing.visitDate)) {
          petMap.set(r.patientId, { ...r, visitHistory: existing.visitHistory });
        }
      }
    });
    setUniquePets(Array.from(petMap.values()));
  }, [records]);

  useEffect(() => {
    if (viewPayload?.triggerAddPet && viewPayload?.preFilledClient) {
      setShowAddModal(true);
    }
  }, [viewPayload]);

  const normalizePhone = (p: string) => p.replace(/\D/g, '');

  const filteredPets = uniquePets.filter(p => {
    if (activeFilter !== 'All' && p.petType !== activeFilter) return false;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = p.petName.toLowerCase().includes(q);
      const matchOwner = p.ownerName.toLowerCase().includes(q);
      const matchPhone = normalizePhone(p.ownerPhone).includes(normalizePhone(searchQuery));
      const matchChip = (p as any).microchipId?.toLowerCase().includes(q);
      return matchName || matchOwner || matchPhone || matchChip;
    }
    return true;
  });

  const selectedPet = uniquePets.find(p => p.id === selectedPetId);

  const handleSavePet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.petName) return;

    const ownerName = viewPayload?.preFilledClient?.full_name || viewPayload?.preFilledClient?.name || 'Unknown Owner';
    const ownerPhone = viewPayload?.preFilledClient?.primary_phone || viewPayload?.preFilledClient?.phone || '0000000000';
    const ownerEmail = viewPayload?.preFilledClient?.email_address || 'not-provided@example.com';
    const normalizedPhone = normalizePhone(ownerPhone);

    const baseRecord: MedicalRecord = {
      id: crypto.randomUUID(),
      patientId: `${formData.petName}_${normalizedPhone}`,
      petName: formData.petName,
      petType: formData.petType,
      breed: formData.breed || 'Mixed',
      age: formData.age || 'Unknown',
      weight: parseFloat(formData.weight) || 0,
      ownerName: ownerName,
      ownerPhone: ownerPhone,
      ownerEmail: ownerEmail,
      visitDate: new Date().toISOString().split('T')[0],
      symptoms: 'Initial Registration',
      diagnosis: 'N/A',
      treatmentNotes: 'Patient registered into system directory.',
      prescribedMeds: [],
      vaccinations: [],
      labResults: [],
      createdDate: new Date().toISOString().split('T')[0],
      ...(formData.microchipId && { microchipId: formData.microchipId }),
      ...(formData.allergies && { allergies: formData.allergies }),
      ...(formData.sex && { sex: formData.sex })
    } as any;

    if (onAddRecord) onAddRecord(baseRecord);
    setShowAddModal(false);
    setSelectedPetId(baseRecord.id);
    showToast(`${formData.petName} successfully registered!`, 'success');
  };

  const handleUpdatePetDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPet || !onUpdatePet) return;
    
    onUpdatePet(selectedPet.patientId, formData.petName, {
      petType: formData.petType,
      breed: formData.breed,
      age: formData.age,
      weight: parseFloat(formData.weight) || 0,
      sex: formData.sex,
      microchipId: formData.microchipId,
      allergies: formData.allergies
    });
    
    setShowEditModal(false);
    showToast(`Patient profile for ${formData.petName} updated globally.`, 'success');
  };

  const openEditModal = () => {
    if (!selectedPet) return;
    setFormData({
      petName: selectedPet.petName,
      petType: selectedPet.petType,
      breed: selectedPet.breed || '',
      sex: selectedPet.sex || 'Unknown',
      age: selectedPet.age || '',
      weight: selectedPet.weight ? String(selectedPet.weight) : '',
      microchipId: selectedPet.microchipId || '',
      allergies: selectedPet.allergies || ''
    });
    setShowEditModal(true);
  };

  return (
    <div className="flex h-full w-full gap-4 overflow-hidden" id="pets-module-container">
      
      {/* LEFT PANE */}
      <aside className="w-1/3 min-w-[320px] max-w-[400px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
        
        <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">Patient Directory</h2>
            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{filteredPets.length} Total</span>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" placeholder="Search by Pet, Owner, or Microchip..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 shadow-xs" 
            />
          </div>

          <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-1">
            {(['All', 'Canine', 'Feline', 'Avian', 'Reptile', 'Small Mammal', 'Exotic'] as const).map(filter => (
              <button
                key={filter} onClick={() => setActiveFilter(filter)}
                className={`shrink-0 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-colors ${activeFilter === filter ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {filteredPets.map(pet => {
            const isSelected = selectedPetId === pet.id;
            return (
              <div 
                key={pet.id} onClick={() => setSelectedPetId(pet.id)}
                className={`p-3 rounded-xl cursor-pointer transition-all border ${isSelected ? 'bg-indigo-50 border-indigo-200 shadow-xs' : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className={`font-extrabold truncate text-sm ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>{pet.petName}</div>
                  {pet.allergies && <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                </div>
                <div className="text-[10px] font-bold text-slate-500">{pet.petType} • {pet.breed}</div>
                <div className="text-[10px] font-semibold text-slate-400 mt-1.5 pt-1.5 border-t border-slate-100 flex items-center gap-1">
                  <User className="w-3 h-3" /> {pet.ownerName}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-100 bg-white shrink-0">
          <button onClick={() => { setFormData({ petName: '', petType: 'Canine', breed: '', sex: 'Unknown', age: '', weight: '', microchipId: '', allergies: '' }); setShowAddModal(true); }} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer">
            <PawPrint className="h-4 w-4" /> Register New Patient
          </button>
        </div>
      </aside>

      {/* RIGHT PANE */}
      <main className="flex-1 bg-white rounded-2xl flex flex-col border border-slate-200 shadow-sm overflow-hidden relative">
        {!selectedPet ? (
          <div className="flex-1 flex flex-col items-center justify-center relative bg-slate-50/50">
            <Activity className="h-12 w-12 text-slate-200 mb-3 z-10" />
            <h3 className="text-sm font-extrabold text-slate-500 z-10">No Patient Selected</h3>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
            
            {selectedPet.allergies && (
              <div className="bg-rose-600 text-white p-3 flex items-center justify-center gap-2 shrink-0 sticky top-0 z-20 shadow-md">
                <ShieldAlert className="w-5 h-5 shrink-0 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-widest">Medical Alert: Allergic to {selectedPet.allergies}</span>
              </div>
            )}

            <div className="p-6 space-y-6">
              
              <div className="flex flex-wrap lg:flex-nowrap gap-6 items-start justify-between">
                <div className="flex items-center gap-5">
                  <div className="w-20 h-20 bg-slate-100 rounded-2xl border border-slate-200 flex items-center justify-center shadow-inner shrink-0">
                    <PawPrint className="w-8 h-8 text-slate-300" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight">{selectedPet.petName}</h2>
                      <button onClick={openEditModal} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer" title="Edit Patient Details">
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500 uppercase tracking-wide">
                      <span>{selectedPet.petType}</span> • <span>{selectedPet.breed}</span> • <span>{selectedPet.sex || 'Unknown Sex'}</span>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 mt-1 flex items-center gap-3">
                      <span>Age: {selectedPet.age}</span>
                      <span>Weight: {selectedPet.weight} kg</span>
                      {selectedPet.microchipId && <span>Microchip: {selectedPet.microchipId}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 min-w-[200px]">
                  {onGoToCustomers && (
                    <button onClick={() => onGoToCustomers(selectedPet.ownerPhone)} className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs">
                      <User className="w-3.5 h-3.5" /> View Owner Profile
                    </button>
                  )}
                  {onGoToAppointments && (
                    <button onClick={() => onGoToAppointments({ full_name: selectedPet.ownerName, primary_phone: selectedPet.ownerPhone }, selectedPet)} className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs">
                      <Calendar className="w-3.5 h-3.5" /> Book Follow-Up
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs Container */}
              <div className="mt-4 border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                <div className="flex border-b border-slate-100 bg-slate-50">
                  {(['history', 'preventatives', 'vitals'] as const).map(tab => (
                    <button 
                      key={tab} onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors ${activeTab === tab ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 cursor-pointer'}`}
                    >
                      {tab === 'history' ? 'Clinical History' : tab}
                    </button>
                  ))}
                </div>
                <div className="p-5 bg-white min-h-[300px]">
                  {activeTab === 'history' && (
                    <div className="space-y-4">
                      {selectedPet.visitHistory.map((visit: MedicalRecord, idx: number) => (
                        <div key={idx} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-extrabold text-slate-800 text-sm">{visit.diagnosis || 'General Consultation'}</span>
                              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{visit.visitDate}</span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium leading-relaxed">{visit.treatmentNotes}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Add / Edit Patient Modal */}
      {(showAddModal || showEditModal) && createPortal(
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-sky-100 max-w-lg w-full text-xs shadow-xl animate-fade-in flex flex-col overflow-hidden">
            <div className="flex justify-between items-start p-6 pb-4 border-b border-slate-100 shrink-0">
              <div>
                <h4 className="text-sm font-extrabold text-slate-800 leading-none">{showEditModal ? 'Edit Patient Details' : 'Register New Patient'}</h4>
                <p className="text-[10px] text-slate-400 mt-1">Update clinical baseline details in the directory</p>
              </div>
              <button onClick={() => {setShowAddModal(false); setShowEditModal(false);}} className="p-1 hover:bg-slate-100 text-slate-400 rounded-lg cursor-pointer">✕</button>
            </div>
            
            <form onSubmit={showEditModal ? handleUpdatePetDetails : handleSavePet} className="flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                
                {showAddModal && viewPayload?.preFilledClient && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-xs mb-2">
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-200 text-slate-500 p-2 rounded-lg"><User className="w-4 h-4" /></div>
                      <div>
                        <div className="text-xs font-black text-slate-800 leading-tight">{viewPayload.preFilledClient.full_name || viewPayload.preFilledClient.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{viewPayload.preFilledClient.primary_phone || viewPayload.preFilledClient.phone}</div>
                      </div>
                    </div>
                    <div className="px-2 py-1 bg-white rounded-md text-[9px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest border border-slate-100">
                      <Lock className="w-3 h-3" /> Owner Locked
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-600 block text-[10px]">Patient Name *</label>
                    <input type="text" required value={formData.petName} onChange={e => setFormData({...formData, petName: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]">Species *</label>
                    <select value={formData.petType} onChange={e => setFormData({...formData, petType: e.target.value as any})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold">
                      <option value="Canine">Canine</option>
                      <option value="Feline">Feline</option>
                      <option value="Avian">Avian</option>
                      <option value="Reptile">Reptile</option>
                      <option value="Small Mammal">Small Mammal</option>
                      <option value="Exotic">Exotic</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]">Sex</label>
                    <select value={formData.sex} onChange={e => setFormData({...formData, sex: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold">
                      <option value="Unknown">Unknown</option>
                      <option value="Male (Intact)">Male (Intact)</option>
                      <option value="Male (Neutered)">Male (Neutered)</option>
                      <option value="Female (Intact)">Female (Intact)</option>
                      <option value="Female (Spayed)">Female (Spayed)</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]">Breed</label>
                    <input type="text" value={formData.breed} onChange={e => setFormData({...formData, breed: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]">Current Age</label>
                    <input type="text" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]">Weight (kg)</label>
                    <input type="number" step="0.1" value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]">Microchip ID</label>
                    <input type="text" value={formData.microchipId} onChange={e => setFormData({...formData, microchipId: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-rose-600 block text-[10px]">Known Allergies</label>
                    <input type="text" value={formData.allergies} onChange={e => setFormData({...formData, allergies: e.target.value})} className="w-full px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500 font-semibold text-rose-800" />
                  </div>
                </div>
              </div>
              
              <div className="shrink-0 flex gap-2 p-6 pt-4 justify-end border-t border-slate-100 bg-white">
                <button type="button" onClick={() => {setShowAddModal(false); setShowEditModal(false);}} className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer shadow-xs transition-colors">Save Details</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
