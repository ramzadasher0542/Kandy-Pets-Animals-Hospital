/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { PawPrint, CheckSquare, FileText, CheckCircle2, AlertTriangle, Scissors, Activity, User } from 'lucide-react';
import { GroomingLog, MedicalRecord, Pet, InventoryItem, ClinicQueueItem, Client } from '../types';
import { showToast } from './Toast';
import { fetchGroomingLogs, upsertGroomingLog } from '../lib/db';
import { sortQueueByUrgency } from '../lib/queueUtils';
import PageShell from './ui/PageShell';
import { EmptyState } from './ui/EmptyState';
import MasterDetailLayout from './ui/MasterDetailLayout';
import ClinicQueue from './ui/ClinicQueue';

interface GroomingProps {
  clients: Client[];
  pets: Pet[];
  records: MedicalRecord[];
  inventory: InventoryItem[];
  clinicQueue?: ClinicQueueItem[];
  onUpdateRecord: (record: MedicalRecord) => void;
  systemConfig?: any;
  onUpdateInventory?: (item: InventoryItem) => Promise<void>;
}

const GROOMING_SERVICES = [
  { category: 'Main Actions', items: ['Full Grooming', 'Bath & Dry', 'Trimming / Scissors Work'] },
  { category: 'Sanitary Add-Ons', items: ['Nail Clipping', 'Ear Cleaning', 'Styling', 'Shaving'] },
  { category: 'Medical Add-Ons', items: ['Medicated Bath'] }
];

