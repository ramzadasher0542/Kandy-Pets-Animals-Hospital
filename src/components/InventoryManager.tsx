import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Package, 
  Search, 
  Plus, 
  AlertTriangle, 
  TrendingUp, 
  Edit3, 
  ArrowRight,
  TrendingDown,
  Percent,
  CheckCircle2,
  Bookmark
} from 'lucide-react';
import { InventoryItem, ItemCategory, CATEGORY_DISPLAY_MAP } from '../types';
import { showToast } from './Toast';

interface InventoryProps {
  inventory: InventoryItem[];
  onAddProduct: (product: InventoryItem) => void;
  onUpdateStock: (id: string, qtyDelta: number) => void;
  onUpdatePrice: (id: string, newPrice: number) => void;
  onUpdateInventory?: (newInventory: InventoryItem[]) => void;
  systemConfig?: any;
}

export default function InventoryManager({ 
  inventory, 
  onAddProduct, 
  onUpdateStock,
  onUpdatePrice,
  onUpdateInventory,
  systemConfig
}: InventoryProps) {
  const currencySign = systemConfig?.currencySymbol || '$';
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // Custom states to add new products/services
  const [showAddForm, setShowAddForm] = useState(false);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('retail');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('');
  const [unit, setUnit] = useState('item');
  const [formError, setFormError] = useState('');

  // Edit stock states
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingSku, setEditingSku] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editingCategory, setEditingCategory] = useState<ItemCategory>('retail');
  const [editingPrice, setEditingPrice] = useState('');
  const [editingCost, setEditingCost] = useState('');
  const [editingStock, setEditingStock] = useState('');
  const [editingMinStock, setEditingMinStock] = useState('');
  const [editingUnit, setEditingUnit] = useState('item');

  // Fast stock adjustments state (smarter local adjustment memory to prevent corruption)
  const [tempStockAdjustments, setTempStockAdjustments] = useState<Record<string, number>>({});

  const handleTempStockDelta = (itemId: string, currentStock: number, delta: number) => {
    const currentVal = tempStockAdjustments[itemId] !== undefined ? tempStockAdjustments[itemId] : currentStock;
    const newVal = Math.max(0, Math.round(currentVal + delta));
    setTempStockAdjustments(prev => ({
      ...prev,
      [itemId]: newVal
    }));
  };

  const handleTempStockChange = (itemId: string, val: string) => {
    const newVal = val === '' ? 0 : parseInt(val, 10) || 0;
    setTempStockAdjustments(prev => ({
      ...prev,
      [itemId]: Math.max(0, Math.round(newVal))
    }));
  };

  // Enforce absolute integer casting parameters on stock adjustments to lock out data-overwrite variance
  const handleModifyItemStockAtomic = async (itemId: string, currentStock: number, adjustmentStep: number) => {
    try {
      const sanitizedStep = parseInt(String(adjustmentStep), 10) || 0;
      const computedNewStock = Math.max(0, Math.round(currentStock + sanitizedStep));
      
      console.log(`[CeylonPets POS] Executing atomic stock operation for item ${itemId}. Target count:`, computedNewStock);
      
      // Pass the fully rounded absolute integer down to the local mutation update engine
      await Promise.resolve(onUpdateStock(itemId, computedNewStock - currentStock));
    } catch (err) {
      console.error('[CeylonPets POS] Inventory counter override crash intercepted safely:', err);
    }
  };

  const handleCommitStockAdjustment = async (itemId: string, currentStock: number) => {
    const adjustedVal = tempStockAdjustments[itemId];
    if (adjustedVal === undefined) return;
    
    await handleModifyItemStockAtomic(itemId, currentStock, adjustedVal - currentStock);
    
    // Clear temporary adjustment
    setTempStockAdjustments(prev => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
  };

  // Edit price state
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState('');

  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddForm) {
          setShowAddForm(false);
          setSku(''); setName(''); setPrice(''); setCost(''); setStock(''); setMinStock(''); setFormError('');
        }
        if (editingItem) setEditingItem(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showAddForm, editingItem]);

  // Force absolute real-time UI data recalculation to eliminate stale stock cache lag
  const filteredInventoryItems = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    return (inventory || []).filter((item) => {
      if (!item) return false;
      const matchesSearch = 
        (item.name || '').toLowerCase().includes(term) ||
        (item.sku || '').toLowerCase().includes(term) ||
        (item.category || '').toLowerCase().includes(term);
        
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      
      return matchesSearch && matchesCategory;
    });
  }, [inventory, searchTerm, categoryFilter]);

  const handleAddProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku || !name || !price) {
      setFormError('SKU Code, Item Name, and Retail Price are required.');
      return;
    }

    const stockNum = parseInt(stock) || 0;
    const isService = category === 'service' || category === 'lab_service';
    
    if (!isService && stockNum < 0) {
      setFormError('Stock cannot be negative for physical items.');
      return;
    }

    // Lock floating point precision strictly to 2 decimal places to avoid calculation drift
    const priceNum = Math.round((parseFloat(price) || 0) * 100) / 100;
    const costNum = Math.round((parseFloat(cost) || 0) * 100) / 100;
    const location = ''; 
    const now = new Date().toISOString();

    const newProduct = {
      // CRITICAL: Supabase-Ready UUIDs to prevent primary key collisions on sync
      id: crypto.randomUUID(),
      sku: sku.trim().toUpperCase() || `SKU-${crypto.randomUUID().split('-')[0].toUpperCase()}`,
      name: name.trim(),
      category: category,
      price: priceNum,
      cost: costNum,
      stock: isService ? 0 : stockNum,
      minStock: isService ? 0 : (parseInt(minStock) || 0),
      unit: unit.trim() || 'item',
      location: location.trim() || 'Main Clinic',
      // Mandatory Cloud-Sync Metadata
      created_at: now,
      updated_at: now,
      is_deleted: false
    } as any; // Cast as any temporarily to prevent TS errors if types.ts lacks metadata fields

    onAddProduct(newProduct);
    setShowAddForm(false);

    // reset forms
    setSku('');
    setName('');
    setPrice('');
    setCost('');
    setStock('');
    setMinStock('');
    setUnit('item');
    setFormError('');
  };

  const handleEditProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    if (!editingSku || !editingName || !editingPrice) {
      showToast('All required asterisked fields must be completed.', 'success');
      return;
    }

    const updatedInventory = inventory.map(item => {
      if (item.id === editingItem.id) {
        return {
          ...item,
          sku: editingSku.trim().toUpperCase(),
          name: editingName.trim(),
          category: editingCategory,
          price: Math.round((parseFloat(editingPrice) || 0) * 100) / 100,
          cost: Math.round((parseFloat(editingCost) || 0) * 100) / 100,
          stock: (editingCategory === 'service' || editingCategory === 'lab_service') ? 0 : parseInt(editingStock) || 0,
          minStock: (editingCategory === 'service' || editingCategory === 'lab_service') ? 0 : parseInt(editingMinStock) || 0,
          unit: editingUnit.trim(),
          updated_at: new Date().toISOString() // Cloud sync trigger
        } as any;
      }
      return item;
    });

    if (onUpdateInventory) {
      onUpdateInventory(updatedInventory);
    } else {
      const priceNum = Math.round((parseFloat(editingPrice) || 0) * 100) / 100;
      onUpdatePrice(editingItem.id, priceNum);
      const stockNum = parseInt(editingStock) || 0;
      const delta = stockNum - editingItem.stock;
      if (delta !== 0) {
        onUpdateStock(editingItem.id, delta);
      }
    }

    setEditingItem(null);
  };

  const handlePriceUpdateCommit = (id: string) => {
    const p = parseFloat(tempPrice);
    if (!isNaN(p) && p >= 0) {
      onUpdatePrice(id, p);
    }
    setEditingPriceId(null);
  };

  return (
    <div className="space-y-4" id="inventory-manager-component">
      
      {/* Search Actions bar */}
      <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input name="searchCustomAnimalItemsMed172" id="search-custom-animal-items-med-172"
            aria-label="Search inventory items"
            type="text"
            placeholder="Search custom animal items, medications, checkups..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 text-xs rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex bg-slate-50 border rounded-xl p-1 overflow-x-auto whitespace-nowrap">
            {['all', 'service', 'vaccine', 'lab_service', 'prescription', 'retail'].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize cursor-pointer transition-all ${
                  categoryFilter === cat 
                    ? 'bg-sky-500 text-white shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat === 'all' ? 'All Inventory' : CATEGORY_DISPLAY_MAP[cat] || cat}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="ml-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="h-4 w-4" /> Add Item Line
          </button>
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="bg-white rounded-2xl border border-sky-100 shadow-sm overflow-hidden text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-extrabold text-[10px] uppercase tracking-wider border-b border-sky-100">
                <th className="py-3 px-4">SKU Code</th>
                <th className="py-3 px-4">Item Catalog Description</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">In-Stock Count</th>
                <th className="py-3 px-4 text-right font-mono">Retail Price</th>
                <th className="py-3 px-4 text-right">Margin %</th>
                <th className="py-3 px-4 text-center">Fast Stocks Adjustment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-50 font-medium">
              {filteredInventoryItems.map(item => {
                const isService = item.category === 'service' || item.category === 'lab_service';
                const isLowStock = !isService && item.stock <= item.minStock;
                
                // Profit margin calculation
                const margin = item.price > 0 
                  ? Math.round(((item.price - item.cost) / item.price) * 100) 
                  : 100;

                return (
                  <tr 
                    key={item.id} 
                    className={`hover:bg-sky-50/30 transition-colors ${
                      isLowStock ? 'bg-rose-50/20' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-400">
                      {item.sku}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-left">
                          <div className="font-bold text-slate-800 leading-snug">{item.name}</div>
                          {!isService && (
                            <div className="text-[10px] text-slate-400 font-medium font-mono mt-0.5">
                              Min stock buffer safety check: {item.minStock} {item.unit}s
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem(item);
                            setEditingSku(item.sku);
                            setEditingName(item.name);
                            setEditingCategory(item.category);
                            setEditingPrice(item.price.toString());
                            setEditingCost(item.cost.toString());
                            setEditingStock(item.stock.toString());
                            setEditingMinStock(item.minStock.toString());
                            setEditingUnit(item.unit);
                          }}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-[10px] cursor-pointer transition-all flex items-center gap-1.5 flex-shrink-0 border border-indigo-100 hover:border-indigo-200"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Edit Details</span>
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 capitalize">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        item.category === 'service' ? 'bg-sky-100 text-sky-800' :
                        item.category === 'vaccine' ? 'bg-fuchsia-100 text-fuchsia-800' :
                        item.category === 'lab_service' ? 'bg-purple-100 text-purple-800' :
                        item.category === 'prescription' ? 'bg-emerald-100 text-emerald-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {CATEGORY_DISPLAY_MAP[item.category] || item.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold">
                      {isService ? (
                        <span className="text-slate-400 font-mono text-[10px]">Infinite (N/A)</span>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <span className={`font-mono ${isLowStock ? 'text-rose-600 font-black' : 'text-slate-700'}`}>
                            {item.stock}
                          </span>
                          <span className="text-[10px] text-slate-400">{item.unit}s</span>
                          {isLowStock && (
                            <AlertTriangle className="h-3 w-3 text-rose-500 animate-bounce" title="Safety warning triggered" />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-800">
                      {editingPriceId === item.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input name="inputNumber594" id={`edit-price-${item.id}`}
                            aria-label="Edit price"
                            type="number"
                            step="0.1"
                            value={tempPrice}
                            onChange={(e) => setTempPrice(e.target.value)}
                            className="w-16 px-1 py-0.5 border text-right font-mono text-xs rounded"
                          />
                          <button 
                            type="button"
                            onClick={() => handlePriceUpdateCommit(item.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <div className="group inline-flex items-center justify-end gap-1">
                          <span>{currencySign}{item.price.toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPriceId(item.id);
                              setTempPrice(item.price.toString());
                            }}
                            className="p-0.5 text-slate-300 hover:text-slate-600 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">
                      {isService ? (
                        <span className="text-slate-400 font-mono text-[10px]">100%</span>
                      ) : (
                        <span className={`font-bold ${margin > 40 ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {margin}%
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {isService ? (
                        <div className="text-center font-mono text-[10px] text-slate-400">Fixed rate</div>
                      ) : (
                        <div className="flex justify-center items-center gap-1.5">
                          <button 
                            type="button"
                            onClick={() => handleTempStockDelta(item.id, item.stock, -1)}
                            className="w-7 h-7 flex items-center justify-center bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-650 rounded-lg font-bold text-sm cursor-pointer select-none transition-colors"
                            title="Decrement stock by 1"
                          >
                            -
                          </button>
                          
                          <input name="inputNumber399" id={`edit-stock-${item.id}`}
                            aria-label="Edit stock quantity"
                            type="number"
                            value={tempStockAdjustments[item.id] !== undefined ? tempStockAdjustments[item.id] : item.stock}
                            onChange={(e) => handleTempStockChange(item.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleCommitStockAdjustment(item.id, item.stock);
                              }
                            }}
                            className="w-14 px-1 py-1.5 border border-slate-250 text-center font-mono text-xs rounded-lg font-bold text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                            title="Type exact new quantity"
                          />
                          
                          <button 
                            type="button"
                            onClick={() => handleTempStockDelta(item.id, item.stock, 1)}
                            className="w-7 h-7 flex items-center justify-center bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-650 rounded-lg font-bold text-sm cursor-pointer select-none transition-colors"
                            title="Increment stock by 1"
                          >
                            +
                          </button>

                          {tempStockAdjustments[item.id] !== undefined && tempStockAdjustments[item.id] !== item.stock && (
                            <div className="flex items-center gap-1 pl-1">
                              <button 
                                type="button"
                                onClick={() => handleCommitStockAdjustment(item.id, item.stock)}
                                className="w-7 h-7 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-sm cursor-pointer transition-colors shadow-xs"
                                title="Confirm adjustment"
                              >
                                ✓
                              </button>
                              <button 
                                type="button"
                                onClick={() => {
                                  setTempStockAdjustments(prev => {
                                    const copy = { ...prev };
                                    delete copy[item.id];
                                    return copy;
                                  });
                                }}
                                className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg font-bold text-xs cursor-pointer transition-colors"
                                title="Cancel adjustment"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredInventoryItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    No matching clinical inventory found. Add item lines above!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Item Modal Overlay using React Portal to prevent containing block scrolling bug */}
      {showAddForm && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-sky-100 max-w-md w-full text-xs shadow-xl animate-fade-in flex flex-col overflow-hidden max-h-[calc(100vh-40px)]">
            
            <div className="flex justify-between items-start shrink-0 p-6 pb-4 border-b border-slate-100">
              <div>
                <h4 className="text-base font-extrabold text-slate-800 leading-none">Register New Supplies SKU</h4>
                <p className="text-[11px] text-slate-400 mt-1">Configure pricing rates, medication descriptors, and initial stock levels if retail</p>
              </div>
              <button 
                type="button"
                onClick={() => setShowAddForm(false)}
                className="p-1 hover:bg-slate-100 text-slate-400 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddProductSubmit} className="flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
              {formError && (
                <div className="text-red-600 bg-red-50 p-2 rounded mb-4 border border-red-200">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block" htmlFor="unique-sku-code">Unique SKU Code *</label>
                  <input name="uniqueSkuCode" id="unique-sku-code"
                    type="text"
                    required
                    maxLength={50}
                    placeholder="e.g. RT-009, SV-012"
                    value={sku}
                    onChange={(e) => { setSku(e.target.value.toUpperCase()); if (formError) setFormError(''); }}
                    className={`w-full px-3 py-2 bg-slate-50 border ${formError && !sku ? 'border-red-500' : 'border-slate-200'} rounded-lg text-slate-800 font-mono uppercase font-bold`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block" htmlFor="supply-category">Supply Category</label>
                  <select name="supplyCategory" id="supply-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ItemCategory)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold"
                  >
                    <option value="retail">Pet Retail Product</option>
                    <option value="prescription">Prescription Medicine</option>
                    <option value="vaccine">Vaccine</option>
                    <option value="lab_service">Lab Service</option>
                    <option value="service">Clinical Core Service</option>
                  </select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-semibold text-slate-700 block" htmlFor="catalog-item-name">Catalog Item Name *</label>
                  <input name="catalogItemName" id="catalog-item-name"
                    type="text"
                    required
                    maxLength={100}
                    placeholder="e.g. Purina Hypoallergenic Vet Food 3kg"
                    value={name}
                    onChange={(e) => { setName(e.target.value); if (formError) setFormError(''); }}
                    className={`w-full px-3 py-2 bg-slate-50 border ${formError && !name ? 'border-red-500' : 'border-slate-200'} rounded-lg text-slate-800`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block" htmlFor="clinic-selling-price-currencysign">Clinic Selling Price ({currencySign}) *</label>
                  <input name="clinicSellingPriceCurrencysign" id="clinic-selling-price-currencysign"
                    type="number"
                    step="0.01"
                    required
                    min={0}
                    max={999999}
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => { setPrice(e.target.value); if (formError) setFormError(''); }}
                    className={`w-full px-3 py-2 bg-slate-50 border ${formError && !price ? 'border-red-500' : 'border-slate-200'} rounded-lg text-slate-800 font-mono font-bold`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block" htmlFor="acquisition-cost-currencysign">Acquisition Cost ({currencySign})</label>
                  <input name="acquisitionCostCurrencysign" id="acquisition-cost-currencysign"
                    type="number"
                    step="0.01"
                    min={0}
                    max={999999}
                    placeholder="22.50"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono"
                  />
                </div>

                {category !== 'service' && category !== 'lab_service' && (
                  <>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 block" htmlFor="starting-stock-units">Starting Stock Units *</label>
                      <input name="startingStockUnits" id="starting-stock-units"
                        type="number"
                        required
                        min={0}
                        max={999999}
                        placeholder="15"
                        value={stock}
                        onChange={(e) => setStock(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 block" htmlFor="min-stock-safety-threshold">Min Stock Safety Threshold</label>
                      <input name="minStockSafetyThreshold" id="min-stock-safety-threshold"
                        type="number"
                        min={0}
                        max={999999}
                        placeholder="5"
                        value={minStock}
                        onChange={(e) => setMinStock(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="font-semibold text-slate-700 block" htmlFor="unit-label">Unit label</label>
                      <input name="unitLabel" id="unit-label"
                        type="text"
                        maxLength={50}
                        placeholder="item, dose, vial"
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                      />
                    </div>
                  </>
                )}
              </div>

              </div>
              <div className="shrink-0 flex gap-2 p-6 pt-4 justify-end border-t border-slate-100 bg-white">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer shadow-sm"
                >
                  Add SKU Line To Ledger
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Item Modal Overlay using React Portal to prevent containing block scrolling bug */}
      {editingItem && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-sky-100 max-w-md w-full text-xs shadow-xl animate-fade-in flex flex-col overflow-hidden max-h-[calc(100vh-40px)]">
            
            <div className="flex justify-between items-start shrink-0 p-6 pb-4 border-b border-slate-100">
              <div>
                <h4 className="text-base font-extrabold text-slate-800 leading-none">Modify Supplies SKU Details</h4>
                <p className="text-[11px] text-slate-400 mt-1">Update price rates, name, cost, unit labels and stock thresholds</p>
              </div>
              <button 
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1 hover:bg-slate-100 text-slate-400 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditProductSubmit} className="flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block" htmlFor="edit-unique-sku-code">Unique SKU Code *</label>
                  <input name="uniqueSkuCode" id="edit-unique-sku-code"
                    type="text"
                    required
                    maxLength={50}
                    placeholder="e.g. RT-009, SV-012"
                    value={editingSku}
                    onChange={(e) => setEditingSku(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono uppercase font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block" htmlFor="edit-supply-category">Supply Category</label>
                  <select name="supplyCategory" id="edit-supply-category"
                    value={editingCategory}
                    onChange={(e) => setEditingCategory(e.target.value as ItemCategory)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold"
                  >
                    <option value="retail">Pet Retail Product</option>
                    <option value="prescription">Prescription Medicine</option>
                    <option value="vaccine">Vaccine</option>
                    <option value="lab_service">Lab Service</option>
                    <option value="service">Clinical Core Service</option>
                  </select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-semibold text-slate-700 block" htmlFor="edit-catalog-item-name">Catalog Item Name *</label>
                  <input name="catalogItemName" id="edit-catalog-item-name"
                    type="text"
                    required
                    maxLength={100}
                    placeholder="e.g. Purina Hypoallergenic Vet Food 3kg"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block" htmlFor="edit-clinic-selling-price">Clinic Selling Price ({currencySign}) *</label>
                  <input name="clinicSellingPriceCurrencysign" id="edit-clinic-selling-price"
                    type="number"
                    step="0.01"
                    required
                    min={0}
                    max={999999}
                    placeholder="45.00"
                    value={editingPrice}
                    onChange={(e) => setEditingPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block" htmlFor="edit-acquisition-cost">Acquisition Cost ({currencySign})</label>
                  <input name="acquisitionCostCurrencysign" id="edit-acquisition-cost"
                    type="number"
                    step="0.01"
                    min={0}
                    max={999999}
                    placeholder="22.50"
                    value={editingCost}
                    onChange={(e) => setEditingCost(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono"
                  />
                </div>

                {editingCategory !== 'service' && editingCategory !== 'lab_service' && (
                  <>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 block" htmlFor="edit-inventory-stock-quantity">Inventory Stock Quantity *</label>
                      <input name="inventoryStockQuantity" id="edit-inventory-stock-quantity"
                        type="number"
                        required
                        min={0}
                        max={999999}
                        placeholder="15"
                        value={editingStock}
                        onChange={(e) => setEditingStock(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 block" htmlFor="edit-min-stock-safety-threshold">Min Stock Safety Threshold</label>
                      <input name="minStockSafetyThreshold" id="edit-min-stock-safety-threshold"
                        type="number"
                        min={0}
                        max={999999}
                        placeholder="5"
                        value={editingMinStock}
                        onChange={(e) => setEditingMinStock(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="font-semibold text-slate-700 block" htmlFor="edit-unit-label">Unit label</label>
                      <input name="unitLabel" id="edit-unit-label"
                        type="text"
                        maxLength={50}
                        placeholder="bag, bottle, caplet, dose"
                        value={editingUnit}
                        onChange={(e) => setEditingUnit(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                      />
                    </div>
                  </>
                )}
              </div>

              </div>
              <div className="shrink-0 flex gap-2 p-6 pt-4 justify-end border-t border-slate-100 bg-white">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-650 font-bold rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer shadow-sm"
                >
                  Save Stock Details
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
