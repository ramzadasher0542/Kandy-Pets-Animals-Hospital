/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, Plus, Edit2, Trash2, AlertTriangle, 
  Package, Activity, X, CheckCircle2, RefreshCw, Layers, DollarSign
} from 'lucide-react';
import { InventoryItem, ItemCategory } from '../types';
import { fetchInventory, upsertInventoryItem } from '../lib/db';
import { db } from '../lib/localDb'; 
import { showToast } from './Toast';

const CATEGORIES: { id: ItemCategory | 'All', label: string, color: string }[] = [
  { id: 'All', label: 'All Items', color: 'bg-slate-100 text-slate-700' },
  { id: 'retail', label: 'Retail & Supplies', color: 'bg-blue-50 text-blue-700' },
  { id: 'prescription', label: 'Pharmacy Rx', color: 'bg-emerald-50 text-emerald-700' },
  { id: 'vaccine', label: 'Vaccines', color: 'bg-amber-50 text-amber-700' },
  { id: 'service', label: 'Clinical Services', color: 'bg-purple-50 text-purple-700' },
  { id: 'lab_service', label: 'Lab Tests', color: 'bg-rose-50 text-rose-700' }
];

interface InventoryProps {
  inventory?: InventoryItem[];
  onAddProduct?: any;
  onUpdateStock?: any;
  onUpdatePrice?: any;
  onUpdateInventory?: (items: InventoryItem[]) => void;
  systemConfig?: any;
}

export default function InventoryManager({ onUpdateInventory }: InventoryProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ItemCategory | 'All'>('All');
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  // Quick Adjust State
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<number | string>('');

  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    sku: '', name: '', category: 'retail', price: 0, cost: 0, stock: 0, minStock: 5, unit: 'unit'
  });

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    const data = await fetchInventory();
    const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
    setItems(sorted);
    if (onUpdateInventory) onUpdateInventory(sorted); // Global Sync Cable active
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.sku) {
      showToast('SKU and Name are required.', 'error');
      return;
    }

    const isPhysical = !['service', 'lab_service'].includes(formData.category as string);

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
      location: formData.location || ''
    };

    await upsertInventoryItem(payload);
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
    await upsertInventoryItem(updatedItem);
    await loadInventory();
    
    setAdjustItem(null);
    setAdjustAmount('');
    showToast(`Stock adjusted by ${delta > 0 ? '+' + delta : delta}.`, 'success');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this item?')) return;
    await db.inventory.removeItem(id);
    await loadInventory();
    showToast('Item deleted from registry.', 'success');
  };

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({ ...item });
    setShowAddModal(true);
  };

  const openNew = () => {
    setEditingItem(null);
    setFormData({ sku: `SKU-${Date.now().toString().slice(-6)}`, name: '', category: 'retail', price: 0, cost: 0, stock: 0, minStock: 5, unit: 'unit', location: '' });
    setShowAddModal(true);
  };

  // Compute filtering and stats
  const filteredItems = items.filter(item => {
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

                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-black text-slate-800 text-sm">{item.name}</div>
                      <div className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">{item.sku}</div>
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
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isService && (
                          <button onClick={() => setAdjustItem(item)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer" title="Quick Adjust Stock">
                            <RefreshCw className="w-4 h-4" />
                          </button>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Full Add/Edit Form */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full animate-scale-up flex flex-col overflow-hidden max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 shrink-0 flex justify-between items-start bg-slate-50/50">
              <div>
                <h2 className="text-lg font-black text-slate-800">{editingItem ? 'Edit Registry Item' : 'New Inventory Record'}</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Master Database Entry</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-400 rounded-xl cursor-pointer transition-colors"><X className="w-4 h-4"/></button>
            </div>

            <form onSubmit={handleSaveItem} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Item Name *</label>
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
                      <option value="lab_service">Lab Test</option>
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
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Current Stock</label>
                      <input type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: parseInt(e.target.value)})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black font-mono text-slate-800 outline-none focus:border-indigo-500" />
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
                ) : (
                  <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-start gap-3">
                    <Activity className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-indigo-900">Infinite Capacity Item</h4>
                      <p className="text-[10px] font-semibold text-indigo-700 mt-1 leading-relaxed">Because this is classified as a Service or Lab Test, physical stock tracking is disabled.</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-200 shrink-0 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Cancel</button>
                <button type="submit" className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                  <CheckCircle2 className="w-4 h-4"/> Save Item
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
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}