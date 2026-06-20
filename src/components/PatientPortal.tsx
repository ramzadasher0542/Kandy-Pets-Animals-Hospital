/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, PawPrint, Activity, HeartPulse, TestTube, Syringe, 
  Edit2, CheckCircle2, X, User, PenTool, Database, Clock
} from 'lucide-react';
import { MedicalRecord, PetClassification } from '../types';
import { formatDisplayDate } from '../utils/time';
import { showToast } from './Toast';

interface PatientPortalProps {
  records: MedicalRecord[];
  onUpdateRecord?: (record: MedicalRecord) => void;
  onGoToRecords?: (patientId: string) => void;
  onGenerateConsent?: (clientName: string, petName: string) => void;
}

export default function PatientPortal({ 
  records, 
  onUpdateRecord, 
  onGoToRecords, 
  onGenerateConsent 
}: PatientPortalProps) {
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [passportTab, setPassportTab] = useState<'timeline' | 'exams' | 'labs' | 'vaccines'>('timeline');
  const [showQueueOnly, setShowQueueOnly] = useState(false);

  // Edit Master Identity State
  const [showEditPetModal, setShowEditPetModal] = useState(false);
  const [editPetData, setEditPetData] = useState({
    petName: '', petType: 'Canine' as PetClassification, breed: '', sex: 'Unknown', weight: 0, age: ''
  });

  const todayStr = new Date().toISOString().split('T')[0];

  // ---------------------------------------------------------
  // SMART PET DIRECTORY LOGIC
  // ---------------------------------------------------------
  const displayPets = useMemo(() => {
    const petMap = new Map<string, MedicalRecord>();
    records.forEach(r => {
      // Find the most recent record for each patient identity
      if (!petMap.has(r.patientId) || new Date(r.visitDate) > new Date(petMap.get(r.patientId)!.visitDate)) {
        petMap.set(r.patientId, r);
      }
    });

    let activeList = Array.from(petMap.values());

    if (showQueueOnly) {
      activeList = activeList.filter(p => records.some(r => r.patientId === p.patientId && r.visitDate === todayStr));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      activeList = activeList.filter(p => 
        p.petName.toLowerCase().includes(q) || 
        p.ownerName.toLowerCase().includes(q) ||
        p.ownerPhone.includes(q)
      );
    }

    return activeList.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
  }, [records, showQueueOnly, searchQuery, todayStr]);

  // ---------------------------------------------------------
  // PASSPORT AGGREGATION LOGIC
  // ---------------------------------------------------------
  const petRecords = selectedPatientId 
    ? records.filter(r => r.patientId === selectedPatientId).sort((a,b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()) 
    : [];
  
  const activePet = petRecords.length > 0 ? petRecords[0] : null;

  const allPetLabs = petRecords.flatMap(r => (r.labResults || []).map(l => ({ ...l, visitDate: r.visitDate })));
  const allPetVax = petRecords.flatMap(r => (r.vaccinations || []).map(v => ({ ...v, visitDate: r.visitDate })));

  // ---------------------------------------------------------
  // IDENTITY MUTATION ENGINE
  // ---------------------------------------------------------
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
    if (!onUpdateRecord || !selectedPatientId) {
      showToast('Record update engine unavailable.', 'error');
      return;
    }

    // BULK MASTER-SYNC: Propagate changes across ALL historical E.H.R
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
    showToast('Patient Identity synchronized across all medical records.', 'success');
  };

  // ---------------------------------------------------------
  // UI RENDERERS
  // ---------------------------------------------------------
  return (
    <div className="flex h-full w-full gap-4 overflow-hidden" id="patient-portal-container">
      
      {/* LEFT PANE: PET DIRECTORY & QUEUE */}
      <aside className="w-1/3 min-w-[320px] max-w-[400px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
        <div className="p-5 border-b border-slate-100 bg-slate-50 shrink-0 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
              <PawPrint className="w-4 h-4 text-indigo-600" /> Patient Portal
            </h2>
            <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 shadow-xs">
              <button onClick={() => setShowQueueOnly(true)} className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-colors ${showQueueOnly ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>In Clinic</button>
              <button onClick={() => setShowQueueOnly(false)} className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-colors ${!showQueueOnly ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>All Pets</button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" placeholder="Search Pet or Owner..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-xs" 
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-slate-50/30">
          {displayPets.length === 0 ? (
            <div className="text-center py-10 text-slate-400 font-bold text-xs">No patients found.</div>
          ) : (
            displayPets.map(pet => (
              <div 
                key={pet.patientId} onClick={() => setSelectedPatientId(pet.patientId)}
                className={`p-4 rounded-2xl cursor-pointer transition-all border ${selectedPatientId === pet.patientId ? 'bg-indigo-600 border-indigo-700 shadow-md text-white' : 'bg-white border-slate-200 hover:border-indigo-300 shadow-sm'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className={`font-black truncate text-sm ${selectedPatientId === pet.patientId ? 'text-white' : 'text-slate-800'}`}>{pet.petName}</div>
                  {showQueueOnly && <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${selectedPatientId === pet.patientId ? 'bg-indigo-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>Queued</span>}
                </div>
                <div className={`text-[10px] font-bold ${selectedPatientId === pet.patientId ? 'text-indigo-200' : 'text-slate-500'}`}>{pet.petType} • {pet.breed}</div>
                <div className={`text-[10px] font-semibold mt-2 pt-2 border-t flex items-center gap-1.5 ${selectedPatientId === pet.patientId ? 'text-indigo-100 border-indigo-500' : 'text-slate-400 border-slate-100'}`}>
                  <User className="w-3 h-3" /> {pet.ownerName}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* RIGHT PANE: THE PASSPORT DOSSIER */}
      <main className="flex-1 bg-slate-50 rounded-2xl flex flex-col border border-slate-200 shadow-sm overflow-hidden relative">
        {!activePet ? (
          <div className="flex-1 flex flex-col items-center justify-center relative opacity-50">
            <Database className="h-16 w-16 text-slate-300 mb-4" />
            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Select a Patient to view Passport</h3>
          </div>
        ) : (
          <div className="flex-1 flex flex-col relative overflow-hidden animate-fade-in">
            
            {/* PASSPORT HEADER */}
            <div className="bg-white border-b border-slate-200 shrink-0 shadow-sm z-10">
              <div className="px-6 py-4 flex items-center justify-end border-b border-slate-100 bg-slate-50/50">
                <div className="flex gap-2">
                   {onGoToRecords && (
                     <button onClick={() => onGoToRecords(activePet.id)} className="px-4 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer">
                       <Activity className="w-3.5 h-3.5"/> Open Current E.H.R
                     </button>
                   )}
                   {onGenerateConsent && (
                     <button onClick={() => onGenerateConsent(activePet.ownerName, activePet.petName)} className="px-4 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer">
                       <PenTool className="w-3.5 h-3.5"/> Sign Waiver
                     </button>
                   )}
                </div>
              </div>
              
              <div className="p-6 flex flex-wrap xl:flex-nowrap gap-6 items-center justify-between">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center border border-indigo-200 shadow-inner">
                    <PawPrint className="w-8 h-8 text-indigo-500" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                      {activePet.petName}
                      <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest border border-slate-200">ID: {activePet.patientId.split('_')[0].toUpperCase()}</span>
                    </h2>
                    <div className="flex items-center gap-3 mt-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      <span>{activePet.petType}</span>
                      {activePet.breed && <><span className="w-1 h-1 rounded-full bg-slate-300"></span><span>{activePet.breed}</span></>}
                      <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                      <span className="flex items-center gap-1"><User className="w-3 h-3"/> {activePet.ownerName}</span>
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

              {/* PASSPORT NAVIGATION */}
              <div className="flex px-6 gap-2 mt-2">
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
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50">
              
              {/* TAB: TIMELINE */}
              {passportTab === 'timeline' && (
                <div className="space-y-4 max-w-4xl animate-fade-in mx-auto">
                  {petRecords.length === 0 && <div className="text-center py-10 text-slate-400 font-bold text-xs border border-dashed border-slate-200 rounded-2xl">No clinical history found.</div>}
                  {petRecords.map((record, idx) => (
                    <div key={record.id} className="relative pl-8 pb-8 group">
                      {idx !== petRecords.length - 1 && <div className="absolute left-3.5 top-8 bottom-0 w-0.5 bg-slate-200 group-hover:bg-indigo-200 transition-colors"></div>}
                      <div className="absolute left-1.5 top-1.5 w-4 h-4 rounded-full border-4 border-white bg-indigo-400 shadow-sm group-hover:scale-125 transition-transform"></div>
                      
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="text-xs font-black text-slate-800 flex items-center gap-2">
                              {formatDisplayDate(record.visitDate)}
                              {record.visitDate === todayStr && <span className="bg-emerald-100 text-emerald-700 text-[8px] px-1.5 py-0.5 rounded uppercase tracking-widest">Today</span>}
                            </div>
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
                          <div className="text-xs font-bold text-slate-700 leading-relaxed">
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

              {/* TAB: SYSTEMIC EXAMS */}
              {passportTab === 'exams' && (
                <div className="space-y-4 max-w-4xl animate-fade-in mx-auto">
                  {petRecords.filter(r => r.physicalExam).length === 0 && <div className="text-center py-10 text-slate-400 font-bold text-xs border border-dashed border-slate-200 rounded-2xl">No systemic examinations recorded.</div>}
                  {petRecords.filter(r => r.physicalExam).map(record => {
                    const exam = record.physicalExam!;
                    const abnormalSystems = Object.entries(exam).filter(([_, data]) => !data.isNormal || (data.abnormalities && data.abnormalities.length > 0));
                    
                    return (
                      <div key={record.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="text-xs font-black text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400"/> {formatDisplayDate(record.visitDate)} Systemic Review
                        </div>
                        
                        {abnormalSystems.length === 0 ? (
                          <div className="bg-emerald-50 text-emerald-700 text-xs font-bold p-3 rounded-xl border border-emerald-100 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4"/> All Systems Marked Normal
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {abnormalSystems.map(([systemKey, data]) => (
                              <div key={systemKey} className="bg-rose-50/30 p-3 rounded-xl border border-rose-100">
                                <div className="text-[10px] font-black text-rose-800 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                  <AlertTriangle className="w-3 h-3"/> {systemKey.replace(/([A-Z])/g, ' $1').trim()}
                                </div>
                                <ul className="list-disc list-inside text-xs font-bold text-rose-600 pl-1 space-y-1">
                                  {data.abnormalities?.map((ab, i) => <li key={i}>{ab}</li>)}
                                </ul>
                                {data.notes && <div className="text-[10px] font-medium text-rose-700 mt-2 italic border-t border-rose-100 pt-2">"{data.notes}"</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* TAB: LABS */}
              {passportTab === 'labs' && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-fade-in max-w-4xl mx-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase tracking-widest font-black text-[9px]">
                        <th className="py-4 px-5">Date</th>
                        <th className="py-4 px-5">Diagnostic Test</th>
                        <th className="py-4 px-5">Status</th>
                        <th className="py-4 px-5">Results / Matrix</th>
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
                                 <div className="text-[10px] font-bold text-slate-600 line-clamp-2">
                                   {lab.value?.startsWith('{') ? 'Structured Parameters Logged' : (lab.notes || 'Results recorded in main lab module.')}
                                 </div>
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

              {/* TAB: VACCINES */}
              {passportTab === 'vaccines' && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-fade-in max-w-4xl mx-auto">
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
        )}
      </main>

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

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}