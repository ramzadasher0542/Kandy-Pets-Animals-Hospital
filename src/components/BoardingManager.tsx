/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Modal } from './ui/Modal';
import {
  Home, Activity, Info, CheckCircle2, AlertTriangle, Lock, Utensils, Stethoscope, Pill, Receipt
} from 'lucide-react';
import { MedicalRecord, BoardingRecord, Pet, Client, ClinicQueueItem, InventoryItem, ActiveShift, User } from '../types';
import { BoardingPricingProfile } from '../types';
import { showToast } from './Toast';
import { fetchBoardingRecords, recordBoardingCharge, settleBoardingAccount, startBoardingAdmission, updateBoardingCare } from '../lib/db';
import PageShell from './ui/PageShell';
import { sortQueueByUrgency } from '../lib/queueUtils';
import { formatRupees, parseWholeRupees } from '../utils/currency';

interface BoardingProps {
  systemConfig: any;
  clients: Client[];
  pets: Pet[];
  records: MedicalRecord[];
  clinicQueue?: ClinicQueueItem[];
  inventory?: InventoryItem[];
  onUpdateStock?: (itemId: string, qtyDelta: number) => Promise<void>;
  onUpdateRecord: (record: MedicalRecord) => void;
  onDischargeToQueue?: (item: ClinicQueueItem) => Promise<void>;
  activeShift?: ActiveShift | null;
  currentUser?: User | null;
  onChangeConfig?: (config: any) => Promise<void>;
  onSaveBoardingPricing?: (profile: BoardingPricingProfile) => Promise<void>;
}

const KENNEL_SPACES = Array.from({ length: 10 }, (_, i) => `Kennel ${i + 1}`);
const CONDO_SPACES = ['Cat Condo A', 'Cat Condo B', 'Cat Condo C'];
const ALL_SPACES = [...KENNEL_SPACES, ...CONDO_SPACES];

const DEFAULT_BOARDING_PRICING: BoardingPricingProfile = {
  enabled: true,
  billing_unit: 'night',
  cat_no_food_cents: 0,
  cat_with_food_cents: 0,
  dog_no_food_cents: 0,
  dog_with_food_cents: 0,
  cat_litter_cents: 0,
  dog_litter_cents: 0,
  milk_cup_cents: 0,
  default_deposit_cents: 0,
  doctor_round_cents: 0,
  cleaning_cents_per_day: 0,
  late_checkout_cents: 0,
  allow_food_charge: true,
  allow_litter_charge: true,
  allow_medical_boarding: true,
  allow_doctor_rounds: true,
  allow_cleaning_fee: true,
  allow_medication_charge: true,
  allow_late_checkout_fee: false,
};

