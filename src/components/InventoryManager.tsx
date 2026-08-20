/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import EmptyState from './ui/EmptyState';
import { Modal } from './ui/Modal';
import {
  Plus, X, Edit2, Trash2, AlertTriangle,
  Package, Activity, CheckCircle2, RefreshCw, Layers, DollarSign, TestTube, MinusCircle, Info, Settings2
} from 'lucide-react';
import { InventoryItem, ItemCategory, InventoryBatch, Supplier, InventoryCategory } from '../types';
import { fetchInventory, fetchInventoryBatches, upsertInventoryBatch, fetchSuppliers, upsertSupplier, fetchInventoryCategories, upsertInventoryCategory, deleteInventoryCategory } from '../lib/db';
import { showToast } from './Toast';
import PageShell from './ui/PageShell';
import { formatRupees, parseWholeRupees } from '../utils/currency';

const UNIT_PRESETS = [
  'Tablet', 'Bottle', 'Vial', 'Box', 'Pack', 'Sachet', 'Tube',
  'kg', 'g', 'ml', 'l', 'unit', 'dose', 'Ampoule', 'Capsule',
  'Syringe', 'Other'
];

const DEFAULT_CATEGORY_DEFINITIONS = [
  { name: 'retail', label: 'Retail', is_service: false, is_lab: false },
  { name: 'service', label: 'Service', is_service: true, is_lab: false },
  { name: 'food', label: 'Food', is_service: false, is_lab: false },
  { name: 'pharmacy', label: 'Pharmacy', is_service: false, is_lab: false },
  { name: 'prescription', label: 'Prescription', is_service: false, is_lab: false },
  { name: 'vaccine', label: 'Vaccine', is_service: false, is_lab: false },
  { name: 'lab_service', label: 'Lab Service', is_service: true, is_lab: true },
] as const;

interface InventoryProps {
  inventory?: InventoryItem[];
  onAddProduct?: any;
  onUpdateStock?: (itemId: string, qtyDelta: number, expectedStock?: number) => Promise<void>;
  onUpdatePrice?: any;
  onUpdateInventory?: (item: any) => Promise<void>;
  onDeleteInventory?: (id: string) => Promise<void>;
  systemConfig?: any;
}

