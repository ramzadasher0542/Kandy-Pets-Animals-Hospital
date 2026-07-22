/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, ModalSection } from './ui/Modal';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon, Clock, Plus, User, CheckCircle2,
  Activity, X, ChevronLeft, ChevronRight, List as ListIcon,
  Edit2, Trash2, Lock, Stethoscope, Phone, PenTool, History, SearchCode
} from 'lucide-react';
import { Appointment, AppointmentStatus, MedicalRecord, PetClassification, User as AppUser, Pet, Client } from '../types';
import { showToast } from './Toast';
import { formatDisplayDate, formatDisplayTime } from '../utils/time';
import PhoneInput from './PhoneInput';
import { db } from '../lib/localDb';
import { fetchPets, fetchClients, upsertPet } from '../lib/db';
import { Badge } from './ui/Badge';
import PageShell from './ui/PageShell';

interface AppointmentsProps {
  appointments: Appointment[];
  records: MedicalRecord[];
  isOnline?: boolean;
  onAddAppointment: (appointment: Appointment) => void;
  onUpdateStatus: (id: string, status: AppointmentStatus) => void;
  onAddRecord: (record: MedicalRecord) => void;
  onUpdateAppointment?: (appointment: Appointment) => void;
  preFilledClient?: any;
  preFilledPet?: any;
  onGenerateConsent?: (clientName: string, petName: string) => void;
  onUpdateClient?: (client: any) => Promise<void>;
  onUpdatePet?: (id: string, name: string, petObj: Pet) => void;
}

// ---------------------------------------------------------
// CORE UTILITIES
// ---------------------------------------------------------
const enforcePhoneFormat = (p: string) => {
  if (!p) return '+94 ';
  let digits = p.replace(/\D/g, '');
  if (digits.startsWith('94')) return '+94 ' + digits.slice(2);
  if (digits.startsWith('0')) return '+94 ' + digits.slice(1);
  return '+94 ' + digits;
};

const normalizeSearchPhone = (p: string) => p.replace(/\D/g, '').slice(-9);

