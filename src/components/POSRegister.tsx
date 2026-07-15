/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import EmptyState from './ui/EmptyState';
import { Modal } from './ui/Modal';
import { createPortal } from 'react-dom';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, CreditCard,
  User, Calendar as CalendarIcon, FileText, ChevronRight, Activity, Receipt, Package,
  PenTool, CheckCircle2
} from 'lucide-react';
import PageShell from './ui/PageShell';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { InventoryItem, Appointment, Invoice, InvoiceItem, MedicalRecord, BoardingRecord, GroomingLog, LabResult, Vaccination, Pet, ClinicQueueItem, User as UserType } from '../types';
import { fetchInvoices, upsertInvoice, fetchPets, fetchBoardingRecords, fetchGroomingLogs, fetchLabResults, fetchVaccinations } from '../lib/db';
import { sortQueueByUrgency } from '../lib/queueUtils';
import PhoneInput from './PhoneInput';
import { formatDisplayDate } from '../utils/time';
import { showToast } from './Toast';
import POSReceipt from './POSReceipt';

const DISCOUNT_APPROVAL_THRESHOLD_PCT = 10;

interface POSProps {
  inventory: InventoryItem[];
  appointments: Appointment[];
  records: MedicalRecord[];
  clinicQueue?: ClinicQueueItem[];
  onCheckout?: (invoice: Invoice, updatedInventory: InventoryItem[]) => void;
  activeShiftId?: string;
  currentUser?: UserType;
  invoices?: Invoice[];
  onUpdateStock?: (itemId: string, qtyDelta: number, expectedStock?: number) => Promise<void>;
  onAddInvoice?: (invoice: any) => Promise<void>;
  onVoidInvoice?: (id: string) => Promise<void>;
  systemConfig?: any;
  onVerifyMasterPin?: (pin: string) => boolean;
  onTriggerInventorySync?: () => Promise<void>;
  activeShift?: any;
  incomingClient?: any;
  onUpdateRecord?: (record: MedicalRecord) => Promise<void>;
  onAtomicCheckout?: (invoice: Invoice, cart: any[]) => Promise<void>;
}

interface CartItem extends InventoryItem {
  cartQuantity: number;
  cartId: string;
  sourceRefs?: { type: 'vaccination' | 'grooming' | 'lab' | 'boarding'; id: string }[];
}

const normalizeSearchPhone = (p: string) => p ? p.replace(/\D/g, '').slice(-9) : '';