export default function InventoryManager({ inventory, onUpdateStock, onUpdateInventory, onDeleteInventory, systemConfig }: InventoryProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ItemCategory | 'All' | 'Expiring'>('All');
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  
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

  const [customUnit, setCustomUnit] = useState('');

  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [newCategoryIsService, setNewCategoryIsService] = useState(false);

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showInlineSupplier, setShowInlineSupplier] = useState(false);
  const [inlineSupplierName, setInlineSupplierName] = useState('');

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

  useEffect(() => {
    const loadSuppliers = async () => {
      const data = await fetchSuppliers();
      setSuppliers(data);
    };
    loadSuppliers();
  }, []);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    const cats = await fetchInventoryCategories();
    if (cats.length === 0) {
      const seeded = DEFAULT_CATEGORY_DEFINITIONS.map((definition, index): InventoryCategory => ({
        id: crypto.randomUUID(),
        ...definition,
        sort_order: index + 1,
        is_deleted: false,
      }));
      await Promise.all(seeded.map(upsertInventoryCategory));
      setCategories(await fetchInventoryCategories());
      return;
    }
    setCategories(cats);
  };

  const handleAddCategory = async () => {
    if (!newCategoryLabel.trim()) { showToast('Category name is required.', 'error'); return; }
    const name = newCategoryLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (categories.find(c => c.name === name)) { showToast('Category already exists.', 'error'); return; }
    const newCat: InventoryCategory = {
      id: crypto.randomUUID(),
      name,
      label: newCategoryLabel.trim(),
      is_service: newCategoryIsService,
      is_lab: false,
      sort_order: categories.length + 1,
      is_deleted: false
    };
    await upsertInventoryCategory(newCat);
    await loadCategories();
    setNewCategoryLabel('');
    setNewCategoryIsService(false);
    showToast('Category added.', 'success');
  };

  const handleUpdateCategory = async (id: string, updates: Partial<InventoryCategory>) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    await upsertInventoryCategory({ ...cat, ...updates });
    await loadCategories();
  };

  const handleDeleteCategory = async (id: string) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    const inUse = (items || []).some(i => i.category === cat.name);
    if (inUse) { showToast('Cannot delete — items still use this category.', 'error'); return; }
    await deleteInventoryCategory(id);
    await loadCategories();
    showToast('Category removed.', 'success');
  };

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
      category_id: categories.find(c => c.name === formData.category)?.id,
      price: Number(formData.price) || 0,
      cost: 0, // deprecated — batch-level only
      // Stock is changed only through Receive or Quick Adjust so batch totals
      // remain the source of truth for physical items.
      stock: editingItem ? (isPhysical ? editingItem.stock : 0) : 0,
      minStock: isPhysical ? (Number(formData.minStock) || 0) : 0,
      unit: formData.unit || 'unit',
      location: formData.location || '',
      labParameters: isLab ? (formData.labParameters || []) : undefined,
      is_deleted: editingItem ? (editingItem.is_deleted || false) : false
    };

    setIsSaving(true);
    try {
      if (onUpdateInventory) {
        await onUpdateInventory(payload);
      }
      await loadInventory();

      setShowAddModal(false);
      setEditingItem(null);
      showToast(editingItem ? 'Item updated successfully.' : 'New item added to registry.', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItem) return;
    
    const delta = Number(adjustAmount);
    if (isNaN(delta) || delta === 0) return;

    try {
      if (onUpdateStock) {
        await onUpdateStock(adjustItem.id, delta, adjustItem.stock);
      } else if (onUpdateInventory) {
        await onUpdateInventory({ ...adjustItem, stock: adjustItem.stock + delta });
      } else {
        throw new Error('Stock handler unavailable.');
      }
      await loadInventory();
      setAdjustItem(null);
      setAdjustAmount('');
      showToast(`Stock adjusted by ${delta > 0 ? '+' + delta : delta}.`, 'success');
    } catch (error: any) {
      showToast(`Stock adjustment failed: ${error?.message || error}`, 'error');
    }
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
      supplier: receiveFormData.supplier || '',
      supplier_id: receiveFormData.supplier_id || undefined,
      origin: systemConfig?.setupModeActive ? 'opening_stock' : 'purchase',
      costPerUnit: receiveFormData.costPerUnit ? Math.round(Number(receiveFormData.costPerUnit) * 100) : undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
       is_deleted: false
    };

    const updatedItem = { ...receiveStockItem, stock: receiveStockItem.stock + qty };
    const itemBatches = batches.filter(b => b.inventoryItemId === receiveStockItem.id && b.quantityRemaining > 0);
    itemBatches.push(batch);
    itemBatches.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    
    updatedItem.expiryDate = itemBatches[0].expiryDate;
    updatedItem.lotNumber = itemBatches[0].lotNumber;

    if (import.meta.env.DEV) console.log('[InventoryManager] Receiving stock. Qty:', qty, 'Old stock:', receiveStockItem.stock, 'New stock:', updatedItem.stock);

    if (onUpdateInventory) {
      await upsertInventoryBatch(batch);
      if (import.meta.env.DEV) console.log('[InventoryManager] Calling onUpdateInventory with new stock:', updatedItem.stock);
      await onUpdateInventory(updatedItem);
    }

    
    await loadInventory();
    
    setReceiveStockItem(null);
    setReceiveFormData({
      lotNumber: '', expiryDate: '', quantityReceived: 0, supplier: '', costPerUnit: 0, receivedDate: new Date().toISOString().split('T')[0]
    });
    showToast('Stock received and batch created', 'success');
  };

  const handleAddInlineSupplier = async () => {
    if (!inlineSupplierName.trim()) return;
    const newSupplier: Supplier = {
      id: crypto.randomUUID(),
      name: inlineSupplierName.trim(),
      is_active: true,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await upsertSupplier(newSupplier);
    const refreshed = await fetchSuppliers();
    setSuppliers(refreshed);
    setReceiveFormData(prev => ({ ...prev, supplier_id: newSupplier.id }));
    setShowInlineSupplier(false);
    setInlineSupplierName('');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this item?')) return;
    try {
      if (!onDeleteInventory) throw new Error('Delete handler unavailable.');
      await onDeleteInventory(id);
      await loadInventory();
      setSelectedItem(null);
      showToast('Item deleted from registry.', 'success');
    } catch (error: any) {
      showToast(`Delete failed: ${error?.message || error}`, 'error');
    }
  };

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({ ...item, labParameters: item.labParameters || [] });
    setShowAddModal(true);
  };

  const openNew = () => {
    setEditingItem(null);
    setCustomUnit('');
    setFormData({
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      name: '',
      category: 'retail',
      price: 0,
      stock: 0,
      minStock: 5,
      unit: '',
      location: '',
      labParameters: []
    });
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
  const totalValue = physicalItems.reduce((sum, item) => sum + ((item.cost || 0) * (item.stock || 0)), 0);
  const selectedCategory = categories.find(c => c.name === formData.category);
  const isFormPhysical = selectedCategory ? !selectedCategory.is_service : true;
  const isFormLab = selectedCategory ? selectedCategory.is_lab : false;

  return (
    <PageShell
      title="Inventory"
      subtitle="Manage stock, supply, and services"
      kpis={[
        {
          icon: <Layers className="w-6 h-6" />,
          label: 'Total Registry',
          value: <>{items.length} <span className="text-xs text-slate-500 font-bold ml-1">Items</span></>,
        },
        {
          icon: lowStockCount > 0 ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />,
          label: 'Stock Alerts',
          value: <span className={lowStockCount > 0 ? 'text-rose-600' : 'text-emerald-600'}>{lowStockCount} <span className="text-xs font-bold ml-1">Critical</span></span>,
          iconBg: lowStockCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600',
        },
        {
          icon: <DollarSign className="w-6 h-6" />,
          label: 'Physical Asset Value',
          value: <span className="font-mono">{formatRupees(totalValue)}</span>,
          iconBg: 'bg-emerald-50 text-emerald-600',
        },
      ]}
      filters={{
        options: [
          { id: 'All', label: 'All Items' },
          ...categories.map(cat => ({ id: cat.name, label: cat.label })),
          { id: 'Expiring', label: 'Expiring Stock', icon: <AlertTriangle className="w-3 h-3"/>, activeClass: 'bg-amber-500 text-white shadow-md' },
        ],
        active: activeCategory,
        onChange: (id) => setActiveCategory(id as any),
      }}
      search={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: 'Search SKU or Name...',
      }}
      actions={
        <>
          <button onClick={() => setShowCategoryManager(true)} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer whitespace-nowrap">
            <Settings2 className="w-3.5 h-3.5" /> Manage
          </button>
          <button onClick={openNew} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] uppercase tracking-widest font-black rounded-xl shadow-md flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </>
      }
    >
      {/* Main Data Grid */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <div className="flex gap-4">
            <div className={`${selectedItem ? 'w-2/3' : 'w-full'} transition-all`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">SKU & Item Name</th>
                  <th className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Category</th>
                  <th className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Cost / Price</th>
                  <th className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Stock Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr><td colSpan={4}><EmptyState title="No items found in registry" /></td></tr>
                ) : filteredItems.map(item => {
                  const catInfo = categories.find(c => c.name === item.category);
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
  
                  const isSelected = selectedItem?.id === item.id;
                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${isSelected ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''}`}
                        onClick={() => setSelectedItem(isSelected ? null : item)}
                      >
                        <td className="px-4 py-3">
                          <div className="text-xs font-bold text-slate-800">{item.name}</div>
                          {item.category === 'lab_service' && item.labParameters && item.labParameters.length > 0 && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{item.labParameters.length} Params</span>
                          )}
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">{item.sku}</div>
                          {!isService && itemBatches.length > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleBatches(item.id); }}
                              className="text-[10px] text-indigo-600 hover:text-indigo-700 font-bold mt-1"
                            >
                              {expandedBatches.has(item.id) ? 'Hide Batches' : `Batches (${itemBatches.length})`}
                            </button>
                          )}
                          {expiringSoonCount > 0 && !expandedBatches.has(item.id) && (
                            <div className="text-[10px] text-amber-600 font-bold mt-1">⚠ {expiringSoonCount} units expiring within 30 days</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{catInfo?.label || item.category}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-700">
                          <div className="text-emerald-700 font-bold">{formatRupees(item.price || 0)}</div>
                          <div className="text-slate-400">Cost: {formatRupees(item.cost || 0)}</div>
                        </td>
                        <td className="px-4 py-3">
                          {isService ? (
                            <span className="text-xs text-slate-400">∞</span>
                          ) : (
                            <div className="text-xs">
                              <span className="font-bold text-slate-800">{item.stock} {item.unit}</span>
                              {isLow && <span className="ml-2 text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">Low Stock</span>}
                              {expiryStatus === 'expired' && <span className="ml-2 text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">EXPIRED</span>}
                              {expiryStatus === 'soon' && <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Expiring Soon</span>}
                            </div>
                          )}
                        </td>
                      </tr>
                      {expandedBatches.has(item.id) && (
                        <tr>
                          <td colSpan={4} className="px-4 py-2 bg-slate-50">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  <th className="text-left py-1">Lot Number</th>
                                  <th className="text-left py-1">Expiry Date</th>
                                  <th className="text-left py-1">Qty Remaining</th>
                                  <th className="text-left py-1">Supplier</th>
                                </tr>
                              </thead>
                              <tbody>
                                {itemBatches.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()).map(b => {
                                  const daysDiff = (new Date(b.expiryDate).getTime() - new Date().getTime()) / (1000*60*60*24);
                                  const isExp = daysDiff < 0;
                                  const isSoon = daysDiff >= 0 && daysDiff <= 30;
                                  const supplierName = b.supplier_id ? suppliers.find(s => s.id === b.supplier_id)?.name || 'Unknown' : b.supplier || '-';
                                  return (
                                    <tr key={b.id} className="border-t border-slate-100">
                                      <td className="py-1 font-mono">{b.lotNumber}</td>
                                      <td className="py-1">
                                        {b.expiryDate}
                                        {isExp && <span className="ml-1 text-rose-600 font-bold">Expired</span>}
                                        {isSoon && <span className="ml-1 text-amber-600 font-bold">Soon</span>}
                                      </td>
                                      <td className="py-1 font-bold">{b.quantityRemaining}</td>
                                      <td className="py-1 text-slate-500">{supplierName}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>

          {selectedItem && (
            <div className="w-1/3 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in self-start">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-800">{selectedItem.name}</h3>
                  <p className="text-[10px] font-mono text-slate-400">{selectedItem.sku}</p>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full mt-1 inline-block">{categories.find(c => c.name === selectedItem.category)?.label || selectedItem.category}</span>
                </div>
                <button onClick={() => setSelectedItem(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock</div>
                  <div className="text-lg font-black text-slate-800">{selectedItem.stock} <span className="text-xs font-normal text-slate-500">{selectedItem.unit}</span></div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Min Alert</div>
                  <div className="text-lg font-black text-slate-800">{selectedItem.minStock}</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3">
                  <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Selling</div>
                  <div className="text-lg font-black text-emerald-800">Rs. {formatRupees(selectedItem.price || 0)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cost</div>
                  <div className="text-lg font-black text-slate-800">Rs. {formatRupees(selectedItem.cost || 0)}</div>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Active Batches</h4>
                {(() => {
                  const selectedBatches = batches.filter(b => b.inventoryItemId === selectedItem.id && b.quantityRemaining > 0).sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
                  return selectedBatches.length === 0 ? (
                    <p className="text-xs text-slate-400">No active batches</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedBatches.map(b => {
                        const s = suppliers.find(sup => sup.id === b.supplier_id);
                        return (
                          <div key={b.id} className="bg-slate-50 rounded-xl p-3 text-xs">
                            <div className="flex justify-between font-bold text-slate-700">
                              <span>{b.lotNumber || 'No lot'}</span>
                              <span>{b.quantityRemaining} left</span>
                            </div>
                            <div className="text-slate-500 mt-1">Exp: {b.expiryDate || 'N/A'} {b.origin && <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-700 px-1 rounded">{b.origin}</span>}</div>
                            <div className="text-slate-500 mt-0.5">{s?.name || b.supplier || 'No supplier'}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button onClick={() => setReceiveStockItem(selectedItem)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-colors">
                  <Package className="w-3.5 h-3.5" /> Receive
                </button>
                <button onClick={() => setAdjustItem(selectedItem)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 text-slate-700 text-xs font-black rounded-xl hover:bg-slate-200 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" /> Adjust
                </button>
                <button onClick={() => openEdit(selectedItem)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors">
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => handleDelete(selectedItem.id)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border border-rose-200 text-rose-700 text-xs font-bold rounded-xl hover:bg-rose-50 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* MODAL: Full Add/Edit Form */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        size="lg"
        title={
          <div>
            <div className="text-lg font-black text-slate-800">{editingItem ? 'Edit Registry Item' : 'New Inventory Record'}</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Master Database Entry</div>
          </div>
        }
        footer={
          <>
            <button type="button" onClick={() => setShowAddModal(false)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Cancel</button>
            <button type="submit" form="inventoryForm" disabled={isSaving} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <CheckCircle2 className="w-4 h-4"/> {isSaving ? 'Saving...' : 'Save Record'}
            </button>
          </>
        }
      >
<form id="inventoryForm" onSubmit={handleSaveItem} className="space-y-5">
  <fieldset disabled={isSaving} className="contents">

    {/* BASIC INFO */}
    <div className="space-y-3">
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Basic Information</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Item / Test Name *</label>
          <input
            type="text"
            required
            value={formData.name || ''}
            onChange={e => setFormData({...formData, name: e.target.value})}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
            placeholder="e.g. Amoxicillin 250mg"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">SKU / Barcode *</label>
          <input
            type="text"
            required
            value={formData.sku || ''}
            onChange={e => setFormData({...formData, sku: e.target.value})}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Master Category</label>
          <select
            value={formData.category || 'retail'}
            onChange={e => setFormData({...formData, category: e.target.value as ItemCategory, unit: e.target.value === 'service' || e.target.value === 'lab_service' ? '' : formData.unit})}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {categories.map(cat => (
              <option key={cat.name} value={cat.name}>{cat.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>

    {/* PRICING */}
    <div className="space-y-3">
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pricing</div>
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Selling Price (Rs.) *</label>
          <input
            type="number"
            step="1" inputMode="numeric"
            min="0"
            required
            value={formData.price || 0}
            onChange={e => setFormData({...formData, price: parseWholeRupees(e.target.value)})}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <p className="mt-2 text-[10px] text-slate-400">Cost is tracked per batch when receiving stock.</p>
      </div>
    </div>

    {/* PHYSICAL ITEMS: Stock Settings */}
    {isFormPhysical && (
      <div className="space-y-3">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Settings</div>
        <div className="grid grid-cols-3 gap-3">
          {editingItem && (
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Current Stock</label>
              <input
                type="number"
                value={formData.stock || 0}
                readOnly
                className="w-full px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 outline-none"
              />
              <p className="mt-1 text-[10px] text-amber-600">Use Receive or Quick Adjust to keep batches in sync.</p>
            </div>
          )}
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Alert Minimum</label>
            <input
              type="number"
              value={formData.minStock || 0}
              onChange={e => setFormData({...formData, minStock: parseInt(e.target.value)})}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Unit Metric *</label>
            <select
              required
              value={formData.unit || ''}
              onChange={e => {
                const val = e.target.value;
                setFormData({...formData, unit: val === '__OTHER__' ? customUnit || '' : val});
                if (val !== '__OTHER__') setCustomUnit('');
              }}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Select unit...</option>
              {UNIT_PRESETS.map(u => (
                <option key={u} value={u === 'Other' ? '__OTHER__' : u}>{u}</option>
              ))}
            </select>
          </div>
          {(formData.unit === '__OTHER__' || (!UNIT_PRESETS.includes(formData.unit || '') && formData.unit)) && (
            <div className="col-span-full">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Custom Unit</label>
              <input
                type="text"
                required
                placeholder="e.g. strip, pouch"
                value={customUnit}
                onChange={e => {
                  setCustomUnit(e.target.value);
                  setFormData({...formData, unit: e.target.value});
                }}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          )}
        </div>
      </div>
    )}

    {/* SERVICE INFO (non-physical, non-lab) */}
    {!isFormPhysical && !isFormLab && (
      <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
        <div>
          <div className="text-xs font-bold text-indigo-800">Service Item</div>
          <p className="text-[10px] text-indigo-600 mt-0.5">Stock tracking is disabled. Set quantity at billing time. No expiry dates.</p>
        </div>
      </div>
    )}

    {/* LAB PARAMETERS */}
    {isFormLab && (
      <div className="space-y-3">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Diagnostic Parameters</div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 animate-fade-in shadow-inner">
          <div className="flex items-center justify-between border-b border-indigo-200 pb-3 mb-4">
            <div>
              <h4 className="text-xs font-black text-indigo-900 flex items-center gap-2"><TestTube className="w-4 h-4"/> Diagnostic Parameter Matrix</h4>
              <p className="text-[10px] font-bold text-indigo-600 mt-1 uppercase tracking-widest">Define the reference ranges & units for this specific test.</p>
            </div>
            <button type="button" onClick={handleAddLabParameter} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm transition-colors cursor-pointer flex items-center gap-1">
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
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Range (e.g. 6.0 - 17.0)"
                    value={param.referenceRange}
                    onChange={(e) => handleUpdateLabParameter(index, 'referenceRange', e.target.value)}
                    className="w-1/3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono font-bold text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Unit (e.g. 10^9/L)"
                    value={param.unit}
                    onChange={(e) => handleUpdateLabParameter(index, 'unit', e.target.value)}
                    className="w-1/4 px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono font-bold text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveLabParameter(index)}
                    className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    title="Remove Parameter"
                  >
                    <MinusCircle className="w-5 h-5"/>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )}

    {/* LOT/EXPIRY — edit only, prescription/vaccine */}
    {editingItem && ['prescription', 'vaccine'].includes(formData.category || '') && (
      <div className="space-y-3">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Batch Override (Edit Only)</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Lot Number</label>
            <input
              type="text"
              value={formData.lotNumber || ''}
              onChange={e => setFormData({...formData, lotNumber: e.target.value})}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Expiry Date</label>
            <input
              type="date"
              value={formData.expiryDate || ''}
              onChange={e => setFormData({...formData, expiryDate: e.target.value})}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>
        <p className="text-[10px] text-amber-600">⚠ This overrides the soonest-expiring batch display only. Use Receive Stock for actual batch management.</p>
      </div>
    )}

  </fieldset>
</form>
      </Modal>

      {/* MODAL: Quick Adjust Stock */}
      <Modal
        open={!!adjustItem}
        onClose={() => setAdjustItem(null)}
        size="sm"
        title={
          <div>
            <div className="text-lg font-black text-slate-800 leading-tight">Quick Adjust Stock</div>
            <div className="text-xs font-bold text-slate-500">{adjustItem?.name}</div>
          </div>
        }
        icon={<div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl"><Package className="w-5 h-5"/></div>}
        footer={
          <>
            <button type="button" onClick={() => setAdjustItem(null)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-black rounded-xl hover:bg-slate-50 transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Cancel</button>
            <button type="submit" form="quickAdjustForm" className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Apply Delta</button>
          </>
        }
      >
        <div className="text-center space-y-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-4">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Stock</div>
            <div className="text-3xl font-black font-mono text-slate-800">{adjustItem?.stock}</div>
          </div>

          <form id="quickAdjustForm" onSubmit={handleQuickAdjust} className="space-y-4 pt-2">
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
          </form>
        </div>
      </Modal>

      {/* MODAL: Receive Stock */}
            <Modal
        open={!!receiveStockItem}
        onClose={() => setReceiveStockItem(null)}
        size="md"
        title={
          <div>
            <div className="text-lg font-black text-slate-800 leading-tight">Receive Stock</div>
            <div className="text-xs font-bold text-slate-500 mt-0.5">{receiveStockItem?.name}</div>
          </div>
        }
        icon={<div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl"><Package className="w-5 h-5"/></div>}
        footer={
          <>
            <button type="button" onClick={() => setReceiveStockItem(null)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Cancel</button>
            <button type="submit" form="receiveStockForm" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest cursor-pointer flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4"/> Confirm Receipt
            </button>
          </>
        }
      >
        <form id="receiveStockForm" onSubmit={handleReceiveStock} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Quantity Received</label>
              <input type="number" required min={1} value={receiveFormData.quantityReceived || ""} onChange={e => setReceiveFormData({...receiveFormData, quantityReceived: Number(e.target.value)})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black font-mono text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div className="col-span-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Cost Price per Unit</label>
              <input type="number" step="1" inputMode="numeric" min="0" required value={receiveFormData.costPerUnit || ""} onChange={e => setReceiveFormData({...receiveFormData, costPerUnit: parseWholeRupees(e.target.value)})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black font-mono text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div className="col-span-2 space-y-2">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                  Supplier {systemConfig?.setupModeActive ? '(Optional)' : '*'}
                </label>
                <select
                  required={!systemConfig?.setupModeActive}
                  value={receiveFormData.supplier_id || ''}
                  onChange={e => {
                    if (e.target.value === '__NEW__') {
                      setShowInlineSupplier(true);
                    } else {
                      setReceiveFormData({...receiveFormData, supplier_id: e.target.value});
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">
                    {systemConfig?.setupModeActive ? 'No supplier (Opening Stock)' : 'Select supplier...'}
                  </option>
                  {suppliers.filter(s => s.is_active !== false).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                  <option value="__NEW__">+ Add New Supplier</option>
                </select>
              </div>
              {showInlineSupplier && (
                <div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-200">
                  <input
                    type="text"
                    placeholder="New supplier name"
                    value={inlineSupplierName}
                    onChange={e => setInlineSupplierName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={handleAddInlineSupplier} className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-lg hover:bg-indigo-700">Add</button>
                    <button type="button" onClick={() => { setShowInlineSupplier(false); setInlineSupplierName(''); }} className="px-3 py-1.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg hover:bg-slate-300">Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <div className="col-span-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Lot / Batch Number</label>
              <input type="text" value={receiveFormData.lotNumber || ""} onChange={e => setReceiveFormData({...receiveFormData, lotNumber: e.target.value})} placeholder="Optional" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div className="col-span-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Expiry Date</label>
              <input type="date" value={receiveFormData.expiryDate || ""} onChange={e => setReceiveFormData({...receiveFormData, expiryDate: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
            </div>
          </div>
        </form>
      </Modal>

      {showCategoryManager && (
        <Modal open={showCategoryManager} onClose={() => setShowCategoryManager(false)} title="Manage Categories" size="md" footer={
          <button onClick={() => setShowCategoryManager(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200">Done</button>
        }>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex-1">
                  <input
                    value={cat.label}
                    onChange={e => handleUpdateCategory(cat.id, { label: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cat.is_service}
                    onChange={e => handleUpdateCategory(cat.id, { is_service: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  Service
                </label>
                <button
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <div className="border-t border-slate-200 pt-4 space-y-3">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Add New Category</div>
              <div className="flex items-center gap-3">
                <input
                  placeholder="e.g. Pet Toys"
                  value={newCategoryLabel}
                  onChange={e => setNewCategoryLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }}
                  className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newCategoryIsService}
                    onChange={e => setNewCategoryIsService(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  Service
                </label>
                <button
                  onClick={handleAddCategory}
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </PageShell>
  );
}