export default function BoardingManager({ systemConfig, clients, pets = [], records, clinicQueue = [], inventory = [], onUpdateStock, onUpdateRecord, onDischargeToQueue, activeShift, currentUser, onChangeConfig, onSaveBoardingPricing }: BoardingProps) {
  
  // Intake Form State
  const [selectedCage, setSelectedCage] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [checkOutDate, setCheckOutDate] = useState<string>('');
  const [foodType, setFoodType] = useState<'without_food' | 'with_food'>('without_food');
  const [admissionFoodItemId, setAdmissionFoodItemId] = useState<string>('');
  const [hospitalProvidesLitter, setHospitalProvidesLitter] = useState<boolean>(false);
  const [medicalBoarding, setMedicalBoarding] = useState<boolean>(false);
  const [estimatedStayDays, setEstimatedStayDays] = useState<number>(1);
  const legacyRates = systemConfig?.boardingRates || {};
  const configuredPricing: BoardingPricingProfile = systemConfig?.boardingPricing || {
    ...DEFAULT_BOARDING_PRICING,
    cat_no_food_cents: legacyRates.catNofoodCents || 0,
    cat_with_food_cents: legacyRates.catWithfoodCents || 0,
    dog_no_food_cents: legacyRates.dogNofoodCents || 0,
    dog_with_food_cents: legacyRates.dogWithfoodCents || 0,
    cat_litter_cents: legacyRates.catLitterCents || 0,
    dog_litter_cents: legacyRates.dogLitterCents || 0,
    milk_cup_cents: legacyRates.milkCupCents || 0,
    default_deposit_cents: systemConfig?.defaultDepositCents || 1500000,
  };
  const depositCents = configuredPricing.default_deposit_cents;
  const [pricingDraft, setPricingDraft] = useState<BoardingPricingProfile>(configuredPricing);
  const [isSavingRates, setIsSavingRates] = useState(false);

  React.useEffect(() => {
    setPricingDraft(configuredPricing);
  }, [systemConfig]);

  const saveBoardingRates = async () => {
    if (!onSaveBoardingPricing) return;
    setIsSavingRates(true);
    try {
      await onSaveBoardingPricing(pricingDraft);
      showToast('Boarding rates saved.', 'success');
    } catch (error: any) {
      showToast(`Boarding rates failed: ${error?.message || 'Unknown error'}`, 'error');
    } finally {
      setIsSavingRates(false);
    }
  };
  
  // Guardrail State
  const [showDepositGuard, setShowDepositGuard] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  const [boardingRecords, setBoardingRecords] = useState<BoardingRecord[]>([]);

  React.useEffect(() => {
    fetchBoardingRecords().then(setBoardingRecords).catch((e) => { if (import.meta.env.DEV) console.error(e); });
  }, []);

  const calculateDailyRate = (pet: Pet | undefined, food: 'without_food' | 'with_food', litter: boolean, profile = configuredPricing) => {
    if (!pet || !profile) return 0;
    const safeRate = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
    let cost = 0;
    const isCat = pet.petType?.toLowerCase() === 'cat' || pet.petType?.toLowerCase() === 'feline';
    const isDog = pet.petType?.toLowerCase() === 'dog' || pet.petType?.toLowerCase() === 'canine';

    if (isCat) {
      cost = safeRate(food === 'with_food' ? profile.cat_with_food_cents : profile.cat_no_food_cents);
      if (litter) cost += safeRate(profile.cat_litter_cents);
    } else if (isDog) {
      cost = safeRate(food === 'with_food' ? profile.dog_with_food_cents : profile.dog_no_food_cents);
      if (litter) cost += safeRate(profile.dog_litter_cents);
    }
    return cost;
  };

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

  // Feeding plan modal state
  const [feedingModalCage, setFeedingModalCage] = useState<string | null>(null);
  const [feedingItemId, setFeedingItemId] = useState<string>('');
  const [feedingQtyPerMeal, setFeedingQtyPerMeal] = useState<number>(1);
  const [feedingMealsPerDay, setFeedingMealsPerDay] = useState<number>(3);

  const foodInventory = useMemo(() => inventory.filter(i => i.category === 'food' && i.stock > 0), [inventory]);

  // Medication log modal state (Admission only)
  const [medModalCage, setMedModalCage] = useState<string | null>(null);
  const [medItemId, setMedItemId] = useState<string>('');
  const [medQty, setMedQty] = useState<number>(1);

  // Active stays show a transparent estimate; final totals come from the
  // settlement RPC using the server's actual checkout date and price snapshot.
  const computeCharges = (b: BoardingRecord) => {
    if (b.status === 'discharged') return Number(b.totalChargesCents || 0);
    const profile = b.pricingSnapshot || configuredPricing;
    const pet = pets.find(item => item.id === b.petId);
    const checkIn = new Date(`${b.checkInDate}T00:00:00Z`).getTime();
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const nights = Number.isFinite(checkIn) ? Math.max(1, Math.ceil((todayUtc - checkIn) / 86_400_000)) : 1;
    const base = calculateDailyRate(pet, b.foodType, b.hospitalProvidesLitter || false, profile) * nights;
    const cleaning = b.medicalBoarding && profile.allow_cleaning_fee
      ? profile.cleaning_cents_per_day * nights
      : 0;
    const todayDate = new Date(todayUtc).toISOString().split('T')[0];
    const lateCheckout = profile.allow_late_checkout_fee
      && b.expectedCheckOut
      && todayDate > b.expectedCheckOut
      ? profile.late_checkout_cents
      : 0;
    const events = (b.billingItems || [])
      .filter(i => !['admission_deposit', 'additional_charges', 'settlement_refund'].includes(i.itemId))
      .reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
    return base + cleaning + lateCheckout + events;
  };

  const countDoctorRounds = (b: BoardingRecord) =>
    (b.billingItems || []).filter(i => i.itemId === 'doctor_round').length;

  const handleLogDoctorRound = async (cage: string) => {
    const occupant = activeBoardingMap.get(cage);
    if (!occupant) return;
    try {
      const updated = await recordBoardingCharge(occupant.boarding.id, 'doctor_round', 1);
      setBoardingRecords(prev => prev.map(b => b.id === updated.id ? updated : b));
      const fee = updated.billingItems?.at(-1)?.price || 0;
      showToast(`Doctor round logged (Rs. ${formatRupees(Number(fee) / 100)}).`, 'success');
    } catch (error: any) {
      showToast(`Doctor round failed: ${error?.message || error}`, 'error');
    }
  };

  const openMedModal = (cage: string) => {
    setMedItemId('');
    setMedQty(1);
    setMedModalCage(cage);
  };

  const handleLogMedication = async () => {
    if (!medModalCage) return;
    const occupant = activeBoardingMap.get(medModalCage);
    if (!occupant) return;
    if (!medItemId) { showToast('Select a medication item.', 'error'); return; }
    if (medQty <= 0) { showToast('Quantity must be positive.', 'error'); return; }
    const item = inventory.find(i => i.id === medItemId);
    if (!item) { showToast('Medication item not found in inventory.', 'error'); return; }
    try {
      const updated = await recordBoardingCharge(occupant.boarding.id, 'medication', medQty, medItemId);
      setBoardingRecords(prev => prev.map(b => b.id === updated.id ? updated : b));
    } catch (err: any) {
      showToast(`Stock update failed: ${err?.message || err}`, 'error');
      return;
    }
    showToast('Medication logged. Stock updated.', 'success');
    setMedModalCage(null);
  };

  const openFeedingModal = (cage: string) => {
    const occupant = activeBoardingMap.get(cage);
    const plan = occupant?.boarding.feedingPlan;
    setFeedingItemId(plan?.inventoryItemId || '');
    setFeedingQtyPerMeal(plan?.quantityPerMeal ?? 1);
    setFeedingMealsPerDay(plan?.mealsPerDay ?? 3);
    setFeedingModalCage(cage);
  };

  const handleSaveFeedingPlan = async () => {
    if (!feedingModalCage) return;
    const occupant = activeBoardingMap.get(feedingModalCage);
    if (!occupant) return;
    if (!feedingItemId) { showToast('Select a food item.', 'error'); return; }
    if (feedingQtyPerMeal <= 0 || feedingMealsPerDay <= 0) { showToast('Quantities must be positive.', 'error'); return; }
    const item = foodInventory.find(i => i.id === feedingItemId);
    if (!item) { showToast('Food item not found in inventory.', 'error'); return; }

    const updated: BoardingRecord = {
      ...occupant.boarding,
      feedingPlan: {
        inventoryItemId: item.id,
        itemName: item.name,
        quantityPerMeal: feedingQtyPerMeal,
        mealsPerDay: feedingMealsPerDay,
      }
    };
    const persisted = await updateBoardingCare(updated.id, updated.feedingPlan);
    setBoardingRecords(prev => prev.map(b => b.id === persisted.id ? persisted : b));
    showToast(`Feeding plan set: ${item.name} — ${feedingQtyPerMeal}/meal × ${feedingMealsPerDay}/day.`, 'success');
    setFeedingModalCage(null);
  };

  const handleLogFeeding = async (cage: string) => {
    const occupant = activeBoardingMap.get(cage);
    if (!occupant) return;
    const plan = occupant.boarding.feedingPlan;
    if (!plan) { showToast('No feeding plan set', 'error'); return; }
    try {
      const updated = await recordBoardingCharge(occupant.boarding.id, 'food', plan.quantityPerMeal, plan.inventoryItemId);
      setBoardingRecords(prev => prev.map(b => b.id === updated.id ? updated : b));
    } catch (err: any) {
      showToast(`Stock update failed: ${err?.message || err}`, 'error');
      return;
    }
    showToast('Feeding logged. Stock updated.', 'success');
  };

  const handleDischargeSettle = async (cage: string) => {
    if (isSettling) return;
    const occupant = activeBoardingMap.get(cage);
    if (!occupant || !occupant.boarding) return;
    const b = occupant.boarding;

    if (!activeShift || !currentUser) {
      showToast('Open a shift before settling a boarding account.', 'error');
      return;
    }

    setIsSettling(true);
    try {
      const result = await settleBoardingAccount(b.id, activeShift.id);
      setBoardingRecords(prev => prev.map(r => r.id === result.boarding.id ? result.boarding : r));
      const balance = Number(result.balance_cents || 0);
      const toastMsg = balance < 0
        ? `Discharged. Additional cash recorded: Rs. ${formatRupees(Math.abs(balance) / 100)}.`
        : balance > 0
          ? `Discharged. Refund: Rs. ${formatRupees(balance / 100)}`
          : 'Discharged. Settled exactly — no balance.';
      showToast(toastMsg, 'success');
    } catch (err: any) {
      const message = err?.message === 'OPEN_SHIFT_REQUIRED' ? 'Open a shift before settling a boarding account.' : `Boarding settlement failed: ${err?.message || err}`;
      showToast(message, 'error');
      setIsSettling(false);
      return;
    }

    setSelectedCage(null);
    setDischargeModalCage(null);
    setIsSettling(false);
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
    if (isSaving) return;
    if (!selectedCage || !selectedPatientId) return;

    if (!activeShift || !currentUser) {
      showToast('Open a shift before collecting the boarding deposit.', 'error');
      return;
    }

    const patient = uniquePatients.find(p => p.id === selectedPatientId);
    if (!patient) return;

    setIsSaving(true);

    // Snapshot today's cage rate for this pet/food/litter configuration
    if (!configuredPricing.enabled) {
      showToast('Boarding is disabled for this clinic.', 'error');
      setIsSaving(false);
      return;
    }
    if (foodType === 'with_food' && !configuredPricing.allow_food_charge) {
      showToast('Clinic-provided food is disabled in boarding pricing.', 'error');
      setIsSaving(false);
      return;
    }
    if (hospitalProvidesLitter && !configuredPricing.allow_litter_charge) {
      showToast('Hospital-provided litter is disabled in boarding pricing.', 'error');
      setIsSaving(false);
      return;
    }
    if (medicalBoarding && !configuredPricing.allow_medical_boarding) {
      showToast('Medical boarding is disabled for this clinic.', 'error');
      setIsSaving(false);
      return;
    }

    const cageFeePerDayCents = calculateDailyRate(patient, foodType, hospitalProvidesLitter, configuredPricing);
    if (cageFeePerDayCents <= 0) {
      showToast('Configure a positive boarding rate for this patient type before admission.', 'error');
      setIsSaving(false);
      return;
    }

    const admissionFood = foodType === 'with_food'
      ? foodInventory.find(item => item.id === admissionFoodItemId)
      : undefined;
    if (foodType === 'with_food' && !admissionFood) {
      showToast('Select an in-stock food item before admitting a patient with food.', 'error');
      return;
    }

    // Intake charges the flat deposit only; all other charges accumulate against it.
    const billingItems = [
      { itemId: 'admission_deposit', name: 'Admission/Boarding Deposit (Refundable)', price: depositCents, quantity: 1, category: 'service' }
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
      hospitalProvidesLitter,
      billingItems: billingItems,
      feedingPlan: admissionFood ? {
        inventoryItemId: admissionFood.id,
        itemName: admissionFood.name,
        quantityPerMeal: 1,
        mealsPerDay: 3,
      } : undefined,
      estimatedStayDays: Math.max(1, estimatedStayDays || 1),
      depositAmountCents: depositCents,
      totalChargesCents: 0,
      cageFeePerDayCents,
      cleaningFeePerDayCents: medicalBoarding && configuredPricing.allow_cleaning_fee ? configuredPricing.cleaning_cents_per_day : 0,
      doctorFeePerVisitCents: medicalBoarding && configuredPricing.allow_doctor_rounds ? configuredPricing.doctor_round_cents : 0,
    };

    try {
      const persisted = await startBoardingAdmission(newBoardingInfo, activeShift.id);
      setBoardingRecords(prev => [...prev, persisted]);
    } catch (err: any) {
      showToast(`Boarding admission failed: ${err?.message || err}`, 'error');
      setIsSaving(false);
      return;
    }
    showToast(`Patient booked into ${selectedCage}.`, 'success');

    // Reset
    setShowDepositGuard(false);
    setSelectedCage(null);
    setSelectedPatientId('');
    setCheckOutDate('');
    setFoodType('without_food');
    setAdmissionFoodItemId('');
    setMedicalBoarding(false);
    setHospitalProvidesLitter(false);
    setEstimatedStayDays(1);
    setIsSaving(false);
  };

  const renderActiveQueue = () => {
    const activeQueue = sortQueueByUrgency(clinicQueue.filter(q =>
      (q.serviceType === 'Boarding' || q.serviceType === 'boarding') &&
      q.status === 'active'
    ));

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
                <div className="font-bold text-sm truncate flex items-center gap-1.5">
                  {q.petName}
                  {q.urgency === 'emergency' && <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0">EMERGENCY</span>}
                  {q.urgency === 'non-emergency' && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0">NON-EMERGENCY</span>}
                </div>
                <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded shrink-0 ${selectedPatientId === q.petId ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                  Waiting
                </div>
              </div>
              {q.emergencyBackfillRequired && (
                <div className={`text-[10px] font-black uppercase tracking-wider mb-1 ${selectedPatientId === q.petId ? 'text-amber-200' : 'text-amber-700'}`}>⚠ DETAILS PENDING</div>
              )}
              <div className={`text-[10px] font-black ${selectedPatientId === q.petId ? 'text-indigo-200' : 'text-slate-500'}`}>
                {q.ownerName}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const btnClass = "py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer border border-white/30 hover:shadow-lg flex items-center justify-center gap-1";

  const renderCageBilling = (cage: string, occupant: { boarding: BoardingRecord; pet: Pet | undefined; ownerName: string }) => {
    const b = occupant.boarding;
    const isAdmission = b.medicalBoarding;
    const deposit = b.depositAmountCents ?? 0;
    const charges = computeCharges(b);
    const balance = deposit - charges;
    const rounds = countDoctorRounds(b);

    return (
      <div className="mt-auto pt-3 space-y-2">
        {/* Billing type badge + estimated stay */}
        <div className="flex items-center gap-1.5">
          <span data-testid={`type-badge-${cage}`} className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded shadow-sm ${isAdmission ? 'bg-white text-rose-700' : 'bg-sky-500 text-white'}`}>{isAdmission ? 'Admission' : 'Boarding'}</span>
          <span className="text-[10px] font-bold text-rose-100">~{b.estimatedStayDays ?? 1}d · deposit Rs. {formatRupees(deposit / 100)}</span>
        </div>

        {/* Running settlement tab */}
        <div data-testid={`billing-tab-${cage}`} className="text-[10px] font-bold text-white bg-black/25 rounded-xl p-2 border border-white/10 space-y-0.5">
          <div>Deposit held: Rs. {formatRupees(deposit / 100)}</div>
          <div data-testid={`charges-${cage}`}>Charges to date: Rs. {formatRupees(charges / 100)}</div>
          <div data-testid={`balance-${cage}`} className={balance < 0 ? 'text-rose-300 font-black' : 'text-emerald-200 font-black'}>
            Balance: Rs. {formatRupees(balance / 100)} {balance < 0 ? '(owes more)' : balance > 0 ? '(refund)' : ''}
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-1">
          <button data-testid={`feeding-btn-${cage}`} onClick={(e) => { e.stopPropagation(); openFeedingModal(cage); }} className={btnClass}><Utensils className="w-3 h-3" />Feed</button>
          <button data-testid={`log-feed-btn-${cage}`} onClick={(e) => { e.stopPropagation(); handleLogFeeding(cage); }} className={btnClass}>Log Feed</button>
          {isAdmission && (
            <button data-testid={`doctor-round-btn-${cage}`} onClick={(e) => { e.stopPropagation(); handleLogDoctorRound(cage); }} className={btnClass}><Stethoscope className="w-3 h-3" />Round ({rounds})</button>
          )}
          {isAdmission && (
            <button data-testid={`log-med-btn-${cage}`} onClick={(e) => { e.stopPropagation(); openMedModal(cage); }} className={btnClass}><Pill className="w-3 h-3" />Med</button>
          )}
        </div>
        <button data-testid={`discharge-settle-btn-${cage}`} onClick={(e) => { e.stopPropagation(); setDischargeModalCage(cage); }} className="w-full py-2 bg-white text-rose-700 hover:bg-rose-50 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer border border-white/60 hover:shadow-lg flex items-center justify-center gap-1"><Receipt className="w-3 h-3" />Discharge &amp; Settle</button>
      </div>
    );
  };


  return (
    <PageShell title="Boarding & Admission" subtitle="Manage inpatient kennels, condos, and feeding schedules">
      <div className="flex h-full w-full gap-4 overflow-hidden relative" id="boarding-module-container">
      {/* LEFT PANE: Visual Kennel Board (40%) */}
      <aside className="w-2/5 min-w-[350px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <h2 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
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
                          <div className="text-[10px] font-black text-rose-100 uppercase tracking-widest bg-black/20 px-2 py-1 rounded backdrop-blur-sm border border-white/10">{cage}</div>
                          <Lock className="w-4 h-4 text-rose-200" />
                        </div>
                        <div className="font-black text-white text-lg tracking-tight truncate drop-shadow-sm">{occupant.pet?.name || 'Unknown Pet'}</div>
                        <div className="text-xs font-bold text-rose-100 truncate opacity-90">{occupant.pet?.breed || 'Unknown Breed'}</div>
                        <div className="text-[10px] font-bold text-rose-200 truncate mt-0.5">Owner: {occupant.ownerName || 'Unknown'}</div>
                        <div className="text-[10px] font-black text-white bg-black/20 px-2 py-1 rounded-2xl inline-block mt-2 border border-white/10 shadow-sm w-max">Rs. {formatRupees(calculateDailyRate(occupant.pet, occupant.boarding.foodType, occupant.boarding.hospitalProvidesLitter || false, occupant.boarding.pricingSnapshot || configuredPricing) / 100)}/{(occupant.boarding.pricingSnapshot || configuredPricing).billing_unit}</div>
                        {occupant.boarding.feedingPlan && (
                          <div data-testid={`feeding-plan-${cage}`} className="text-[10px] font-bold text-rose-50 bg-black/20 px-2 py-1 rounded-xl inline-block mt-1 border border-white/10 w-max">🍽 {occupant.boarding.feedingPlan.itemName} — {occupant.boarding.feedingPlan.quantityPerMeal}/meal × {occupant.boarding.feedingPlan.mealsPerDay}/day</div>
                        )}
                        {renderCageBilling(cage, occupant)}
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
                          <div className="text-[10px] font-black text-rose-100 uppercase tracking-widest bg-black/20 px-2.5 py-1 rounded backdrop-blur-sm border border-white/10 shadow-sm">{cage}</div>
                          <Lock className="w-5 h-5 text-rose-200 drop-shadow-sm" />
                        </div>
                        <div className="font-black text-white text-xl tracking-tight truncate drop-shadow-md">{occupant.pet?.name || 'Unknown Pet'}</div>
                        <div className="text-xs font-bold text-rose-100 truncate mb-1 opacity-90 drop-shadow-sm">{occupant.pet?.breed || 'Unknown Breed'}</div>
                        <div className="text-[10px] font-bold text-white/80 bg-black/20 px-2 py-0.5 rounded-full inline-block mb-1 border border-white/10 w-max mt-1">Owner: {occupant.ownerName}</div>
                        <div className="text-[10px] font-black text-white bg-black/20 px-2 py-1 rounded-2xl inline-block mb-3 border border-white/10 w-max">Rs. {formatRupees(calculateDailyRate(occupant.pet, occupant.boarding.foodType, occupant.boarding.hospitalProvidesLitter || false, occupant.boarding.pricingSnapshot || configuredPricing) / 100)}/{(occupant.boarding.pricingSnapshot || configuredPricing).billing_unit}</div>
                        {occupant.boarding.feedingPlan && (
                          <div data-testid={`feeding-plan-${cage}`} className="text-[10px] font-bold text-rose-50 bg-black/20 px-2 py-1 rounded-xl inline-block mb-2 border border-white/10 w-max">🍽 {occupant.boarding.feedingPlan.itemName} — {occupant.boarding.feedingPlan.quantityPerMeal}/meal × {occupant.boarding.feedingPlan.mealsPerDay}/day</div>
                        )}
                        {renderCageBilling(cage, occupant)}
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
        <details open className="shrink-0 border-b border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600">Boarding rates &amp; admission deposit</summary>
          <div className="px-5 pb-4 space-y-4">
             <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
               {([
                 ['cat_no_food_cents', 'Cat / owner food'],
                 ['cat_with_food_cents', 'Cat / clinic food'],
                 ['dog_no_food_cents', 'Dog / owner food'],
                 ['dog_with_food_cents', 'Dog / clinic food'],
                 ['cat_litter_cents', 'Cat litter extra'],
                 ['dog_litter_cents', 'Dog litter extra'],
                  ['milk_cup_cents', 'Milk cup reference'],
                  ['doctor_round_cents', 'Doctor round'],
                  ['cleaning_cents_per_day', 'Medical cleaning / day'],
                  ['late_checkout_cents', 'Late pickup fee'],
                ] as const).map(([key, label]) => (
                <label key={key} className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {label}
                  <div className="relative mt-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">{systemConfig?.currencySymbol || 'Rs. '}</span>
                     <input type="number" min="0" step="1" value={Math.round((pricingDraft[key] || 0) / 100)} onChange={e => setPricingDraft(prev => ({ ...prev, [key]: Math.round(parseWholeRupees(e.target.value) * 100) }))} className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-2 text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                </label>
              ))}
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Admission deposit
                <div className="relative mt-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">{systemConfig?.currencySymbol || 'Rs. '}</span>
                   <input data-testid="boarding-deposit-input" type="number" min="0" step="1" value={Math.round(pricingDraft.default_deposit_cents / 100)} onChange={e => setPricingDraft(prev => ({ ...prev, default_deposit_cents: Math.round(parseWholeRupees(e.target.value) * 100) }))} className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-2 text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                 </div>
               </label>
               <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Billing basis
                 <select value={pricingDraft.billing_unit} onChange={e => setPricingDraft(prev => ({ ...prev, billing_unit: e.target.value === 'day' ? 'day' : 'night' }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white py-2 text-xs font-bold text-slate-800">
                   <option value="night">Per night</option>
                   <option value="day">Per day</option>
                 </select>
               </label>
             </div>
             <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 rounded-xl border border-slate-200 bg-white p-3">
               {([
                 ['allow_food_charge', 'Allow clinic food'],
                 ['allow_litter_charge', 'Allow litter charge'],
                 ['allow_medical_boarding', 'Allow medical boarding'],
                 ['allow_doctor_rounds', 'Allow doctor rounds'],
                 ['allow_cleaning_fee', 'Charge medical cleaning'],
                 ['allow_medication_charge', 'Charge medication'],
                 ['allow_late_checkout_fee', 'Charge late pickup'],
                 ['enabled', 'Boarding enabled'],
               ] as const).map(([key, label]) => (
                 <label key={key} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50">
                   <input type="checkbox" checked={Boolean(pricingDraft[key])} onChange={e => setPricingDraft(prev => ({ ...prev, [key]: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                   {label}
                 </label>
               ))}
             </div>
             <div className="flex items-center justify-between gap-3">
               <p className="text-[10px] font-medium text-slate-500">Clinic owners/managers control these rates and toggles. New admissions keep a pricing snapshot.</p>
              <button type="button" onClick={() => void saveBoardingRates()} disabled={isSavingRates} className="rounded-lg bg-indigo-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-700 disabled:opacity-50">{isSavingRates ? 'Saving...' : 'Save rates'}</button>
            </div>
          </div>
        </details>
        {!selectedCage ? (
          <div className="flex-1 flex flex-col items-center justify-center relative opacity-60">
            <Home className="h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-sm font-bold text-slate-500">Select an Empty Space</h3>
            <p className="text-xs font-bold mt-1 text-slate-400">Choose a kennel or condo from the board to initiate intake.</p>
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

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Estimated Stay (days)</label>
                  <input
                    data-testid="estimated-stay-input"
                    type="number" min={1}
                    value={estimatedStayDays}
                    onChange={e => setEstimatedStayDays(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] font-black text-slate-400">For planning &amp; staffing only — does not change the deposit.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2 border border-slate-200 p-4 rounded-2xl bg-slate-50">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block text-center mb-3">Dietary Plan</label>
                  <div className="flex rounded-xl overflow-hidden shadow-sm border border-slate-200">
                    <button type="button" onClick={() => setFoodType('without_food')} className={`flex-1 py-2 text-xs font-bold transition-colors ${foodType === 'without_food' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
                      Without Food
                    </button>
                     <button type="button" disabled={!configuredPricing.allow_food_charge} onClick={() => setFoodType('with_food')} className={`flex-1 py-2 text-xs font-bold transition-colors ${foodType === 'with_food' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'} disabled:cursor-not-allowed disabled:opacity-40`}>
                       With Food
                     </button>
                  </div>
                  {foodType === 'with_food' && (
                    <select
                      data-testid="admission-food-select"
                      value={admissionFoodItemId}
                      onChange={e => setAdmissionFoodItemId(e.target.value)}
                      className="w-full mt-3 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">Select in-stock food</option>
                      {foodInventory.map(item => <option key={item.id} value={item.id}>{item.name} (stock {item.stock})</option>)}
                    </select>
                  )}
                  {foodType === 'with_food' && foodInventory.length === 0 && (
                    <p className="text-[10px] font-bold text-amber-600 mt-2">No in-stock food is available. Add food inventory before admission.</p>
                  )}
                </div>

                <div className="space-y-2 border border-slate-200 p-4 rounded-2xl bg-slate-50">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block text-center mb-3">Boarding Level</label>
                  <div className="flex rounded-xl overflow-hidden shadow-sm border border-slate-200">
                    <button type="button" onClick={() => setMedicalBoarding(false)} className={`flex-1 py-2 text-xs font-bold transition-colors ${!medicalBoarding ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
                      Standard
                    </button>
                     <button type="button" disabled={!configuredPricing.allow_medical_boarding} onClick={() => setMedicalBoarding(true)} className={`flex-1 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-1 ${medicalBoarding ? 'bg-rose-600 text-white' : 'bg-white text-rose-600 hover:bg-rose-50'} disabled:cursor-not-allowed disabled:opacity-40`}>
                       <Activity className="w-3 h-3" /> Medical
                     </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border border-slate-200 p-4 rounded-2xl bg-slate-50">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block text-center mb-3">Litter Service</label>
                <div className="flex rounded-xl overflow-hidden shadow-sm border border-slate-200">
                  <button type="button" onClick={() => setHospitalProvidesLitter(false)} className={`flex-1 py-2 text-xs font-bold transition-colors ${!hospitalProvidesLitter ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
                    Owner Brings
                  </button>
                   <button type="button" disabled={!configuredPricing.allow_litter_charge} onClick={() => setHospitalProvidesLitter(true)} className={`flex-1 py-2 text-xs font-bold transition-colors ${hospitalProvidesLitter ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'} disabled:cursor-not-allowed disabled:opacity-40`}>
                     Hospital Provides
                   </button>
                </div>
              </div>

               {medicalBoarding && (
                 <div data-testid="admission-fees" className="grid grid-cols-2 gap-6">
                   <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                     <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Doctor rounds</p>
                     <p className="mt-1 text-lg font-black text-rose-900">{systemConfig?.currencySymbol || 'Rs. '}{formatRupees(configuredPricing.doctor_round_cents / 100)} each</p>
                     <p className="mt-1 text-[10px] font-bold text-rose-700">Set by clinic pricing. Staff cannot override it during admission.</p>
                   </div>
                   <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                     <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Medical cleaning</p>
                     <p className="mt-1 text-lg font-black text-rose-900">{systemConfig?.currencySymbol || 'Rs. '}{formatRupees(configuredPricing.cleaning_cents_per_day / 100)} / {configuredPricing.billing_unit}</p>
                     <p className="mt-1 text-[10px] font-bold text-rose-700">Calculated by the server at discharge.</p>
                   </div>
                 </div>
               )}

              <div data-testid="deposit-display" className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl">
                <p className="text-sm font-black text-emerald-800">Cash deposit to collect: Rs. {formatRupees(depositCents / 100)} <span className="font-bold text-emerald-600">(standard admission deposit)</span></p>
                <p className="text-xs text-emerald-700 font-bold mt-1">The deposit is recorded in the active shift and applied at discharge.</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex gap-3 items-start">
                <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest mb-1">Financial Notice</h4>
                  <p className="text-xs text-amber-700 font-bold leading-relaxed">Booking this space records the mandatory cash deposit in the active shift ledger. The space will be locked until checkout.</p>
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
      <Modal
        open={showDepositGuard}
        onClose={() => setShowDepositGuard(false)}
        size="sm"
        title="Mandatory Admission Deposit"
        icon={<div className="bg-rose-100 text-rose-600 p-2 rounded-xl"><AlertTriangle className="w-5 h-5 animate-pulse" /></div>}
        footer={
          <>
            <button onClick={() => setShowDepositGuard(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors">Cancel</button>
             <button onClick={handleConfirmBooking} disabled={isSaving} className="flex-[2] py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition-colors">{isSaving ? 'Saving...' : 'Collect & Lock Cage'}</button>
          </>
        }
      >
        <div className="text-center space-y-6">
          <p className="text-slate-500 text-xs font-bold px-2">System protocol requires a deposit to secure {selectedCage} and lock the patient into the ward flowsheet.</p>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount Required</div>
            <div className="text-3xl font-mono font-black text-slate-800 mt-1">Rs. {formatRupees(depositCents / 100)}</div>
          </div>
        </div>
      </Modal>

      {/* MODAL: Feeding Plan */}
      <Modal
        open={!!feedingModalCage}
        onClose={() => setFeedingModalCage(null)}
        size="md"
        title={
          <div>
            <div className="text-base font-black text-slate-800 uppercase tracking-tight">Feeding Plan</div>
            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{feedingModalCage} • {feedingModalCage ? (activeBoardingMap.get(feedingModalCage)?.pet?.name || 'Unknown') : 'Unknown'}</div>
          </div>
        }
        icon={<div className="bg-amber-100 text-amber-600 p-2 rounded-xl"><Utensils className="w-5 h-5" /></div>}
        footer={
          <>
            <button onClick={() => setFeedingModalCage(null)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors">Cancel</button>
            <button data-testid="feeding-save-btn" onClick={handleSaveFeedingPlan} className="flex-[2] py-3 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition-colors cursor-pointer">Set Feeding Plan</button>
          </>
        }
      >
        <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Food Item</label>
              <select
                data-testid="feeding-item-select"
                value={feedingItemId}
                onChange={e => setFeedingItemId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              >
                <option value="">— Select food item —</option>
                {foodInventory.map(i => (
                  <option key={i.id} value={i.id}>{i.name} (stock {i.stock})</option>
                ))}
              </select>
              {foodInventory.length === 0 && (
                <p className="text-[10px] font-bold text-amber-600">No inventory items with category "food". Add one in the Inventory panel first.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Qty / Meal</label>
                <input
                  data-testid="feeding-qty-per-meal"
                  type="number" min={1}
                  value={feedingQtyPerMeal}
                  onChange={e => setFeedingQtyPerMeal(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Meals / Day</label>
                <input
                  data-testid="feeding-meals-per-day"
                  type="number" min={1}
                  value={feedingMealsPerDay}
                  onChange={e => setFeedingMealsPerDay(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
            </div>

        </div>
      </Modal>

      {/* MODAL: Discharge & Settle */}
      {(() => {
        if (!dischargeModalCage) return null;
        const occ = activeBoardingMap.get(dischargeModalCage);
        const b = occ?.boarding;
        const deposit = b?.depositAmountCents ?? 0;
        const charges = b ? computeCharges(b) : 0;
        const balance = deposit - charges;
        return (
        <Modal
          open={!!dischargeModalCage}
          onClose={() => setDischargeModalCage(null)}
          size="sm"
          title="Discharge &amp; Settle"
          icon={<div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl"><Receipt className="w-5 h-5" /></div>}
          footer={
            <>
              <button onClick={() => setDischargeModalCage(null)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors">Cancel</button>
              <button data-testid="confirm-settle-btn" onClick={() => handleDischargeSettle(dischargeModalCage)} className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition-colors cursor-pointer">Confirm Discharge</button>
            </>
          }
        >
          <div className="text-center space-y-5">
            <p className="text-slate-500 text-xs font-bold px-2">Settle the account for {occ?.pet?.name || 'this patient'} in {dischargeModalCage} and free the cage.</p>
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="font-bold text-slate-500">Deposit held</span><span data-testid="settle-deposit" className="font-mono font-black text-slate-800">Rs. {formatRupees(deposit / 100)}</span></div>
              <div className="flex justify-between"><span className="font-bold text-slate-500">Charges to date</span><span data-testid="settle-charges" className="font-mono font-black text-slate-800">Rs. {formatRupees(charges / 100)}</span></div>
              <div className="border-t border-slate-200 my-1"></div>
              {balance >= 0 ? (
                <div className="flex justify-between"><span className="font-black text-emerald-700">Refund to owner</span><span data-testid="settle-balance" className="font-mono font-black text-emerald-700">Rs. {formatRupees(balance / 100)}</span></div>
              ) : (
                <div className="flex justify-between"><span className="font-black text-rose-600">Collect additional</span><span data-testid="settle-balance" className="font-mono font-black text-rose-600">Rs. {formatRupees(Math.abs(balance) / 100)}</span></div>
              )}
            </div>
          </div>
        </Modal>
        );
      })()}

      {/* MODAL: Log Medication (Admission) */}
      <Modal
        open={!!medModalCage}
        onClose={() => setMedModalCage(null)}
        size="md"
        title={
          <div>
            <div className="text-base font-black text-slate-800 uppercase tracking-tight">Log Medication</div>
            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{medModalCage} • {medModalCage ? (activeBoardingMap.get(medModalCage)?.pet?.name || 'Unknown') : 'Unknown'}</div>
          </div>
        }
        icon={<div className="bg-rose-100 text-rose-600 p-2 rounded-xl"><Pill className="w-5 h-5" /></div>}
        footer={
          <>
            <button onClick={() => setMedModalCage(null)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors">Cancel</button>
            <button data-testid="med-save-btn" onClick={handleLogMedication} className="flex-[2] py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition-colors cursor-pointer">Log &amp; Deduct Stock</button>
          </>
        }
      >
        <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Inventory Item</label>
              <select
                data-testid="med-item-select"
                value={medItemId}
                onChange={e => setMedItemId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              >
                <option value="">— Select item —</option>
                {inventory.map(i => (
                  <option key={i.id} value={i.id}>{i.name} (stock {i.stock}) — Rs. {formatRupees(i.price)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Quantity</label>
              <input
                data-testid="med-qty-input"
                type="number" min={1}
                value={medQty}
                onChange={e => setMedQty(parseInt(e.target.value) || 0)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>

        </div>
      </Modal>

    </div>
    </PageShell>
  );
}
