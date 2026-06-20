import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShoppingBag, Search, Tag, Trash2, Plus, Minus, UserPlus, CreditCard, Coins, FileText, Printer, ArrowRight, Lock, Activity, Sparkles, QrCode } from 'lucide-react';
import { InventoryItem, Appointment, Invoice, InvoiceItem, PaymentMethod, User as StaffUser, MedicalRecord, ActiveShift } from '../types';
import { showToast } from './Toast';
import { addRevenueToActiveShift } from '../lib/db';

interface POSProps {
  inventory: InventoryItem[]; appointments: Appointment[]; records: MedicalRecord[];
  isOnline: boolean; currentUser: StaffUser; invoices: Invoice[];
  onUpdateStock: (itemId: string, qtyDelta: number, expectedStock?: number) => Promise<void>;
  onAddInvoice: (invoice: Invoice) => Promise<void>;
  onVoidInvoice: (invoiceId: string) => void;
  systemConfig?: any; onVerifyMasterPin?: (pin: string) => boolean;
  onTriggerInventorySync?: () => void; incomingClient?: { phone: string; name: string; id: string } | null;
  activeShift: ActiveShift | null;
  onUpdateRecord: (record: MedicalRecord) => void;
}

interface ActiveClient { id: string; name: string; phone: string; petName?: string; appointmentId?: string; }

