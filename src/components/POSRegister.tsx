/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Search, ShoppingCart, Plus, Minus, Trash2, CreditCard, 
  User, Calendar as CalendarIcon, FileText, ChevronRight, Activity, Receipt, Package,
  PenTool, CheckCircle2 // FIXED: Added missing icons
} from 'lucide-react';
import { InventoryItem, Appointment, Invoice, InvoiceItem, MedicalRecord } from '../types';
import { formatDisplayDate } from '../utils/time';
import { showToast } from './Toast';

interface POSProps {
  inventory: InventoryItem[];
  appointments: Appointment[];
  records: MedicalRecord[];
  onCheckout: (invoice: Invoice, updatedInventory: InventoryItem[]) => void;
  activeShiftId?: string;
  currentUser?: string;
}

interface CartItem extends InventoryItem {
  cartQuantity: number;
  cartId: string;
}

const normalizeSearchPhone = (p: string) => p ? p.replace(/\D/g, '').slice(-9) : '';

// FIXED: Default props added to prevent Uncaught TypeErrors if App.tsx fails to pass them
export default function POSRegister({ 
  inventory = [], 
  appointments = [], 
  records = [], 
  onCheckout, 
  activeShiftId, 
  currentUser 
}: POSProps) {
  
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash');
  
  // Checkout Context
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [customClientName, setCustomClientName] = useState('');
  const [customClientPhone, setCustomClientPhone] = useState('');

  const todayStr = formatDisplayDate(new Date());

  // ---------------------------------------------------------
  // INVENTORY & QUEUE LOGIC
  // ---------------------------------------------------------
  const filteredInventory = useMemo(() => {
    if (!searchQuery) return inventory;
    const q = searchQuery.toLowerCase();
    return inventory.filter(i => 
      i.name.toLowerCase().includes(q) || 
      i.sku.toLowerCase().includes(q)
    );
  }, [inventory, searchQuery]);

  const activeQueue = useMemo(() => {
    return appointments.filter(a => 
      a.date === todayStr && ['booked', 'in-progress', 'completed'].includes(a.status)
    ).sort((a, b) => {
      // Prioritize completed appointments waiting for payment
      if (a.status === 'completed' && b.status !== 'completed') return -1;
      if (b.status === 'completed' && a.status !== 'completed') return 1;
      return 0;
    });
  }, [appointments, todayStr]);

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
    const targetPid = `${(apt.petName || '').trim().toLowerCase()}_${normalizeSearchPhone(apt.ownerPhone)}`;
    const activeRecord = records.find(r => r.patientId === targetPid && r.visitDate === todayStr);

    let newCartItems: CartItem[] = [];

    // 1. Add Default Consultation Fee if exists in inventory
    const consultFee = inventory.find(i => i.name.toLowerCase().includes('consultation') || i.category === 'service');
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
    if (activeRecord && activeRecord.vaccinations) {
      activeRecord.vaccinations.forEach(vax => {
        if (!vax.billed) {
          const invItem = inventory.find(i => i.id === vax.itemId);
          if (invItem) {
            newCartItems.push({ ...invItem, cartQuantity: 1, cartId: crypto.randomUUID() });
          }
        }
      });
    }

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

  const handleCheckout = () => {
    if (cart.length === 0) {
      showToast('Cart is empty.', 'error');
      return;
    }

    const isWalkIn = !selectedAppointment;
    const clientName = isWalkIn ? (customClientName || 'Walk-in Client') : selectedAppointment.ownerName;
    const clientPhone = isWalkIn ? (customClientPhone || '0000000000') : selectedAppointment.ownerPhone;
    const petName = isWalkIn ? 'Retail Sale' : selectedAppointment.petName;
    const patientId = isWalkIn ? 'RETAIL' : `${selectedAppointment.petName.toLowerCase()}_${normalizeSearchPhone(selectedAppointment.ownerPhone)}`;

    const invoiceItems: InvoiceItem[] = cart.map(c => ({
      itemId: c.id,
      sku: c.sku,
      name: c.name,
      category: c.category,
      quantity: c.cartQuantity,
      unitPrice: c.price,
      totalPrice: c.price * c.cartQuantity
    }));

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
      paymentStatus: 'paid',
      createdBy: currentUser || 'Cashier',
      shiftId: activeShiftId
    };

    // Prepare inventory deductions (Ignore infinite stock categories)
    const updatedInventory = [...inventory];
    cart.forEach(cartItem => {
      if (!['service', 'lab_service'].includes(cartItem.category)) {
        const invIndex = updatedInventory.findIndex(i => i.id === cartItem.id);
        if (invIndex !== -1) {
          updatedInventory[invIndex] = {
            ...updatedInventory[invIndex],
            stock: Math.max(0, updatedInventory[invIndex].stock - cartItem.cartQuantity)
          };
        }
      }
    });

    onCheckout(invoice, updatedInventory);
    
    // Reset
    setCart([]);
    setDiscount(0);
    setSelectedAppointment(null);
    setCustomClientName('');
    setCustomClientPhone('');
  };

  return (
    <div className="flex h-full w-full gap-4 overflow-hidden" id="pos-register-container">
      
      {/* LEFT PANE: CHECKOUT CART */}
      <aside className="w-1/2 min-w-[400px] max-w-[500px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0 z-10">
        <div className="p-5 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between">
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
                <input type="text" placeholder="Walk-in Name (Opt)" value={customClientName} onChange={e => setCustomClientName(e.target.value)} className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-[10px] font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div>
                <input type="text" placeholder="Phone (Opt)" value={customClientPhone} onChange={e => setCustomClientPhone(e.target.value)} className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-[10px] font-bold font-mono text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 p-2 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-4">
              <Receipt className="w-16 h-16 text-slate-300"/>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cart is empty</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.cartId} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group animate-fade-in">
                <div className="flex-1 min-w-0 pr-4">
                  <div className="font-black text-slate-800 text-xs truncate">{item.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{item.category.replace('_', ' ')}</div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden shadow-inner">
                    <button onClick={() => updateCartQuantity(item.cartId, -1)} className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors cursor-pointer"><Minus className="w-3 h-3"/></button>
                    <div className="w-8 text-center text-xs font-black font-mono text-slate-800">{item.cartQuantity}</div>
                    <button onClick={() => updateCartQuantity(item.cartId, 1)} className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors cursor-pointer"><Plus className="w-3 h-3"/></button>
                  </div>
                  <div className="w-20 text-right font-black font-mono text-xs text-slate-800">
                    {(item.price * item.cartQuantity).toFixed(2)}
                  </div>
                  <button onClick={() => removeFromCart(item.cartId)} className="p-1.5 text-rose-400 hover:bg-rose-100 hover:text-rose-600 rounded-lg transition-colors cursor-pointer">
                    <Trash2 className="w-4 h-4"/>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Financial Totals & Checkout */}
        <div className="bg-white border-t border-slate-200 p-5 shrink-0 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-10">
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

          <button 
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className={`w-full py-3.5 rounded-xl font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 transition-all shadow-md ${cart.length > 0 ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'}`}
          >
            <CheckCircle2 className="w-5 h-5"/> Process Transaction
          </button>
        </div>
      </aside>

      {/* RIGHT PANE: DB SEARCH & E.H.R IMPORT */}
      <main className="flex-1 bg-white rounded-2xl flex flex-col border border-slate-200 shadow-sm overflow-hidden relative">
        
        {/* Top Search Bar */}
        <div className="p-5 border-b border-slate-100 bg-white shrink-0 flex items-center gap-4 z-10 shadow-sm">
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
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col xl:flex-row gap-6 p-6 bg-slate-50/50">
          
          {/* Inventory Grid */}
          <div className="flex-1">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
              <Package className="w-3.5 h-3.5"/> Inventory & Services
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredInventory.slice(0, 30).map(item => (
                <div key={item.id} onClick={() => addToCart(item, 1)} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between">
                  <div>
                    <div className="font-black text-slate-800 text-xs leading-tight mb-1">{item.name}</div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">{item.category.replace('_', ' ')}</div>
                  </div>
                  <div className="flex justify-between items-end border-t border-slate-50 pt-2">
                    <div className="font-mono text-xs font-black text-indigo-600">{item.price.toFixed(2)}</div>
                    {!['service', 'lab_service'].includes(item.category) && (
                      <div className={`text-[9px] font-bold ${item.stock <= item.minStock ? 'text-rose-500' : 'text-slate-400'}`}>
                        Stk: {item.stock}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {filteredInventory.length === 0 && <div className="col-span-full py-8 text-center text-[10px] font-bold text-slate-400">No items match search.</div>}
            </div>
          </div>

          {/* Active Queue / E.H.R Importer */}
          <div className="w-full xl:w-80 shrink-0">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5"/> Today's Clinical Queue
            </h3>
            <div className="space-y-3">
              {activeQueue.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-xl p-6 text-center shadow-sm">
                  <CalendarIcon className="w-8 h-8 text-slate-200 mx-auto mb-2"/>
                  <div className="text-[10px] font-bold text-slate-400">No active patients in clinic today.</div>
                </div>
              ) : (
                activeQueue.map(apt => {
                  const isSelected = selectedAppointment?.id === apt.id;
                  const isCompleted = apt.status === 'completed';
                  
                  return (
                    <div 
                      key={apt.id} 
                      onClick={() => handleSelectAppointment(apt)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer shadow-sm relative overflow-hidden ${isSelected ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
                    >
                      {isCompleted && !isSelected && <div className="absolute top-0 right-0 w-2 h-full bg-emerald-400"></div>}
                      <div className="flex justify-between items-start mb-1">
                        <div className={`font-black text-sm truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>{apt.petName}</div>
                        <div className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${isSelected ? 'bg-indigo-500 text-white' : isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isCompleted ? 'Ready' : 'In Clinic'}
                        </div>
                      </div>
                      <div className={`text-[10px] font-bold mb-3 ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>{apt.ownerName} • {apt.ownerPhone}</div>
                      
                      <div className={`border-t pt-3 flex items-center justify-between ${isSelected ? 'border-indigo-500' : 'border-slate-100'}`}>
                        <div className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${isSelected ? 'text-white' : 'text-indigo-600'}`}>
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
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}