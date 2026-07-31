# Phase H3: Inventory Redesign + Setup Mode + Supplier Dropdown
# Mission: Clean list + detail panel, supplier dropdown, setup mode wiring

## FILE 1: src/App.tsx

### UPDATE InventoryManager prop
Find the case 'inventory' in renderCanvas().
REPLACE:
  case 'inventory':
    return &lt;InventoryManager currentUser={currentUser} /&gt;;
WITH:
  case 'inventory':
    return &lt;InventoryManager currentUser={currentUser} systemConfig={systemConfig} /&gt;;

## FILE 2: src/components/InventoryManager.tsx

### ADD imports
Add to existing imports:
  import { X, Package, RefreshCw, Edit2, Trash2 } from 'lucide-react';
  import { fetchSuppliers, upsertSupplier } from '../lib/db';
  import { Supplier } from '../types';

### ADD props
Find the component signature. If it only has { currentUser }, change to:
  export default function InventoryManager({ currentUser, systemConfig }: { currentUser: any; systemConfig: any }) {

### ADD state (after existing useState declarations, around line 70)
  const [selectedItem, setSelectedItem] = useState&lt;InventoryItem | null&gt;(null);
  const [suppliers, setSuppliers] = useState&lt;Supplier[]&gt;([]);
  const [showInlineSupplier, setShowInlineSupplier] = useState(false);
  const [inlineSupplierName, setInlineSupplierName] = useState('');

### ADD supplier load useEffect (after existing useEffects)
  useEffect(() =&gt; {
    const loadSuppliers = async () =&gt; {
      const data = await fetchSuppliers();
      setSuppliers(data);
    };
    loadSuppliers();
  }, []);

### ADD inline supplier handler (after handleReceiveStock or near other handlers)
  const handleAddInlineSupplier = async () =&gt; {
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
    setReceiveFormData(prev =&gt; ({ ...prev, supplier_id: newSupplier.id }));
    setShowInlineSupplier(false);
    setInlineSupplierName('');
  };

### REPLACE the main table + layout block
FIND the entire block starting with:
  &lt;tbody className="divide-y divide-slate-100"&gt;
    {filteredItems.length === 0 ? (...) : filteredItems.map(item =&gt; { ... })}
  &lt;/tbody&gt;
AND the surrounding table structure (the &lt;table&gt; element).

REPLACE the WHOLE &lt;table&gt; and its wrapper with this two-column layout:

&lt;div className="flex gap-4"&gt;
  {/* LEFT: Item List */}
  &lt;div className={`${selectedItem ? 'w-2/3' : 'w-full'} transition-all`}&gt;
    &lt;table className="w-full"&gt;
      &lt;thead&gt;
        &lt;tr className="border-b border-slate-100"&gt;
          &lt;th className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left"&gt;SKU & Item Name&lt;/th&gt;
          &lt;th className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left"&gt;Category&lt;/th&gt;
          &lt;th className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left"&gt;Cost / Price&lt;/th&gt;
          &lt;th className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left"&gt;Stock Level&lt;/th&gt;
        &lt;/tr&gt;
      &lt;/thead&gt;
      &lt;tbody className="divide-y divide-slate-100"&gt;
        {filteredItems.length === 0 ? (
          &lt;tr&gt;&lt;td colSpan={4}&gt;&lt;EmptyState title="No items found in registry" /&gt;&lt;/td&gt;&lt;/tr&gt;
        ) : filteredItems.map(item =&gt; {
          const catInfo = CATEGORIES.find(c =&gt; c.id === item.category);
          const isService = ['service', 'lab_service'].includes(item.category);
          const isLow = !isService && item.stock &lt;= item.minStock;
          let expiryStatus: 'ok' | 'soon' | 'expired' = 'ok';
          if (['prescription', 'vaccine'].includes(item.category) && item.expiryDate) {
            const today = new Date(); today.setHours(0,0,0,0);
            const exp = new Date(item.expiryDate);
            const daysDiff = (exp.getTime() - today.getTime()) / (1000*60*60*24);
            if (daysDiff &lt; 0) expiryStatus = 'expired';
            else if (daysDiff &lt;= 30) expiryStatus = 'soon';
          }
          const itemBatches = batches.filter(b =&gt; b.inventoryItemId === item.id && b.quantityRemaining &gt; 0);
          const expiringSoonCount = itemBatches.filter(b =&gt; {
            const days = (new Date(b.expiryDate).getTime() - new Date().getTime()) / (1000*60*60*24);
            return days &gt;= 0 && days &lt;= 30;
          }).reduce((sum, b) =&gt; sum + b.quantityRemaining, 0);
          const isSelected = selectedItem?.id === item.id;
          return (
            &lt;React.Fragment key={item.id}&gt;
              &lt;tr 
                className={`hover:bg-slate-50 transition-colors cursor-pointer ${isSelected ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''}`}
                onClick={() =&gt; setSelectedItem(isSelected ? null : item)}
              &gt;
                &lt;td className="px-4 py-3"&gt;
                  &lt;div className="text-xs font-bold text-slate-800"&gt;{item.name}&lt;/div&gt;
                  {item.category === 'lab_service' && item.labParameters && item.labParameters.length &gt; 0 && (
                    &lt;span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full"&gt;{item.labParameters.length} Params&lt;/span&gt;
                  )}
                  &lt;div className="text-[10px] font-mono text-slate-400 mt-0.5"&gt;{item.sku}&lt;/div&gt;
                  {!isService && itemBatches.length &gt; 0 && (
                    &lt;button 
                      onClick={(e) =&gt; { e.stopPropagation(); toggleBatches(item.id); }}
                      className="text-[10px] text-indigo-600 hover:text-indigo-700 font-bold mt-1"
                    &gt;
                      {expandedBatches.has(item.id) ? 'Hide Batches' : `Batches (${itemBatches.length})`}
                    &lt;/button&gt;
                  )}
                  {expiringSoonCount &gt; 0 && !expandedBatches.has(item.id) && (
                    &lt;div className="text-[10px] text-amber-600 font-bold mt-1"&gt;⚠ {expiringSoonCount} units expiring within 30 days&lt;/div&gt;
                  )}
                &lt;/td&gt;
                &lt;td className="px-4 py-3 text-xs text-slate-600"&gt;{catInfo?.label || item.category}&lt;/td&gt;
                &lt;td className="px-4 py-3 text-xs font-mono text-slate-700"&gt;
                  &lt;div className="text-emerald-700 font-bold"&gt;{(item.price || 0).toFixed(2)}&lt;/div&gt;
                  &lt;div className="text-slate-400"&gt;Cost: {(item.cost || 0).toFixed(2)}&lt;/div&gt;
                &lt;/td&gt;
                &lt;td className="px-4 py-3"&gt;
                  {isService ? (
                    &lt;span className="text-xs text-slate-400"&gt;∞&lt;/span&gt;
                  ) : (
                    &lt;div className="text-xs"&gt;
                      &lt;span className="font-bold text-slate-800"&gt;{item.stock} {item.unit}&lt;/span&gt;
                      {isLow && &lt;span className="ml-2 text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded"&gt;Low Stock&lt;/span&gt;}
                      {expiryStatus === 'expired' && &lt;span className="ml-2 text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded"&gt;EXPIRED&lt;/span&gt;}
                      {expiryStatus === 'soon' && &lt;span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded"&gt;Expiring Soon&lt;/span&gt;}
                    &lt;/div&gt;
                  )}
                &lt;/td&gt;
              &lt;/tr&gt;
              {expandedBatches.has(item.id) && (
                &lt;tr&gt;
                  &lt;td colSpan={4} className="px-4 py-2 bg-slate-50"&gt;
                    &lt;table className="w-full text-xs"&gt;
                      &lt;thead&gt;
                        &lt;tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest"&gt;
                          &lt;th className="text-left py-1"&gt;Lot Number&lt;/th&gt;
                          &lt;th className="text-left py-1"&gt;Expiry Date&lt;/th&gt;
                          &lt;th className="text-left py-1"&gt;Qty Remaining&lt;/th&gt;
                          &lt;th className="text-left py-1"&gt;Supplier&lt;/th&gt;
                        &lt;/tr&gt;
                      &lt;/thead&gt;
                      &lt;tbody&gt;
                        {itemBatches.sort((a, b) =&gt; new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()).map(b =&gt; {
                          const daysDiff = (new Date(b.expiryDate).getTime() - new Date().getTime()) / (1000*60*60*24);
                          const isExp = daysDiff &lt; 0;
                          const isSoon = daysDiff &gt;= 0 && daysDiff &lt;= 30;
                          const supplierName = b.supplier_id ? suppliers.find(s =&gt; s.id === b.supplier_id)?.name || 'Unknown' : b.supplier || '-';
                          return (
                            &lt;tr key={b.id} className="border-t border-slate-100"&gt;
                              &lt;td className="py-1 font-mono"&gt;{b.lotNumber}&lt;/td&gt;
                              &lt;td className="py-1"&gt;
                                {b.expiryDate}
                                {isExp && &lt;span className="ml-1 text-rose-600 font-bold"&gt;Expired&lt;/span&gt;}
                                {isSoon && &lt;span className="ml-1 text-amber-600 font-bold"&gt;Soon&lt;/span&gt;}
                              &lt;/td&gt;
                              &lt;td className="py-1 font-bold"&gt;{b.quantityRemaining}&lt;/td&gt;
                              &lt;td className="py-1 text-slate-500"&gt;{supplierName}&lt;/td&gt;
                            &lt;/tr&gt;
                          );
                        })}
                      &lt;/tbody&gt;
                    &lt;/table&gt;
                  &lt;/td&gt;
                &lt;/tr&gt;
              )}
            &lt;/React.Fragment&gt;
          );
        })}
      &lt;/tbody&gt;
    &lt;/table&gt;
  &lt;/div&gt;

  {/* RIGHT: Detail Panel */}
  {selectedItem && (
    &lt;div className="w-1/3 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in self-start"&gt;
      &lt;div className="flex items-start justify-between"&gt;
        &lt;div&gt;
          &lt;h3 className="text-sm font-black text-slate-800"&gt;{selectedItem.name}&lt;/h3&gt;
          &lt;p className="text-[10px] font-mono text-slate-400"&gt;{selectedItem.sku}&lt;/p&gt;
          &lt;span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full mt-1 inline-block"&gt;{CATEGORIES.find(c =&gt; c.id === selectedItem.category)?.label || selectedItem.category}&lt;/span&gt;
        &lt;/div&gt;
        &lt;button onClick={() =&gt; setSelectedItem(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"&gt;&lt;X className="w-4 h-4" /&gt;&lt;/button&gt;
      &lt;/div&gt;

      &lt;div className="grid grid-cols-2 gap-3 text-xs"&gt;
        &lt;div className="bg-slate-50 rounded-xl p-3"&gt;
          &lt;div className="text-[10px] font-black text-slate-400 uppercase tracking-widest"&gt;Stock&lt;/div&gt;
          &lt;div className="text-lg font-black text-slate-800"&gt;{selectedItem.stock} &lt;span className="text-xs font-normal text-slate-500"&gt;{selectedItem.unit}&lt;/span&gt;&lt;/div&gt;
        &lt;/div&gt;
        &lt;div className="bg-slate-50 rounded-xl p-3"&gt;
          &lt;div className="text-[10px] font-black text-slate-400 uppercase tracking-widest"&gt;Min Alert&lt;/div&gt;
          &lt;div className="text-lg font-black text-slate-800"&gt;{selectedItem.minStock}&lt;/div&gt;
        &lt;/div&gt;
        &lt;div className="bg-emerald-50 rounded-xl p-3"&gt;
          &lt;div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest"&gt;Selling&lt;/div&gt;
          &lt;div className="text-lg font-black text-emerald-800"&gt;Rs. {(selectedItem.price || 0).toFixed(2)}&lt;/div&gt;
        &lt;/div&gt;
        &lt;div className="bg-slate-50 rounded-xl p-3"&gt;
          &lt;div className="text-[10px] font-black text-slate-400 uppercase tracking-widest"&gt;Cost&lt;/div&gt;
          &lt;div className="text-lg font-black text-slate-800"&gt;Rs. {(selectedItem.cost || 0).toFixed(2)}&lt;/div&gt;
        &lt;/div&gt;
      &lt;/div&gt;

      &lt;div&gt;
        &lt;h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2"&gt;Active Batches&lt;/h4&gt;
        {(() =&gt; {
          const selectedBatches = batches.filter(b =&gt; b.inventoryItemId === selectedItem.id && b.quantityRemaining &gt; 0).sort((a, b) =&gt; new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
          return selectedBatches.length === 0 ? (
            &lt;p className="text-xs text-slate-400"&gt;No active batches&lt;/p&gt;
          ) : (
            &lt;div className="space-y-2 max-h-48 overflow-y-auto"&gt;
              {selectedBatches.map(b =&gt; {
                const s = suppliers.find(sup =&gt; sup.id === b.supplier_id);
                return (
                  &lt;div key={b.id} className="bg-slate-50 rounded-xl p-3 text-xs"&gt;
                    &lt;div className="flex justify-between font-bold text-slate-700"&gt;
                      &lt;span&gt;{b.lotNumber || 'No lot'}&lt;/span&gt;
                      &lt;span&gt;{b.quantityRemaining} left&lt;/span&gt;
                    &lt;/div&gt;
                    &lt;div className="text-slate-500 mt-1"&gt;Exp: {b.expiryDate || 'N/A'} {b.origin && &lt;span className="ml-1 text-[10px] bg-indigo-100 text-indigo-700 px-1 rounded"&gt;{b.origin}&lt;/span&gt;}&lt;/div&gt;
                    &lt;div className="text-slate-500 mt-0.5"&gt;{s?.name || b.supplier || 'No supplier'}&lt;/div&gt;
                  &lt;/div&gt;
                );
              })}
            &lt;/div&gt;
          );
        })()}
      &lt;/div&gt;

      &lt;div className="grid grid-cols-2 gap-2 pt-2"&gt;
        &lt;button onClick={() =&gt; setReceiveStockItem(selectedItem)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-colors"&gt;
          &lt;Package className="w-3.5 h-3.5" /&gt; Receive
        &lt;/button&gt;
        &lt;button onClick={() =&gt; setAdjustItem(selectedItem)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 text-slate-700 text-xs font-black rounded-xl hover:bg-slate-200 transition-colors"&gt;
          &lt;RefreshCw className="w-3.5 h-3.5" /&gt; Adjust
        &lt;/button&gt;
        &lt;button onClick={() =&gt; openEdit(selectedItem)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"&gt;
          &lt;Edit2 className="w-3.5 h-3.5" /&gt; Edit
        &lt;/button&gt;
        &lt;button onClick={() =&gt; handleDelete(selectedItem.id)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border border-rose-200 text-rose-700 text-xs font-bold rounded-xl hover:bg-rose-50 transition-colors"&gt;
          &lt;Trash2 className="w-3.5 h-3.5" /&gt; Delete
        &lt;/button&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  )}
&lt;/div&gt;

### UPDATE Receive Stock form
In the Receive Stock modal form (around line 719), FIND the Supplier / Vendor input:
  &lt;input type="text" required value={receiveFormData.supplier||""} onChange={e =&gt; setReceiveFormData({...receiveFormData, supplier: e.target.value})} placeholder="e.g. Medisupply Co." /&gt;

REPLACE it with this block:
  &lt;div&gt;
    &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5"&gt;
      Supplier {systemConfig?.setupModeActive ? '(Optional)' : '*'}
    &lt;/label&gt;
    &lt;select
      required={!systemConfig?.setupModeActive}
      value={receiveFormData.supplier_id || ''}
      onChange={e =&gt; {
        if (e.target.value === '__NEW__') {
          setShowInlineSupplier(true);
        } else {
          setReceiveFormData({...receiveFormData, supplier_id: e.target.value});
        }
      }}
      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
    &gt;
      &lt;option value=""&gt;
        {systemConfig?.setupModeActive ? 'No supplier (Opening Stock)' : 'Select supplier...'}
      &lt;/option&gt;
      {suppliers.filter(s =&gt; s.is_active !== false).map(s =&gt; (
        &lt;option key={s.id} value={s.id}&gt;{s.name}&lt;/option&gt;
      ))}
      &lt;option value="__NEW__"&gt;+ Add New Supplier&lt;/option&gt;
    &lt;/select&gt;
  &lt;/div&gt;
  {showInlineSupplier && (
    &lt;div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-200"&gt;
      &lt;input
        type="text"
        placeholder="New supplier name"
        value={inlineSupplierName}
        onChange={e =&gt; setInlineSupplierName(e.target.value)}
        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
      /&gt;
      &lt;div className="flex gap-2"&gt;
        &lt;button type="button" onClick={handleAddInlineSupplier} className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-lg hover:bg-indigo-700"&gt;Add&lt;/button&gt;
        &lt;button type="button" onClick={() =&gt; { setShowInlineSupplier(false); setInlineSupplierName(''); }} className="px-3 py-1.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg hover:bg-slate-300"&gt;Cancel&lt;/button&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  )}

### UPDATE handleReceiveStock
In handleReceiveStock, where the batch object is built, ADD these two fields:
  supplier_id: receiveFormData.supplier_id || undefined,
  origin: systemConfig?.setupModeActive ? 'opening_stock' : 'purchase',

KEEP the old supplier field for backward compat:
  supplier: receiveFormData.supplier || '',

The batch object should now look like:
  const batch: InventoryBatch = {
    id: crypto.randomUUID(),
    inventoryItemId: receiveStockItem.id,
    lotNumber: receiveFormData.lotNumber || '',
    expiryDate: receiveFormData.expiryDate || '',
    quantityReceived: receiveFormData.quantityReceived || 0,
    quantityRemaining: receiveFormData.quantityReceived || 0,
    receivedDate: receiveFormData.receivedDate || new Date().toISOString().split('T')[0],
    supplier: receiveFormData.supplier || '',
    supplier_id: receiveFormData.supplier_id || undefined,
    origin: systemConfig?.setupModeActive ? 'opening_stock' : 'purchase',
    costPerUnit: Math.round((receiveFormData.costPerUnit || 0) * 100),
    _dirty: false,
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

## FILE 3: src/components/SystemSettings.tsx

### ADD Setup Mode toggle to Inventory & Stock tab
FIND the inventory tab block:
  {activeTab === 'inventory' && (
    &lt;div className="space-y-6 animate-fade-in"&gt;
      &lt;div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6"&gt;
        &lt;div&gt;
          &lt;h3&gt;Bulk Stock Update&lt;/h3&gt;
          ...

INSERT a new section BEFORE the Bulk Stock Update section (still inside the space-y-6):
  &lt;div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4"&gt;
    &lt;div&gt;
      &lt;h3 className="text-sm font-black text-slate-800"&gt;Stock Entry Mode&lt;/h3&gt;
      &lt;p className="text-xs text-slate-500 mt-1"&gt;Control how incoming stock is recorded in the system.&lt;/p&gt;
    &lt;/div&gt;
    &lt;label className="flex items-start gap-3 cursor-pointer"&gt;
      &lt;input
        type="checkbox"
        checked={localConfig.setupModeActive || false}
        onChange={e =&gt; {
          const updated = { ...localConfig, setupModeActive: e.target.checked };
          setLocalConfig(updated);
          onChangeConfig(updated);
        }}
        className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 mt-0.5"
      /&gt;
      &lt;div&gt;
        &lt;span className="text-sm font-bold text-slate-800"&gt;Opening Stock / Setup Mode&lt;/span&gt;
        &lt;p className="text-xs text-slate-500 mt-0.5"&gt;
          When enabled, receiving stock does not require a supplier and marks batches as 
          &lt;span className="font-bold text-amber-700"&gt; opening stock&lt;/span&gt; rather than purchases. 
          Use this during initial clinic setup or full stock counts.
        &lt;/p&gt;
      &lt;/div&gt;
    &lt;/label&gt;
  &lt;/div&gt;

## CONSTRAINTS
- Do NOT remove the old supplier text field from the batch (backward compat)
- Do NOT change PageShell props or filters
- Do NOT change the Add Item / Edit Item modal
- Do NOT change Quick Adjust logic
- Run npx tsc --noEmit