// FIXED: Default props added to prevent Uncaught TypeErrors if App.tsx fails to pass them
export default function POSRegister({ 
  inventory = [], 
  appointments = [], 
  records = [], 
  clinicQueue = [],
  onAddInvoice, 
  onUpdateStock,
  onAtomicCheckout,
  activeShiftId,
  activeShift,
  currentUser,
  systemConfig,
  invoices = [],
  onVerifyMasterPin
}: POSProps) {
  
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);

  const [pets, setPets] = useState<Pet[]>([]);
  const [activeBoarding, setActiveBoarding] = useState<BoardingRecord[]>([]);
  const [groomingLogs, setGroomingLogs] = useState<GroomingLog[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);

  React.useEffect(() => {
    fetchPets().then(setPets).catch(console.error);
    fetchBoardingRecords().then(setActiveBoarding).catch(console.error);
    fetchGroomingLogs().then(setGroomingLogs).catch(console.error);
    fetchLabResults().then(setLabResults).catch(console.error);
    fetchVaccinations().then(setVaccinations).catch(console.error);
  }, []);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'split'>('cash');
  const [splitAmounts, setSplitAmounts] = useState({ cash: 0, card: 0, bank_transfer: 0 });
  
  // Checkout Context
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [customClientName, setCustomClientName] = useState('');
  const [customClientPhone, setCustomClientPhone] = useState('');
  const [lastCompletedInvoice, setLastCompletedInvoice] = useState<Invoice | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const todayStr = formatDisplayDate(new Date());

  // ---------------------------------------------------------
  // INVENTORY & QUEUE LOGIC
  // ---------------------------------------------------------
  const filteredInventory = useMemo(() => {
    // Directly-sellable stock: retail, food, pharmacy (prescription) and vaccines.
    // Clinical services (consultation/surgery/lab) are NOT walk-in sellable — they
    // come in via "Import from EHR" so a medical chart backs every service charge.
    const SELLABLE = ['retail', 'food', 'prescription', 'vaccine'];
    const allowed = inventory.filter(i => SELLABLE.includes(i.category));
    if (!searchQuery) return allowed;
    const q = searchQuery.toLowerCase();
    return allowed.filter(i => 
      i.name.toLowerCase().includes(q) || 
      i.sku.toLowerCase().includes(q)
    );
  }, [inventory, searchQuery]);

  const awaitingCheckoutQueue = useMemo(() => {
    return sortQueueByUrgency(clinicQueue.filter(q => q.status === 'active'));
  }, [clinicQueue]);

  const unbilledAppointments = useMemo(() => {
    return appointments.filter(a => {
      if (a.date !== todayStr) return false;
      if (a.status !== 'completed') return false;
      const hasPaidInvoice = (invoices || []).some(inv => inv.appointmentId === a.id && inv.paymentStatus === 'paid');
      return !hasPaidInvoice;
    });
  }, [appointments, invoices, todayStr]);

  // ---------------------------------------------------------
  // CART OPERATIONS
  // ---------------------------------------------------------
  const addToCart = (item: InventoryItem, qty: number = 1) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, cartQuantity: i.cartQuantity + qty } : i);
      }
      return [...prev, { ...item, cartQuantity: qty, cartId: crypto.randomUUID() }];
    });
  };

  const removeFromCart = (cartId: string) => {
    setCart(prev => prev.filter(i => i.cartId !== cartId));
  };

  const updateCartQuantity = (cartId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.cartId === cartId) {
        const newQty = Math.max(1, i.cartQuantity + delta);
        return { ...i, cartQuantity: newQty };
      }
      return i;
    }));
  };

  const clearCart = () => {
    if (window.confirm('Clear all items from the current transaction?')) {
      setCart([]);
      setDiscount(0);
      setPaymentMethod('cash');
      setSplitAmounts({ cash: 0, card: 0, bank_transfer: 0 });
      setSelectedAppointment(null);
      setCustomClientName('');
      setCustomClientPhone('');
    }
  };

  // ---------------------------------------------------------
  // E.H.R AUTO-SCRAPER ENGINE
  // ---------------------------------------------------------
  const handleSelectAppointment = (apt: Appointment) => {
    setSelectedAppointment(apt);
    setCustomClientName('');
    setCustomClientPhone('');
    
    // Auto-Scrape Logic
    // AUDIT FIX: Multi-day charge sweep — find today's record
    const petStub = pets.find(p => p.name.toLowerCase() === (apt.petName || '').trim().toLowerCase());
    const targetPid = petStub ? petStub.id : `${(apt.petName || '').trim().toLowerCase()}_${normalizeSearchPhone(apt.ownerPhone)}`;

    const allPatientRecords = records.filter(r => r.patientId === targetPid);
    const activeRecord = allPatientRecords.find(r => r.visitDate === todayStr);

    const targetBoarding = activeBoarding.filter(b => b.petId === targetPid && b.status === 'active' && !b.billed);

    let newCartItems: CartItem[] = [];

    // 1. Add Default Consultation Fee if exists in inventory
    // FIXED: Was `|| i.category === 'service'` which grabbed ANY service (like grooming)
    const consultFee = inventory.find(i => i.name.toLowerCase().includes('consultation'));
    if (consultFee && cart.length === 0) {
      newCartItems.push({ ...consultFee, cartQuantity: 1, cartId: crypto.randomUUID() });
    }

    // 2. Scrape Prescribed Meds & Lab Tests
    if (activeRecord && activeRecord.prescribedMeds) {
      activeRecord.prescribedMeds.forEach(med => {
        const invItem = inventory.find(i => i.id === med.itemId);
        if (invItem) {
          // Check if it's already in the scrape list to aggregate quantities
          const existing = newCartItems.find(i => i.id === invItem.id);
          if (existing) {
            existing.cartQuantity += med.quantity;
          } else {
            newCartItems.push({ ...invItem, cartQuantity: med.quantity, cartId: crypto.randomUUID() });
          }
        }
      });
    }

    // 3. Scrape Unbilled Vaccinations
    const unbilledVax = vaccinations.filter(v => v.petId === targetPid && !v.billed);
    unbilledVax.forEach(vax => {
      const invItem = inventory.find(i => i.id === vax.itemId);
      if (invItem) {
        const existing = newCartItems.find(i => i.id === invItem.id);
        if (existing) {
          existing.cartQuantity += 1;
          if (!existing.sourceRefs) existing.sourceRefs = [];
          existing.sourceRefs.push({ type: 'vaccination', id: vax.id });
        } else {
          newCartItems.push({ 
            ...invItem, 
            cartQuantity: 1, 
            cartId: crypto.randomUUID(),
            sourceRefs: [{ type: 'vaccination', id: vax.id }]
          });
        }
      }
    });

    // 4. AUDIT FIX: Sweep native billing items from Grooming, Labs, and Boarding
    const sweepBillingItems = (items: any[], sourceType: 'vaccination' | 'grooming' | 'lab' | 'boarding', sourceId: string) => {
      items.forEach(med => {
        const invItem = inventory.find(i => i.id === med.itemId);
        if (invItem) {
          const existing = newCartItems.find(i => i.id === invItem.id);
          if (existing) {
            existing.cartQuantity += med.quantity || 1;
            if (!existing.sourceRefs) existing.sourceRefs = [];
            existing.sourceRefs.push({ type: sourceType, id: sourceId });
          } else {
            newCartItems.push({ 
              ...invItem, 
              cartQuantity: med.quantity || 1, 
              cartId: crypto.randomUUID(),
              sourceRefs: [{ type: sourceType, id: sourceId }]
            });
          }
        }
      });
    };

    // Sweep native arrays replacing the prescribedMeds hack
    const patientGrooming = groomingLogs.filter(l => l.petId === targetPid && !l.billed);
    patientGrooming.forEach(log => {
      if (log.billingItems) sweepBillingItems(log.billingItems, 'grooming', log.id);
    });
    
    const patientLabs = labResults.filter(l => l.petId === targetPid && !l.billed);
    patientLabs.forEach(res => {
      if (res.billingItems) sweepBillingItems(res.billingItems, 'lab', res.id);
    });

    targetBoarding.forEach(rec => {
      if (rec.billingItems) sweepBillingItems(rec.billingItems, 'boarding', rec.id);
    });

    if (newCartItems.length > 0) {
      setCart(newCartItems);
      showToast(`Imported ${newCartItems.length} billable items from E.H.R.`, 'success');
    } else {
      setCart(newCartItems);
      showToast('No active charges found in E.H.R. Manual entry required.', 'info');
    }
  };

  // ---------------------------------------------------------
  // FINANCIAL MATH & CHECKOUT
  // ---------------------------------------------------------
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.cartQuantity), 0);
  const totalCostOfGoods = cart.reduce((sum, item) => sum + (item.cost * item.cartQuantity), 0);
  const total = Math.max(0, subtotal - discount);

  const handleCheckout = async () => {
    console.log('[POS] handleCheckout initiated. Cart size:', cart.length, 'Total:', total);
    if (cart.length === 0) {
      showToast('Cart is empty.', 'error');
      return;
    }

    if (discount > 0 && subtotal > 0) {
      const discountPct = (discount / subtotal) * 100;
      if (discountPct > DISCOUNT_APPROVAL_THRESHOLD_PCT) {
        if (!onVerifyMasterPin) {
          showToast('Master PIN verification unavailable.', 'error');
          return;
        }
        const pin = window.prompt(`AUTHORIZATION REQUIRED: Discount of ${discountPct.toFixed(1)}% exceeds approval threshold (${DISCOUNT_APPROVAL_THRESHOLD_PCT}%). Enter Master PIN:`);
        if (!pin || !onVerifyMasterPin(pin)) {
          showToast('Discount authorization failed.', 'error');
          return;
        }
      }
    }

    // FIXED: Stock validation — prevent over-selling
    console.log('[POS] Checkout initiated. Cart size:', cart.length, 'Total:', subtotal);
    console.log('[POS] Current inventory prop size:', inventory.length);
    const overSoldItems = cart.filter(c => {
      const invItem = inventory.find(i => i.id === c.id);
      console.log('[POS] Checkout stock check:', c.name, 'cartQty:', c.cartQuantity, 'invStock:', invItem?.stock, 'invId:', invItem?.id);
      return invItem && !['service', 'lab_service'].includes(invItem.category) && c.cartQuantity > invItem.stock;
    });
    if (overSoldItems.length > 0) {
      console.error('[POS] Insufficient stock for:', overSoldItems.map(i => i.name).join(', '));
      showToast(`Insufficient stock for: ${overSoldItems.map(i => i.name).join(', ')}`, 'error');
      return;
    }

    console.log('[POS] Passed stock validation. Building invoice...');
    
    const isWalkIn = !selectedAppointment;
    const clientName = isWalkIn ? (customClientName || 'Walk-in Client') : selectedAppointment.ownerName;
    const clientPhone = isWalkIn ? (customClientPhone || '0000000000') : selectedAppointment.ownerPhone;
    const petName = isWalkIn ? 'Retail Sale' : selectedAppointment.petName;
    
    console.log('[POS] Resolving patientId...');
    const patientId = isWalkIn ? 'RETAIL' : `${selectedAppointment.petName.toLowerCase().trim()}_${normalizeSearchPhone(selectedAppointment.ownerPhone)}`;

    console.log('[POS] Mapping cart items...');
    const invoiceItems: InvoiceItem[] = cart.map(c => {
      const numericPrice = Number(c.price) || 0;
      return {
        itemId: c.id,
        sku: c.sku,
        name: c.name,
        category: c.category,
        quantity: c.cartQuantity,
        unitPrice: numericPrice,
        totalPrice: numericPrice * c.cartQuantity
      };
    });

    const invoice: Invoice = {
      id: crypto.randomUUID(),
      appointmentId: selectedAppointment?.id,
      patientId,
      petName,
      ownerName: clientName,
      ownerPhone: clientPhone,
      date: new Date().toISOString(),
      items: invoiceItems,
      subtotal,
      tax: 0, 
      discount,
      sales_total: total,
      cogs: totalCostOfGoods,
      profit: total - totalCostOfGoods,
      paymentMethod,
      splitPayments: paymentMethod === 'split' ? [
        { method: 'cash' as const, amount: splitAmounts.cash },
        { method: 'card' as const, amount: splitAmounts.card },
        { method: 'bank_transfer' as const, amount: splitAmounts.bank_transfer }
      ].filter(p => p.amount > 0) : undefined,
      paymentStatus: 'paid',
      createdBy: currentUser?.name || 'Cashier',
      shiftId: activeShiftId
    };

    try {
      console.log('[POS] Calling onAtomicCheckout...');
      if (onAtomicCheckout) {
        await onAtomicCheckout(invoice, cart);
      }
      console.log('[POS] onAtomicCheckout completed.');

      showToast(`Transaction completed — Invoice #${invoice.id.slice(0,8)}`, 'success');

      // Receipt preview trigger
      console.log('[POS] Triggering receipt modal...');
      setLastCompletedInvoice(invoice);
      setShowReceiptModal(true);
      console.log('[POS] Receipt modal triggered.');
    } catch (error: any) {
      console.error('Checkout failed:', error);
      showToast(error.message || 'Checkout failed', 'error');
    }
  };

  return (
    <PageShell title="POS Register">
    <div className="flex h-full w-full gap-4 overflow-hidden" id="pos-register-container">
      
      {/* LEFT PANE: CHECKOUT CART */}
      <aside className="w-1/2 min-w-[400px] max-w-[500px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0 z-10">
        <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-indigo-600" /> Active Register
          </h2>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-[10px] font-black text-rose-500 hover:text-rose-700 uppercase tracking-widest transition-colors cursor-pointer">
              Void Cart
            </button>
          )}
        </div>

        {/* Client Context Header */}
        <div className="bg-indigo-50 border-b border-indigo-100 p-4 shrink-0 flex items-center justify-between">
          {selectedAppointment ? (
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-sm"><User className="w-4 h-4"/></div>
              <div>
                <div className="text-xs font-black text-indigo-900">{selectedAppointment.ownerName} <span className="text-[10px] text-indigo-500 font-bold ml-1">• {selectedAppointment.petName}</span></div>
                <div className="text-[10px] font-bold text-indigo-700 font-mono mt-0.5">{selectedAppointment.ownerPhone}</div>
              </div>
            </div>
          ) : (
            <div className="w-full grid grid-cols-2 gap-3">
              <div>
                <input type="text" placeholder="Walk-in Name (Opt)" value={customClientName} onChange={e => setCustomClientName(e.target.value)} className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-[10px] font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div>
                <PhoneInput value={customClientPhone} onChange={setCustomClientPhone} className="w-full" />
              </div>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 p-2 space-y-2">
          {cart.length === 0 ? (
            <EmptyState icon={<Receipt className="w-6 h-6 text-slate-400" />} title="Cart is empty" className="opacity-50" />
          ) : (
            cart.map(item => (
              <div key={item.cartId} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group animate-fade-in">
                <div className="flex-1 min-w-0 pr-4">
                  <div className="font-black text-slate-800 text-xs truncate">{item.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{item.category.replace('_', ' ')}</div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-inner">
                    <button onClick={() => updateCartQuantity(item.cartId, -1)} className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors cursor-pointer"><Minus className="w-3 h-3"/></button>
                    <div className="w-8 text-center text-xs font-black font-mono text-slate-800">{item.cartQuantity}</div>
                    <button onClick={() => updateCartQuantity(item.cartId, 1)} className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors cursor-pointer"><Plus className="w-3 h-3"/></button>
                  </div>
                  <div className="w-20 text-right font-black font-mono text-xs text-slate-800">
                    {(item.price * item.cartQuantity).toFixed(2)}
                  </div>
                  <button onClick={() => removeFromCart(item.cartId)} className="p-1.5 text-rose-400 hover:bg-rose-100 hover:text-rose-600 rounded-xl transition-colors cursor-pointer">
                    <Trash2 className="w-4 h-4"/>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Financial Totals & Checkout */}
        <div className="bg-white border-t border-slate-200 p-4 shrink-0 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-10">
          <div className="space-y-2 mb-4">
            <div className="flex justify-between items-center text-xs font-bold text-slate-500">
              <span>Subtotal</span>
              <span className="font-mono">{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-xs font-bold text-slate-500">
              <span className="flex items-center gap-2">Discount <PenTool className="w-3 h-3"/></span>
              <div className="relative w-24">
                <span className="absolute left-2 top-1 text-[10px] font-mono">-</span>
                <input type="number" min="0" step="0.01" value={discount || ''} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} className="w-full text-right bg-slate-50 border border-slate-200 rounded text-[10px] font-mono font-bold py-1 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <span className="text-sm font-black text-slate-800 uppercase tracking-widest">Total Due</span>
              <span className="text-2xl font-black text-emerald-600 font-mono tracking-tight">{total.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-2 mb-4 bg-slate-50 p-1 rounded-xl border border-slate-200">
            <button 
              onClick={() => { setPaymentMethod('cash'); setSplitAmounts({ cash: 0, card: 0, bank_transfer: 0 }); }}
              className={`flex-1 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all ${paymentMethod !== 'split' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Single
            </button>
            <button 
              onClick={() => { 
                setPaymentMethod('split'); 
                setSplitAmounts({ cash: total, card: 0, bank_transfer: 0 }); 
              }}
              className={`flex-1 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all ${paymentMethod === 'split' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Split Payment
            </button>
          </div>

          {paymentMethod !== 'split' ? (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['cash', 'card', 'bank_transfer'].map(method => (
                <button 
                  key={method} 
                  onClick={() => setPaymentMethod(method as any)}
                  className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex flex-col items-center gap-1 transition-all border cursor-pointer ${paymentMethod === method ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  <CreditCard className="w-4 h-4"/>
                  {method.replace('_', ' ')}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Cash Amount</span>
                <input type="number" min="0" step="0.01" value={splitAmounts.cash || ''} onChange={e => setSplitAmounts(prev => ({ ...prev, cash: parseFloat(e.target.value) || 0 }))} className="w-24 text-right bg-white border border-slate-300 rounded font-mono p-1 focus:ring-1 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Card Amount</span>
                <input type="number" min="0" step="0.01" value={splitAmounts.card || ''} onChange={e => setSplitAmounts(prev => ({ ...prev, card: parseFloat(e.target.value) || 0 }))} className="w-24 text-right bg-white border border-slate-300 rounded font-mono p-1 focus:ring-1 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Bank Transfer</span>
                <input type="number" min="0" step="0.01" value={splitAmounts.bank_transfer || ''} onChange={e => setSplitAmounts(prev => ({ ...prev, bank_transfer: parseFloat(e.target.value) || 0 }))} className="w-24 text-right bg-white border border-slate-300 rounded font-mono p-1 focus:ring-1 focus:ring-indigo-500 outline-none" />
              </div>
              {(() => {
                const diff = (total - (splitAmounts.cash + splitAmounts.card + splitAmounts.bank_transfer)).toFixed(2);
                const isBalanced = Math.abs(parseFloat(diff)) < 0.01;
                return (
                  <div className={`text-[10px] font-black uppercase tracking-widest text-right mt-2 ${isBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isBalanced ? 'Balanced' : `Remaining: ${diff}`}
                  </div>
                );
              })()}
            </div>
          )}

          <Button
            data-testid="btn-checkout"
            onClick={handleCheckout}
            disabled={cart.length === 0 || (paymentMethod === 'split' && Math.abs(total - (splitAmounts.cash + splitAmounts.card + splitAmounts.bank_transfer)) >= 0.01)}
            className="w-full py-3.5"
          >
            <CheckCircle2 className="w-5 h-5"/> Process Transaction
          </Button>
        </div>
      </aside>

      {/* RIGHT PANE: DB SEARCH & E.H.R IMPORT */}
      <main className="flex-1 bg-white rounded-2xl flex flex-col border border-slate-200 shadow-sm overflow-hidden relative">
        
        {/* Top Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-white shrink-0 flex items-center gap-4 z-10 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Scan Barcode or Search Inventory / Services..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" 
              autoFocus
            />
            <div className="text-[10px] text-slate-500 mt-2 font-black">
              Showing sellable stock — retail, food, pharmacy &amp; vaccines. Clinical services are added via Import from EHR.
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col 2xl:flex-row gap-4 p-4 bg-slate-50/50">

          {/* Inventory Grid */}
          <div className="flex-1">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
              <Package className="w-3.5 h-3.5"/> Inventory & Services
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {filteredInventory.slice(0, 30).map(item => (
                <div key={item.id} onClick={() => addToCart(item, 1)} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between">
                  <div>
                    <div className="font-black text-slate-800 text-xs leading-tight mb-1">{item.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{item.category.replace('_', ' ')}</div>
                  </div>
                  <div className="flex justify-between items-end border-t border-slate-50 pt-2">
                    <div className="font-mono text-xs font-black text-indigo-600">{(item.price || 0).toFixed(2)}</div>
                    {!['service', 'lab_service'].includes(item.category) && (
                      <div className={`text-[10px] font-bold ${item.stock <= item.minStock ? 'text-rose-500' : 'text-slate-400'}`}>
                        Stk: {item.stock}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {filteredInventory.length === 0 && <div className="col-span-full py-8"><EmptyState icon={<Package className="w-8 h-8 opacity-50" />} title="No Items Match Search" /></div>}
            </div>
          </div>

          {/* Active Queue / E.H.R Importer */}
          <div className="w-full 2xl:w-80 shrink-0">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5"/> Today's Clinical Queue
            </h3>
            <div className="space-y-6">
              
              {/* SECTION: Awaiting Checkout */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Awaiting Checkout</h4>
                <div className="space-y-3">
                  {awaitingCheckoutQueue.length === 0 ? (
                    <div className="text-[10px] text-slate-400 italic px-2">No patients active.</div>
                  ) : (
                    awaitingCheckoutQueue.map(q => {
                      const apt = appointments.find(a => a.id === q.appointmentId);
                      if (!apt) return null;
                      const isSelected = selectedAppointment?.id === apt.id;
                      
                      return (
                        <div
                          key={q.id}
                          data-testid="btn-import-ehr"
                          onClick={() => handleSelectAppointment(apt)}
                          className={`p-4 rounded-xl border transition-all cursor-pointer shadow-sm relative overflow-hidden ${isSelected ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div className={`font-black text-sm truncate flex items-center gap-1.5 ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                              {q.petName}
                              {q.urgency === 'emergency' && <Badge tone="rose">EMERGENCY</Badge>}
                              {q.urgency === 'non-emergency' && <Badge tone="amber">URGENT</Badge>}
                            </div>
                            <div className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 ${isSelected ? 'bg-indigo-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
                              In Clinic
                            </div>
                          </div>
                          {q.emergencyBackfillRequired && (
                            <div className={`text-[10px] font-black uppercase tracking-wider mb-1 ${isSelected ? 'text-amber-200' : 'text-amber-700'}`}>⚠ DETAILS PENDING</div>
                          )}
                          <div className={`text-[10px] font-bold mb-3 ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>{q.ownerName} • {q.ownerPhone}</div>

                          <div className={`border-t pt-3 flex items-center justify-between ${isSelected ? 'border-indigo-500' : 'border-slate-100'}`}>
                            <div className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${isSelected ? 'text-white' : 'text-indigo-600'}`}>
                              <FileText className="w-3 h-3"/> Import E.H.R Charges
                            </div>
                            <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-indigo-300' : 'text-slate-300'}`}/>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* SECTION: Seen Today - Not Yet Billed */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Seen Today — Not Yet Billed</h4>
                <div className="space-y-3">
                  {unbilledAppointments.length === 0 ? (
                    <div className="text-[10px] text-slate-400 italic px-2">No unbilled checkouts.</div>
                  ) : (
                    unbilledAppointments.map(apt => {
                      const isSelected = selectedAppointment?.id === apt.id;
                      
                      return (
                        <div
                          key={apt.id}
                          data-testid="btn-import-ehr"
                          onClick={() => handleSelectAppointment(apt)}
                          className={`p-4 rounded-xl border transition-all cursor-pointer shadow-sm relative overflow-hidden ${isSelected ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
                        >
                          {!isSelected && <div className="absolute top-0 right-0 w-2 h-full bg-emerald-400"></div>}
                          <div className="flex justify-between items-start mb-1">
                            <div className={`font-black text-sm truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>{apt.petName}</div>
                            <div className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${isSelected ? 'bg-indigo-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                              Ready
                            </div>
                          </div>
                          <div className={`text-[10px] font-bold mb-3 ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>{apt.ownerName} • {apt.ownerPhone}</div>
                          
                          <div className={`border-t pt-3 flex items-center justify-between ${isSelected ? 'border-indigo-500' : 'border-slate-100'}`}>
                            <div className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${isSelected ? 'text-white' : 'text-indigo-600'}`}>
                              <FileText className="w-3 h-3"/> Import E.H.R Charges
                            </div>
                            <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-indigo-300' : 'text-slate-300'}`}/>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>
      </main>

      <Modal
        open={showReceiptModal}
        onClose={() => {
          setCart([]);
          setDiscount(0);
          setSelectedAppointment(null);
          setCustomClientName('');
          setCustomClientPhone('');
          setLastCompletedInvoice(null);
          setShowReceiptModal(false);
        }}
        size="md"
        title="Receipt Preview"
        icon={<div className="bg-indigo-100 p-2 rounded-xl text-indigo-600"><Receipt className="w-5 h-5" /></div>}
        footer={
          <>
            <Button 
              variant="secondary"
              onClick={() => {
                setCart([]);
                setDiscount(0);
                setSelectedAppointment(null);
                setCustomClientName('');
                setCustomClientPhone('');
                setLastCompletedInvoice(null);
                setShowReceiptModal(false);
              }}
              className="flex-1 bg-white border border-slate-200"
            >
              Done
            </Button>
            <Button 
              onClick={() => window.print()}
              className="flex-1"
            >
              🖨 Print Receipt
            </Button>
          </>
        }
      >
        <div className="bg-slate-200 -mx-6 -my-4 p-6 flex justify-center">
          <POSReceipt invoice={lastCompletedInvoice} systemConfig={systemConfig || {}} />
        </div>
      </Modal>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
    </PageShell>
  );
}