export default function POSRegister({ inventory, appointments, records, currentUser, invoices, onUpdateStock, onAddInvoice, onVoidInvoice, systemConfig, onVerifyMasterPin, incomingClient, activeShift, onUpdateRecord }: POSProps) {
  
  if (!activeShift) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8 h-[calc(100vh-140px)]">
        <div className="bg-white p-10 rounded-3xl shadow-xl flex flex-col items-center text-center max-w-md border border-slate-200 animate-scale-up">
          <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-6"><Lock className="w-10 h-10" /></div>
          <h2 className="text-xl font-black text-slate-800 mb-2">🔒 REGISTER IS CLOSED</h2>
          <p className="text-slate-500 font-semibold mb-8 text-xs leading-relaxed">No active shift detected. Please navigate to the Shift & Drawer panel to open the register with your starting float.</p>
        </div>
      </div>
    );
  }

  // Bug #7 Fix: Always track the latest records prop to prevent stale closure in checkout
  const recordsRef = useRef(records);
  useEffect(() => { recordsRef.current = records; }, [records]);

  const [activeTab, setActiveTab] = useState<'queue' | 'quick' | 'search'>('queue');
  const [isWalkIn, setIsWalkIn] = useState(!incomingClient);
  const [selectedClient, setSelectedClient] = useState<ActiveClient | null>(incomingClient ? { id: incomingClient.id, name: incomingClient.name, phone: incomingClient.phone } : null);
  const [cart, setCart] = useState<Array<{ item: InventoryItem; quantity: number }>>([]);
  const [discountVal, setDiscountVal] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [checkoutSuccess, setCheckoutSuccess] = useState<Invoice | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedInvoiceDetails, setSelectedInvoiceDetails] = useState<Invoice | null>(null);
  const cashInputRef = useRef<HTMLInputElement>(null);

  const [showPinChallenge, setShowPinChallenge] = useState(false);
  const [challengeInvoiceId, setChallengeInvoiceId] = useState<string | null>(null);
  const [enteredChallengePin, setEnteredChallengePin] = useState('');
  const [challengePinError, setChallengePinError] = useState(false);

  useEffect(() => {
    if (incomingClient) { setIsWalkIn(false); setSelectedClient({ id: incomingClient.id, name: incomingClient.name, phone: incomingClient.phone }); }
  }, [incomingClient]);

  useEffect(() => {
    if (isWalkIn) setSelectedClient({ id: 'walk_in_retail', name: 'Walk-In / Retail Customer', phone: '0000000000' });
    else if (selectedClient?.id === 'walk_in_retail') setSelectedClient(null);
  }, [isWalkIn]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowCheckoutModal(false); if (checkoutSuccess) setCheckoutSuccess(null); }
      if (checkoutSuccess && e.key === 'Enter') { e.preventDefault(); handlePrintReceipt(checkoutSuccess); }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showCheckoutModal, checkoutSuccess]);

  const normalizePhone = (p: string) => p.replace(/\D/g, '');

  const handleQueueClick = (apt: Appointment) => {
    setIsWalkIn(false);
    const matchedRec = records.find(r => r.petName === apt.petName && normalizePhone(r.ownerPhone) === normalizePhone(apt.ownerPhone));
    setSelectedClient({ id: matchedRec?.patientId || apt.id, name: apt.ownerName, phone: apt.ownerPhone, petName: apt.petName, appointmentId: apt.id });
    let consultFeeAlreadyInjected = false;
    if (matchedRec && matchedRec.prescribedMeds) {
      matchedRec.prescribedMeds.forEach(med => {
        if (med.itemId === 'consult_fee') consultFeeAlreadyInjected = true;
        const invItem = inventory.find(i => i.id === med.itemId);
        if (invItem) addToCart(invItem, med.quantity || 1);
        else if (med.itemId === 'boarding_deposit' || med.itemId === 'boarding_rate') {
            const rateItem = inventory.find(i => i.id === 'boarding_rate' || i.name.toLowerCase().includes('boarding'));
            const actualRate = rateItem ? rateItem.price : 2500;
            const appliedPrice = med.itemId === 'boarding_deposit' ? -15000 : actualRate;
            
            addToCart({ id: med.itemId, sku: 'SRV-BRD', name: med.name, category: 'service', price: appliedPrice, cost: 0, stock: 999, minStock: 0, unit: 'Session' }, med.quantity);
        }
      });
    }
    // Bug #3 Fix: Only inject consult fee if prescribedMeds did NOT already contain one
    if (!consultFeeAlreadyInjected) {
      const consultFee = inventory.find(i => i.category === 'service' && i.name.toLowerCase().includes('consult'));
      if (consultFee) addToCart(consultFee, 1);
    }
    showToast(`Session locked to ${apt.petName}. Prescriptions injected to cart.`, 'success');
  };

  const addToCart = (product: InventoryItem, qty: number = 1) => {
    const isService = product?.category === 'service' || product?.category === 'lab_service';
    if (product.stock <= 0 && !isService) { showToast(`Critical: ${product.name} is out of stock.`, 'error'); return; }
    setCart(prev => {
      const existing = prev.find(i => i.item.id === product.id);
      if (existing) {
        if (existing.quantity + qty > product.stock && !isService) { showToast(`Cannot add more. Inventory limit reached.`, 'error'); return prev; }
        return prev.map(i => i.item.id === product.id ? { ...i, quantity: i.quantity + qty } : i);
      }
      return [...prev, { item: product, quantity: qty }];
    });
  };

  const updateCartQty = (productId: string, val: number) => {
    setCart(prev => prev.map(i => {
      if (i.item.id === productId) {
        const newQty = i.quantity + val;
        const isService = i.item.category === 'service' || i.item.category === 'lab_service';
        if (newQty <= 0) return { ...i, quantity: 0 };
        if (newQty > i.item.stock && !isService) { showToast(`Cannot exceed available stock limit.`, 'error'); return i; }
        return { ...i, quantity: newQty };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const removeFromCart = (productId: string) => setCart(cart.filter(i => i.item.id !== productId));

  const handleResetActiveRegisterCartAtomic = useCallback(() => { setCart([]); setDiscountVal(0); setIsWalkIn(true); setAmountReceived(''); }, []);

  const taxRate = systemConfig ? systemConfig.taxRate : 0.0825;
  const currencySign = systemConfig ? systemConfig.currencySymbol : 'Rs.';
  
  const centsSubtotal = cart.reduce((sum, item) => sum + Math.round(item.item.price * 100) * item.quantity, 0);
  const centsDiscount = Math.round((discountVal || 0) * 100);
  const netCentsSubtotal = Math.max(0, centsSubtotal - centsDiscount);
  const centsTax = Math.round(netCentsSubtotal * taxRate);
  const centsTotal = netCentsSubtotal + centsTax;

  const subtotal = centsSubtotal / 100;
  const discount = centsDiscount / 100;
  const tax = centsTax / 100;
  const total = centsTotal / 100;

  const handleCheckoutSubmit = async (): Promise<boolean> => {
    if (isProcessing) return false;
    if (cart.length === 0) { showToast('Cannot checkout: Cart is empty.', 'error'); return false; }
    setIsProcessing(true);
    try {
      let totalCogsCents = 0;
      const newInvItems: InvoiceItem[] = cart.map(c => {
        const itemCostCents = Math.round((Number(c.item.cost) || 0) * 100);
        totalCogsCents += itemCostCents * c.quantity;
        return { itemId: c.item.id, sku: c.item.sku, name: c.item.name, category: c.item.category, quantity: c.quantity, unitPrice: c.item.price, totalPrice: (Math.round(c.item.price * 100) * c.quantity) / 100 };
      });
      const totalCogs = totalCogsCents / 100;
      const profit = Math.round((total - totalCogs) * 100) / 100;
      
      // Bug #5 Fix: Use crypto.randomUUID() for collision-safe invoice IDs
      const invoiceObj: Invoice = {
        id: `INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, appointmentId: selectedClient?.appointmentId, patientId: selectedClient?.id || '0', petName: selectedClient?.petName || 'Walk-in Pet', ownerName: selectedClient?.name || 'Walk-In Customer', ownerPhone: selectedClient?.phone || '0000000000', date: new Date().toISOString().split('T')[0], items: newInvItems, subtotal, tax, discount, sales_total: total, cogs: totalCogs, profit, shiftId: activeShift.id, paymentMethod, paymentStatus: 'paid', createdBy: currentUser?.name || 'Unknown'
      };

      const stockPromises = cart.filter(c => c.item.category !== 'service' && c.item.category !== 'lab_service').map(c => onUpdateStock(c.item.id, -c.quantity, c.item.stock));
      await Promise.all([...stockPromises, onAddInvoice(invoiceObj)]);
      await addRevenueToActiveShift(paymentMethod, Math.round(total * 100));

      // SPIDERWEB SYNC: Wipe the Temporary Billing Queue to prevent double-billing
      // Bug #7 Fix: Use recordsRef.current (latest snapshot) instead of stale closure
      if (selectedClient && selectedClient.petName) {
        const targetRecord = recordsRef.current.find(r => 
          r.petName === selectedClient.petName && 
          r.ownerPhone.replace(/\D/g, '') === selectedClient.phone.replace(/\D/g, '')
        );
        if (targetRecord) {
          onUpdateRecord({ ...targetRecord, prescribedMeds: [] });
        }
      }

      setCheckoutSuccess(invoiceObj);
      handleResetActiveRegisterCartAtomic();
      setShowCheckoutModal(false);
      setIsProcessing(false);
      showToast('Checkout complete! Invoice generated.', 'success');
      return true;
    } catch (err: any) {
      showToast('Database error during checkout. Cart preserved.', 'error');
      setIsProcessing(false);
      return false;
    }
  };

  const hashPin = (pin: string) => {
    if (!pin || /^\d{4}$/.test(pin) === false) return pin;
    let hash = 5381; const combined = pin + "CeylonPetsSecuritySalt";
    for (let i = 0; i < combined.length; i++) hash = (hash * 33) ^ combined.charCodeAt(i);
    return (hash >>> 0).toString(16).padStart(8, '0');
  };

  const handleInitiateVoid = (invId: string) => {
    if (currentUser.role === 'owner' || currentUser.role === 'admin') {
      if (window.confirm(`Void Invoice ${invId}? Stock will be reinstated.`)) {
        onVoidInvoice(invId); setSelectedInvoiceDetails(prev => prev && prev.id === invId ? { ...prev, paymentStatus: 'void' } : prev);
      }
    } else { setChallengeInvoiceId(invId); setShowPinChallenge(true); }
  };

  const handleVerifyChallengePin = () => {
    const authorized = onVerifyMasterPin ? onVerifyMasterPin(enteredChallengePin) : hashPin(enteredChallengePin) === (systemConfig?.masterPin || hashPin('5692'));
    if (authorized && challengeInvoiceId) {
      onVoidInvoice(challengeInvoiceId); setSelectedInvoiceDetails(prev => prev && prev.id === challengeInvoiceId ? { ...prev, paymentStatus: 'void' } : prev);
      setShowPinChallenge(false); setChallengeInvoiceId(null); setEnteredChallengePin(''); showToast(`Transaction voided.`, 'success');
    } else { setChallengePinError(true); setEnteredChallengePin(''); setTimeout(() => setChallengePinError(false), 2000); }
  };

  const handlePrintReceipt = (inv: Invoice) => {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) return;
    printWindow.document.write(`<html><head><style>body{font-family:monospace;font-size:12px;}</style></head><body><h3>${systemConfig?.hospitalName || 'Ceylon Pets'}</h3><p>Invoice: ${inv.id}<br/>Total: ${currencySign}${inv.sales_total.toFixed(2)}</p><script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}</script></body></html>`);
    printWindow.document.close();
  };

  const billedAptIds = new Set(invoices.filter(i => i.paymentStatus === 'paid').map(i => i.appointmentId).filter(Boolean));
  const queueApts = appointments.filter(a => a.status === 'completed' && !billedAptIds.has(a.id));
  const quickAddItems = inventory.filter(i => ['retail', 'vaccine', 'prescription'].includes(i.category)).slice(0, 12);
  const filteredProducts = inventory.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()) || i.sku.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex h-[calc(100vh-140px)] w-full gap-5 overflow-hidden" id="pos-enterprise-split">
      <div className="w-[40%] min-w-[380px] flex flex-col border border-slate-200 rounded-2xl bg-white shadow-sm shrink-0 overflow-hidden relative">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-black text-slate-800 tracking-tight text-sm">Active Register</span>
            <label className="flex items-center cursor-pointer hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors">
              <input type="checkbox" className="sr-only" checked={isWalkIn} onChange={(e) => setIsWalkIn(e.target.checked)} />
              <div className={`w-8 h-4 bg-slate-200 rounded-full transition-colors relative ${isWalkIn ? 'bg-emerald-500' : ''}`}>
                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${isWalkIn ? 'translate-x-4' : ''}`} />
              </div>
              <span className="ml-2 text-[10px] font-bold text-slate-600 uppercase tracking-wide">Walk-In</span>
            </label>
          </div>
          {!isWalkIn && selectedClient && (
            <div className="flex justify-between items-center bg-indigo-50 border border-indigo-200 p-3 rounded-xl shadow-xs animate-fade-in">
              <div>
                <div className="text-xs font-black text-indigo-900 leading-tight">{selectedClient.name}</div>
                <div className="text-[10px] font-bold text-indigo-600 font-mono mt-0.5">{selectedClient.phone}</div>
                {selectedClient.petName && <div className="text-[10px] font-bold text-slate-600 mt-1 flex items-center gap-1"><Activity className="w-3 h-3 text-indigo-400" /> Patient: {selectedClient.petName}</div>}
              </div>
              <button onClick={() => setIsWalkIn(true)} className="w-6 h-6 flex items-center justify-center text-indigo-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors font-bold">✕</button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-white">
          {cart.map(c => (
            <div key={c.item.id} className="flex justify-between items-center p-3 border border-slate-100 rounded-xl bg-slate-50/50">
              <div className="space-y-1 overflow-hidden pr-2">
                <div className="text-[9px] font-mono text-slate-400">{c.item.sku}</div>
                <div className="text-xs font-bold text-slate-800 truncate leading-none">{c.item.name}</div>
                <div className="text-[10px] font-black text-slate-500 font-mono">{currencySign}{c.item.price.toFixed(2)}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-xs">
                  <button onClick={() => updateCartQty(c.item.id, -1)} className="p-1 hover:bg-slate-100 text-slate-500 rounded-md"><Minus className="h-3 w-3" /></button>
                  <span className="w-5 text-center font-bold text-slate-800 font-mono text-xs">{c.quantity}</span>
                  <button onClick={() => updateCartQty(c.item.id, 1)} className="p-1 hover:bg-slate-100 text-slate-500 rounded-md"><Plus className="h-3 w-3" /></button>
                </div>
                <button onClick={() => removeFromCart(c.item.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-3">
              <ShoppingBag className="w-10 h-10 opacity-50" />
              <div className="text-xs font-bold">Register is Empty</div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0 space-y-3">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between font-bold text-slate-500"><span>Subtotal:</span><span className="font-mono text-slate-700">{currencySign}{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-slate-500 items-center"><span className="flex items-center gap-1"><Tag className="w-3 h-3 text-indigo-400" /> Discount:</span><input type="number" min="0" step="5" value={discountVal || ''} onChange={e => setDiscountVal(Math.max(0, parseFloat(e.target.value) || 0))} className="w-16 px-1.5 py-0.5 rounded-md border border-slate-200 text-right font-mono text-slate-700 font-bold outline-none focus:border-indigo-400" /></div>
            <div className="flex justify-between font-bold text-slate-500 border-b border-slate-200 pb-2"><span>Vet Tax ({(taxRate*100).toFixed(1)}%):</span><span className="font-mono text-slate-700">{currencySign}{tax.toFixed(2)}</span></div>
            <div className="flex justify-between items-center font-black text-slate-900 pt-1"><span className="text-sm">Total Due:</span>
              <span className={`font-mono text-lg ${total < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{currencySign}{total.toFixed(2)}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            <button onClick={() => { setPaymentMethod('cash'); setShowCheckoutModal(true); }} disabled={cart.length === 0} className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] rounded-xl cursor-pointer disabled:opacity-50 uppercase tracking-widest flex flex-col items-center justify-center gap-1"><Coins className="w-4 h-4" /> {total < 0 ? 'Refund' : 'Cash'}</button>
            <button onClick={() => { setPaymentMethod('card'); setShowCheckoutModal(true); }} disabled={cart.length === 0 || total < 0} className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] rounded-xl cursor-pointer disabled:opacity-50 uppercase tracking-widest flex flex-col items-center justify-center gap-1"><CreditCard className="w-4 h-4" /> Card</button>
            <button onClick={() => { setPaymentMethod('bank_transfer'); setShowCheckoutModal(true); }} disabled={cart.length === 0 || total < 0} className="py-3 bg-sky-600 hover:bg-sky-700 text-white font-black text-[10px] rounded-xl cursor-pointer disabled:opacity-50 uppercase tracking-widest flex flex-col items-center justify-center gap-1"><FileText className="w-4 h-4" /> Transfer</button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden relative">
        <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-white shrink-0">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {(['queue', 'quick', 'search'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${activeTab === tab ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>{tab === 'queue' ? 'Queue' : tab === 'quick' ? 'Quick Add' : 'Search'}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 bg-slate-50 p-5 overflow-y-auto custom-scrollbar relative">
          {activeTab === 'queue' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-500" /> Awaiting Clinical Checkout</h3>
              {queueApts.length === 0 ? <div className="p-8 border border-dashed border-slate-200 rounded-2xl text-center text-xs font-bold text-slate-400 bg-white">No patients currently queued for checkout.</div> : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {queueApts.map(apt => (
                    <div key={apt.id} onClick={() => handleQueueClick(apt)} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between h-32 group relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-emerald-100 text-emerald-700 px-2 py-1 text-[8px] font-black uppercase tracking-widest rounded-bl-lg">Pending</div>
                      <div><div className="text-sm font-black text-slate-800">{apt.petName}</div><div className="text-[10px] font-bold text-slate-500 mt-0.5">{apt.ownerName} • <span className="font-mono">{apt.ownerPhone}</span></div></div>
                      <div className="flex justify-between items-center border-t border-slate-100 pt-2 text-[10px]"><span className="font-bold text-slate-600 flex items-center gap-1"><UserPlus className="w-3 h-3" /> {apt.veterinarian}</span><span className="font-bold text-indigo-600 group-hover:underline flex items-center gap-1">Process Bill <ArrowRight className="w-3 h-3" /></span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'quick' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-500" /> Frequent Items & Vaccines</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {quickAddItems.map(item => (
                  <button key={item.id} onClick={() => addToCart(item, 1)} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-sky-400 transition-all text-left flex flex-col justify-between h-28 cursor-pointer active:scale-95 group">
                    <span className="text-xs font-bold text-slate-800 line-clamp-3 leading-snug group-hover:text-sky-700">{item.name}</span>
                    <div className="flex justify-between items-center mt-2 w-full"><span className="text-[11px] font-black text-emerald-600 font-mono">{currencySign}{item.price.toFixed(2)}</span><Plus className="w-4 h-4 text-slate-300 group-hover:text-sky-500" /></div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'search' && (
            <div className="space-y-4 flex flex-col h-full">
              <div className="flex gap-3 shrink-0 relative">
                <div className="relative flex-1"><Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" /><input type="text" placeholder="Search by name or SKU..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 shadow-sm outline-none" /></div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredProducts.map(product => (
                    <div key={product.id} onClick={() => addToCart(product)} className="bg-white p-3 rounded-xl border border-slate-200 hover:border-indigo-300 cursor-pointer transition-all group flex flex-col justify-between active:scale-95">
                      <div><span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 block w-max mb-1">{product.sku}</span><h5 className="text-[11px] font-bold text-slate-800 leading-snug line-clamp-2">{product.name}</h5></div>
                      <div className="mt-2 flex justify-between items-center border-t border-slate-100 pt-2"><span className="text-xs font-black text-slate-800 font-mono">{currencySign}{product.price.toFixed(2)}</span><span className="text-[9px] font-bold text-slate-400">Stock: {product.stock}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-scale-up">
            <h3 className="text-base font-black text-slate-800 text-center">Confirm {total < 0 ? 'Refund' : paymentMethod.toUpperCase()}</h3>
            <div className="bg-slate-50 p-4 rounded-xl text-center space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{total < 0 ? 'Client Refund Due' : 'Total Due'}</span>
              <div className={`text-3xl font-black font-mono ${total < 0 ? 'text-rose-600' : 'textemerald-600'}`}>{currencySign}{Math.abs(total).toFixed(2)}</div>
            </div>
            {paymentMethod === 'cash' && total >= 0 && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 block">Cash Tendered by Customer</label>
                <input ref={cashInputRef} type="number" value={amountReceived} onChange={e => setAmountReceived(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCheckoutSubmit()} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-lg font-mono font-black focus:border-emerald-500 focus:outline-none transition-colors" placeholder="0.00" />
                {parseFloat(amountReceived) >= total && (
                  <div className="flex justify-between text-xs font-bold bg-emerald-50 text-emerald-700 p-2 rounded-lg mt-2"><span>Change Due:</span><span className="font-mono">{currencySign}{(parseFloat(amountReceived) - total).toFixed(2)}</span></div>
                )}
              </div>
            )}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setShowCheckoutModal(false)} className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs flex-1 transition-colors">Cancel</button>
              <button onClick={handleCheckoutSubmit} disabled={isProcessing || (paymentMethod === 'cash' && total >= 0 && Number(amountReceived) < total)} className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex-[2] shadow-md disabled:opacity-50">{total < 0 ? 'Process Refund & Close Invoice' : 'Complete Transaction'}</button>
            </div>
          </div>
        </div>
      )}

      {selectedInvoiceDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl border border-sky-100 max-h-[85vh] w-full max-w-md flex flex-col shadow-2xl animate-scale-up text-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-start shrink-0">
              <div><h4 className="text-sm font-extrabold text-slate-800">Invoice {selectedInvoiceDetails.id}</h4><p className="text-[10px] text-slate-400 font-mono mt-0.5">{selectedInvoiceDetails.date} • {selectedInvoiceDetails.createdBy}</p></div>
              <button onClick={() => setSelectedInvoiceDetails(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
              <div className="bg-indigo-50 p-3 rounded-xl"><span className="font-bold text-indigo-900 block">{selectedInvoiceDetails.ownerName}</span><span className="text-[10px] text-indigo-600 font-mono block mt-0.5">{selectedInvoiceDetails.ownerPhone}</span></div>
              <table className="w-full text-left">
                <thead className="text-[10px] text-slate-400 font-bold border-b border-slate-100"><tr><th className="pb-2">Item</th><th className="pb-2 text-center">Qty</th><th className="pb-2 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-slate-50 font-semibold text-slate-700">
                  {selectedInvoiceDetails.items.map((i, idx) => (
                    <tr key={idx}><td className="py-2">{i.name}</td><td className="py-2 text-center">{i.quantity}</td><td className="py-2 text-right font-mono">{currencySign}{i.totalPrice.toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-2 shrink-0 bg-slate-50">
              <button onClick={() => handlePrintReceipt(selectedInvoiceDetails)} className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-1"><Printer className="w-4 h-4"/> Print</button>
              {selectedInvoiceDetails.paymentStatus !== 'void' && <button onClick={() => handleInitiateVoid(selectedInvoiceDetails.id)} className="flex-1 py-2.5 border border-rose-200 text-rose-600 font-bold rounded-xl bg-white hover:bg-rose-50">Void</button>}
            </div>
          </div>
        </div>
      )}

      {showPinChallenge && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center space-y-4 shadow-2xl animate-scale-up text-xs">
            <h4 className="text-sm font-extrabold text-slate-800">Admin Override Required</h4>
            <input type="password" maxLength={4} placeholder="PIN" value={enteredChallengePin} onChange={e => setEnteredChallengePin(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 text-center text-xl font-mono tracking-widest rounded-xl focus:outline-none focus:border-indigo-500" />
            <div className="flex gap-2">
              <button onClick={() => setShowPinChallenge(false)} className="flex-1 py-2.5 bg-slate-100 font-bold rounded-xl">Cancel</button>
              <button onClick={handleVerifyChallengePin} className="flex-1 py-2.5 bg-rose-600 text-white font-bold rounded-xl">Authorize Void</button>
            </div>
          </div>
        </div>
      )}

      {checkoutSuccess && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-scale-up">
             <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">✓</div>
             <h3 className="text-xl font-black text-slate-800">Paid in Full</h3>
             <p className="text-slate-500 text-xs font-semibold">Total: {currencySign}{checkoutSuccess.sales_total.toFixed(2)}</p>
             <div className="flex gap-2 pt-2">
               <button onClick={() => handlePrintReceipt(checkoutSuccess)} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-1"><Printer className="w-4 h-4"/> Print</button>
               <button onClick={() => setCheckoutSuccess(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl">Close</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
