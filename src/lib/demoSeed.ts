/**
 * Demo data seed — populates an EMPTY vault with a realistic, interlinked
 * snapshot of a busy clinic so every screen looks alive out of the box.
 *
 * Safety:
 *  - No-op if any clients already exist (never clobbers real data).
 *  - Callers gate on `!navigator.webdriver` so automated test runs (which seed
 *    their own fixtures) are never affected.
 *  - Records are written WITHOUT `_dirty`, so the Supabase sync engine will not
 *    push this local demo data to any backend.
 */
import { db } from './localDb';

const now = new Date();
const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => d.toISOString().split('T')[0];
const at = (dayOffset: number, hour = 9, min = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, min, 0, 0);
  return d;
};
const stamp = { created_at: iso(now), updated_at: iso(now) };

export async function seedDemoData(): Promise<boolean> {
  const existing = await db.clients.length();
  if (existing > 0) return false; // vault already has data — leave it alone

  // ---- Clients + Pets -----------------------------------------------------
  const people: Array<{ id: string; name: string; ltv: number; bal: number; status?: string; pets: Array<[string, string, string, string, number, string]> }> = [
    { id: '771234567', name: 'Kumara Perera', ltv: 4850000, bal: 0, pets: [['Bruno', 'Canine', 'German Shepherd', 'Male', 32, '4 years']] },
    { id: '772345678', name: 'Nimal Fernando', ltv: 2210000, bal: 0, pets: [['Rex', 'Canine', 'Labrador', 'Male', 28, '5 years'], ['Bella', 'Canine', 'Beagle', 'Female', 12, '2 years']] },
    { id: '773456789', name: 'Saman De Silva', ltv: 960000, bal: -150000, status: 'flagged_bad_debt', pets: [['Coco', 'Feline', 'Persian', 'Female', 4, '3 years']] },
    { id: '774567890', name: 'Anoma Jayawardena', ltv: 1740000, bal: 0, pets: [['Milo', 'Canine', 'Pomeranian', 'Male', 5, '1 year']] },
    { id: '775678901', name: 'Ruwan Bandara', ltv: 3300000, bal: 0, pets: [['Simba', 'Canine', 'Rottweiler', 'Male', 40, '6 years']] },
    { id: '776789012', name: 'Dilani Wickramasinghe', ltv: 520000, bal: 0, pets: [['Luna', 'Feline', 'Siamese', 'Female', 3, '2 years']] },
    { id: '777890123', name: 'Chaminda Rathnayake', ltv: 2680000, bal: 0, pets: [['Rocky', 'Canine', 'Bulldog', 'Male', 22, '4 years']] },
    { id: '778901234', name: 'Priya Gunasekara', ltv: 1180000, bal: 0, pets: [['Nala', 'Canine', 'Golden Retriever', 'Female', 30, '3 years']] },
  ];

  const petIdOf = (petName: string, id: string) => `${petName.toLowerCase()}_${id}`;

  for (const c of people) {
    const clientId = `client_${c.id}`;
    const petIds = c.pets.map(p => petIdOf(p[0], c.id));
    await db.clients.setItem(clientId, {
      client_id: clientId, full_name: c.name, primary_phone: `+94${c.id}`, alternate_phone: '',
      email_address: `${c.name.toLowerCase().replace(/[^a-z]/g, '')}@gmail.com`, physical_address: 'Kandy, Sri Lanka',
      communication_preference: 'sms', account_balance: c.bal, lifetime_value: c.ltv,
      client_status: c.status || 'active', administrative_notes: '', petIds, ...stamp,
    });
    for (const p of c.pets) {
      const pid = petIdOf(p[0], c.id);
      await db.pets.setItem(pid, {
        id: pid, clientId, name: p[0], petType: p[1], breed: p[2], sex: p[3], weight: p[4], age: p[5], ...stamp,
      });
    }
  }

  // ---- Inventory (only if empty) -----------------------------------------
  if ((await db.inventory.length()) === 0) {
    const inv: Array<[string, string, number, number, number, number, string]> = [
      ['Consultation / OPD', 'service', 1500, 600, 999, 10, 'session'],
      ['Surgical Procedure', 'service', 12000, 4000, 999, 10, 'session'],
      ['Grooming — Full Service', 'service', 3500, 1200, 999, 10, 'session'],
      ['Rabies Vaccine', 'vaccine', 2500, 900, 40, 10, 'vial'],
      ['DHPPi Vaccine', 'vaccine', 3200, 1200, 8, 10, 'vial'],
      ['Amoxicillin 250mg', 'prescription', 350, 120, 180, 30, 'tablet'],
      ['Anti-Tick Spot-On', 'prescription', 1800, 700, 6, 15, 'unit'],
      ['Premium Dog Food 3kg', 'food', 4200, 2800, 35, 10, 'bag'],
      ['Cat Food 2kg', 'food', 3100, 2000, 28, 10, 'bag'],
      ['Pet Shampoo', 'retail', 900, 350, 50, 10, 'bottle'],
      ['Chew Toy', 'retail', 650, 250, 70, 15, 'unit'],
      ['CBC Blood Panel', 'lab_service', 2800, 900, 999, 10, 'test'],
    ];
    for (let i = 0; i < inv.length; i++) {
      const [name, category, price, cost, stock, minStock, unit] = inv[i];
      const id = `inv_${1000 + i}`;
      await db.inventory.setItem(id, { id, sku: `SKU-${1000 + i}`, name, category, price, cost, stock, minStock, unit });
    }
  }

  // ---- Appointments + live clinic queue ----------------------------------
  // [petName, id, ownerName, admissionType, status, urgency, dayOffset, hour, breed, petType]
  const appts: Array<[string, string, string, string, string, string, number, number, string, string]> = [
    ['Bruno', '771234567', 'Kumara Perera', 'OPD', 'in-progress', 'routine', 0, 9, 'German Shepherd', 'Canine'],
    ['Coco', '773456789', 'Saman De Silva', 'Vaccination', 'in-progress', 'routine', 0, 10, 'Persian', 'Feline'],
    ['Simba', '775678901', 'Ruwan Bandara', 'Grooming Salon', 'in-progress', 'routine', 0, 10, 'Rottweiler', 'Canine'],
    ['Rocky', '777890123', 'Chaminda Rathnayake', 'OPD', 'in-progress', 'emergency', 0, 11, 'Bulldog', 'Canine'],
    ['Milo', '774567890', 'Anoma Jayawardena', 'OPD', 'booked', 'routine', 0, 15, 'Pomeranian', 'Canine'],
    ['Nala', '778901234', 'Priya Gunasekara', 'Vaccination', 'booked', 'routine', 1, 11, 'Golden Retriever', 'Canine'],
    ['Rex', '772345678', 'Nimal Fernando', 'OPD', 'completed', 'routine', 0, 8, 'Labrador', 'Canine'],
    ['Luna', '776789012', 'Dilani Wickramasinghe', 'Grooming Salon', 'completed', 'routine', 0, 8, 'Siamese', 'Feline'],
  ];
  let aptNo = 1000;
  const svcOf = (adm: string) => adm === 'Vaccination' ? 'Vaccination' : adm === 'Pet Boarding' ? 'Boarding' : adm === 'Grooming Salon' ? 'Grooming' : 'Examination';
  for (const a of appts) {
    const [petName, id, ownerName, adm, status, urgency, off, hour, breed, petType] = a as any;
    const aptId = `apt_${id}_${aptNo}`;
    const when = at(off, hour);
    await db.appointments.setItem(aptId, {
      id: aptId, aptNumber: `APT-${aptNo}`, petName, petType, breed, ownerName, ownerPhone: `+94${id}`,
      date: ymd(when), time: when.toTimeString().slice(0, 5), veterinarian: 'Dr. Anil Jayasuriya', assignedVet: 'Dr. Anil Jayasuriya',
      admissionType: adm, reason: adm === 'Vaccination' ? 'Annual booster' : adm === 'Grooming Salon' ? 'Full grooming session' : urgency === 'emergency' ? 'Acute distress — walk-in' : 'General check-up',
      status, urgency, emergencyBackfillRequired: false, ...stamp,
    });
    if (status === 'in-progress') {
      const qId = `queue_${aptId}`;
      await db.clinicQueue.setItem(qId, {
        id: qId, petId: petIdOf(petName, id), petName, ownerName, ownerPhone: `+94${id}`, appointmentId: aptId,
        serviceType: svcOf(adm), checkInTime: iso(when), status: 'active',
        priority: urgency === 'emergency' ? 0 : (urgency === 'non-emergency' ? 1 : 2),
        assignedVet: 'Dr. Anil Jayasuriya', urgency, emergencyBackfillRequired: false,
      });
    }
    aptNo++;
  }

  // ---- Invoices (revenue + category mix, dated across the month) ----------
  const mkItem = (name: string, category: string, price: number, qty: number) => ({ itemId: name.toLowerCase().replace(/[^a-z]/g, ''), sku: 'SKU', name, category, quantity: qty, unitPrice: price, totalPrice: price * qty });
  // [petName, id, ownerName, dayOffset, method, items...]
  const invoices: Array<any> = [
    ['Rex', '772345678', 'Nimal Fernando', 0, 'cash', [mkItem('Consultation / OPD', 'service', 1500, 1), mkItem('Amoxicillin 250mg', 'prescription', 350, 10)]],
    ['Luna', '776789012', 'Dilani Wickramasinghe', 0, 'card', [mkItem('Grooming — Full Service', 'service', 3500, 1), mkItem('Pet Shampoo', 'retail', 900, 1)]],
    ['Bruno', '771234567', 'Kumara Perera', 1, 'cash', [mkItem('Consultation / OPD', 'service', 1500, 1), mkItem('Rabies Vaccine', 'vaccine', 2500, 1)]],
    ['Coco', '773456789', 'Saman De Silva', 2, 'cash', [mkItem('DHPPi Vaccine', 'vaccine', 3200, 1)]],
    ['Simba', '775678901', 'Ruwan Bandara', 3, 'bank_transfer', [mkItem('Surgical Procedure', 'service', 12000, 1)]],
    ['Milo', '774567890', 'Anoma Jayawardena', 5, 'card', [mkItem('Premium Dog Food 3kg', 'food', 4200, 1), mkItem('Chew Toy', 'retail', 650, 2)]],
    ['Nala', '778901234', 'Priya Gunasekara', 8, 'cash', [mkItem('Consultation / OPD', 'service', 1500, 1), mkItem('CBC Blood Panel', 'lab_service', 2800, 1)]],
    ['Bella', '772345678', 'Nimal Fernando', 12, 'cash', [mkItem('Cat Food 2kg', 'food', 3100, 1)]],
    ['Rocky', '777890123', 'Chaminda Rathnayake', 18, 'card', [mkItem('Consultation / OPD', 'service', 1500, 1), mkItem('Anti-Tick Spot-On', 'prescription', 1800, 1)]],
    ['Coco', '773456789', 'Saman De Silva', 34, 'cash', [mkItem('Consultation / OPD', 'service', 1500, 1)]],
  ];
  let invNo = 5000;
  for (const v of invoices) {
    const [petName, id, ownerName, off, method, items] = v;
    const subtotal = items.reduce((s: number, it: any) => s + it.totalPrice, 0);
    const cogs = Math.round(subtotal * 0.4);
    const invId = `inv_${invNo}`;
    await db.invoices.setItem(invId, {
      id: invId, patientId: petIdOf(petName, id), petName, ownerName, ownerPhone: `+94${id}`, date: iso(at(-off, 12)),
      items, subtotal, tax: 0, discount: 0, sales_total: subtotal, cogs, profit: subtotal - cogs,
      paymentMethod: method, paymentStatus: 'paid', createdBy: 'Ceylon Pets POS Admin',
    });
    invNo++;
  }

  // ---- Boarding (occupied kennels) ---------------------------------------
  const boarders: Array<[string, string, string, boolean]> = [
    ['Bella', '772345678', 'Kennel 5', false],
    ['Luna', '776789012', 'Condo 2', false],
    ['Milo', '774567890', 'Kennel 3', true],
  ];
  for (const b of boarders) {
    const [petName, id, cage, medical] = b;
    const bid = `board_${petIdOf(petName, id)}`;
    await db.boardingRecords.setItem(bid, {
      id: bid, petId: petIdOf(petName, id), cageNumber: cage, checkInDate: ymd(at(-1)), expectedCheckOut: ymd(at(2)),
      status: 'active', foodType: 'with_food', medicalBoarding: medical, depositPaid: true, hospitalProvidesLitter: false,
      billingItems: [], estimatedStayDays: 3, depositAmountCents: 1500000, totalChargesCents: 0,
      cageFeePerDayCents: 150000, cleaningFeePerDayCents: 50000, doctorFeePerVisitCents: 500000, ...stamp,
    });
  }

  // ---- Lab results (pending → populates Lab queue) -----------------------
  await db.labResults.setItem('lab_rex', { id: 'lab_rex', petId: petIdOf('Rex', '772345678'), testName: 'CBC Blood Panel', requestDate: iso(at(0, 8)), status: 'pending', ...stamp });
  await db.labResults.setItem('lab_nala', { id: 'lab_nala', petId: petIdOf('Nala', '778901234'), testName: 'Biochemistry Profile', requestDate: iso(at(0, 9)), status: 'pending', ...stamp });

  // ---- Vaccinations (history) --------------------------------------------
  await db.vaccinations.setItem('vax_bruno', { id: 'vax_bruno', petId: petIdOf('Bruno', '771234567'), itemId: 'rabies', name: 'Rabies Vaccine', price: 2500, billed: true, dateAdministered: ymd(at(-120)), nextDueDate: ymd(at(245)), status: 'active', ...stamp });
  await db.vaccinations.setItem('vax_coco', { id: 'vax_coco', petId: petIdOf('Coco', '773456789'), itemId: 'dhppi', name: 'DHPPi Vaccine', price: 3200, billed: true, dateAdministered: ymd(at(-30)), nextDueDate: ymd(at(-2)), status: 'overdue', ...stamp });

  // ---- Grooming logs (history) -------------------------------------------
  await db.groomingLogs.setItem('groom_luna', { id: 'groom_luna', petId: petIdOf('Luna', '776789012'), date: ymd(at(-14)), services: ['Full Grooming', 'Nail Clipping'], totalBilled: 3500, status: 'completed', ...stamp });
  await db.groomingLogs.setItem('groom_simba', { id: 'groom_simba', petId: petIdOf('Simba', '775678901'), date: ymd(at(-40)), services: ['Bath & Dry'], totalBilled: 2000, status: 'completed', ...stamp });

  // ---- Staff -------------------------------------------------------------
  const staff: Array<[string, string, string, string, string, number]> = [
    ['Dr. Anil Jayasuriya', 'Head Veterinarian', 'Clinical', 'monthly', 'monthlySalary', 25000000],
    ['Dr. Fathima Nizar', 'Veterinarian', 'Clinical', 'monthly', 'monthlySalary', 18000000],
    ['Sanjaya Silva', 'Groomer', 'Grooming', 'hourly', 'hourlyRate', 45000],
    ['Malithi Perera', 'Receptionist', 'Admin', 'hourly', 'hourlyRate', 35000],
  ];
  for (let i = 0; i < staff.length; i++) {
    const [fullName, position, department, employmentType, rateField, rate] = staff[i];
    const id = `staff_${i + 1}`;
    await db.staffProfiles.setItem(id, {
      id, fullName, position, department, employmentType, [rateField]: rate,
      hireDate: ymd(at(-400 + i * 30)), active: true, ...stamp, is_deleted: false,
    });
  }

  return true;
}
