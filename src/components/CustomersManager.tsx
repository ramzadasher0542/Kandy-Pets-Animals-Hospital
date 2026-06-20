/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, UserPlus, Phone, Mail, MapPin, Calendar, 
  ArrowRight, FileText, Wallet, ShieldAlert, PawPrint, Activity, 
  Edit2, PenTool, User, X, CheckCircle2, ChevronLeft, HeartPulse, TestTube, Syringe
} from 'lucide-react';
import { Client, MedicalRecord, Invoice, Appointment, PetClassification } from '../types';
import { fetchClients, upsertClient } from '../lib/db';
import { showToast } from './Toast';
import { formatDisplayDate } from '../utils/time';

interface CustomersManagerProps {
  records: MedicalRecord[];
  invoices: Invoice[];
  appointments: Appointment[];
  onGoToPOS?: (client: Client) => void;
  onGoToAppointments?: (client: Client, pet?: any) => void;
  onGoToRecords?: (patientId: string) => void;
  onUpdateCustomer?: (oldPhone: string, newPhone: string, newName: string, newEmail: string) => void;
  onGenerateConsent?: (clientName: string, petName: string) => void;
  onAddRecord?: (record: MedicalRecord) => void; 
  onUpdateRecord?: (record: MedicalRecord) => void; // PHASE 3/4: Needed for bulk Pet updates
}