const toLocalISODate = (d: Date) => {
  const z = (n: number) => ('0' + n).slice(-2);
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

const getNextAptNumber = (apts: Appointment[]) => {
  let max = 999;
  apts.forEach(a => {
    if (a.aptNumber) {
      const match = a.aptNumber.match(/APT-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
  });
  return `APT-${max + 1}`;
};

export default function AppointmentsManager({ 
  appointments, records, isOnline, onAddAppointment, onUpdateStatus,
  onAddRecord, onUpdateAppointment, preFilledClient, preFilledPet, onGenerateConsent, onUpdateClient, onUpdatePet
}: AppointmentsProps) {
  
  // ---------------------------------------------------------
  // CONSTANTS
  // ---------------------------------------------------------
  const listFilters = ['All', 'Pending', 'Confirmed', 'Completed', 'Cancelled', 'No show'];

  // ---------------------------------------------------------
  // STATE MANAGEMENT
  // ---------------------------------------------------------
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list'); // DEFAULT TO LIST
  const [currentDate, setCurrentDate] = useState(new Date());
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>('week');
  const [doctorFilter, setDoctorFilter] = useState('All Doctors');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showArchive, setShowArchive] = useState(false);
  
  const [liveVets, setLiveVets] = useState<{name: string, id: string}[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAptId, setEditingAptId] = useState<string | null>(null);

  // Form State
  const [petName, setPetName] = useState('');
  const [petType, setPetType] = useState<PetClassification>('Canine');
  const [breed, setBreed] = useState('');
  const [weight, setWeight] = useState<number | ''>(''); // PHASE 1 NATIVE
  const [sex, setSex] = useState('Unknown'); // PHASE 1 NATIVE
  const [fastingStartTime, setFastingStartTime] = useState('');
  const [rabiesProof, setRabiesProof] = useState(false);
  const [dhlpProof, setDhlpProof] = useState(false);
  const [fleaTickUpToDate, setFleaTickUpToDate] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('+94 ');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [date, setDate] = useState(formatDisplayDate(new Date()));
  const [time, setTime] = useState(formatDisplayTime(new Date()));
  const [veterinarian, setVeterinarian] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [admissionType, setAdmissionType] = useState('OPD');
  const [urgency, setUrgency] = useState<'routine' | 'non-emergency' | 'emergency'>('routine');
  const [phone2, setPhone2] = useState('');
  const [address, setAddress] = useState('');

  // Emergency Intake State
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyPetName, setEmergencyPetName] = useState('');
  const [emergencyOwnerPhone, setEmergencyOwnerPhone] = useState('+94 ');
  const [emergencyComplaint, setEmergencyComplaint] = useState('');
  const [emergencyVet, setEmergencyVet] = useState('');

  // Identity Scanner State
  const [identitySearch, setIdentitySearch] = useState('');
  const [knownPets, setKnownPets] = useState<any[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);

  const [selectedPopoverApt, setSelectedPopoverApt] = useState<Appointment | null>(null);
  const [overflowPopover, setOverflowPopover] = useState<{date: string, apts: Appointment[]} | null>(null);

  // ---------------------------------------------------------
  // INITIALIZATION & EFFECTS
  // ---------------------------------------------------------
  useEffect(() => {
    const sorted = [...appointments].sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time}`);
      const dateB = new Date(`${b.date}T${b.time}`);
      return dateB.getTime() - dateA.getTime();
    });
    setAllAppointments(sorted);
  }, [appointments]);

  const fetchVets = useCallback(async () => {
    try {
      const byName = new Map<string, { name: string; id: string }>();

      // Primary source: anyone in Staff & Payroll whose role reads as a
      // practitioner (vet / doctor / surgeon / physician). No manual re-entry —
      // add a doctor once in Staff and they appear here automatically.
      await db.staffProfiles.iterate((p: any) => {
        if (p && !p.is_deleted && p.active !== false) {
          const role = `${p.position || ''} ${p.department || ''}`.toLowerCase();
          if (/vet|doctor|surgeon|physician/.test(role) && p.fullName) {
            byName.set(p.fullName, { name: p.fullName, id: p.id });
          }
        }
      });

      // Also include legacy login accounts with a clinical role.
      const users = await db.users.getItem<AppUser[]>('users_list') || [];
      users
        .filter(u => u.role === 'veterinarian' || u.role === 'admin')
        .forEach(v => { if (v.name && !byName.has(v.name)) byName.set(v.name, { name: v.name, id: v.id }); });

      const vets = Array.from(byName.values());
      if (vets.length > 0) {
        setLiveVets(vets);
        if (!veterinarian) setVeterinarian(vets[0].name);
      } else {
        const fallback = { name: 'Attending Doctor', id: 'fallback' };
        setLiveVets([fallback]);
        if (!veterinarian) setVeterinarian(fallback.name);
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error('Failed to fetch vets:', e);
    }
  }, [veterinarian]);

  useEffect(() => {
    fetchVets();
    fetchClients().then(setClients).catch((e) => { if (import.meta.env.DEV) console.error(e); });
    fetchPets().then(setPets).catch((e) => { if (import.meta.env.DEV) console.error(e); });
  }, [fetchVets]);

  useEffect(() => {
    if (preFilledClient || preFilledPet) {
      if (preFilledClient) {
        setOwnerName(preFilledClient.full_name || preFilledClient.name || '');
        setOwnerPhone(enforcePhoneFormat(preFilledClient.primary_phone || preFilledClient.phone || ''));
        if (preFilledClient.email_address) setOwnerEmail(preFilledClient.email_address);
        if (preFilledClient.physical_address) setAddress(preFilledClient.physical_address);
      }
      if (preFilledPet) {
        setPetName(preFilledPet.petName || '');
        setPetType(preFilledPet.petType || 'Canine');
        setBreed(preFilledPet.breed || '');
      }
      setShowAddModal(true);
    }
  }, [preFilledClient, preFilledPet]);


  // ---------------------------------------------------------
  // IDENTITY SCANNER ENGINE (SUPERCHARGED)
  // ---------------------------------------------------------
  const handleIdentityScan = (query: string) => {
    setIdentitySearch(query);
    const target = normalizeSearchPhone(query);
    if (target.length >= 7) {
      const matches = clients.filter(c => normalizeSearchPhone(c.primary_phone) === target);
      if (matches.length > 0) {
        const latest = matches[matches.length - 1]; 
        setOwnerName(latest.full_name);
        setOwnerPhone(enforcePhoneFormat(latest.primary_phone));
        setOwnerEmail(latest.email_address || '');
        
        if (latest.petIds && latest.petIds.length > 0) {
          const clientPets = pets.filter(p => latest.petIds?.includes(p.id));
          setKnownPets(clientPets.map(p => ({
              name: p.name, 
              type: p.petType, 
              breed: p.breed,
              weight: p.weight || '',
              sex: p.sex || 'Unknown'
          })));
        } else {
          setKnownPets([]);
        }
      } else {
        setKnownPets([]);
      }
    } else {
      setKnownPets([]);
    }
  };

  const handleSelectKnownPet = (pet: any) => {
    setPetName(pet.name);
    setPetType(pet.type);
    setBreed(pet.breed);
    if (pet.weight) setWeight(pet.weight);
    if (pet.sex) setSex(pet.sex);
  };

  // ---------------------------------------------------------
  // FORM & SUBMISSION
  // ---------------------------------------------------------
  const resetForm = useCallback(() => {
    setEditingAptId(null);
    setPetName(''); setBreed(''); setWeight(''); setSex('Unknown');
    setFastingStartTime(''); setRabiesProof(false); setDhlpProof(false); setFleaTickUpToDate(false);
    setOwnerName(''); setOwnerPhone('+94 '); setOwnerEmail('');
    setReason(''); setFormError(''); setAdmissionType('OPD'); setUrgency('routine'); setPhone2(''); setAddress('');
    setDate(formatDisplayDate(new Date())); setTime(formatDisplayTime(new Date()));
    setIdentitySearch(''); setKnownPets([]);
    if (liveVets.length > 0) setVeterinarian(liveVets[0].name);
  }, [liveVets]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddModal) { setShowAddModal(false); resetForm(); }
        if (showEmergencyModal) { setShowEmergencyModal(false); }
        if (selectedPopoverApt) setSelectedPopoverApt(null);
        if (overflowPopover) setOverflowPopover(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showAddModal, showEmergencyModal, selectedPopoverApt, overflowPopover, resetForm]);

  const handleEditClick = (apt: Appointment) => {
    if (apt.status === 'completed' || apt.status === 'cancelled') return;
    setEditingAptId(apt.id);
    setPetName(apt.petName);
    setPetType(apt.petType);
    setBreed(apt.breed);
    setWeight(apt.weight || '');
    setSex(apt.sex || 'Unknown');
    setOwnerName(apt.ownerName);
    setOwnerPhone(enforcePhoneFormat(apt.ownerPhone));
    setOwnerEmail(apt.ownerEmail || '');
    setDate(apt.date);
    setTime(apt.time);
    setVeterinarian(apt.veterinarian);
    setAdmissionType(apt.admissionType || 'OPD');
    setUrgency(apt.urgency || 'routine');
    
    setPhone2(apt.alternatePhone || '');
    setAddress(apt.address || '');

    if (apt.surgeryChecklist) {
      setFastingStartTime(apt.surgeryChecklist.fastingStartTime || '');
      setRabiesProof(apt.surgeryChecklist.rabiesProof);
      setDhlpProof(apt.surgeryChecklist.dhlpProof);
      setFleaTickUpToDate(apt.surgeryChecklist.fleaTickUpToDate);
    } else {
      setFastingStartTime('');
      setRabiesProof(false);
      setDhlpProof(false);
      setFleaTickUpToDate(false);
    }
    
    let displayReason = apt.reason || '';
    const match = displayReason.match(/:::METADATA(.*?):::\n?/);
    if (match) {
      try {
        if (!apt.alternatePhone && !apt.address) {
          const meta = JSON.parse(match[1]);
          setPhone2(meta.phone2 || '');
          setAddress(meta.address || '');
        }
      } catch(e){}
      displayReason = displayReason.replace(match[0], '').trim();
    }
    
    setReason(displayReason);
    setSelectedPopoverApt(null);
    setShowAddModal(true);
  };

  const handleEmergencyIntake = async () => {
    if (!emergencyPetName.trim() || !emergencyComplaint.trim()) {
      showToast('Pet Name and Chief Complaint are required.', 'error');
      return;
    }
    const aptId = crypto.randomUUID();
    const aptNumber = getNextAptNumber(allAppointments);
    const now = new Date().toISOString();
    const targetVet = emergencyVet || (liveVets[0]?.name || '');

    // COLLISION FIX: handleCheckIn derives client_id/pet id from normalizeSearchPhone
    // (last 9 digits). A shared placeholder like '0000000000' would normalize to the
    // SAME value for every phoneless emergency, merging them all into one client.
    // If no real phone was entered, mint a unique ALL-DIGIT sentinel instead so each
    // emergency keeps its own identity until backfilled. (A literal "TEMP-" prefix
    // cannot survive normalizeSearchPhone's \D strip, so we use an all-digit token.)
    const enteredPhoneDigits = normalizeSearchPhone(emergencyOwnerPhone || '');
    const hasRealPhone = enteredPhoneDigits.length >= 9;
    const tempPhone = hasRealPhone
      ? enforcePhoneFormat(emergencyOwnerPhone)
      : `9${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;

    const newApt = {
      id: aptId,
      aptNumber,
      petName: emergencyPetName.trim(),
      petType: 'Canine' as any,
      breed: 'Unknown',
      ownerName: 'Emergency — Details Pending',
      ownerPhone: tempPhone,
      date: formatDisplayDate(new Date()),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      veterinarian: targetVet,
      assignedVet: targetVet,
      admissionType: 'OPD' as any,
      reason: emergencyComplaint,
      status: 'in-progress' as any, // goes straight to active
      urgency: 'emergency' as any,
      emergencyBackfillRequired: true,
      created_at: now,
      updated_at: now,
      is_deleted: false
    } as any;
    
    await onAddAppointment(newApt);
    await handleCheckIn(newApt);
    
    showToast('Emergency intake created. Complete patient details when stable.', 'success');
    setShowEmergencyModal(false);
    setEmergencyPetName('');
    setEmergencyOwnerPhone('+94 ');
    setEmergencyComplaint('');
    setEmergencyVet(liveVets[0]?.name || '');
  };

  const handleCreateAppointment = async (e: React.FormEvent | React.KeyboardEvent) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!petName || !date || !time || !ownerName || ownerPhone.length < 10) {
      setFormError('Patient Name, Visit Date, Time, Owner Name, and valid Phone are required.');
      return;
    }

    // Client/CRM record creation moved to check-in (handleCheckIn)
    // Rationale: Don't pollute pet/customer DB until patient physically arrives

    const displayDate = formatDisplayDate(date);
    const displayTime = formatDisplayTime(time);

    // Double-booking guard — but emergencies are exempt. Two emergencies can
    // legitimately arrive for the same vet in the same minute; blocking that would
    // make it impossible to ever complete the second one's details (F-2 backfill).
    // The guard still fully protects routine/urgent bookings from double-booking.
    if (urgency !== 'emergency') {
      const conflict = allAppointments.find(a =>
        a.veterinarian === veterinarian &&
        a.date === displayDate &&
        a.time === displayTime &&
        (a.status === 'booked' || a.status === 'in-progress') &&
        a.id !== editingAptId &&        // never conflict with the appointment being edited
        a.urgency !== 'emergency'       // an emergency never blocks another booking
      );

      if (conflict) {
        setFormError(`Dr. ${veterinarian} already has an appointment at ${displayTime} on ${displayDate}. Choose a different time or vet.`);
        return;
      }
    }

    const now = new Date().toISOString();
    const currentWeight = typeof weight === 'number' ? weight : parseFloat(weight as string) || 0;
    const isSurgery = reason.toLowerCase().includes('surgery') || admissionType.toLowerCase().includes('surgery');
    const surgeryChecklistObj = isSurgery ? {
      fastingStartTime,
      rabiesProof,
      dhlpProof,
      fleaTickUpToDate
    } : undefined;

    if (editingAptId) {
      const existingApt = allAppointments.find(a => a.id === editingAptId);
      const wasBackfillPending = (existingApt as any)?.emergencyBackfillRequired === true;

      // EMERGENCY BACKFILL: completing the details of an emergency intake.
      // The emergency Client + Pet were created at intake with ids derived from a
      // temporary phone. We must update those records IN PLACE (keeping their original
      // ids) rather than re-deriving new deterministic ids from the real phone —
      // otherwise any medical record / queue item / billing already attached to the
      // emergency visit would be orphaned. Identity stability > id-format purity once
      // clinical records exist.
      if (wasBackfillPending) {
        const oldPhoneNorm = normalizeSearchPhone((existingApt as any).ownerPhone);
        const oldClientId = `client_${oldPhoneNorm}`;
        const oldPetId = `${((existingApt as any).petName || '').trim().toLowerCase()}_${oldPhoneNorm}`;

        // Update the existing Client in place (same client_id, new name/phone).
        try {
          let existingClient: any = null;
          await db.clients.iterate((value: any) => {
            if (value && !Array.isArray(value) && value.client_id === oldClientId) {
              existingClient = value;
              return false;
            }
          });
          if (existingClient && onUpdateClient) {
            await onUpdateClient({
              ...existingClient,
              full_name: ownerName.trim(),
              primary_phone: enforcePhoneFormat(ownerPhone),
              alternate_phone: phone2 || existingClient.alternate_phone || '',
              physical_address: address || existingClient.physical_address || '',
              updated_at: now
            });
          }
        } catch (err) {
          if (import.meta.env.DEV) console.error('[Emergency Backfill] client update-in-place failed:', err);
        }

        // Update the existing Pet in place (same id, corrected type/breed/etc).
        const existingPet = pets.find(p => p.id === oldPetId);
        if (existingPet) {
          const updatedPet: Pet = {
            ...existingPet,
            name: petName.trim(),
            petType,
            breed: breed || 'Mixed breed',
            weight: currentWeight,
            sex,
            updated_at: now
          };
          await upsertPet(updatedPet);
          setPets(prev => prev.map(p => (p.id === updatedPet.id ? updatedPet : p)));
          if (onUpdatePet) onUpdatePet(updatedPet.id, updatedPet.name, updatedPet);
        }
      }

      const updatedApt = {
        ...existingApt,
        id: editingAptId,
        petName: petName.trim(),
        petType,
        breed: breed || 'Mixed breed',
        weight: currentWeight,
        sex,
        ownerName: ownerName.trim(),
        ownerPhone: enforcePhoneFormat(ownerPhone),
        ownerEmail: ownerEmail || 'not-provided@example.com',
        date: formatDisplayDate(date),
        time: formatDisplayTime(time),
        veterinarian,
        assignedVet: veterinarian,
        admissionType: admissionType as any,
        urgency,
        reason: reason,
        alternatePhone: phone2,
        address: address,
        surgeryChecklist: surgeryChecklistObj,
        // Details are now complete — clear the pending flag and hide the amber banner.
        emergencyBackfillRequired: wasBackfillPending ? false : (existingApt as any)?.emergencyBackfillRequired,
        updated_at: now
      } as any;
      if (onUpdateAppointment) onUpdateAppointment(updatedApt);
    } else {
      const aptNumber = getNextAptNumber(allAppointments);
      const newApt = {
        id: crypto.randomUUID(),
        aptNumber,
        petName: petName.trim(),
        petType,
        breed: breed || 'Mixed breed',
        weight: currentWeight,
        sex,
        ownerName: ownerName.trim(),
        ownerPhone: enforcePhoneFormat(ownerPhone),
        ownerEmail: ownerEmail || 'not-provided@example.com',
        date: formatDisplayDate(date),
        time: formatDisplayTime(time),
        veterinarian,
        assignedVet: veterinarian,
        admissionType: admissionType as any,
        urgency,
        reason: reason,
        alternatePhone: phone2,
        address: address,
        status: 'booked',
        surgeryChecklist: surgeryChecklistObj,
        created_at: now,
        updated_at: now,
        is_deleted: false
      } as any;
      await onAddAppointment(newApt);
    }

    setShowAddModal(false);
    resetForm();
  };

  const handleCheckIn = async (apt: any) => {
    if (apt.status === 'completed' || apt.status === 'cancelled') return;
    
    const normalizedPhone = normalizeSearchPhone(apt.ownerPhone);
    
    // BUG #4 FIX: Deduplicate clients — search by phone before creating
    try {
      let existingClient: any = null;
      await db.clients.iterate((value: any) => {
        if (value && !Array.isArray(value) && normalizeSearchPhone(value.primary_phone) === normalizedPhone) {
          existingClient = value;
          return false; // stop iteration — found match
        }
      });

      if (!existingClient) {
        // No existing client with this phone — create with deterministic ID
        const clientPayload = {
          client_id: `client_${normalizedPhone}`,
          full_name: apt.ownerName.trim(),
          primary_phone: enforcePhoneFormat(apt.ownerPhone),
          alternate_phone: apt.alternatePhone || '',
          email_address: apt.ownerEmail || 'not-provided@example.com',
          physical_address: apt.address || '',
          communication_preference: 'sms' as any,
          account_balance: 0,
          lifetime_value: 0,
          client_status: 'active' as any,
          administrative_notes: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_deleted: false
        };
        if (onUpdateClient) await onUpdateClient(clientPayload);
      } else {
        // Client exists — update name/email if they were placeholders
        if (existingClient.full_name !== apt.ownerName.trim() && onUpdateClient) {
          await onUpdateClient({ ...existingClient, full_name: apt.ownerName.trim() });
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Enterprise OS] CRM Sync on check-in failed:', err);
    }

    // BUG #3 FIX: Use deterministic patientId that matches queue petId format
    const targetPhone = normalizeSearchPhone(apt.ownerPhone);
    const targetPetName = (apt.petName || '').trim().toLowerCase();
    const deterministicPatientId = `${targetPetName}_${targetPhone}`;

    // Fix: Create the relational Pet entity if it doesn't exist
    const petExistsInDb = pets.some(p => p.id === deterministicPatientId);
    if (!petExistsInDb) {
      const newPet: Pet = {
        id: deterministicPatientId,
        clientId: `client_${targetPhone}`,
        name: apt.petName.trim(),
        petType: apt.petType,
        breed: apt.breed || 'Mixed breed',
        weight: apt.weight || 0,
        sex: apt.sex || 'Unknown',
        age: apt.age || 'Unknown',
        created_at: new Date().toISOString()
      };
      await upsertPet(newPet);
      setPets(prev => [...prev, newPet]);
      if (onUpdatePet) onUpdatePet(newPet.id, newPet.name, newPet);
    }

    const patientExists = records.some(r => 
      normalizeSearchPhone(r.ownerPhone) === targetPhone && 
      r.patientId === deterministicPatientId
    );
    
    if (!patientExists) {
      const newRecord: MedicalRecord = {
        id: crypto.randomUUID(),
        patientId: deterministicPatientId,
        ownerName: apt.ownerName.trim(),
        ownerPhone: enforcePhoneFormat(apt.ownerPhone),
        ownerEmail: apt.ownerEmail || 'not-provided@example.com',
        visitDate: apt.date,
        attendingVet: apt.veterinarian,
        appointmentId: apt.id,
        symptoms: '',
        diagnosis: '',
        treatmentNotes: '',
        prescribedMeds: [],
        createdDate: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false
      };
      await onAddRecord(newRecord);
    }
    await onUpdateStatus(apt.id, 'in-progress');
    setSelectedPopoverApt(null);
  };

  const handleCancelApt = async (apt: Appointment) => {
    if (apt.status === 'completed' || apt.status === 'cancelled') return;
    await onUpdateStatus(apt.id, 'cancelled');
    setSelectedPopoverApt(null);
  };

  // ---------------------------------------------------------
  // FILTERING & DERIVATIONS
  // ---------------------------------------------------------
  const baseFilteredApts = allAppointments.filter(apt => {
    if (doctorFilter !== 'All Doctors' && apt.veterinarian !== doctorFilter) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        apt.petName.toLowerCase().includes(q) || 
        apt.ownerName.toLowerCase().includes(q) || 
        apt.ownerPhone.toLowerCase().includes(q) ||
        (apt.aptNumber && apt.aptNumber.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }
    return true;
  });

  const listFilteredApts = baseFilteredApts.filter(apt => {
    if (statusFilter === 'All') return true;
    if (statusFilter === 'Pending') return apt.status === 'booked';
    if (statusFilter === 'Confirmed') return apt.status === 'in-progress';
    if (statusFilter === 'Completed') return apt.status === 'completed';
    if (statusFilter === 'Cancelled' || statusFilter === 'No show') return apt.status === 'cancelled';
    return true;
  });

  const todayStr = toLocalISODate(new Date());
  
  const todaysListApts = listFilteredApts.filter(a => a.date === todayStr).sort((a, b) => {
    const getUrgencyVal = (u?: string) => u === 'emergency' ? 3 : u === 'non-emergency' ? 2 : 1;
    const diff = getUrgencyVal(b.urgency) - getUrgencyVal(a.urgency);
    if (diff !== 0) return diff;
    return (a.time || '').localeCompare(b.time || '');
  });
  const futureListApts = listFilteredApts.filter(a => new Date(a.date) > new Date(todayStr));
  const pastListApts = listFilteredApts.filter(a => new Date(a.date) < new Date(todayStr));

  const todaysStats = allAppointments.filter(a => a.date === todayStr);
  const todayVolume = todaysStats.length;
  const awaitingTriage = todaysStats.filter(a => a.status === 'booked').length;
  const inTreatment = todaysStats.filter(a => a.status === 'in-progress').length;

  const currentDisplayAptNumber = editingAptId 
    ? allAppointments.find(a => a.id === editingAptId)?.aptNumber || 'N/A'
    : getNextAptNumber(allAppointments);

  // ---------------------------------------------------------
  // UI HELPERS
  // ---------------------------------------------------------
  const getStatusPill = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'booked') return <Badge tone="amber">Pending</Badge>;
    if (s === 'in-progress') return <Badge tone="sky" className="flex items-center gap-1 w-max"><Activity className="h-3 w-3 animate-pulse" /> In Treatment</Badge>;
    if (s === 'completed') return <Badge tone="emerald">Completed</Badge>;
    if (s === 'cancelled') return <Badge tone="rose">Cancelled</Badge>;
    return <Badge tone="slate">{status}</Badge>;
  };

  const getServicePill = (apt: Appointment) => {
    const type = apt.admissionType || 'OPD';
    if (type === 'OPD') return <Badge tone="sky">OPD</Badge>;
    if (type === 'Vaccination') return <Badge tone="emerald">Vaccination</Badge>;
    if (type === 'Hospital Admission') return <Badge tone="rose">Hospital Admission</Badge>;
    if (type === 'Pet Boarding') return <Badge tone="amber">Pet Boarding</Badge>;
    return <Badge tone="slate">{type}</Badge>;
  };

  // ---------------------------------------------------------
  // VIEWS
  // ---------------------------------------------------------
  const renderCalendarView = () => {
    if (timeframe === 'month') {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const days = [];
      for(let i=0; i<start.getDay(); i++) days.push(null);
      for(let i=1; i<=end.getDate(); i++) days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
      
      return (
        <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm h-full overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="p-3 text-center text-[10px] uppercase font-bold text-slate-500">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 flex-1 bg-slate-200 gap-px border-t border-slate-200 overflow-y-auto custom-scrollbar h-full">
            {days.map((d, i) => {
              if(!d) return <div key={`empty-${i}`} className="bg-slate-50/50 min-h-[100px] h-full" />;
              const dayStr = toLocalISODate(d);
              const apts = baseFilteredApts.filter(a => a.date === dayStr);
              const displayApts = apts.slice(0, 3);
              const hasOverflow = apts.length > 3;

              return (
                <div 
                  key={dayStr} 
                  className="bg-white p-2 min-h-[100px] h-full hover:bg-slate-50 transition-colors cursor-pointer flex flex-col relative"
                  onClick={() => { setCurrentDate(d); setTimeframe('day'); }}
                >
                  <div className={`text-xs font-bold mb-1.5 z-10 ${d.toDateString() === new Date().toDateString() ? 'text-indigo-600 bg-indigo-50 w-6 h-6 flex items-center justify-center rounded-full shadow-sm border border-indigo-100' : 'text-slate-600'}`}>{d.getDate()}</div>
                  <div className="space-y-1 flex-1 z-10 overflow-hidden">
                    {apts.length === 0 ? (
                      <div className="absolute inset-0 opacity-[0.03] bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#000_10px,#000_20px)] pointer-events-none"></div>
                    ) : (
                      <>
                        {displayApts.map(a => {
                          const isLocked = ['completed', 'cancelled'].includes(a.status);
                          return (
                            <div 
                              key={a.id} 
                              onClick={(e) => { e.stopPropagation(); setSelectedPopoverApt(a); }}
                              className={`text-[10px] p-1.5 rounded-xl truncate shadow-xs font-black transition-colors flex items-center justify-between ${
                                isLocked 
                                  ? 'bg-slate-50 text-slate-500 border border-slate-200' 
                                  : 'bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100'
                              }`}
                            >
                              <div className="flex items-center gap-1 truncate">
                                {getServicePill(a)} <span className="truncate">{a.time} - {a.petName}</span>
                              </div>
                              {isLocked && <Lock className="w-2.5 h-2.5 ml-1 opacity-50 shrink-0" />}
                            </div>
                          )
                        })}
                        {hasOverflow && (
                          <div 
                            onClick={(e) => { e.stopPropagation(); setOverflowPopover({ date: dayStr, apts }); }}
                            className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 mt-1 cursor-pointer w-full text-center py-1 bg-slate-50 hover:bg-indigo-50 rounded-xl transition-colors border border-slate-100"
                          >
                            +{apts.length - 3} more
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      );
    }

    const getWeekDays = (baseDate: Date) => {
      const d = new Date(baseDate);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      const days = [];
      for (let i = 0; i < 7; i++) {
        days.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
      return days;
    };

    const days = timeframe === 'day' ? [currentDate] : getWeekDays(currentDate);
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="flex-1 flex flex-col border border-slate-200 rounded-2xl bg-white shadow-sm h-full overflow-hidden">
        <div className="grid border-b border-slate-200 bg-slate-50 sticky top-0 z-10" style={{ gridTemplateColumns: `70px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="p-3 border-r border-slate-200 flex items-end justify-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time</div>
          {days.map(d => (
            <div 
              key={d.toISOString()} 
              className={`p-3 text-center border-r border-slate-200 last:border-r-0 cursor-pointer hover:bg-slate-100 transition-colors ${d.toDateString() === new Date().toDateString() ? 'bg-indigo-50/50' : ''}`}
              onClick={() => { setCurrentDate(d); setTimeframe('day'); }}
            >
              <div className={`text-[10px] uppercase font-bold ${d.toDateString() === new Date().toDateString() ? 'text-indigo-500' : 'text-slate-400'}`}>{d.toLocaleDateString('en-US', {weekday:'short'})}</div>
              <div className={`text-sm font-bold mt-0.5 ${d.toDateString()===new Date().toDateString() ? 'text-indigo-600':'text-slate-700'}`}>{d.getDate()}</div>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar relative h-full">
          {hours.map(hour => (
            <div key={hour} className="grid border-b border-slate-100 min-h-[90px]" style={{ gridTemplateColumns: `70px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="p-2 border-r border-slate-200 bg-slate-50 flex items-start justify-center pt-3 text-[10px] font-bold text-slate-400">
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>
              {days.map(d => {
                const dayStr = toLocalISODate(d);
                const apts = baseFilteredApts.filter(a => a.date === dayStr && parseInt(a.time.split(':')[0], 10) === hour);
                const isToday = d.toDateString() === new Date().toDateString();
                
                return (
                  <div key={dayStr} className={`p-1.5 border-r border-slate-100 last:border-r-0 relative hover:bg-slate-50/50 transition-colors z-10 ${isToday ? 'bg-indigo-50/10' : ''}`}>
                    {apts.length === 0 && (
                      <div className="absolute inset-0 opacity-[0.03] bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#000_10px,#000_20px)] pointer-events-none"></div>
                    )}
                    {apts.map(a => {
                      const isLocked = ['completed', 'cancelled'].includes(a.status);
                      return (
                        <div 
                          key={a.id} 
                          onClick={(e) => { e.stopPropagation(); setSelectedPopoverApt(a); }}
                          className={`mb-1.5 p-2 border rounded-xl text-[10px] leading-tight shadow-xs cursor-pointer hover:shadow-sm transition-all group relative z-20 ${
                            isLocked 
                              ? 'bg-slate-50 border-slate-200 text-slate-500' 
                              : 'bg-indigo-50 border-indigo-100 text-indigo-800 hover:border-indigo-300'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-1 font-bold truncate">
                              {getServicePill(a)} {a.petName}
                            </div>
                            {isLocked && <Lock className="w-2.5 h-2.5 ml-1 opacity-50 shrink-0" />}
                          </div>
                          <div className="truncate opacity-80 mt-0.5 font-bold">{a.ownerName} - {a.aptNumber}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAptRow = (apt: Appointment) => {
    const isLocked = ['completed', 'cancelled'].includes(apt.status);
    return (
      <tr key={apt.id} className="hover:bg-slate-50 transition-colors group">
        <td className="py-4 px-4">
          <div className="font-bold text-slate-800">{formatDisplayDate(apt.date)}</div>
          <div className="text-[10px] text-slate-500 font-black">{formatDisplayTime(apt.time)}</div>
        </td>
        <td className="py-4 px-4">
          <div className="flex flex-col items-start gap-1">
            <div className="font-bold text-slate-800 flex items-center gap-2">
              {apt.petName}
              {apt.urgency === 'emergency' && <Badge tone="rose">EMERGENCY</Badge>}
              {apt.urgency === 'non-emergency' && <Badge tone="amber">URGENT</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shadow-xs border border-slate-200">{apt.aptNumber || 'N/A'}</span>
              <span className="text-[10px] text-slate-500 font-black">{apt.petType} - {apt.breed || 'Mixed'}</span>
            </div>
            {(apt as any).emergencyBackfillRequired && (
              <Badge data-testid="badge-details-pending" tone="amber" className="mt-0.5 inline-flex items-center gap-1">⚠ Details Pending</Badge>
            )}
          </div>
        </td>
        <td className="py-4 px-4">
          <div className="font-bold text-slate-700">{apt.ownerName}</div>
          <div className="text-[10px] text-slate-500 font-black font-mono mt-0.5 flex items-center gap-1">
            <Phone className="w-2.5 h-2.5" /> {apt.ownerPhone}
          </div>
        </td>
        <td className="py-4 px-4">
          <div className="flex flex-col items-start gap-1.5">
            {getServicePill(apt)}
            <div className="text-[10px] text-slate-500 font-black flex items-center gap-1.5">
              <Stethoscope className="w-3 h-3 text-slate-400" /> {apt.assignedVet || apt.veterinarian}
            </div>
          </div>
        </td>
        <td className="py-4 px-4">
          {getStatusPill(apt.status)}
        </td>
        <td className="py-4 px-4 text-right w-32">
          <div className="flex items-center justify-end gap-1">
            {apt.emergencyBackfillRequired && !isLocked && (
              <button data-testid="btn-complete-details" onClick={() => handleEditClick(apt)} title="Complete emergency patient details" className="px-2 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer whitespace-nowrap">
                Complete Details
              </button>
            )}
            {apt.status === 'booked' && (
              <button data-testid="btn-check-in" onClick={() => !isLocked && handleCheckIn(apt)} disabled={isLocked} title="Check In" className={`p-1.5 rounded-xl transition-colors ${isLocked ? 'text-slate-300 opacity-50 cursor-not-allowed' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer'}`}>
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => !isLocked && handleEditClick(apt)} disabled={isLocked} title={isLocked ? "Record Locked" : "Edit Details"} className={`p-1.5 rounded-xl transition-colors ${isLocked ? 'text-slate-300 opacity-50 cursor-not-allowed' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer'}`}>
              {isLocked ? <Lock className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
            </button>
            <button onClick={() => !isLocked && handleCancelApt(apt)} disabled={isLocked} title={isLocked ? "Record Locked" : "Cancel Appointment"} className={`p-1.5 rounded-xl transition-colors ${isLocked ? 'text-slate-300 opacity-50 cursor-not-allowed' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderListView = () => (
    <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm h-full overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center gap-4 overflow-x-auto custom-scrollbar bg-slate-50/50">
        <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
           {listFilters.map(filter => (
            <button 
              key={filter} 
              onClick={() => setStatusFilter(filter)}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${statusFilter === filter ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {filter}
            </button>
          ))}
        </div>
        <button 
          onClick={() => setShowArchive(!showArchive)}
          className={`px-4 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${showArchive ? 'bg-slate-800 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          <History className="w-3.5 h-3.5" /> Past / Archived
        </button>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar h-full p-4 space-y-8 bg-slate-50/30">
        
        {/* TODAY SECTION - HIGH PRIORITY */}
        <section>
          <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="bg-indigo-600 w-2 h-6 rounded-full"></span> TODAY'S APPOINTMENTS ({todaysListApts.length})
          </h3>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-wider font-bold text-[10px]">
                  <th className="py-3 px-4 w-40">Time</th>
                  <th className="py-3 px-4">Pet Details</th>
                  <th className="py-3 px-4">Owner Info</th>
                  <th className="py-3 px-4">Service & Provider</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {todaysListApts.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400 font-bold">No appointments scheduled for today.</td></tr>
                ) : todaysListApts.map(renderAptRow)}
              </tbody>
            </table>
          </div>
        </section>

        {/* UPCOMING SECTION */}
        <section>
          <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="bg-emerald-500 w-2 h-6 rounded-full"></span> UPCOMING ({futureListApts.length})
          </h3>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden opacity-90">
            <table className="w-full text-left text-xs border-collapse">
              <tbody className="divide-y divide-slate-100">
                {futureListApts.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-400 font-bold">No upcoming appointments found.</td></tr>
                ) : futureListApts.map(renderAptRow)}
              </tbody>
            </table>
          </div>
        </section>

        {/* PAST / ARCHIVED SECTION */}
        {showArchive && (
          <section className="animate-fade-in opacity-75 grayscale hover:grayscale-0 transition-all">
            <h3 className="text-sm font-black text-slate-600 mb-3 flex items-center gap-2 border-b border-slate-200 pb-2">
              <span className="bg-slate-400 w-2 h-6 rounded-full"></span> PAST / ARCHIVED ({pastListApts.length})
            </h3>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <tbody className="divide-y divide-slate-100">
                  {pastListApts.length === 0 ? (
                    <tr><td colSpan={6} className="py-6 text-center text-slate-400 font-bold">No past appointments found.</td></tr>
                  ) : pastListApts.map(renderAptRow)}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </div>
  );

  const isSurgeryForm = reason.toLowerCase().includes('surgery') || admissionType.toLowerCase().includes('surgery');
  let fastingHours = 0;
  if (isSurgeryForm && date && time && fastingStartTime) {
    const surgeryDate = new Date(`${date}T${time}`);
    const fastingDate = new Date(fastingStartTime);
    if (!isNaN(surgeryDate.getTime()) && !isNaN(fastingDate.getTime())) {
      fastingHours = (surgeryDate.getTime() - fastingDate.getTime()) / (1000 * 60 * 60);
    }
  }

  let under6Months = false;
  if (isSurgeryForm && petName) {
    const matchedPet = pets.find(p => p.name.toLowerCase() === petName.toLowerCase() && p.petType === petType);
    if (!matchedPet || !matchedPet.age) {
       under6Months = true;
    } else {
       const ageStr = matchedPet.age.toLowerCase();
       if (ageStr.includes('month')) {
          const num = parseInt(ageStr.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(num) && num < 6) under6Months = true;
       } else if (ageStr.includes('week') || ageStr.includes('day')) {
          under6Months = true;
       }
    }
  }

  return (
    <PageShell
      title="Appointments"
      subtitle="Manage daily schedule and bookings"
      kpis={[
        {
          icon: <CalendarIcon className="w-6 h-6" />,
          label: "Today's Volume",
          value: todayVolume,
        },
        {
          icon: <Clock className="w-6 h-6" />,
          label: 'Awaiting Triage',
          value: <span className={awaitingTriage > 0 ? 'text-amber-600' : ''}>{awaitingTriage}</span>,
          iconBg: awaitingTriage > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400',
        },
        {
          icon: <Activity className="w-6 h-6" />,
          label: 'In-Treatment',
          value: <span className={inTreatment > 0 ? 'text-sky-600' : ''}>{inTreatment}</span>,
          iconBg: inTreatment > 0 ? 'bg-sky-50 text-sky-600' : 'bg-slate-50 text-slate-400',
        },
      ]}
      filters={{
        options: [
          { id: 'list', label: 'List', icon: <ListIcon className="w-3.5 h-3.5 mr-1" /> },
          { id: 'calendar', label: 'Calendar', icon: <CalendarIcon className="w-3.5 h-3.5 mr-1" /> },
        ],
        active: viewMode,
        onChange: (id) => setViewMode(id as 'list' | 'calendar'),
      }}
      search={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: 'Search ID, pet, phone...',
      }}
      actions={
        <>
          {viewMode === 'calendar' && (
            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
              <button onClick={() => {
                const d = new Date(currentDate);
                if (timeframe === 'week') d.setDate(d.getDate() - 7);
                else if (timeframe === 'day') d.setDate(d.getDate() - 1);
                else d.setMonth(d.getMonth() - 1);
                setCurrentDate(d);
              }} className="p-1.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 shadow-xs transition-colors cursor-pointer">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => { setCurrentDate(new Date()); setTimeframe('day'); }} className="px-4 py-1.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-[10px] font-black text-slate-700 shadow-xs transition-colors cursor-pointer">
                Today
              </button>
              <button onClick={() => {
                const d = new Date(currentDate);
                if (timeframe === 'week') d.setDate(d.getDate() + 7);
                else if (timeframe === 'day') d.setDate(d.getDate() + 1);
                else d.setMonth(d.getMonth() + 1);
                setCurrentDate(d);
              }} className="p-1.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 shadow-xs transition-colors cursor-pointer">
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="px-3 text-[10px] font-black text-slate-800 min-w-[140px] text-center">
                {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
            </div>
          )}
          {viewMode === 'calendar' && (
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              {['day', 'week', 'month'].map(t => (
                <button key={t} onClick={() => setTimeframe(t as any)} className={`px-3 py-1.5 rounded-xl text-[10px] font-bold capitalize transition-all cursor-pointer ${timeframe === t ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <select value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)} className="hidden md:block px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer">
            <option value="All Doctors">All Doctors</option>
            {liveVets.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
          </select>
          <button onClick={() => setShowEmergencyModal(true)} className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] uppercase tracking-widest font-black rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-md whitespace-nowrap">
            ⚡ Emergency Intake
          </button>
          <button data-testid="btn-new-appointment" onClick={() => { resetForm(); setShowAddModal(true); }} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] uppercase tracking-widest font-black rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-md whitespace-nowrap">
            <Plus className="h-4 w-4" /> New Appointment
          </button>
        </>
      }
    >
      {viewMode === 'calendar' ? renderCalendarView() : renderListView()}

      {/* Overflow Appointments Mini-Popover */}
      {overflowPopover && createPortal(
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOverflowPopover(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 max-w-sm w-full animate-fade-in relative max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <button onClick={() => setOverflowPopover(null)} className="absolute top-3 right-3 p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"><X className="h-4 w-4" /></button>
            <h3 className="text-sm font-bold text-slate-800 mb-1">Appointments Overflow</h3>
            <p className="text-[10px] text-slate-500 font-black mb-4">{overflowPopover.date}</p>
            
            <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 pr-1">
              {overflowPopover.apts.map(a => {
                const isLocked = ['completed', 'cancelled'].includes(a.status);
                return (
                  <div 
                    key={a.id} 
                    onClick={() => { setOverflowPopover(null); setSelectedPopoverApt(a); }}
                    className={`p-2.5 rounded-xl text-xs shadow-xs cursor-pointer hover:shadow-sm transition-all group border ${
                      isLocked 
                        ? 'bg-slate-50 border-slate-200 text-slate-500' 
                        : 'bg-indigo-50 border-indigo-100 text-indigo-800 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-0.5">
                      <div className="font-bold truncate">{a.petName} <span className="text-[10px] text-slate-400 ml-1">{a.aptNumber}</span></div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{a.time}</span>
                        {isLocked && <Lock className="w-3 h-3 opacity-50 shrink-0" />}
                      </div>
                    </div>
                    <div className="truncate opacity-80 text-[10px] font-black">{a.ownerName} - {a.reason.replace(/:::METADATA(.*?):::/, '').substring(0, 30)}...</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Calendar Quick Action Popover Modal */}
      {selectedPopoverApt && createPortal(
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedPopoverApt(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 max-w-sm w-full animate-fade-in relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedPopoverApt(null)} className="absolute top-3 right-3 p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"><X className="h-4 w-4" /></button>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-black text-slate-800">{selectedPopoverApt.petName}</h3>
              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">{selectedPopoverApt.aptNumber}</span>
            </div>
            <p className="text-[10px] text-slate-500 font-black mb-4">{selectedPopoverApt.date} at {selectedPopoverApt.time}</p>
            {selectedPopoverApt.emergencyBackfillRequired && (
              <Badge data-testid="badge-details-pending" tone="amber" className="mb-3 inline-flex items-center gap-1">⚠ Details Pending</Badge>
            )}

            <div className="space-y-2">
              {selectedPopoverApt.status === 'booked' && (
                <button onClick={() => handleCheckIn(selectedPopoverApt)} className="w-full py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-250 font-bold rounded-xl text-[10px] uppercase tracking-wide flex justify-center items-center gap-2 cursor-pointer transition-colors">
                  <CheckCircle2 className="h-4 w-4" /> Check In Patient
                </button>
              )}

              {onGenerateConsent && (
                <button onClick={() => {
                  onGenerateConsent(selectedPopoverApt.ownerName, selectedPopoverApt.petName);
                  setSelectedPopoverApt(null);
                }} className="w-full py-2 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 font-bold rounded-xl text-[10px] uppercase tracking-wide flex justify-center items-center gap-2 cursor-pointer transition-colors">
                  <PenTool className="h-4 w-4" /> Generate Admission Consent
                </button>
              )}
              
              {!['completed', 'cancelled'].includes(selectedPopoverApt.status) ? (
                <>
                  <button onClick={() => handleEditClick(selectedPopoverApt)} className="w-full py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-bold rounded-xl text-[10px] uppercase tracking-wide flex justify-center items-center gap-2 cursor-pointer transition-colors">
                    <Edit2 className="h-4 w-4" /> Edit Details
                  </button>
                  <button onClick={() => handleCancelApt(selectedPopoverApt)} className="w-full py-2 bg-white text-rose-600 hover:bg-rose-50 border border-slate-200 font-bold rounded-xl text-[10px] uppercase tracking-wide flex justify-center items-center gap-2 cursor-pointer transition-colors">
                    <Trash2 className="h-4 w-4" /> Cancel Appointment
                  </button>
                </>
              ) : (
                <div className="w-full py-2 bg-slate-50 text-slate-400 border border-slate-200 font-bold rounded-xl text-[10px] uppercase tracking-wide flex justify-center items-center gap-2 cursor-not-allowed opacity-70">
                  <Lock className="h-4 w-4" /> Record Locked
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Main Appointment Form Modal - NEW UI OVERHAUL */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        size="lg"
        title={
          <div>
            <div className="text-base font-black text-slate-800 leading-none">{editingAptId ? 'Edit Appointment Details' : 'Schedule Veterinary Check-up'}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Central CRM & Schedule Link</div>
          </div>
        }
        footer={
          <>
            <button type="button" onClick={() => setShowAddModal(false)} className="px-6 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 cursor-pointer transition-colors text-[10px] uppercase tracking-widest">Cancel</button>
            <button type="submit" form="appointmentForm" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl cursor-pointer shadow-md transition-colors text-[10px] uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4"/> {editingAptId ? 'Save Changes' : 'Confirm Appointment'}
            </button>
          </>
        }
      >
        <form id="appointmentForm" onSubmit={handleCreateAppointment} className="space-y-5">
                
                {formError && <div className="text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200 font-black shadow-sm">{formError}</div>}

                {/* THE IDENTITY SCANNER BAR (SUPERCHARGED: Auto-fills Weight and Sex too) */}
                {!editingAptId && !preFilledClient && (
                  <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex items-center gap-4">
                    <div className="bg-indigo-600 p-2 rounded-xl text-white"><SearchCode className="w-5 h-5"/></div>
                    <div className="flex-1">
                      <label className="font-bold text-indigo-900 block text-[10px] uppercase tracking-widest mb-1.5">Identity Scanner: Auto-fill Existing Client by Phone</label>
                      <input 
                        type="text" 
                        placeholder="Type phone (e.g. 077 123 4567)" 
                        value={identitySearch}
                        onChange={(e) => handleIdentityScan(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold font-mono text-xs" 
                      />
                    </div>
                    {knownPets.length > 0 && (
                      <div className="flex-1">
                        <label className="font-bold text-indigo-900 block text-[10px] uppercase tracking-widest mb-1.5">Detected Pets for {ownerName}</label>
                        <select onChange={(e) => {
                          const p = knownPets.find(k => k.name === e.target.value);
                          if(p) handleSelectKnownPet(p);
                        }} className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs cursor-pointer">
                          <option value="">Select a known pet...</option>
                          {knownPets.map(p => <option key={p.name} value={p.name}>{p.name} ({p.breed})</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* TIER 1: Administration */}
                <ModalSection title="Administration" tone="slate">
                  <div className="flex flex-col md:flex-row gap-6 mb-6">
                    <div className="flex-1 w-full max-w-[150px]">
                      <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">System Appointment ID</label>
                      <input type="text" readOnly value={currentDisplayAptNumber} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-mono font-bold cursor-not-allowed outline-none text-xs" />
                    </div>
                    <div className="flex-1 w-full">
                      <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Intake Tag (Admission Type)</label>
                      <select value={admissionType} onChange={(e) => setAdmissionType(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs cursor-pointer">
                        <option value="OPD">OPD Consultation</option>
                        <option value="Vaccination">Vaccination Drop-off</option>
                        <option value="Grooming Salon">Grooming Salon</option>
                        <option value="Hospital Admission">Hospital Admission</option>
                        <option value="Pet Boarding">Pet Boarding Intake</option>
                      </select>
                    </div>
                  </div>

                  {/* Urgency Selector */}
                  <div className="mb-6">
                    <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Urgency Level</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setUrgency('routine')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors ${urgency === 'routine' ? 'bg-slate-800 text-white border-slate-900 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>🟢 Routine</button>
                      <button type="button" onClick={() => setUrgency('non-emergency')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors ${urgency === 'non-emergency' ? 'bg-amber-500 text-white border-amber-600 shadow-sm' : 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'}`}>🟡 Non-Emergency</button>
                      <button type="button" onClick={() => setUrgency('emergency')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors ${urgency === 'emergency' ? 'bg-rose-600 text-white border-rose-700 shadow-sm' : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'}`}>🔴 Emergency</button>
                    </div>
                  </div>
                </ModalSection>

                {/* TIER 2: Patient & Owner Split */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* Patient Block */}
                  <ModalSection title="Patient Details" tone="indigo" className="h-full">
                    <div className="space-y-3">
                      <div>
                        <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Patient Name *</label>
                        <input type="text" name="petName" required value={petName} onChange={(e) => { setPetName(e.target.value); setFormError(''); }} className={`w-full px-3 py-2 bg-slate-50 border ${formError && !petName ? 'border-rose-500' : 'border-slate-200'} rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs`} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Species</label>
                          <select value={petType} onChange={(e) => setPetType(e.target.value as any)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs cursor-pointer">
                            <option value="Canine">Canine</option>
                            <option value="Feline">Feline</option>
                            <option value="Avian">Avian</option>
                            <option value="Reptile">Reptile</option>
                            <option value="Small Mammal">Small Mammal</option>
                            <option value="Exotic">Exotic</option>
                          </select>
                        </div>
                        <div>
                          <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Breed</label>
                          <input type="text" value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="e.g. Labrador" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs" />
                        </div>
                      </div>

                      {/* PHASE 1: Native Weight and Sex Inputs */}
                      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                        <div>
                          <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Weight (kg)</label>
                          <input type="number" step="0.1" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 15.5" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs" />
                        </div>
                        <div>
                          <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Sex</label>
                          <select value={sex} onChange={(e) => setSex(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs cursor-pointer">
                            <option value="Unknown">Unknown</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Neutered Male">Neutered Male</option>
                            <option value="Spayed Female">Spayed Female</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </ModalSection>

                  {/* Client Block */}
                  <ModalSection title="Client Details" tone="emerald" className="h-full">

                    {preFilledClient && !editingAptId ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between shadow-xs mt-auto mb-auto">
                        <div className="flex items-center gap-3">
                          <div className="bg-emerald-600 text-white p-2 rounded-xl shadow-sm"><User className="w-4 h-4" /></div>
                          <div>
                            <div className="text-xs font-black text-emerald-900 leading-tight">{ownerName}</div>
                            <div className="text-[10px] text-emerald-700 font-mono mt-0.5 font-bold">{ownerPhone}</div>
                          </div>
                        </div>
                        <Lock className="w-4 h-4 text-emerald-400" />
                      </div>
                    ) : (
                      <div className="space-y-3 flex-1">
                        <div>
                          <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Owner Name *</label>
                          <input type="text" name="ownerName" required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Phone (+94 Format) *</label>
                            <PhoneInput
                              name="ownerPhone"
                              required
                              value={ownerPhone}
                              onChange={setOwnerPhone}
                            />
                          </div>
                          <div>
                            <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Email</label>
                            <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs" />
                          </div>
                        </div>
                      </div>
                    )}
                  </ModalSection>

                </div>

                {/* TIER 3: Visit Logistics */}
                <ModalSection title="Schedule & Logistics" tone="amber">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Visit Date</label>
                      <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setFormError(''); }} className={`w-full px-3 py-2 bg-slate-50 border ${formError && !date ? 'border-rose-500' : 'border-slate-200'} rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs cursor-pointer`} />
                    </div>
                    <div>
                      <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Time Slot</label>
                      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold font-mono text-xs cursor-pointer" />
                    </div>
                    <div>
                      <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Attending Vet (Live DB)</label>
                      <select value={veterinarian} onChange={(e) => setVeterinarian(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs cursor-pointer">
                        {liveVets.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Chief Complaint / Visit Notes *</label>
                    <textarea name="reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Annual vaccinations, limping on front right leg..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-xs resize-none" />
                  </div>

                  {isSurgeryForm && (
                    <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200 mt-4 space-y-4 shadow-sm">
                      <h3 className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-2"><Activity className="w-3.5 h-3.5"/> Pre-Surgery Checklist</h3>
                      
                      {under6Months && (
                        <div className="bg-amber-100 text-amber-800 text-xs font-bold p-3 rounded-xl border border-amber-300">
                          ⚠ This pet may be under 6 months old. Sterilization is not recommended before 6 months. Confirm with the attending vet.
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="font-bold text-amber-800 block text-[10px] uppercase tracking-widest mb-1.5">Fasting Start Time</label>
                          <input type="datetime-local" value={fastingStartTime} onChange={(e) => setFastingStartTime(e.target.value)} className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20 font-bold text-xs" />
                          {fastingStartTime && date && time && (
                            <div className={`mt-1.5 text-[10px] font-bold ${fastingHours < 5 ? 'text-amber-600' : fastingHours < 10 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              Fasting duration: {fastingHours.toFixed(1)} hours before surgery time
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-col justify-center space-y-2 pt-4">
                          <label className="flex items-center gap-2 text-xs font-bold text-amber-900 cursor-pointer">
                            <input type="checkbox" checked={rabiesProof} onChange={(e) => setRabiesProof(e.target.checked)} className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer" />
                            Rabies Vacc. Proof ✓
                          </label>
                          {(petType === 'Canine' || petType === 'Dog' as any) && (
                            <label className="flex items-center gap-2 text-xs font-bold text-amber-900 cursor-pointer">
                              <input type="checkbox" checked={dhlpProof} onChange={(e) => setDhlpProof(e.target.checked)} className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer" />
                              DHLP Vacc. Proof ✓
                            </label>
                          )}
                          <label className="flex items-center gap-2 text-xs font-bold text-amber-900 cursor-pointer">
                            <input type="checkbox" checked={fleaTickUpToDate} onChange={(e) => setFleaTickUpToDate(e.target.checked)} className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer" />
                            Flea/tick treatment up to date?
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </ModalSection>

        </form>
      </Modal>
      <Modal
        open={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        size="md"
        title={
          <div>
            <div className="text-lg font-black text-slate-800 tracking-tight">Emergency Intake</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Bypass triage and push directly to active queue.</div>
          </div>
        }
        icon={<div className="bg-rose-100 text-rose-600 p-2 rounded-xl">⚡</div>}
        footer={
          <>
            <button onClick={() => setShowEmergencyModal(false)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors text-[10px] uppercase tracking-widest cursor-pointer shadow-sm">
              Cancel
            </button>
            <button onClick={handleEmergencyIntake} className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl transition-colors text-[10px] uppercase tracking-widest cursor-pointer shadow-md flex items-center gap-2">
              <span className="text-sm">⚡</span> Create Emergency Intake
            </button>
          </>
        }
      >
        <div className="space-y-5">
              <div>
                <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Patient Name *</label>
                <input type="text" autoFocus value={emergencyPetName} onChange={e => setEmergencyPetName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-rose-500/20 font-bold text-sm" placeholder="e.g. Buddy" />
              </div>
              
              <div>
                <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Owner Phone (Optional)</label>
                <PhoneInput value={emergencyOwnerPhone} onChange={setEmergencyOwnerPhone} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-rose-500/20 font-bold text-sm" />
              </div>
              
              <div>
                <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Chief Complaint *</label>
                <input type="text" value={emergencyComplaint} onChange={e => setEmergencyComplaint(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-rose-500/20 font-bold text-sm" placeholder="e.g. Hit by vehicle, actively seizing..." />
              </div>
              
              <div>
                <label className="font-bold text-slate-500 block text-[10px] uppercase tracking-widest mb-1.5">Assigned Veterinarian</label>
                <select value={emergencyVet} onChange={e => setEmergencyVet(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-rose-500/20 font-bold text-sm cursor-pointer">
                  {liveVets.map(v => <option key={v.id} value={v.name}>Dr. {v.name}</option>)}
                </select>
              </div>
        </div>
      </Modal>
    </PageShell>
  );
}