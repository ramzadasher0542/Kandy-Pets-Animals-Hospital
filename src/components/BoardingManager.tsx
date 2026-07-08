/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Home, Search, Calendar, Activity, Info, ShieldAlert, CheckCircle2, PawPrint, X, AlertTriangle, Lock
} from 'lucide-react';
import { MedicalRecord, BoardingRecord, Pet, Client, ClinicQueueItem } from '../types';
import { showToast } from './Toast';
import { fetchBoardingRecords, upsertBoardingRecord, fetchPets } from '../lib/db';

interface BoardingProps {
  clients: Client[];
  pets: Pet[];
  records: MedicalRecord[];
  clinicQueue?: ClinicQueueItem[];
  onUpdateRecord: (record: MedicalRecord) => void;
}

const KENNEL_SPACES = Array.from({ length: 10 }, (_, i) => `Kennel ${i + 1}`);
const CONDO_SPACES = ['Cat Condo A', 'Cat Condo B', 'Cat Condo C'];
const ALL_SPACES = [...KENNEL_SPACES, ...CONDO_SPACES];

export default function BoardingManager({ clients, pets = [], records, clinicQueue = [], onUpdateRecord }: BoardingProps) {
  
  // Intake Form State
  const [selectedCage, setSelectedCage] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [checkOutDate, setCheckOutDate] = useState<string>('');
  const [foodType, setFoodType] = useState<'without_food' | 'with_food'>('without_food');
  const [medicalBoarding, setMedicalBoarding] = useState<boolean>(false);
  
  // Guardrail State
  const [showDepositGuard, setShowDepositGuard] = useState(false);

  const [boardingRecords, setBoardingRecords] = useState<BoardingRecord[]>([]);

  React.useEffect(() => {
    fetchBoardingRecords().then(setBoardingRecords).catch(console.error);
  }, []);

  // Derive unique patients & active boarding map
  const { uniquePatients, activeBoardingMap } = useMemo(() => {
    const cageMap = new Map<string, { boarding: BoardingRecord, pet: Pet | undefined, ownerName: string }>();

    boardingRecords.forEach(b => {
      if (b.status === 'active') {
        const pet = pets.find(p => p.id === b.petId);
        const client = pet ? clients.find(c => c.client_id === pet.clientId) : null;
        cageMap.set(b.cageNumber, { boarding: b, pet, ownerName: client ? client.full_name : 'Unknown Owner' });
      }
    });

    return { 
      uniquePatients: pets,
      activeBoardingMap: cageMap
    };
  }, [boardingRecords, pets, clients]);

  const [dischargeModalCage, setDischargeModalCage] = useState<string | null>(null);

  const handleDischarge = async (cage: string) => {
    const occupant = activeBoardingMap.get(cage);
    if (!occupant || !occupant.boarding) return;
    
    const updatedBoarding: BoardingRecord = {
      ...occupant.boarding,
      status: 'discharged'
    };
    await upsertBoardingRecord(updatedBoarding);
    setBoardingRecords(prev => prev.map(b => b.id === updatedBoarding.id ? updatedBoarding : b));
    showToast(`${occupant.pet?.name || 'Unknown'} discharged from ${cage}. Cage is now available.`, 'success');
    setSelectedCage(null);
    setDischargeModalCage(null);
  };

  const handleOpenGuard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      showToast('Please select a patient.', 'error');
      return;
    }
    if (!checkOutDate) {
      showToast('Expected checkout date is required.', 'error');
      return;
    }
    setShowDepositGuard(true);
  };

  const handleConfirmBooking = async () => {
    if (!selectedCage || !selectedPatientId) return;

    const patient = uniquePatients.find(p => p.id === selectedPatientId);
    if (!patient) return;

    const checkIn = new Date();
    const checkOut = new Date(checkOutDate);
    const diffMs = checkOut.getTime() - checkIn.getTime();
    const boardingDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    const billingItems = [
      { itemId: 'boarding_deposit', name: '[DEPOSIT] Admission Hold', dosage: 'N/A', quantity: 1 },
      { itemId: 'boarding_rate', name: `[BOARDING] Base Rate (${boardingDays} Day${boardingDays > 1 ? 's' : ''})`, dosage: 'N/A', quantity: boardingDays }
    ];

    const newBoardingInfo: BoardingRecord = {
      id: crypto.randomUUID(),
      petId: selectedPatientId,
      cageNumber: selectedCage,
      checkInDate: new Date().toISOString().split('T')[0],
      expectedCheckOut: checkOutDate,
      status: 'active',
      foodType,
      medicalBoarding,
      depositPaid: true,
      billingItems: billingItems
    };

    await upsertBoardingRecord(newBoardingInfo);
    setBoardingRecords(prev => [...prev, newBoardingInfo]);
    showToast(`Patient booked into ${selectedCage}.`, 'success');
    
    // Reset
    setShowDepositGuard(false);
    setSelectedCage(null);
    setSelectedPatientId('');
    setCheckOutDate('');
    setFoodType('without_food');
    setMedicalBoarding(false);
  };

  const renderActiveQueue = () => {
    const activeQueue = clinicQueue.filter(q => 
      (q.serviceType === 'Boarding' || q.serviceType === 'boarding') && 
      q.status === 'active'
    );
    
    if (activeQueue.length === 0) return null;

    return (
      <div className="p-4 border-b border-slate-100 bg-indigo-50/50 shrink-0">
        <h3 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5"/> Active Boarding Queue
        </h3>
        <div className="space-y-2">
          {activeQueue.map(q => (
            <div 
              key={q.id}
              onClick={() => { setSelectedPatientId(q.petId); }}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedPatientId === q.petId ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' : 'bg-white border-indigo-100 hover:border-indigo-300 shadow-sm'}`}
            >
              <div className="flex justify-between items-center mb-1">
                <div className="font-bold text-sm truncate">{q.petName}</div>
                <div className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded shrink-0 ${selectedPatientId === q.petId ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                  Waiting
                </div>
              </div>
              <div className={`text-[10px] font-medium ${selectedPatientId === q.petId ? 'text-indigo-200' : 'text-slate-500'}`}>
                {q.ownerName}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-140px)] w-full gap-4 overflow-hidden" id="boarding-module-container">
      
      {/* LEFT PANE: Visual Kennel Board (40%) */}
      <aside className="w-2/5 min-w-[350px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <h2 className="text-sm font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Home className="w-5 h-5 text-indigo-600" /> Live Kennel & Condo Board
          </h2>
          <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Select an empty space to check-in.</p>
        </div>

        {renderActiveQueue()}

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 bg-slate-50/50">
          
          {/* Dog Kennels */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-200 pb-2">Dog Kennels</h3>
            <div className="grid grid-cols-2 gap-3">
              {KENNEL_SPACES.map(cage => {
                const occupant = activeBoardingMap.get(cage);
                const isSelected = selectedCage === cage;
                
                if (occupant) {
                  return (
                    <div key={cage} className="p-4 rounded-2xl relative overflow-hidden bg-gradient-to-br from-rose-500 to-rose-700 shadow-lg border border-rose-400 group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:scale-110 transition-transform duration-500"></div>
                      <div className="absolute bottom-0 left-0 w-16 h-16 bg-black/10 rounded-full blur-xl -ml-8 -mb-8 pointer-events-none"></div>
                      
                      <div className="relative z-10 flex flex-col h-full">
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-[10px] font-black text-rose-100 uppercase tracking-widest bg-black/20 px-2 py-1 rounded-md backdrop-blur-sm border border-white/10">{cage}</div>
                          <Lock className="w-4 h-4 text-rose-200" />
                        </div>
                        <div className="font-black text-white text-lg tracking-tight truncate drop-shadow-sm">{occupant.pet?.name || 'Unknown Pet'}</div>
                        <div className="text-xs font-bold text-rose-100 truncate opacity-90">{occupant.pet?.breed || 'Unknown Breed'}</div>
                        <div className="text-[10px] font-bold text-rose-200 truncate mt-0.5">Owner: {occupant.ownerName || 'Unknown'}</div>
                        <div className="mt-auto pt-3">
                          <button onClick={(e) => { e.stopPropagation(); setDischargeModalCage(cage); }} className="w-full py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer border border-white/30 hover:shadow-lg">Discharge</button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div 
                    key={cage} onClick={() => setSelectedCage(cage)}
                    className={`p-4 rounded-2xl transition-all cursor-pointer relative overflow-hidden group ${isSelected ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-xl border-indigo-400 scale-[1.02] text-white' : 'bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 hover:shadow-md hover:border-emerald-300'}`}
                  >
                    <div className={`absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none transition-transform duration-500 group-hover:scale-110 ${isSelected ? 'bg-white/20' : 'bg-emerald-200/50'}`}></div>
                    
                    <div className="relative z-10 flex flex-col h-full">
                      <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isSelected ? 'text-indigo-100' : 'text-emerald-600'}`}>{cage}</div>
                      <div className={`font-black text-lg flex items-center gap-1.5 ${isSelected ? 'text-white' : 'text-emerald-900'}`}><CheckCircle2 className={`w-4 h-4 ${isSelected ? 'text-indigo-200' : 'text-emerald-500'}`} /> Empty</div>
                      <div className={`text-xs font-bold mt-1 ${isSelected ? 'text-indigo-200' : 'text-emerald-600/70'}`}>Ready for admission</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cat Condos */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-200 pb-2">Feline Condos</h3>
            <div className="grid grid-cols-2 gap-3">
              {CONDO_SPACES.map(cage => {
                const occupant = activeBoardingMap.get(cage);
                const isSelected = selectedCage === cage;
                
                if (occupant) {
                  return (
                    <div key={cage} className="p-4 rounded-2xl relative overflow-hidden bg-gradient-to-br from-rose-500 to-rose-700 shadow-lg border border-rose-400 group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:scale-110 transition-transform duration-500"></div>
                      <div className="absolute bottom-0 left-0 w-16 h-16 bg-black/10 rounded-full blur-xl -ml-8 -mb-8 pointer-events-none"></div>
                      
                      <div className="relative z-10 flex flex-col h-full">
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-[10px] font-black text-rose-100 uppercase tracking-widest bg-black/20 px-2.5 py-1 rounded-md backdrop-blur-sm border border-white/10 shadow-sm">{cage}</div>
                          <Lock className="w-5 h-5 text-rose-200 drop-shadow-sm" />
                        </div>
                        <div className="font-black text-white text-xl tracking-tight truncate drop-shadow-md">{occupant.pet?.name || 'Unknown Pet'}</div>
                        <div className="text-xs font-bold text-rose-100 truncate mb-1 opacity-90 drop-shadow-sm">{occupant.pet?.breed || 'Unknown Breed'}</div>
                        <div className="text-[10px] font-bold text-white/80 bg-black/20 px-2 py-0.5 rounded-full inline-block mb-3 border border-white/10 w-max mt-1">Owner: {occupant.ownerName}</div>
                        <div className="mt-auto">
                          <button onClick={(e) => { e.stopPropagation(); setDischargeModalCage(cage); }} className="w-full py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer border border-white/30 hover:shadow-lg">Discharge</button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div 
                    key={cage} onClick={() => setSelectedCage(cage)}
                    className={`p-4 rounded-2xl transition-all cursor-pointer relative overflow-hidden group ${isSelected ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-xl border-indigo-400 scale-[1.02] text-white' : 'bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 hover:shadow-md hover:border-emerald-300'}`}
                  >
                    <div className={`absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none transition-transform duration-500 group-hover:scale-110 ${isSelected ? 'bg-white/20' : 'bg-emerald-200/50'}`}></div>
                    
                    <div className="relative z-10 flex flex-col h-full">
                      <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isSelected ? 'text-indigo-100' : 'text-emerald-600'}`}>{cage}</div>
                      <div className={`font-black text-lg flex items-center gap-1.5 ${isSelected ? 'text-white' : 'text-emerald-900'}`}><CheckCircle2 className={`w-4 h-4 ${isSelected ? 'text-indigo-200' : 'text-emerald-500'}`} /> Empty</div>
                      <div className={`text-xs font-bold mt-1 ${isSelected ? 'text-indigo-200' : 'text-emerald-600/70'}`}>Ready for admission</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </aside>

      {/* RIGHT PANE: Intake Configuration (60%) */}
      <main className="flex-1 bg-white rounded-2xl flex flex-col border border-slate-200 shadow-sm overflow-hidden relative">
        {!selectedCage ? (
          <div className="flex-1 flex flex-col items-center justify-center relative opacity-60">
            <Home className="h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-sm font-extrabold text-slate-500">Select an Empty Space</h3>
            <p className="text-xs font-medium mt-1 text-slate-400">Choose a kennel or condo from the board to initiate intake.</p>
          </div>
        ) : (
          <form onSubmit={handleOpenGuard} className="flex-1 flex flex-col relative h-full">
            <div className="bg-slate-50 p-6 border-b border-slate-200 shrink-0 shadow-sm">
              <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                Intake Configuration: <span className="text-indigo-600">{selectedCage}</span>
              </h2>
              <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">Complete patient link and boarding parameters</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              <div className="space-y-4">
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">Select Patient *</label>
                  <input 
                    type="text"
                    list="patient-list"
                    value={selectedPatientId ? uniquePatients.find(p => p.id === selectedPatientId)?.name : ''}
                    onChange={(e) => {
                      const selected = uniquePatients.find(p => p.name === e.target.value);
                      if (selected) setSelectedPatientId(selected.id);
                      else setSelectedPatientId('');
                    }}
                    placeholder="Search by Patient Name..."
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition-all"
                  />
                  <datalist id="patient-list">
                    {uniquePatients.map(p => (
                      <option key={p.id} value={p.name}>{p.breed}</option>
                    ))}
                  </datalist>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Expected Checkout Date *</label>
                  <input 
                    type="date" required min={new Date().toISOString().split('T')[0]}
                    value={checkOutDate} onChange={e => setCheckOutDate(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2 border border-slate-200 p-4 rounded-2xl bg-slate-50">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block text-center mb-3">Dietary Plan</label>
                  <div className="flex rounded-xl overflow-hidden shadow-sm border border-slate-200">
                    <button type="button" onClick={() => setFoodType('without_food')} className={`flex-1 py-2 text-xs font-bold transition-colors ${foodType === 'without_food' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
                      Without Food
                    </button>
                    <button type="button" onClick={() => setFoodType('with_food')} className={`flex-1 py-2 text-xs font-bold transition-colors ${foodType === 'with_food' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
                      With Food
                    </button>
                  </div>
                </div>

                <div className="space-y-2 border border-slate-200 p-4 rounded-2xl bg-slate-50">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block text-center mb-3">Boarding Level</label>
                  <div className="flex rounded-xl overflow-hidden shadow-sm border border-slate-200">
                    <button type="button" onClick={() => setMedicalBoarding(false)} className={`flex-1 py-2 text-xs font-bold transition-colors ${!medicalBoarding ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
                      Standard
                    </button>
                    <button type="button" onClick={() => setMedicalBoarding(true)} className={`flex-1 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-1 ${medicalBoarding ? 'bg-rose-600 text-white' : 'bg-white text-rose-600 hover:bg-rose-50'}`}>
                      <Activity className="w-3 h-3" /> Medical
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex gap-3 items-start">
                <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest mb-1">Financial Notice</h4>
                  <p className="text-xs text-amber-700 font-semibold leading-relaxed">Booking this space will immediately generate a mandatory admission deposit in the POS billing queue. The space will be locked until checkout.</p>
                </div>
              </div>

            </div>
            
            <div className="p-6 border-t border-slate-100 bg-white shrink-0 flex justify-end">
               <button type="submit" className="px-8 py-3 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-xl cursor-pointer shadow-md transition-colors text-xs uppercase tracking-wide">
                 Initiate Booking Process
               </button>
            </div>
          </form>
        )}
      </main>

      {/* MODAL: Mandatory Deposit Guard */}
      {showDepositGuard && createPortal(
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowDepositGuard(false)}>
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-6 shadow-2xl animate-scale-up" onClick={e => e.stopPropagation()}>
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto shadow-inner"><AlertTriangle className="w-10 h-10 animate-pulse" /></div>
            
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-tight">Mandatory Admission Deposit</h3>
              <p className="text-slate-500 text-xs font-semibold mt-2 px-2">System protocol requires a deposit to secure {selectedCage} and lock the patient into the ward flowsheet.</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount Required</div>
              <div className="text-3xl font-mono font-black text-slate-800 mt-1">LKR 15,000</div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowDepositGuard(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleConfirmBooking} className="flex-[2] py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition-colors">Collect & Lock Cage</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: Discharge Confirmation */}
      {dischargeModalCage && createPortal(
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDischargeModalCage(null)}>
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-6 shadow-2xl animate-scale-up" onClick={e => e.stopPropagation()}>
            <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-inner"><CheckCircle2 className="w-10 h-10" /></div>
            
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-tight">Confirm Discharge</h3>
              <p className="text-slate-500 text-xs font-semibold mt-2 px-2">Are you sure you want to discharge {activeBoardingMap.get(dischargeModalCage)?.pet?.name || 'this patient'} from {dischargeModalCage}? This will free the cage immediately.</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setDischargeModalCage(null)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={() => handleDischarge(dischargeModalCage)} className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition-colors cursor-pointer">Confirm Discharge</button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