export default function GroomingManager({ clients, pets, records, inventory, clinicQueue = [], onUpdateRecord, systemConfig, onUpdateInventory }: GroomingProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'new_session' | 'history'>('new_session');

  const [groomingLogs, setGroomingLogs] = useState<GroomingLog[]>([]);
  const groomingRateItems = useMemo(() => inventory.filter(item =>
    String(item.category).toLowerCase() === 'service' && /groom|bath|nail|shav|trim|deshed|de-shed|ear|styling/i.test(item.name)
  ), [inventory]);
  const [groomingRateDraft, setGroomingRateDraft] = useState<Record<string, number>>({});
  const [isSavingGroomingRates, setIsSavingGroomingRates] = useState(false);

  React.useEffect(() => {
    setGroomingRateDraft(Object.fromEntries(groomingRateItems.map(item => [item.id, item.price])));
  }, [groomingRateItems]);

  const saveGroomingRates = async () => {
    if (!onUpdateInventory) return;
    setIsSavingGroomingRates(true);
    try {
      await Promise.all(groomingRateItems.map(item => onUpdateInventory({ ...item, price: groomingRateDraft[item.id] ?? item.price })));
      showToast('Grooming rates saved.', 'success');
    } catch (error: any) {
      showToast(`Grooming rates failed: ${error?.message || 'Unknown error'}`, 'error');
    } finally {
      setIsSavingGroomingRates(false);
    }
  };
  
  const [groomingInstructions, setGroomingInstructions] = useState({
    bathe: false,
    fullShave: false,
    trimOnly: false,
    nailClip: false,
    earClean: false,
    deShed: false,
    customNotes: ''
  });
  const [consentOwnerName, setConsentOwnerName] = useState('');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  React.useEffect(() => {
    fetchGroomingLogs().then(setGroomingLogs).catch((e) => { if (import.meta.env.DEV) console.error(e); });
  }, []);

  React.useEffect(() => {
    if (selectedPatientId) {
      const p = pets.find(p => p.id === selectedPatientId);
      if (p) {
        const client = clients.find(c => c.client_id === p.clientId);
        if (client) {
          setConsentOwnerName(client.full_name);
        }
      }
    }
  }, [selectedPatientId, pets, clients]);

  const normalizePhone = (p: string) => (p || '').replace(/\D/g, '');

  const filteredPatients = useMemo(() => {
    const salonQueuePatientIds = new Set(
      clinicQueue
        .filter(q => ['grooming', 'Grooming'].includes(q.serviceType || '') && q.status === 'active')
        .map(q => q.petId)
    );

    return pets.map(p => {
      const client = clients.find(c => c.client_id === p.clientId);
      return {
        patientId: p.id,
        pet: p,
        ownerName: client?.full_name || 'Unknown',
        ownerPhone: client?.primary_phone || ''
      };
    }).filter(p => {
      // Show if they are in the grooming queue OR if there's a search query match
      const inQueue = salonQueuePatientIds.has(p.patientId);
      if (!searchQuery && !inQueue) return false;
      if (!searchQuery && inQueue) return true;

      const q = searchQuery.toLowerCase();
      return (p.pet?.name || 'Unknown').toLowerCase().includes(q) || 
             p.ownerName.toLowerCase().includes(q) || 
             normalizePhone(p.ownerPhone).includes(normalizePhone(q));
    });
  }, [pets, clients, clinicQueue, searchQuery]);

  const selectedPatient = filteredPatients.find(p => p.patientId === selectedPatientId);
  const selectedPet = selectedPatient?.pet;
  
  // Aggregate history across all versions of the patient's records
  const historicalGroomingLogs = selectedPatientId ? groomingLogs.filter(l => l.petId === selectedPatientId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];

  const toggleService = (service: string) => {
    setSelectedServices(prev => prev.includes(service) ? prev.filter(s => s !== service) : [...prev, service]);
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    // e.preventDefault(); // Moved to onTouchStart to avoid React passive event warning
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    let x, y;
    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = (e as React.MouseEvent).clientX - rect.left;
      y = (e as React.MouseEvent).clientY - rect.top;
    }
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    // e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    let x, y;
    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = (e as React.MouseEvent).clientX - rect.left;
      y = (e as React.MouseEvent).clientY - rect.top;
    }
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const processFinalization = async () => {
    if (!selectedPatient || selectedServices.length === 0) return;

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
      showToast(`Configure these grooming services in Inventory before billing: ${missingServices.join(', ')}.`, 'error');
      return;
    }

    const consentSignature = hasSignature && canvasRef.current ? canvasRef.current.toDataURL('image/png') : undefined;

    const newLog: GroomingLog = {
      id: crypto.randomUUID(),
      petId: selectedPatientId,
      date: new Date().toISOString().split('T')[0],
      services: selectedServices,
      totalBilled: totalBilled,
      status: 'completed',
      billingItems: billingItems,
      groomingInstructions,
      consentSignature,
      consentTimestamp: consentSignature ? new Date().toISOString() : undefined,
      consentOwnerName: consentOwnerName || undefined
    };

    try {
      await upsertGroomingLog(newLog);
      setGroomingLogs(prev => [...prev, newLog]);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      showToast('Failed to save grooming session.', 'error');
      return;
    }
    showToast(`Grooming session completed & pushed to POS Queue.`, 'success');
    setSelectedServices([]);
    clearSignature();
    setGroomingInstructions({ bathe: false, fullShave: false, trimOnly: false, nailClip: false, earClean: false, deShed: false, customNotes: '' });
    setActiveTab('history');
  };

  const handleFinalizeAndBill = () => {
    if (!selectedPatient || selectedServices.length === 0) return;
    if (!consentOwnerName.trim()) {
      showToast('Owner name is required for grooming consent.', 'error');
      return;
    }
    if (!hasSignature) {
      showToast('A customer signature is required before grooming can be finalized.', 'error');
      return;
    }
    processFinalization();
  };

  const [signatureModal, setSignatureModal] = useState<string | null>(null);

  const handlePrintConsent = (log: GroomingLog) => {
    const printDiv = document.createElement('div');
    printDiv.id = 'print-consent';
    printDiv.innerHTML = `
      <style>
        @media print {
          body * { visibility: hidden; }
          #print-consent, #print-consent * { visibility: visible; }
          #print-consent { position: absolute; left: 0; top: 0; width: 100%; padding: 40px; }
        }
      </style>
      <div style="text-align: center; margin-bottom: 30px;">
        <h2>${systemConfig?.hospitalName || 'KANDY PETS ANIMAL HOSPITAL'}</h2>
        <p>${systemConfig?.hospitalAddress || '123 Vet Street, Kandy'}</p>
        <h1 style="margin-top: 20px;">GROOMING CONSENT FORM</h1>
      </div>
      <div style="margin-bottom: 20px;">
        <p><strong>Date:</strong> ${log.date}</p>
        <p><strong>Owner Name:</strong> ${log.consentOwnerName || '_________________________'}</p>
        <p><strong>Pet ID:</strong> ${log.petId}</p>
      </div>
      <h3>Grooming Instructions</h3>
      <ul style="list-style: none; padding: 0;">
        <li style="margin-bottom: 10px;">${log.groomingInstructions?.bathe ? '☑' : '☐'} Bathe</li>
        <li style="margin-bottom: 10px;">${log.groomingInstructions?.fullShave ? '☑' : '☐'} Full Shave</li>
        <li style="margin-bottom: 10px;">${log.groomingInstructions?.trimOnly ? '☑' : '☐'} Trim Only</li>
        <li style="margin-bottom: 10px;">${log.groomingInstructions?.nailClip ? '☑' : '☐'} Nail Clip</li>
        <li style="margin-bottom: 10px;">${log.groomingInstructions?.earClean ? '☑' : '☐'} Ear Clean</li>
        <li style="margin-bottom: 10px;">${log.groomingInstructions?.deShed ? '☑' : '☐'} De-shed</li>
      </ul>
      <div style="margin-bottom: 40px;">
        <p><strong>Special Instructions:</strong></p>
        <p>${log.groomingInstructions?.customNotes || 'None'}</p>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 50px;">
        <p>Owner Signature: ___________________________  Date: ______</p>
        <p>Staff Signature: ___________________________</p>
      </div>
    `;
    document.body.appendChild(printDiv);
    window.onafterprint = () => {
      printDiv.remove();
      window.onafterprint = null;
    };
    window.print();
  };

  const renderActiveQueue = () => {
    const activeQueue = sortQueueByUrgency(clinicQueue.filter(q =>
      (q.serviceType === 'Grooming' || q.serviceType === 'grooming') &&
      q.status === 'active'
    ));

    return (
      <ClinicQueue
        title="Active Grooming Queue"
        items={activeQueue}
        isSelected={q => selectedPatientId === q.petId}
        onSelect={q => { setSelectedPatientId(q.petId); setSelectedServices([]); setActiveTab('new_session'); }}
        statusLabel={() => 'Waiting'}
      />
    );
  };

  return (
    <PageShell
      title="Grooming & Salon"
      search={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: "Search Patient or Owner..."
      }}
    >
      <div className="flex-1 min-h-0 w-full flex flex-col gap-3" id="grooming-module-container">
        <details open className="shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600">Grooming service rates</summary>
          <div className="px-5 pb-4 space-y-4">
            {groomingRateItems.length === 0 ? (
              <p className="text-xs font-medium text-slate-500">Add grooming services under Inventory &amp; Stock to manage their prices here.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {groomingRateItems.map(item => (
                  <label key={item.id} className="text-[10px] font-black uppercase tracking-widest text-slate-500">{item.name}
                    <div className="relative mt-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">{systemConfig?.currencySymbol || 'Rs. '}</span>
                      <input type="number" min="0" step="1" value={groomingRateDraft[item.id] ?? item.price} onChange={e => setGroomingRateDraft(prev => ({ ...prev, [item.id]: Number(e.target.value) || 0 }))} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-2 text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-violet-500/20" />
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-medium text-slate-500">These prices are the same service prices used by POS.</p>
              <button type="button" onClick={() => void saveGroomingRates()} disabled={isSavingGroomingRates || groomingRateItems.length === 0} className="rounded-lg bg-violet-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-violet-700 disabled:opacity-50">{isSavingGroomingRates ? 'Saving...' : 'Save rates'}</button>
            </div>
          </div>
        </details>
        <div className="flex-1 min-h-0">
          <MasterDetailLayout
          listHeader={renderActiveQueue()}
          list={
            <>
              {filteredPatients.length === 0 ? (
                <EmptyState title="No patients found" />
              ) : (
                filteredPatients.map(patient => (
                  <div 
                    key={patient.patientId} onClick={() => { setSelectedPatientId(patient.patientId); setSelectedServices([]); setActiveTab('new_session'); }}
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
          detailEmptyIcon={<Scissors className="h-16 w-16 text-slate-300" />}
          detailEmptyTitle="Select a Patient to begin a new grooming session."
          detail={
            <div className="flex-1 flex flex-col relative overflow-hidden">
              {/* Identity Header */}
              <div className="bg-white p-6 border-b border-slate-200 flex justify-between items-start shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center border border-indigo-200"><PawPrint className="w-6 h-6 text-indigo-600" /></div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">{selectedPet?.name || 'Unknown'}</h2>
                    <div className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">{selectedPatient?.ownerName} • {selectedPatient?.ownerPhone}</div>
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
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                      <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Grooming Instructions</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                        {(['bathe', 'fullShave', 'trimOnly', 'nailClip', 'earClean', 'deShed'] as const).map(key => {
                          const labelMap = { bathe: 'Bathe', fullShave: 'Full Shave', trimOnly: 'Trim Only', nailClip: 'Nail Clip', earClean: 'Ear Clean', deShed: 'De-shed' };
                          const isChecked = groomingInstructions[key];
                          return (
                            <label key={key} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer select-none ${isChecked ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}>
                              <input type="checkbox" className="sr-only" checked={isChecked} onChange={() => {
                                let newInst = { ...groomingInstructions, [key]: !isChecked };
                                if (key === 'fullShave' && !isChecked) newInst.trimOnly = false;
                                if (key === 'trimOnly' && !isChecked) newInst.fullShave = false;
                                setGroomingInstructions(newInst);
                              }} />
                              <div className={`w-5 h-5 rounded-xl flex items-center justify-center transition-colors ${isChecked ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300'}`}>
                                {isChecked && <CheckCircle2 className="w-4 h-4" />}
                              </div>
                              <span className={`text-xs font-bold transition-colors ${isChecked ? 'text-indigo-900' : 'text-slate-600'}`}>{labelMap[key]}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="mb-6">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Special Instructions</label>
                        <textarea value={groomingInstructions.customNotes} onChange={(e) => setGroomingInstructions({...groomingInstructions, customNotes: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none min-h-[60px]" placeholder="Any custom notes..."></textarea>
                      </div>

                      <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Customer Consent</h3>
                      <div className="mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Owner Name</label>
                        <input type="text" value={consentOwnerName} onChange={(e) => setConsentOwnerName(e.target.value)} className="w-full md:w-1/2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none" placeholder="Owner Name" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Digital Signature</label>
                        <div className="border border-slate-300 bg-slate-50 rounded-xl overflow-hidden inline-block relative">
                          <canvas 
                            ref={canvasRef} 
                            width={400} 
                            height={150} 
                            className="bg-transparent cursor-crosshair touch-none w-full md:w-[400px] h-[150px]"
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={(e) => { e.preventDefault(); startDrawing(e); }}
                            onTouchMove={(e) => { e.preventDefault(); draw(e); }}
                            onTouchEnd={stopDrawing}
          />
        </div>
      </div>
                        <div className="mt-2">
                          <button onClick={clearSignature} className="px-3 py-1.5 text-[10px] font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors">Clear Signature</button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1">
                      {GROOMING_SERVICES.map(group => (
                        <div key={group.category} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm h-fit">
                          <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">{group.category}</h3>
                          <div className="space-y-3">
                            {group.items.map(item => {
                              const isChecked = selectedServices.includes(item);
                              return (
                                <label key={item} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer select-none ${isChecked ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}>
                                  <input 
                                    type="checkbox" 
                                    className="sr-only" 
                                    checked={isChecked} 
                                    onChange={() => toggleService(item)} 
                                  />
                                  <div className={`w-5 h-5 rounded-xl flex items-center justify-center transition-colors ${isChecked ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300'}`}>
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
                    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 flex items-center justify-between shrink-0">
                      <div>
                        <h4 className="text-sm font-black text-indigo-900 flex items-center gap-2"><Activity className="w-4 h-4" /> Ready for POS Billing</h4>
                        <p className="text-xs text-indigo-700 font-bold mt-1">Selected services will be mapped to inventory prices and pushed to the patient's checkout queue.</p>
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
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-widest font-bold text-[10px]">
                          <th className="py-3 px-4 w-40">Date</th>
                          <th className="py-3 px-4">Services Rendered</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historicalGroomingLogs.length === 0 ? (
                          <tr><td colSpan={3}><EmptyState title="No grooming sessions found" /></td></tr>
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
                                <details className="mt-3 border-t border-slate-100 pt-3 text-xs group">
                                  <summary className="cursor-pointer font-bold text-indigo-600 hover:text-indigo-800 outline-none select-none list-none flex items-center gap-1">
                                    <span className="group-open:rotate-90 transition-transform">▶</span> View Instructions
                                  </summary>
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-slate-600 pl-4">
                                    <div>{log.groomingInstructions?.bathe ? '☑' : '☐'} Bathe</div>
                                    <div>{log.groomingInstructions?.fullShave ? '☑' : '☐'} Full Shave</div>
                                    <div>{log.groomingInstructions?.trimOnly ? '☑' : '☐'} Trim Only</div>
                                    <div>{log.groomingInstructions?.nailClip ? '☑' : '☐'} Nail Clip</div>
                                    <div>{log.groomingInstructions?.earClean ? '☑' : '☐'} Ear Clean</div>
                                    <div>{log.groomingInstructions?.deShed ? '☑' : '☐'} De-shed</div>
                                  </div>
                                  {log.groomingInstructions?.customNotes && (
                                    <div className="mt-2 pl-4 text-slate-500 italic">Notes: {log.groomingInstructions.customNotes}</div>
                                  )}
                                </details>
                              </td>
                              <td className="py-4 px-4 text-right flex flex-col items-end gap-2">
                                <span className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700">
                                  {log.status}
                                </span>
                                {log.consentSignature ? (
                                  <>
                                    <span className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> CONSENT SIGNED
                                    </span>
                                    <button onClick={() => setSignatureModal(log.consentSignature!)} className="text-[10px] font-bold text-indigo-600 hover:underline">View Signature</button>
                                  </>
                                ) : (
                                  <span className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> NO CONSENT
                                  </span>
                                )}
                                <button onClick={() => handlePrintConsent(log)} className="mt-1 flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-xl transition-colors border border-slate-300">
                                  🖨 Print Consent Form
                                </button>
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

        {signatureModal && (
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSignatureModal(null)}>
            <div className="bg-white rounded-2xl p-4 shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4">Customer Signature</h3>
              <img src={signatureModal} alt="Signature" className="border border-slate-200 rounded-2xl w-full md:w-[400px]" />
              <button onClick={() => setSignatureModal(null)} className="w-full mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors">Close</button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
