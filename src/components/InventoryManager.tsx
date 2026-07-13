/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, Plus, Edit2, Trash2, AlertTriangle, 
  Package, Activity, X, CheckCircle2, RefreshCw, Layers, DollarSign, TestTube, MinusCircle
} from 'lucide-react';
import { InventoryItem, ItemCategory, InventoryBatch } from '../types';
import { fetchInventory, fetchInventoryBatches, upsertInventoryBatch } from '../lib/db';
import { db } from '../lib/localDb'; 
import { showToast } from './Toast';

const CATEGORIES: { id: ItemCategory | 'All', label: string, color: string }[] = [
  { id: 'All', label: 'All Items', color: 'bg-slate-100 text-slate-700' },
  { id: 'retail', label: 'Retail & Supplies', color: 'bg-blue-50 text-blue-700' },
  { id: 'prescription', label: 'Pharmacy Rx', color: 'bg-emerald-50 text-emerald-700' },
  { id: 'vaccine', label: 'Vaccines', color: 'bg-amber-50 text-amber-700' },
  { id: 'service', label: 'Clinical Services', color: 'bg-purple-50 text-purple-700' },
  { id: 'lab_service', label: 'Lab Tests', color: 'bg-rose-50 text-rose-700' },
  { id: 'food', label: 'Food & Feeding', color: 'bg-orange-50 text-orange-700' }
];

interface InventoryProps {
  inventory?: InventoryItem[];
  onAddProduct?: any;
  onUpdateStock?: any;
  onUpdatePrice?: any;
  onUpdateInventory?: (item: any) => Promise<void>;
  onDeleteInventory?: (id: string) => Promise<void>;
  systemConfig?: any;
}

