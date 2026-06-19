import { InventoryItem, Appointment } from './types';

export const initialStaffState = [{ name: 'System Administrator', username: 'admin', role: 'OWNER', pin: '0000' }]; 

export const INITIAL_INVENTORY: InventoryItem[] = [
  {
    id: '1001',
    sku: 'CP-V-01',
    name: 'General Consultation',
    category: 'service',
    price: 1500.00,
    cost: 0,
    stock: 0,
    minStock: 0,
    unit: 'visit',
    location: 'OPD Room 1'
  },
  {
    id: '1002',
    sku: 'CP-R-02',
    name: 'Simba Premium Kitten Kibble',
    category: 'retail',
    price: 3850.00,
    cost: 2900.00,
    stock: 45,
    minStock: 5,
    unit: 'pack',
    location: 'Aisle A'
  }
];

export const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: '2001',
    petName: 'Simba',
    petType: 'Feline',
    breed: 'Domestic Shorthair',
    ownerName: 'Asher Hasher',
    ownerPhone: '0771234567',
    ownerEmail: 'asher@example.com',
    date: '2026-06-15',
    time: '10:30',
    veterinarian: 'Dr. Bandara',
    reason: 'Routine health checkup and feline booster shots.',
    status: 'booked'
  }
];