export default function CustomersManager({ 
  records, 
  invoices, 
  appointments,
  onGoToPOS,
  onGoToAppointments,
  onGoToRecords,
  onUpdateCustomer,
  onGenerateConsent,
  onAddRecord,
  onUpdateRecord
}: CustomersManagerProps) {
  
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null); // PHASE 3: Pet Passport State
  const [passportTab, setPassportTab] = useState<'timeline' | 'exams' | 'labs' | 'vaccines'>('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditPetModal, setShowEditPetModal] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: '', primary_phone: '', alternate_phone: '',
    email_address: '', physical_address: '', communication_preference: 'sms',
    administrative_notes: ''
  });

  const [newPetData, setNewPetData] = useState({
    petName: '', petType: 'Canine', breed: ''
  });

  const [editPetData, setEditPetData] = useState({
    petName: '', petType: 'Canine' as PetClassification, breed: '', sex: 'Unknown', weight: 0, age: ''
  });

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    const data = await fetchClients();
    setClients(data);
  };

  const normalizePhone = (p: string) => p.replace(/\D/g, '');

  const filteredClients = clients.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (c.full_name.toLowerCase().includes(q)) return true;
    if (c.primary_phone.includes(q)) return true;
    
    const clientPets = records.filter(r => normalizePhone(r.ownerPhone) === normalizePhone(c.primary_phone));
    if (clientPets.some(p => p.petName.toLowerCase().includes(q))) return true;
    
    return false;
  });

  const selectedClient = clients.find(c => c.client_id === selectedClientId);

  // ---------------------------------------------------------
  // CLIENT MANAGEMENT LOGIC
  // ---------------------------------------------------------
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || !formData.primary_phone) {
      showToast('Name and Primary Phone are required.', 'error');
      return;
    }

    const exists = clients.some(c => normalizePhone(c.primary_phone) === normalizePhone(formData.primary_phone));
    if (exists) {
      showToast('Client with this primary phone already exists.', 'error');
      return;
    }

    const newClient: Client = {
      client_id: crypto.randomUUID(),
      ...formData,
      communication_preference: formData.communication_preference as any,
      account_balance: 0,
      lifetime_value: 0,
      client_status: 'active'
    };

    await upsertClient(newClient);

    if (newPetData.petName && onAddRecord) {
      const targetPhone = normalizePhone(formData.primary_phone);
      const targetPetName = newPetData.petName.trim().toLowerCase();
      
      const newRecord: MedicalRecord = {
        id: crypto.randomUUID(),
        patientId: `${targetPetName}_${targetPhone}`,
        petName: newPetData.petName.trim(),
        petType: newPetData.petType as any,
        breed: newPetData.breed || 'Mixed breed',
        age: 'Unknown',
        weight: 0,
        ownerName: formData.full_name.trim(),
        ownerPhone: formData.primary_phone.trim(),
        ownerEmail: formData.email_address || 'not-provided@example.com',
        visitDate: new Date().toISOString().split('T')[0],
        attendingVet: 'System Admin',
        symptoms: '',
        diagnosis: 'Initial Registration',
        treatmentNotes: 'Patient profile established via CRM Onboarding.',
        prescribedMeds: [],
        vaccinations: [],
        labResults: [],
        createdDate: new Date().toISOString().split('T')[0]
      };
      onAddRecord(newRecord);
    }

    await loadClients();
    setShowAddModal(false);
    setSelectedClientId(newClient.client_id);
    showToast('Client and Companion successfully registered.', 'success');
    
    setFormData({ full_name: '', primary_phone: '', alternate_phone: '', email_address: '', physical_address: '', communication_preference: 'sms', administrative_notes: '' });
    setNewPetData({ petName: '', petType: 'Canine', breed: '' });
  };

  const handleUpdateExistingClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    const oldPhone = selectedClient.primary_phone;
    
    const updatedClient = {
      ...selectedClient,
      full_name: formData.full_name,
      primary_phone: formData.primary_phone,
      alternate_phone: formData.alternate_phone,
      email_address: formData.email_address,
      physical_address: formData.physical_address,
      communication_preference: formData.communication_preference as any,
      administrative_notes: formData.administrative_notes
    };
    
    await upsertClient(updatedClient);
    await loadClients();
    
    if (onUpdateCustomer) onUpdateCustomer(oldPhone, formData.primary_phone, formData.full_name, formData.email_address);
    
    setShowEditModal(false);
    showToast('Client profile updated globally.', 'success');
  };

  // ---------------------------------------------------------
  // PET PASSPORT DATA & LOGIC (PHASE 3 & 4)
  // ---------------------------------------------------------
  const petRecords = selectedPetId ? records.filter(r => r.patientId === selectedPetId).sort((a,b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()) : [];
  const activePet = petRecords.length > 0 ? petRecords[0] : null;

  const allPetLabs = petRecords.flatMap(r => (r.labResults || []).map(l => ({ ...l, visitDate: r.visitDate })));
  const allPetVax = petRecords.flatMap(r => (r.vaccinations || []).map(v => ({ ...v, visitDate: r.visitDate })));

  const handleOpenEditPet = () => {
    if (!activePet) return;
    setEditPetData({
      petName: activePet.petName,
      petType: activePet.petType,
      breed: activePet.breed || '',
      sex: activePet.sex || 'Unknown',
      weight: activePet.weight || 0,
      age: activePet.age || ''
    });
    setShowEditPetModal(true);
  };

  const handleSavePetEdits = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateRecord || !selectedPetId) {
      showToast('Record update engine unavailable.', 'error');
      return;
    }

    // BULK MASTER-SYNC: Update the identity across ALL historical records for this patient
    petRecords.forEach(record => {
      const updated = {
        ...record,
        petName: editPetData.petName,
        petType: editPetData.petType,
        breed: editPetData.breed,
        sex: editPetData.sex,
        weight: editPetData.weight,
        age: editPetData.age
      };
      onUpdateRecord(updated);
    });

    setShowEditPetModal(false);
    showToast('Pet Identity synchronized across all historical records.', 'success');
  };


  // ---------------------------------------------------------
  // AGGREGATORS FOR CLIENT DASHBOARD
  // ---------------------------------------------------------
  const clientPets = selectedClient ? records.filter(r => normalizePhone(r.ownerPhone) === normalizePhone(selectedClient.primary_phone)) : [];
  const petMap = new Map<string, any>();
  
  clientPets.forEach(p => {
    if (!petMap.has(p.patientId)) {
      petMap.set(p.patientId, { ...p });
    } else {
      const existing = petMap.get(p.patientId);
      if (new Date(p.visitDate) > new Date(existing.visitDate)) {
        petMap.set(p.patientId, { ...p }); // Overwrite with newest
      }
    }
  });
  
  const uniqueClientPets = Array.from(petMap.values());
  const clientInvoices = selectedClient ? invoices.filter(i => normalizePhone(i.ownerPhone) === normalizePhone(selectedClient.primary_phone)).slice(0, 5) : [];
  const clientAppointments = selectedClient ? appointments.filter(a => normalizePhone(a.ownerPhone) === normalizePhone(selectedClient.primary_phone)).slice(0, 5) : [];

  // =========================================================
  // VIEW BUILDERS
  // =========================================================

  const renderClientDashboard = () => {
    if (!selectedClient) return null;
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col border border-slate-200 rounded-2xl bg-white shadow-sm relative animate-fade-in">
        
        {selectedClient.client_status === 'flagged_bad_debt' && (
          <div className="bg-rose-50 border-b border-rose-200 p-4 flex items-center gap-3 shrink-0 sticky top-0 z-10">
            <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0" />
            <div>
              <h4 className="text-sm font-extrabold text-rose-700">RESTRICTED ACCOUNT: BAD DEBT</h4>
              <p className="text-[10px] text-rose-600 font-bold mt-0.5">This client has been flagged for an outstanding balance. Please collect payment before rendering further services.</p>
            </div>
          </div>
        )}

        <div className="p-6 space-y-6">
          <div className="flex flex-wrap lg:flex-nowrap gap-6 items-start justify-between">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                  {selectedClient.full_name}
                  <button onClick={() => {
                    setFormData({
                      full_name: selectedClient.full_name, primary_phone: selectedClient.primary_phone,
                      alternate_phone: selectedClient.alternate_phone || '', email_address: selectedClient.email_address || '',
                      physical_address: selectedClient.physical_address || '', communication_preference: selectedClient.communication_preference,
                      administrative_notes: selectedClient.administrative_notes || ''
                    });
                    setShowEditModal(true);
                  }} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer" title="Edit Client Profile">
                    <Edit2 className="w-5 h-5" />
                  </button>
                </h2>
                <div className="flex items-center gap-4 mt-2 text-xs font-semibold text-slate-500">
                  <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {selectedClient.primary_phone}</span>
                  <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {selectedClient.email_address || 'N/A'}</span>
                </div>
              </div>
              {selectedClient.physical_address && (
                <div className="flex items-start gap-1.5 text-xs font-semibold text-slate-500 max-w-sm">
                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" /> 
                  <span className="leading-tight">{selectedClient.physical_address}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2 bg-slate-50 p-4 rounded-2xl border border-slate-100 min-w-[200px]">
              <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Account Balance</div>
              <div className={`text-2xl font-black font-mono tracking-tight ${selectedClient.account_balance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {(selectedClient.account_balance / 100).toFixed(2)}
              </div>
              <div className="text-[10px] font-bold text-slate-500 mt-1 flex items-center gap-1">
                <Activity className="w-3 h-3" /> LTV: {(selectedClient.lifetime_value / 100).toFixed(2)}
              </div>
            </div>
          </div>

          {/* COMPANION GRID */}
          <div className="space-y-3">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
              <PawPrint className="w-4 h-4 text-indigo-500" /> Registered Companions
            </h3>
            {uniqueClientPets.length === 0 ? (
              <div className="text-center p-8 text-sm font-bold text-slate-400 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                No active companions registered.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {uniqueClientPets.map(pet => (
                  <div key={pet.patientId} onClick={() => setSelectedPetId(pet.patientId)} className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs hover:shadow-md hover:border-indigo-300 transition-all group flex flex-col justify-between h-full cursor-pointer relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-50 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
                    <div>
                      <div className="font-extrabold text-slate-800 text-sm">{pet.petName}</div>
                      <div className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">
                        {pet.petType} {pet.breed ? ' • ' + pet.breed : ''}
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2 w-full z-10">
                      <button className="flex-1 py-1.5 bg-indigo-600 text-white text-[10px] font-extrabold rounded-lg shadow-sm">
                        Open Passport
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* INVOICES */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-500" /> Client Financials
                </h3>
                {onGoToPOS && (
                  <button onClick={() => onGoToPOS(selectedClient)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1">
                    Jump to POS <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {clientInvoices.length === 0 ? (
                  <div className="p-4 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-xl border border-slate-100 border-dashed">No financial history found.</div>
                ) : (
                  clientInvoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                      <div>
                        <div className="text-xs font-bold text-slate-800">{formatDisplayDate(inv.date)}</div>
                        <div className="text-[10px] font-semibold text-slate-500 mt-0.5">{inv.petName || 'Retail Purchase'}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs font-black text-slate-800">{(inv.sales_total).toFixed(2)}</div>
                        <div className={`text-[9px] font-extrabold uppercase mt-0.5 ${inv.paymentStatus === 'paid' ? 'text-emerald-500' : inv.paymentStatus === 'void' ? 'text-slate-400' : 'text-rose-500'}`}>
                          {inv.paymentStatus}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* APPOINTMENTS */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-500" /> Booking Ledger
                </h3>
                {onGoToAppointments && (
                  <button onClick={() => onGoToAppointments(selectedClient)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1">
                    Book Slot <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {clientAppointments.length === 0 ? (
                  <div className="p-4 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-xl border border-slate-100 border-dashed">No booking history found.</div>
                ) : (
                  clientAppointments.map(apt => (
                    <div key={apt.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                      <div>
                        <div className="text-xs font-bold text-slate-800">{apt.date} <span className="text-slate-400 ml-1">{apt.time}</span></div>
                        <div className="text-[10px] font-semibold text-slate-500 mt-0.5">{apt.petName}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase mt-0.5 ${
                          apt.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 
                          apt.status === 'cancelled' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {apt.status}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  };

  const renderPetPassport = () => {
    if (!activePet || !selectedClient) return null;

    return (
      <div className="flex-1 flex flex-col border border-slate-200 rounded-2xl bg-slate-50 shadow-sm relative overflow-hidden animate-fade-in">
        
        {/* PASSPORT HEADER */}
        <div className="bg-white border-b border-slate-200 shrink-0">
          <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
            <button onClick={() => setSelectedPetId(null)} className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer transition-colors uppercase tracking-widest">
              <ChevronLeft className="w-4 h-4"/> Back to {selectedClient.full_name}'s Profile
            </button>
            <div className="flex gap-2">
               {onGoToRecords && (
                 <button onClick={() => onGoToRecords(activePet.id)} className="px-4 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer">
                   <Activity className="w-3.5 h-3.5"/> Open E.H.R
                 </button>
               )}
               {onGenerateConsent && (
                 <button onClick={() => onGenerateConsent(selectedClient.full_name, activePet.petName)} className="px-4 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer">
                   <PenTool className="w-3.5 h-3.5"/> Sign Waiver
                 </button>
               )}
            </div>
          </div>
          
          <div className="p-6 flex flex-wrap md:flex-nowrap gap-6 items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center border border-indigo-200 shadow-inner">
                <PawPrint className="w-8 h-8 text-indigo-500" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                  {activePet.petName}
                  <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest border border-slate-200">Patient ID: {activePet.patientId.split('_')[0].toUpperCase()}</span>
                </h2>
                <div className="flex items-center gap-3 mt-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest">
                  <span>{activePet.petType}</span>
                  {activePet.breed && <><span className="w-1 h-1 rounded-full bg-slate-300"></span><span>{activePet.breed}</span></>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <div className="text-center px-4 border-r border-slate-200">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Sex</div>
                <div className="text-xs font-black text-slate-700">{activePet.sex || 'Unknown'}</div>
              </div>
              <div className="text-center px-4 border-r border-slate-200">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Weight</div>
                <div className="text-xs font-black text-slate-700">{activePet.weight ? `${activePet.weight} kg` : 'N/A'}</div>
              </div>
              <div className="text-center px-4">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Age</div>
                <div className="text-xs font-black text-slate-700">{activePet.age || 'Unknown'}</div>
              </div>
              <button onClick={handleOpenEditPet} className="ml-2 p-2 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 rounded-xl transition-all shadow-xs cursor-pointer" title="Edit Master Identity">
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* PASSPORT TABS */}
          <div className="flex px-6 gap-2">
            <button onClick={() => setPassportTab('timeline')} className={`px-5 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-t-xl transition-colors flex items-center gap-2 border-b-0 ${passportTab === 'timeline' ? 'bg-slate-50 text-indigo-600 border border-slate-200' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
              <Activity className="w-3.5 h-3.5"/> Clinical Timeline
            </button>
            <button onClick={() => setPassportTab('exams')} className={`px-5 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-t-xl transition-colors flex items-center gap-2 border-b-0 ${passportTab === 'exams' ? 'bg-slate-50 text-indigo-600 border border-slate-200' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
              <HeartPulse className="w-3.5 h-3.5"/> Systemic Exams
            </button>
            <button onClick={() => setPassportTab('labs')} className={`px-5 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-t-xl transition-colors flex items-center gap-2 border-b-0 ${passportTab === 'labs' ? 'bg-slate-50 text-indigo-600 border border-slate-200' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
              <TestTube className="w-3.5 h-3.5"/> Laboratory
            </button>
            <button onClick={() => setPassportTab('vaccines')} className={`px-5 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-t-xl transition-colors flex items-center gap-2 border-b-0 ${passportTab === 'vaccines' ? 'bg-slate-50 text-indigo-600 border border-slate-200' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
              <Syringe className="w-3.5 h-3.5"/> Vaccinations
            </button>
          </div>
        </div>

        {/* PASSPORT BODY */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          
          {passportTab === 'timeline' && (
            <div className="space-y-4 max-w-4xl animate-fade-in">
              {petRecords.length === 0 && <div className="text-center py-10 text-slate-400 font-bold text-xs">No clinical history found.</div>}
              {petRecords.map((record, idx) => (
                <div key={record.id} className="relative pl-8 pb-8 group">
                  {idx !== petRecords.length - 1 && <div className="absolute left-3.5 top-8 bottom-0 w-0.5 bg-slate-200 group-hover:bg-indigo-200 transition-colors"></div>}
                  <div className="absolute left-1.5 top-1.5 w-4 h-4 rounded-full border-4 border-white bg-indigo-400 shadow-sm group-hover:scale-125 transition-transform"></div>
                  
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-xs font-black text-slate-800">{formatDisplayDate(record.visitDate)}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Attending: {record.attendingVet || 'Unknown'}</div>
                      </div>
                      {record.assessment?.severity && (
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${record.assessment.severity === 'Critical' ? 'bg-rose-100 text-rose-700' : record.assessment.severity === 'Severe' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                          {record.assessment.severity}
                        </span>
                      )}
                    </div>
                    
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-3">
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Diagnosis / Assessment</div>
                      <div className="text-xs font-bold text-slate-700">
                        {record.assessment?.diagnosisType ? `${record.assessment.diagnosisType}: ${record.assessment.notes}` : (record.diagnosis || 'No formal diagnosis recorded.')}
                      </div>
                    </div>

                    {record.prescribedMeds && record.prescribedMeds.length > 0 && (
                      <div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Dispensed / Prescribed</div>
                        <div className="flex flex-wrap gap-2">
                          {record.prescribedMeds.map((m, i) => (
                            <span key={i} className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[9px] font-black px-2 py-1 rounded-md shadow-xs">
                              {m.name} {m.dosage ? `(${m.dosage})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {passportTab === 'exams' && (
            <div className="space-y-4 max-w-4xl animate-fade-in">
              {petRecords.filter(r => r.physicalExam).length === 0 && <div className="text-center py-10 text-slate-400 font-bold text-xs">No systemic examinations recorded.</div>}
              {petRecords.filter(r => r.physicalExam).map(record => {
                const exam = record.physicalExam!;
                const abnormalSystems = Object.entries(exam).filter(([_, data]) => !data.isNormal || (data.abnormalities && data.abnormalities.length > 0));
                
                return (
                  <div key={record.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-black text-slate-800 mb-4 pb-2 border-b border-slate-100">{formatDisplayDate(record.visitDate)} Systemic Review</div>
                    
                    {abnormalSystems.length === 0 ? (
                      <div className="bg-emerald-50 text-emerald-700 text-xs font-bold p-3 rounded-xl border border-emerald-100 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4"/> All Systems Normal
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {abnormalSystems.map(([systemKey, data]) => (
                          <div key={systemKey} className="bg-rose-50/50 p-3 rounded-xl border border-rose-100">
                            <div className="text-[10px] font-black text-rose-800 uppercase tracking-widest mb-2">{systemKey.replace(/([A-Z])/g, ' $1').trim()}</div>
                            <ul className="list-disc list-inside text-xs font-bold text-rose-600 pl-2 space-y-1">
                              {data.abnormalities?.map((ab, i) => <li key={i}>{ab}</li>)}
                            </ul>
                            {data.notes && <div className="text-[10px] font-medium text-rose-700 mt-2 italic">"{data.notes}"</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {passportTab === 'labs' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-fade-in max-w-4xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase tracking-widest font-black text-[9px]">
                    <th className="py-4 px-5">Date</th>
                    <th className="py-4 px-5">Test Name</th>
                    <th className="py-4 px-5">Status</th>
                    <th className="py-4 px-5">Results / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allPetLabs.length === 0 ? (
                    <tr><td colSpan={4} className="py-12 text-center text-slate-400 font-bold">No diagnostic labs recorded.</td></tr>
                  ) : (
                    allPetLabs.map((lab, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-5 font-bold text-slate-600">{formatDisplayDate(lab.visitDate)}</td>
                        <td className="py-4 px-5 font-black text-slate-800">{lab.testName}</td>
                        <td className="py-4 px-5">
                          <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${lab.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {lab.status}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          {lab.status === 'completed' ? (
                             <div className="text-[10px] font-bold text-slate-600 line-clamp-2">{lab.notes || 'Values recorded in main lab module.'}</div>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 italic">Pending Pathologist</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {passportTab === 'vaccines' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-fade-in max-w-4xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase tracking-widest font-black text-[9px]">
                    <th className="py-4 px-5">Date Administered</th>
                    <th className="py-4 px-5">Vaccine / Preventative</th>
                    <th className="py-4 px-5">Next Due Date</th>
                    <th className="py-4 px-5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allPetVax.length === 0 ? (
                    <tr><td colSpan={4} className="py-12 text-center text-slate-400 font-bold">No vaccinations recorded.</td></tr>
                  ) : (
                    allPetVax.sort((a,b) => new Date(b.dateAdministered).getTime() - new Date(a.dateAdministered).getTime()).map((vax, i) => {
                      const isOverdue = new Date() > new Date(vax.nextDueDate);
                      return (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-5 font-bold text-slate-600">{formatDisplayDate(vax.dateAdministered)}</td>
                        <td className="py-4 px-5 font-black text-slate-800">{vax.name}</td>
                        <td className={`py-4 px-5 font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-600'}`}>{formatDisplayDate(vax.nextDueDate)}</td>
                        <td className="py-4 px-5">
                          <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${isOverdue ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {isOverdue ? 'Overdue' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    )})
                  )}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full gap-4 overflow-hidden" id="customers-module-container">
      
      {/* LEFT PANE: Master Directory */}
      <aside className="w-1/3 min-w-[320px] max-w-[400px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">Client Directory</h2>
            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{clients.length} Total</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search name, phone, or pet..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs" 
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {filteredClients.map(c => {
            const clientRecs = records.filter(r => normalizePhone(r.ownerPhone) === normalizePhone(c.primary_phone));
            const petCount = new Set(clientRecs.map(r => (r.petName || 'Unknown').trim().toLowerCase())).size;
            const isSelected = selectedClientId === c.client_id;
            
            return (
              <div 
                key={c.client_id}
                onClick={() => { setSelectedClientId(c.client_id); setSelectedPetId(null); }}
                className={`p-3 rounded-xl cursor-pointer transition-all border ${isSelected ? 'bg-indigo-50 border-indigo-200 shadow-xs' : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className={`font-extrabold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>{c.full_name}</div>
                  {c.client_status === 'flagged_bad_debt' && <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                </div>
                <div className="flex justify-between items-center mt-2">
                  <div className={`text-[10px] font-mono font-bold ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`}>{c.primary_phone}</div>
                  <div className="flex items-center gap-1 bg-white border border-slate-200 px-1.5 py-0.5 rounded flex-shrink-0">
                    <PawPrint className={`w-3 h-3 ${petCount > 0 ? 'text-indigo-500' : 'text-slate-300'}`} />
                    <span className="text-[10px] font-bold text-slate-600 leading-none pt-px">{petCount}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredClients.length === 0 && <div className="text-center py-8 text-slate-400 font-medium text-xs">No clients match search.</div>}
        </div>

        <div className="p-4 border-t border-slate-100 bg-white shrink-0">
          <button 
            onClick={() => {
              setFormData({ full_name: '', primary_phone: '', alternate_phone: '', email_address: '', physical_address: '', communication_preference: 'sms', administrative_notes: '' });
              setNewPetData({ petName: '', petType: 'Canine', breed: '' });
              setShowAddModal(true);
            }}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            <UserPlus className="h-4 w-4" /> Register New Client
          </button>
        </div>
      </aside>

      {/* RIGHT PANE: Dynamic Morph (Client Dashboard OR Pet Passport) */}
      {selectedPetId ? renderPetPassport() : renderClientDashboard()}

      {/* NEW: DUAL-CAPTURE ENTERPRISE ONBOARDING MODAL */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-sky-100 max-w-2xl w-full text-[10px] shadow-2xl animate-scale-up flex flex-col overflow-hidden max-h-[calc(100vh-40px)]">
            
            <div className="flex justify-between items-start shrink-0 p-6 pb-4 border-b border-slate-100 bg-white z-10">
              <div>
                <h4 className="text-base font-black text-slate-800 leading-none">Register New Client & Companion</h4>
                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Central CRM Dual-Sync Onboarding</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-slate-100 text-slate-400 rounded-lg cursor-pointer transition-colors"><X className="w-5 h-5"/></button>
            </div>
            
            <form onSubmit={handleSaveClient} className="flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-100/50 space-y-4">

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* TIER 1: Client Block */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2"><User className="w-3.5 h-3.5"/> Client Details</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest mb-1.5">Full Name *</label>
                        <input type="text" required value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-xs" />
                      </div>
                      <div>
                        <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest mb-1.5">Primary Phone *</label>
                        <div className="relative flex items-center">
                          <span className="absolute left-3 font-mono font-bold text-slate-400 text-[10px]">+94</span>
                          <input type="text" required value={formData.primary_phone} onChange={e => setFormData({...formData, primary_phone: e.target.value})} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold font-mono text-xs" />
                        </div>
                      </div>
                      <div>
                        <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest mb-1.5">Email Address</label>
                        <input type="email" value={formData.email_address} onChange={e => setFormData({...formData, email_address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-xs" />
                      </div>
                      <div>
                        <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest mb-1.5">Physical Address</label>
                        <input type="text" value={formData.physical_address} onChange={e => setFormData({...formData, physical_address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-xs" />
                      </div>
                    </div>
                  </div>

                  {/* TIER 2: Companion Block */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2"><PawPrint className="w-3.5 h-3.5"/> First Companion (Optional)</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest mb-1.5">Patient Name</label>
                        <input type="text" value={newPetData.petName} onChange={(e) => setNewPetData({...newPetData, petName: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs" />
                      </div>
                      <div>
                        <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest mb-1.5">Species</label>
                        <select value={newPetData.petType} onChange={(e) => setNewPetData({...newPetData, petType: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs cursor-pointer">
                          <option value="Canine">Canine</option>
                          <option value="Feline">Feline</option>
                          <option value="Avian">Avian</option>
                          <option value="Reptile">Reptile</option>
                          <option value="Small Mammal">Small Mammal</option>
                          <option value="Exotic">Exotic</option>
                        </select>
                      </div>
                      <div>
                        <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest mb-1.5">Breed</label>
                        <input type="text" value={newPetData.breed} onChange={(e) => setNewPetData({...newPetData, breed: e.target.value})} placeholder="e.g. Labrador" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest mb-1.5">Administrative Notes</label>
                  <textarea rows={2} value={formData.administrative_notes} onChange={e => setFormData({...formData, administrative_notes: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs resize-none"></textarea>
                </div>

              </div>
              
              <div className="shrink-0 flex gap-3 p-6 pt-4 justify-end border-t border-slate-100 bg-white">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-5 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 cursor-pointer transition-colors text-[10px] uppercase tracking-widest">Cancel</button>
                <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl cursor-pointer shadow-md transition-colors text-[10px] uppercase tracking-widest flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4"/> Register Client & Companion
                </button>
              </div>
            </form>

          </div>
        </div>,
        document.body
      )}

      {/* PHASE 4: EDIT PET MASTER IDENTITY MODAL */}
      {showEditPetModal && createPortal(
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-sky-100 max-w-lg w-full text-xs shadow-xl animate-fade-in flex flex-col overflow-hidden">
            <div className="flex justify-between items-start p-6 pb-4 border-b border-slate-100 shrink-0 bg-slate-50/50">
              <div>
                <h4 className="text-sm font-black text-slate-800 leading-none">Edit Master Identity</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Updates propagate to all historical E.H.R</p>
              </div>
              <button onClick={() => setShowEditPetModal(false)} className="p-1 hover:bg-slate-200 text-slate-400 rounded-lg cursor-pointer transition-colors"><X className="w-4 h-4"/></button>
            </div>
            
            <form onSubmit={handleSavePetEdits} className="flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Patient Name *</label>
                    <input type="text" required value={editPetData.petName} onChange={e => setEditPetData({...editPetData, petName: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Species</label>
                    <select value={editPetData.petType} onChange={e => setEditPetData({...editPetData, petType: e.target.value as PetClassification})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold cursor-pointer">
                      <option value="Canine">Canine</option>
                      <option value="Feline">Feline</option>
                      <option value="Avian">Avian</option>
                      <option value="Reptile">Reptile</option>
                      <option value="Small Mammal">Small Mammal</option>
                      <option value="Exotic">Exotic</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Breed</label>
                    <input type="text" value={editPetData.breed} onChange={e => setEditPetData({...editPetData, breed: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Sex</label>
                    <select value={editPetData.sex} onChange={e => setEditPetData({...editPetData, sex: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold cursor-pointer">
                      <option value="Unknown">Unknown</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Neutered Male">Neutered Male</option>
                      <option value="Spayed Female">Spayed Female</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Age (DOB / Approx)</label>
                    <input type="text" value={editPetData.age} onChange={e => setEditPetData({...editPetData, age: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Latest Weight (kg)</label>
                    <input type="number" step="0.1" min="0" value={editPetData.weight} onChange={e => setEditPetData({...editPetData, weight: parseFloat(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold font-mono" />
                  </div>
                </div>
              </div>
              
              <div className="shrink-0 flex gap-2 p-6 pt-4 justify-end border-t border-slate-100 bg-white">
                <button type="button" onClick={() => setShowEditPetModal(false)} className="px-5 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 text-[10px] uppercase tracking-widest cursor-pointer transition-colors">Cancel</button>
                <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-[10px] uppercase tracking-widest cursor-pointer shadow-md flex items-center gap-2 transition-colors">
                  <CheckCircle2 className="w-4 h-4"/> Sync Updates
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Client Modal */}
      {showEditModal && createPortal(
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-sky-100 max-w-lg w-full text-xs shadow-xl animate-fade-in flex flex-col overflow-hidden">
            <div className="flex justify-between items-start p-6 pb-4 border-b border-slate-100 shrink-0 bg-slate-50/50">
              <div>
                <h4 className="text-sm font-black text-slate-800 leading-none">Edit Client Profile</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Update details in the central CRM directory</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1.5 hover:bg-slate-200 text-slate-400 rounded-lg cursor-pointer transition-colors"><X className="w-4 h-4"/></button>
            </div>
            
            <form onSubmit={handleUpdateExistingClient} className="flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Full Name *</label>
                    <input type="text" required value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Primary Phone *</label>
                    <input type="text" required placeholder="077 123 4567" value={formData.primary_phone} onChange={e => setFormData({...formData, primary_phone: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Alternate Phone</label>
                    <input type="text" value={formData.alternate_phone} onChange={e => setFormData({...formData, alternate_phone: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Email Address</label>
                    <input type="email" value={formData.email_address} onChange={e => setFormData({...formData, email_address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Physical Address</label>
                    <input type="text" value={formData.physical_address} onChange={e => setFormData({...formData, physical_address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Administrative Notes</label>
                    <textarea rows={2} value={formData.administrative_notes} onChange={e => setFormData({...formData, administrative_notes: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold resize-none"></textarea>
                  </div>
                </div>
              </div>
              
              <div className="shrink-0 flex gap-2 p-6 pt-4 justify-end border-t border-slate-100 bg-white">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-5 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 text-[10px] uppercase tracking-widest cursor-pointer transition-colors">Cancel</button>
                <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-[10px] uppercase tracking-widest cursor-pointer shadow-md flex items-center gap-2 transition-colors">
                  <CheckCircle2 className="w-4 h-4"/> Save Updates
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}