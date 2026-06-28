/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Home, Search, Calendar, Activity, Info, ShieldAlert, CheckCircle2, PawPrint, X, AlertTriangle, Lock
} from 'lucide-react';
import { MedicalRecord, BoardingRecord } from '../types';
import { showToast } from './Toast';

interface BoardingManagerProps {
  records: MedicalRecord[];
  onUpdateRecord: (record: MedicalRecord) => void;
}

const KENNEL_SPACES = Array.from({ length: 10 }, (_, i) => `Kennel ${i + 1}`);
const CONDO_SPACES = ['Cat Condo A', 'Cat Condo B', 'Cat Condo C'];
const ALL_SPACES = [...KENNEL_SPACES, ...CONDO_SPACES];

export default function BoardingManager({ records, onUpdateRecord }: BoardingManagerProps) {
  
  // Intake Form State
  const [selectedCage, setSelectedCage] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [checkOutDate, setCheckOutDate] = useState<string>('');
  const [foodType, setFoodType] = useState<'without_food' | 'with_food'>('without_food');
  const [medicalBoarding, setMedicalBoarding] = useState<boolean>(false);
  
  // Guardrail State
  const [showDepositGuard, setShowDepositGuard] = useState(false);

  // Derive unique patients & active boarding map
  const { uniquePatients, activeBoardingMap } = useMemo(() => {
    const patientMap = new Map<string, MedicalRecord>();
    const cageMap = new Map<string, MedicalRecord>();

    records.forEach(r => {
      // Keep latest record for patient dropdown
      if (!patientMap.has(r.patientId) || new Date(r.visitDate) > new Date(patientMap.get(r.patientId)!.visitDate)) {
        patientMap.set(r.patientId, r);
      }
      // Check active boarding
      if (r.boardingInfo && r.boardingInfo.status === 'active') {
        cageMap.set(r.boardingInfo.cageNumber, r);
      }
    });

    return { 
      uniquePatients: Array.from(patientMap.values()),
      activeBoardingMap: cageMap
    };
  }, [records]);

  // FIXED: Discharge handler — was completely missing, pets were trapped forever
  const handleDischarge = (cage: string) => {
    const occupantRecord = activeBoardingMap.get(cage);
    if (!occupantRecord || !occupantRecord.boardingInfo) return;
    if (!window.confirm(`Discharge ${occupantRecord.petName} from ${cage}? This will free the cage.`)) return;

    const updatedRecord: MedicalRecord = {
      ...occupantRecord,
      boardingInfo: {
        ...occupantRecord.boardingInfo,
        status: 'discharged'
      }
    };
    onUpdateRecord(updatedRecord);
    showToast(`${occupantRecord.petName} discharged from ${cage}. Cage is now available.`, 'success');
    setSelectedCage(null);
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

  const handleConfirmBooking = () => {
    if (!selectedCage || !selectedPatientId) return;

    const patientRecord = uniquePatients.find(p => p.patientId === selectedPatientId);
    if (!patientRecord) return;

    const newBoardingInfo: BoardingRecord = {
      id: crypto.randomUUID(),
      cageNumber: selectedCage,
      checkInDate: new Date().toISOString().split('T')[0],
      expectedCheckOut: checkOutDate,
      status: 'active',
      foodType,
      medicalBoarding,
      depositPaid: true
    };

    // Bug #2 Fix: Calculate actual boarding days from check-in to expected checkout
    const checkIn = new Date(newBoardingInfo.checkInDate);
    const checkOut = new Date(checkOutDate);
    const diffMs = checkOut.getTime() - checkIn.getTime();
    const boardingDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    // POS Billing Trap Injection
    const billingItems = [
      { itemId: 'boarding_deposit', name: '[DEPOSIT] Admission Hold', dosage: '1', quantity: 1 },
      { itemId: 'boarding_rate', name: `[BOARDING] Base Rate (${boardingDays} Day${boardingDays > 1 ? 's' : ''})`, dosage: `${boardingDays} Day${boardingDays > 1 ? 's' : ''}`, quantity: boardingDays }
    ];

    const updatedRecord: MedicalRecord = {
      ...patientRecord,
      boardingInfo: newBoardingInfo,
      prescribedMeds: [...(patientRecord.prescribedMeds || []), ...billingItems]
    };

    onUpdateRecord(updatedRecord);
    showToast(`Patient booked into ${selectedCage}. POS queue updated.`, 'success');
    
    // Reset
    setShowDepositGuard(false);
    setSelectedCage(null);
    setSelectedPatientId('');
    setCheckOutDate('');
    setFoodType('without_food');
    setMedicalBoarding(false);
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
                    <div key={cage} className="p-3 border-2 border-rose-200 bg-rose-50 rounded-xl relative overflow-hidden">
                      <div className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-1">{cage}</div>
                      <div className="font-extrabold text-slate-800 text-sm truncate">{occupant.petName}</div>
                      <div className="text-[10px] font-bold text-slate-500 truncate">{occupant.ownerName}</div>
                      <button onClick={() => handleDischarge(cage)} className="mt-2 w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-colors cursor-pointer">Discharge</button>
                      <div className="absolute top-0 right-0 w-8 h-8 bg-rose-100 flex items-center justify-center rounded-bl-xl">
                        <Lock className="w-3 h-3 text-rose-500" />
                      </div>
                    </div>
                  );
                }

                return (
                  <div 
                    key={cage} onClick={() => setSelectedCage(cage)}
                    className={`p-3 border-2 rounded-xl transition-all cursor-pointer ${isSelected ? 'border-indigo-500 bg-indigo-50 shadow-md transform scale-[1.02]' : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'}`}
                  >
                    <div className="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-1">{cage}</div>
                    <div className="font-extrabold text-emerald-900 text-sm flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Empty</div>
                    <div className="text-[10px] font-bold text-emerald-600 opacity-70">Ready for admission</div>
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
                    <div key={cage} className="p-3 border-2 border-rose-200 bg-rose-50 rounded-xl relative overflow-hidden">
                      <div className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-1">{cage}</div>
                      <div className="font-extrabold text-slate-800 text-sm truncate">{occupant.petName}</div>
                      <div className="text-[10px] font-bold text-slate-500 truncate">{occupant.ownerName}</div>
                      <button onClick={() => handleDischarge(cage)} className="mt-2 w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-colors cursor-pointer">Discharge</button>
                      <div className="absolute top-0 right-0 w-8 h-8 bg-rose-100 flex items-center justify-center rounded-bl-xl">
                        <Lock className="w-3 h-3 text-rose-500" />
                      </div>
                    </div>
                  );
                }

                return (
                  <div 
                    key={cage} onClick={() => setSelectedCage(cage)}
                    className={`p-3 border-2 rounded-xl transition-all cursor-pointer ${isSelected ? 'border-indigo-500 bg-indigo-50 shadow-md transform scale-[1.02]' : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'}`}
                  >
                    <div className="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-1">{cage}</div>
                    <div className="font-extrabold text-emerald-900 text-sm flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Empty</div>
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
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">Select Patient *</label>
                  <select 
                    value={selectedPatientId} onChange={e => setSelectedPatientId(e.target.value)} required
                    className="w-full px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-black text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="" disabled>-- Choose registered patient --</option>
                    {uniquePatients.map(p => (
                      <option key={p.patientId} value={p.patientId}>{p.petName} (Owner: {p.ownerName} - {p.ownerPhone})</option>
                    ))}
                  </select>
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

    </div>
  );
}