export default function InventoryManager({ inventory, onUpdateInventory, onDeleteInventory }: InventoryProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ItemCategory | 'All' | 'Expiring'>('All');
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  // Quick Adjust State
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<number | string>('');

  // Receive Stock State
  const [receiveStockItem, setReceiveStockItem] = useState<InventoryItem | null>(null);
  const [receiveFormData, setReceiveFormData] = useState<Partial<InventoryBatch>>({
    lotNumber: '', expiryDate: '', quantityReceived: 0, supplier: '', costPerUnit: 0, receivedDate: new Date().toISOString().split('T')[0]
  });

  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  const toggleBatches = (itemId: string) => {
    const newSet = new Set(expandedBatches);
    if (newSet.has(itemId)) newSet.delete(itemId);
    else newSet.add(itemId);
    setExpandedBatches(newSet);
  };

  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    sku: '', name: '', category: 'retail', price: 0, cost: 0, stock: 0, minStock: 5, unit: 'unit', labParameters: []
  });

  const loadInventory = useCallback(async () => {
    const data = await fetchInventory();
    const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
    setItems(sorted);
    const dataBatches = await fetchInventoryBatches();
    setBatches(dataBatches);
  }, [inventory]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.sku) {
      showToast('SKU and Name are required.', 'error');
      return;
    }

    const isPhysical = !['service', 'lab_service'].includes(formData.category as string);
    const isLab = formData.category === 'lab_service';

    const payload: InventoryItem = {
      id: editingItem ? editingItem.id : crypto.randomUUID(),
      sku: formData.sku!.trim(),
      name: formData.name!.trim(),
      category: formData.category as ItemCategory,
      price: Number(formData.price) || 0,
      cost: Number(formData.cost) || 0,
      stock: isPhysical ? (Number(formData.stock) || 0) : 0,
      minStock: isPhysical ? (Number(formData.minStock) || 0) : 0,
      unit: formData.unit || 'unit',
      location: formData.location || '',
      labParameters: isLab ? (formData.labParameters || []) : undefined,
      is_deleted: editingItem ? (editingItem.is_deleted || false) : false
    };

    if (onUpdateInventory) {
      await onUpdateInventory(payload);
    }
    await loadInventory();
    
    setShowAddModal(false);
    setEditingItem(null);
    showToast(editingItem ? 'Item updated successfully.' : 'New item added to registry.', 'success');
  };

  const handleQuickAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItem) return;
    
    const delta = Number(adjustAmount);
    if (isNaN(delta) || delta === 0) return;

    const updatedItem = { ...adjustItem, stock: adjustItem.stock + delta };
    if (onUpdateInventory) {
      await onUpdateInventory(updatedItem);
    }
    await loadInventory();
    
    setAdjustItem(null);
    setAdjustAmount('');
    showToast(`Stock adjusted by ${delta > 0 ? '+' + delta : delta}.`, 'success');
  };

  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveStockItem) return;

    const qty = Number(receiveFormData.quantityReceived) || 0;
    if (qty <= 0) {
      showToast('Quantity must be greater than 0', 'error');
      return;
    }

    const batch: InventoryBatch = {
      id: crypto.randomUUID(),
      inventoryItemId: receiveStockItem.id,
      lotNumber: receiveFormData.lotNumber || 'N/A',
      expiryDate: receiveFormData.expiryDate || '2099-12-31',
      quantityReceived: qty,
      quantityRemaining: qty,
      receivedDate: receiveFormData.receivedDate || new Date().toISOString().split('T')[0],
      supplier: receiveFormData.supplier,
      costPerUnit: receiveFormData.costPerUnit ? Math.round(Number(receiveFormData.costPerUnit) * 100) : undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      _dirty: true
    };

    const updatedItem = { ...receiveStockItem, stock: receiveStockItem.stock + qty };
    const itemBatches = batches.filter(b => b.inventoryItemId === receiveStockItem.id && b.quantityRemaining > 0);
    itemBatches.push(batch);
    itemBatches.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    
    updatedItem.expiryDate = itemBatches[0].expiryDate;
    updatedItem.lotNumber = itemBatches[0].lotNumber;

    console.log('[InventoryManager] Receiving stock. Qty:', qty, 'Old stock:', receiveStockItem.stock, 'New stock:', updatedItem.stock);

    if (onUpdateInventory) {
      await upsertInventoryBatch(batch);
      console.log('[InventoryManager] Calling onUpdateInventory with new stock:', updatedItem.stock);
      await onUpdateInventory(updatedItem);
    }

    
    await loadInventory();
    
    setReceiveStockItem(null);
    setReceiveFormData({
      lotNumber: '', expiryDate: '', quantityReceived: 0, supplier: '', costPerUnit: 0, receivedDate: new Date().toISOString().split('T')[0]
    });
    showToast('Stock received and batch created', 'success');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this item?')) return;
    if (onDeleteInventory) {
      await onDeleteInventory(id);
    }
    await loadInventory();
    showToast('Item deleted from registry.', 'success');
  };

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({ ...item, labParameters: item.labParameters || [] });
    setShowAddModal(true);
  };

  const openNew = () => {
    setEditingItem(null);
    setFormData({ sku: `SKU-${Date.now().toString().slice(-6)}`, name: '', category: 'retail', price: 0, cost: 0, stock: 0, minStock: 5, unit: 'unit', location: '', labParameters: [] });
    setShowAddModal(true);
  };

  // Lab Parameters Builder Functions
  const handleAddLabParameter = () => {
    setFormData({
      ...formData,
      labParameters: [...(formData.labParameters || []), { name: '', referenceRange: '', unit: '' }]
    });
  };

  const handleUpdateLabParameter = (index: number, field: 'name' | 'referenceRange' | 'unit', value: string) => {
    const newParams = [...(formData.labParameters || [])];
    newParams[index] = { ...newParams[index], [field]: value };
    setFormData({ ...formData, labParameters: newParams });
  };

  const handleRemoveLabParameter = (index: number) => {
    const newParams = [...(formData.labParameters || [])];
    newParams.splice(index, 1);
    setFormData({ ...formData, labParameters: newParams });
  };

  // Compute filtering and stats
  const filteredItems = items.filter(item => {
    if (activeCategory === 'Expiring') {
      const itemBatches = batches.filter(b => b.inventoryItemId === item.id && b.quantityRemaining > 0);
      return itemBatches.some(b => {
        const daysDiff = (new Date(b.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= 60;
      });
    }
    if (activeCategory !== 'All' && item.category !== activeCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
    }
    return true;
  });

  const physicalItems = items.filter(i => !['service', 'lab_service'].includes(i.category));
  const lowStockCount = physicalItems.filter(i => i.stock <= i.minStock).length;
  const totalValue = physicalItems.reduce((sum, item) => sum + (item.cost * item.stock), 0);
  const isFormPhysical = !['service', 'lab_service'].includes(formData.category as string);
  const isFormLab = formData.category === 'lab_service';

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full overflow-hidden p-6 gap-6">
      
      {/* Top Action & Stats Bar */}
      <div className="flex flex-wrap lg:flex-nowrap gap-6 shrink-0">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600"><Layers className="w-6 h-6" /></div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Registry</div>
              <div className="text-xl font-black text-slate-800">{items.length} <span className="text-xs text-slate-500 font-bold ml-1">Items</span></div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className={`${lowStockCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'} p-3 rounded-xl`}>
              {lowStockCount > 0 ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Alerts</div>
              <div className={`text-xl font-black ${lowStockCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{lowStockCount} <span className="text-xs font-bold ml-1">Critical</span></div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-emerald-50 p-3 rounded-xl text-emerald-600"><DollarSign className="w-6 h-6" /></div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Physical Asset Value</div>
              <div className="text-xl font-black font-mono text-slate-800">{(totalValue).toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto w-full xl:w-auto pb-2 xl:pb-0 custom-scrollbar">
          {CATEGORIES.map(cat => (
            <button 
              key={cat.id} 
              onClick={() => setActiveCategory(cat.id as any)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeCategory === cat.id ? 'bg-slate-800 text-white shadow-md' : `bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200`
              }`}
            >
              {cat.label}
            </button>
          ))}
          <button 
            onClick={() => setActiveCategory('Expiring')}
            className={`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
              activeCategory === 'Expiring' ? 'bg-amber-500 text-white shadow-md' : `bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200`
            }`}
          >
            <AlertTriangle className="w-3 h-3"/> Expiring Stock
          </button>
        </div>

        <div className="flex items-center gap-3 w-full xl:w-auto justify-end flex-wrap">
          <div className="relative flex-1 xl:w-64 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search SKU or Name..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <button onClick={openNew} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] uppercase tracking-widest font-black rounded-xl shadow-md flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
      </div>

      {/* Main Data Grid */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          {activeCategory === 'Expiring' ? (
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-amber-50 border-b border-amber-200 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-amber-700 uppercase tracking-widest">Item Name</th>
                  <th className="px-6 py-4 text-[10px] font-black text-amber-700 uppercase tracking-widest">Lot Number</th>
                  <th className="px-6 py-4 text-[10px] font-black text-amber-700 uppercase tracking-widest">Expiry Date</th>
                  <th className="px-6 py-4 text-[10px] font-black text-amber-700 uppercase tracking-widest">Qty Remaining</th>
                  <th className="px-6 py-4 text-[10px] font-black text-amber-700 uppercase tracking-widest">Days Until Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches
                  .filter(b => b.quantityRemaining > 0 && (new Date(b.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24) <= 60)
                  .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
                  .map(b => {
                    const daysDiff = Math.ceil((new Date(b.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    const isExp = daysDiff < 0;
                    const item = items.find(i => i.id === b.inventoryItemId);
                    return (
                      <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-black text-slate-800">{item?.name || 'Unknown Item'}</td>
                        <td className="px-6 py-4 text-xs font-mono font-bold text-slate-800">{b.lotNumber}</td>
                        <td className="px-6 py-4 text-xs font-mono font-bold flex items-center gap-2">
                          <span className={isExp ? 'text-rose-600' : 'text-amber-600'}>{b.expiryDate}</span>
                          {isExp && <span className="bg-rose-100 text-rose-600 text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-widest">Expired</span>}
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-slate-800">{b.quantityRemaining}</td>
                        <td className="px-6 py-4 text-xs font-black">
                          {isExp ? <span className="text-rose-600">Expired {-daysDiff} days ago</span> : <span className="text-amber-600">{daysDiff} days</span>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">SKU & Item Name</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cost / Price</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock Level</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                      <div className="text-sm font-black text-slate-500">No items found in registry.</div>
                    </td>
                  </tr>
                ) : filteredItems.map(item => {
                  const catInfo = CATEGORIES.find(c => c.id === item.category);
                  const isService = ['service', 'lab_service'].includes(item.category);
                  const isLow = !isService && item.stock <= item.minStock;
  
                  let expiryStatus: 'ok' | 'soon' | 'expired' = 'ok';
                  if (['prescription', 'vaccine'].includes(item.category) && item.expiryDate) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const exp = new Date(item.expiryDate);
                    const daysDiff = (exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysDiff < 0) expiryStatus = 'expired';
                    else if (daysDiff <= 30) expiryStatus = 'soon';
                  }
  
                  const itemBatches = batches.filter(b => b.inventoryItemId === item.id && b.quantityRemaining > 0);
                  const isExpanded = expandedBatches.has(item.id);
                  const expiringSoonCount = itemBatches.filter(b => {
                    const days = (new Date(b.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
                    return days >= 0 && days <= 30;
                  }).reduce((sum, b) => sum + b.quantityRemaining, 0);
  
                  return (
                    <React.Fragment key={item.id}>
                    <tr className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-black text-slate-800 text-sm flex items-center gap-2">
                          {item.name}
                          {item.category === 'lab_service' && item.labParameters && item.labParameters.length > 0 && (
                            <span className="bg-indigo-50 border border-indigo-100 text-indigo-600 text-[8px] px-1.5 py-0.5 rounded flex items-center gap-1"><TestTube className="w-2 h-2"/> {item.labParameters.length} Params</span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">{item.sku}</div>
                        {!isService && itemBatches.length > 0 && (
                          <button onClick={() => toggleBatches(item.id)} className="mt-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                            {isExpanded ? 'Hide Batches' : `Batches (${itemBatches.length})`}
                          </button>
                        )}
                        {expiringSoonCount > 0 && !isExpanded && (
                          <div className="mt-1 text-[9px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3"/> {expiringSoonCount} units expiring within 30 days
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border border-white/20 shadow-xs ${catInfo?.color || 'bg-slate-100 text-slate-600'}`}>
                          {catInfo?.label || item.category}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs font-black text-slate-800">{item.price.toFixed(2)}</div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Cost: {item.cost.toFixed(2)}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {isService ? (
                          <span className="text-lg font-black text-slate-300">∞</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className={`font-mono text-sm font-black px-3 py-1 rounded-xl border ${isLow ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                              {item.stock} <span className="text-[9px] opacity-70 ml-0.5 uppercase">{item.unit}</span>
                            </span>
                            {isLow && <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5"/> Low Stock</span>}
                            {expiryStatus === 'expired' && <span className="text-[8px] font-black text-rose-600 uppercase tracking-widest flex items-center justify-center gap-1 bg-rose-100 px-1.5 py-0.5 rounded"><AlertTriangle className="w-2 h-2"/> EXPIRED</span>}
                            {expiryStatus === 'soon' && <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest flex items-center justify-center gap-1 bg-amber-100 px-1.5 py-0.5 rounded"><AlertTriangle className="w-2 h-2"/> Expiring Soon</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                          {!isService && (
                            <>
                              <button onClick={() => setReceiveStockItem(item)} className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-1 mr-2" title="Receive Stock">
                                <Package className="w-3 h-3" /> Receive
                              </button>
                              <button onClick={() => setAdjustItem(item)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer" title="Quick Adjust Stock">
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button onClick={() => openEdit(item)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer" title="Edit Master Data">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer" title="Delete from Registry">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50 border-b border-slate-200 shadow-inner">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                            <table className="w-full text-left">
                              <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                  <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Lot Number</th>
                                  <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Expiry Date</th>
                                  <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Qty Remaining</th>
                                  <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Supplier</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {itemBatches.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()).map(b => {
                                  const daysDiff = (new Date(b.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
                                  const isExp = daysDiff < 0;
                                  const isSoon = daysDiff >= 0 && daysDiff <= 30;
                                  return (
                                    <tr key={b.id}>
                                      <td className="px-4 py-2 text-xs font-mono font-bold text-slate-800">{b.lotNumber}</td>
                                      <td className="px-4 py-2 text-xs font-mono font-bold flex items-center gap-2">
                                        <span className={isExp ? 'text-rose-600' : isSoon ? 'text-amber-600' : 'text-slate-600'}>{b.expiryDate}</span>
                                        {isExp && <span className="bg-rose-100 text-rose-600 text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-widest">Expired</span>}
                                        {isSoon && <span className="bg-amber-100 text-amber-600 text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-widest">Soon</span>}
                                      </td>
                                      <td className="px-4 py-2 text-xs font-black text-slate-800">{b.quantityRemaining}</td>
                                      <td className="px-4 py-2 text-xs font-bold text-slate-500">{b.supplier || '-'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL: Full Add/Edit Form */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full animate-scale-up flex flex-col overflow-hidden max-h-[95vh]">
            <div className="p-6 border-b border-slate-100 shrink-0 flex justify-between items-start bg-slate-50/50">
              <div>
                <h2 className="text-lg font-black text-slate-800">{editingItem ? 'Edit Registry Item' : 'New Inventory Record'}</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Master Database Entry</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-400 rounded-xl cursor-pointer transition-colors"><X className="w-4 h-4"/></button>
            </div>

            <form onSubmit={handleSaveItem} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 bg-white">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Item / Test Name *</label>
                    <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">SKU / Barcode *</label>
                    <input type="text" required value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Master Category</label>
                    <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as ItemCategory})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer">
                      <option value="retail">Retail & Supplies</option>
                      <option value="prescription">Pharmacy Rx</option>
                      <option value="vaccine">Vaccine</option>
                      <option value="service">Clinical Service</option>
                      <option value="lab_service">Lab Test (Diagnostic)</option>
                      <option value="food">Food & Feeding</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1"><DollarSign className="w-3 h-3"/> Cost Price (Buying)</label>
                    <input type="number" step="0.01" min="0" value={formData.cost} onChange={e => setFormData({...formData, cost: parseFloat(e.target.value)})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black font-mono text-slate-800 outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-1.5 flex items-center gap-1"><DollarSign className="w-3 h-3"/> Selling Price</label>
                    <input type="number" step="0.01" min="0" required value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} className="w-full px-4 py-2.5 bg-white border border-emerald-300 rounded-xl text-xs font-black font-mono text-emerald-800 outline-none focus:border-emerald-500 shadow-sm" />
                  </div>
                </div>

                {isFormPhysical ? (
                  <div className="grid grid-cols-3 gap-4 animate-fade-in">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Current Stock</label>
                      <input type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: parseInt(e.target.value)})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black font-mono text-slate-800 outline-none focus:border-indigo-500" />
                      <p className="text-[8px] font-bold text-amber-600 mt-1 uppercase tracking-widest">⚠ Manual adjustment — does not create a batch. Use Receive Stock for deliveries.</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest block mb-1.5">Alert Minimum</label>
                      <input type="number" value={formData.minStock} onChange={e => setFormData({...formData, minStock: parseInt(e.target.value)})} className="w-full px-4 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-black font-mono text-rose-800 outline-none focus:border-rose-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Unit Metric</label>
                      <input type="text" placeholder="e.g. tablet, box" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500" />
                    </div>
                  </div>
                ) : null}

                {['prescription', 'vaccine'].includes(formData.category) && (
                  <div className="grid grid-cols-2 gap-4 mt-4 animate-fade-in">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Lot Number</label>
                      <input type="text" placeholder="e.g. LOT-12345" value={formData.lotNumber || ''} onChange={e => setFormData({...formData, lotNumber: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-1.5">Expiry Date</label>
                      <input type="date" value={formData.expiryDate || ''} onChange={e => setFormData({...formData, expiryDate: e.target.value})} className="w-full px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-black font-mono text-amber-800 outline-none focus:border-amber-500" />
                    </div>
                  </div>
                )}

                {isFormLab ? (
                  /* PHASE 2: DYNAMIC LAB PARAMETER BUILDER */
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 animate-fade-in shadow-inner">
                    <div className="flex items-center justify-between border-b border-indigo-200 pb-3 mb-4">
                      <div>
                        <h4 className="text-xs font-black text-indigo-900 flex items-center gap-2"><TestTube className="w-4 h-4"/> Diagnostic Parameter Matrix</h4>
                        <p className="text-[9px] font-bold text-indigo-600 mt-1 uppercase tracking-widest">Define the reference ranges & units for this specific test.</p>
                      </div>
                      <button type="button" onClick={handleAddLabParameter} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm transition-colors cursor-pointer flex items-center gap-1">
                        <Plus className="w-3 h-3"/> Add Parameter
                      </button>
                    </div>

                    <div className="space-y-3">
                      {formData.labParameters && formData.labParameters.length === 0 ? (
                        <div className="text-center py-6 text-indigo-400 font-bold text-xs border border-dashed border-indigo-200 rounded-xl">
                          No parameters defined. The lab module will only show a general notes box for this test.
                        </div>
                      ) : (
                        formData.labParameters?.map((param, index) => (
                          <div key={index} className="flex gap-2 items-center bg-white p-2 rounded-xl border border-indigo-100 shadow-sm animate-fade-in">
                            <input 
                              type="text" 
                              placeholder="Name (e.g. WBC, RBC)" 
                              value={param.name} 
                              onChange={(e) => handleUpdateLabParameter(index, 'name', e.target.value)}
                              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none"
                            />
                            <input 
                              type="text" 
                              placeholder="Range (e.g. 6.0 - 17.0)" 
                              value={param.referenceRange} 
                              onChange={(e) => handleUpdateLabParameter(index, 'referenceRange', e.target.value)}
                              className="w-1/3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none"
                            />
                            <input 
                              type="text" 
                              placeholder="Unit (e.g. 10^9/L)" 
                              value={param.unit} 
                              onChange={(e) => handleUpdateLabParameter(index, 'unit', e.target.value)}
                              className="w-1/4 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none"
                            />
                            <button 
                              type="button" 
                              onClick={() => handleRemoveLabParameter(index)}
                              className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Remove Parameter"
                            >
                              <MinusCircle className="w-5 h-5"/>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-start gap-3 animate-fade-in">
                    <Activity className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-indigo-900">Infinite Capacity Service</h4>
                      <p className="text-[10px] font-semibold text-indigo-700 mt-1 leading-relaxed">Because this is classified as a Clinical Service, physical stock tracking is disabled.</p>
                    </div>
                  </div>
                )}

              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-200 shrink-0 flex justify-end gap-3 z-10">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Cancel</button>
                <button type="submit" className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                  <CheckCircle2 className="w-4 h-4"/> Save Record
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: Quick Adjust Stock */}
      {adjustItem && createPortal(
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full animate-scale-up overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2"><Package className="w-8 h-8"/></div>
              <h3 className="text-lg font-black text-slate-800 leading-tight">Quick Adjust Stock</h3>
              <p className="text-xs font-bold text-slate-500">{adjustItem.name}</p>
              
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-4">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Stock</div>
                <div className="text-3xl font-black font-mono text-slate-800">{adjustItem.stock}</div>
              </div>

              <form onSubmit={handleQuickAdjust} className="space-y-4 pt-2">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 text-left">Adjustment (+ or -)</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 10 or -5" 
                    value={adjustAmount} 
                    onChange={e => setAdjustAmount(e.target.value)} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-lg font-black font-mono text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" 
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setAdjustItem(null)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-black rounded-xl hover:bg-slate-50 transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Cancel</button>
                  <button type="submit" className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Apply Delta</button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: Receive Stock */}
      {receiveStockItem && createPortal(
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full animate-scale-up flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl"><Package className="w-6 h-6"/></div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 leading-tight">Receive Stock</h3>
                  <p className="text-xs font-bold text-slate-500 mt-0.5">{receiveStockItem.name}</p>
                </div>
              </div>
              <button onClick={() => setReceiveStockItem(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <form id="receiveStockForm" onSubmit={handleReceiveStock} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Lot / Batch Number *</label>
                    <input type="text" required value={receiveFormData.lotNumber || ''} onChange={e => setReceiveFormData({...receiveFormData, lotNumber: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-1.5">Expiry Date {['prescription', 'vaccine', 'food'].includes(receiveStockItem.category) ? '*' : ''}</label>
                    <input type="date" required={['prescription', 'vaccine', 'food'].includes(receiveStockItem.category)} value={receiveFormData.expiryDate || ''} onChange={e => setReceiveFormData({...receiveFormData, expiryDate: e.target.value})} className="w-full px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-black font-mono text-amber-800 outline-none focus:border-amber-500" />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-1.5">Qty Received *</label>
                    <input type="number" required min="1" value={receiveFormData.quantityReceived || ''} onChange={e => setReceiveFormData({...receiveFormData, quantityReceived: parseInt(e.target.value) || 0})} className="w-full px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-black font-mono text-emerald-800 outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Received Date</label>
                    <input type="date" required value={receiveFormData.receivedDate || ''} onChange={e => setReceiveFormData({...receiveFormData, receivedDate: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black font-mono text-slate-800 outline-none focus:border-indigo-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Supplier</label>
                    <input type="text" value={receiveFormData.supplier || ''} onChange={e => setReceiveFormData({...receiveFormData, supplier: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Cost per unit (Rs.)</label>
                    <input type="number" step="0.01" min="0" value={receiveFormData.costPerUnit || ''} onChange={e => setReceiveFormData({...receiveFormData, costPerUnit: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black font-mono text-slate-800 outline-none focus:border-indigo-500" />
                  </div>
                </div>
              </form>
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-200 shrink-0 flex justify-end gap-3 rounded-b-3xl">
              <button type="button" onClick={() => setReceiveStockItem(null)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Cancel</button>
              <button form="receiveStockForm" type="submit" className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                <CheckCircle2 className="w-4 h-4"/> Confirm Receipt
              </button>
            </div>
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