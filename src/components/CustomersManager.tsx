/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, UserPlus, Phone, Mail, MapPin, Calendar, 
  ArrowRight, FileText, Wallet, ShieldAlert, PawPrint, Activity, Edit2, PenTool
} from 'lucide-react';
import { Client, MedicalRecord, Invoice, Appointment } from '../types';
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
}

export default function CustomersManager({ 
  records, 
  invoices, 
  appointments,
  onGoToPOS,
  onGoToAppointments,
  onGoToRecords,
  onUpdateCustomer,
  onGenerateConsent
}: CustomersManagerProps) {
  
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '', primary_phone: '', alternate_phone: '',
    email_address: '', physical_address: '', communication_preference: 'sms',
    administrative_notes: ''
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
    await loadClients();
    setShowAddModal(false);
    setSelectedClientId(newClient.client_id);
    showToast('New client successfully registered.', 'success');
    
    setFormData({
      full_name: '', primary_phone: '', alternate_phone: '',
      email_address: '', physical_address: '', communication_preference: 'sms', administrative_notes: ''
    });
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
    
    if (onUpdateCustomer) {
      onUpdateCustomer(oldPhone, formData.primary_phone, formData.full_name, formData.email_address);
    }
    
    setShowEditModal(false);
    showToast('Client profile updated globally.', 'success');
  };

  const openEditModal = () => {
    if (!selectedClient) return;
    setFormData({
      full_name: selectedClient.full_name,
      primary_phone: selectedClient.primary_phone,
      alternate_phone: selectedClient.alternate_phone || '',
      email_address: selectedClient.email_address || '',
      physical_address: selectedClient.physical_address || '',
      communication_preference: selectedClient.communication_preference,
      administrative_notes: selectedClient.administrative_notes || ''
    });
    setShowEditModal(true);
  };

  // ARMOR-PLATED DATA MERGE: Collapses duplicates and preserves Pet Type/Breed
  const clientPets = selectedClient ? records.filter(r => normalizePhone(r.ownerPhone) === normalizePhone(selectedClient.primary_phone)) : [];
  const petMap = new Map<string, any>();
  
  clientPets.forEach(p => {
    const key = (p.petName || 'Unknown').trim().toLowerCase();
    if (!petMap.has(key)) {
      petMap.set(key, { ...p });
    } else {
      const existing = petMap.get(key);
      if (!existing.petType && p.petType) existing.petType = p.petType;
      if (!existing.breed && p.breed) existing.breed = p.breed;
      petMap.set(key, existing);
    }
  });
  
  const uniqueClientPets = Array.from(petMap.values());
  const clientInvoices = selectedClient ? invoices.filter(i => normalizePhone(i.ownerPhone) === normalizePhone(selectedClient.primary_phone)).slice(0, 5) : [];
  const clientAppointments = selectedClient ? appointments.filter(a => normalizePhone(a.ownerPhone) === normalizePhone(selectedClient.primary_phone)).slice(0, 5) : [];

  return (
    <div className="flex h-full w-full gap-4 overflow-hidden" id="customers-module-container">
      
      {/* LEFT PANE: 30% Master Directory */}
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
            // FIX: Accurately count UNIQUE pets, not total records
            const clientRecs = records.filter(r => normalizePhone(r.ownerPhone) === normalizePhone(c.primary_phone));
            const petCount = new Set(clientRecs.map(r => (r.petName || 'Unknown').trim().toLowerCase())).size;
            const isSelected = selectedClientId === c.client_id;
            
            return (
              <div 
                key={c.client_id}
                onClick={() => setSelectedClientId(c.client_id)}
                className={`p-3 rounded-xl cursor-pointer transition-all border ${
                  isSelected 
                    ? 'bg-indigo-50 border-indigo-200 shadow-xs' 
                    : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className={`font-extrabold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                    {c.full_name}
                  </div>
                  {c.client_status === 'flagged_bad_debt' && (
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  )}
                </div>
                <div className="flex justify-between items-center mt-2">
                  <div className={`text-[10px] font-mono font-bold ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`}>
                    {c.primary_phone}
                  </div>
                  <div className="flex items-center gap-1 bg-white border border-slate-200 px-1.5 py-0.5 rounded flex-shrink-0">
                    <PawPrint className={`w-3 h-3 ${petCount > 0 ? 'text-indigo-500' : 'text-slate-300'}`} />
                    <span className="text-[10px] font-bold text-slate-600 leading-none pt-px">{petCount}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredClients.length === 0 && (
            <div className="text-center py-8 text-slate-400 font-medium text-xs">No clients match search.</div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-white shrink-0">
          <button 
            onClick={() => {
              setFormData({ full_name: '', primary_phone: '', alternate_phone: '', email_address: '', physical_address: '', communication_preference: 'sms', administrative_notes: '' });
              setShowAddModal(true);
            }}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            <UserPlus className="h-4 w-4" /> Add New Client
          </button>
        </div>
      </aside>

      {/* RIGHT PANE: 70% Dashboard Details */}
      <main className="flex-1 bg-slate-50 rounded-2xl flex flex-col overflow-hidden relative">
        {!selectedClient ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 border border-slate-200 rounded-2xl bg-white shadow-sm">
            <UserPlus className="h-12 w-12 text-slate-200 mb-3" />
            <h3 className="text-sm font-extrabold text-slate-500">No Client Selected</h3>
            <p className="text-xs font-medium mt-1">Select a client from the directory to view their complete history, financial standing, and pet records.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col border border-slate-200 rounded-2xl bg-white shadow-sm relative">
            
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
                      <button onClick={openEditModal} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer" title="Edit Client Profile">
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
                      <div key={pet.id} className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs hover:shadow-sm transition-all group flex flex-col justify-between h-full">
                        <div>
                          <div className="font-extrabold text-slate-800 text-sm">{pet.petName}</div>
                          <div className="text-[10px] font-bold text-slate-500 mt-1">
                            {pet.petType || 'Companion'}
                            {pet.breed ? ' • ' + pet.breed : ''}
                          </div>
                        </div>
                        <div className="mt-4 flex gap-2 w-full">
                          <button 
                            onClick={() => onGoToRecords && onGoToRecords(pet.id)}
                            className="flex-1 py-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-600 hover:text-indigo-700 text-[10px] font-extrabold rounded-lg transition-colors cursor-pointer"
                          >
                            View EHR
                          </button>
                          {onGenerateConsent && (
                            <button 
                              onClick={() => onGenerateConsent(selectedClient.full_name, pet.petName)}
                              className="flex-1 py-1.5 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-600 hover:text-emerald-700 text-[10px] font-extrabold rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <PenTool className="w-3 h-3" /> Sign Waiver
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-indigo-500" /> Recent Invoices
                    </h3>
                    {onGoToPOS && (
                      <button onClick={() => onGoToPOS(selectedClient)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1">
                        Jump to POS <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {clientInvoices.length === 0 ? (
                      <div className="p-4 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                        No financial history found.
                      </div>
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

                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-indigo-500" /> Appointment Log
                    </h3>
                    {onGoToAppointments && (
                      <button onClick={() => onGoToAppointments(selectedClient)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1">
                        Book Appointment <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {clientAppointments.length === 0 ? (
                      <div className="p-4 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                        No booking history found.
                      </div>
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
        )}
      </main>

      {/* Add Client Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-sky-100 max-w-lg w-full text-xs shadow-xl animate-fade-in flex flex-col overflow-hidden">
            <div className="flex justify-between items-start p-6 pb-4 border-b border-slate-100 shrink-0">
              <div>
                <h4 className="text-sm font-extrabold text-slate-800 leading-none">Register New Client</h4>
                <p className="text-[10px] text-slate-400 mt-1">Add details into the central CRM directory</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-100 text-slate-400 rounded-lg cursor-pointer">✕</button>
            </div>
            
            <form onSubmit={handleSaveClient} className="flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-600 block text-[10px]">Full Name *</label>
                    <input type="text" required value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]">Primary Phone *</label>
                    <input type="text" required placeholder="077 123 4567" value={formData.primary_phone} onChange={e => setFormData({...formData, primary_phone: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]">Alternate Phone</label>
                    <input type="text" value={formData.alternate_phone} onChange={e => setFormData({...formData, alternate_phone: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-600 block text-[10px]">Email Address</label>
                    <input type="email" value={formData.email_address} onChange={e => setFormData({...formData, email_address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-600 block text-[10px]">Physical Address</label>
                    <input type="text" value={formData.physical_address} onChange={e => setFormData({...formData, physical_address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-600 block text-[10px]">Administrative Notes</label>
                    <textarea rows={2} value={formData.administrative_notes} onChange={e => setFormData({...formData, administrative_notes: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"></textarea>
                  </div>
                </div>
              </div>
              
              <div className="shrink-0 flex gap-2 p-6 pt-4 justify-end border-t border-slate-100 bg-white">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 cursor-pointer">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer shadow-xs">Save Client</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Client Modal */}
      {showEditModal && createPortal(
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-sky-100 max-w-lg w-full text-xs shadow-xl animate-fade-in flex flex-col overflow-hidden">
            <div className="flex justify-between items-start p-6 pb-4 border-b border-slate-100 shrink-0">
              <div>
                <h4 className="text-sm font-extrabold text-slate-800 leading-none">Edit Client Profile</h4>
                <p className="text-[10px] text-slate-400 mt-1">Update details in the central CRM directory</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-slate-100 text-slate-400 rounded-lg cursor-pointer">✕</button>
            </div>
            
            <form onSubmit={handleUpdateExistingClient} className="flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-600 block text-[10px]">Full Name *</label>
                    <input type="text" required value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]">Primary Phone *</label>
                    <input type="text" required placeholder="077 123 4567" value={formData.primary_phone} onChange={e => setFormData({...formData, primary_phone: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-1">
                    <label className="font-bold text-slate-600 block text-[10px]">Alternate Phone</label>
                    <input type="text" value={formData.alternate_phone} onChange={e => setFormData({...formData, alternate_phone: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-600 block text-[10px]">Email Address</label>
                    <input type="email" value={formData.email_address} onChange={e => setFormData({...formData, email_address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-600 block text-[10px]">Physical Address</label>
                    <input type="text" value={formData.physical_address} onChange={e => setFormData({...formData, physical_address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="font-bold text-slate-600 block text-[10px]">Administrative Notes</label>
                    <textarea rows={2} value={formData.administrative_notes} onChange={e => setFormData({...formData, administrative_notes: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"></textarea>
                  </div>
                </div>
              </div>
              
              <div className="shrink-0 flex gap-2 p-6 pt-4 justify-end border-t border-slate-100 bg-white">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 cursor-pointer">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer shadow-xs">Save Updates</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}