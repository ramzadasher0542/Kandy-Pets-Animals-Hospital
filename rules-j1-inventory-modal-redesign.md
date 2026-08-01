# Phase J1: Professional Add Inventory Modal Redesign
# Mission: Remove cost, add unit dropdown, clean layout, professional styling

## FILE: src/components/InventoryManager.tsx

### ADD state for unit dropdown
After the existing useState declarations (around line 68-70), ADD:
  const [customUnit, setCustomUnit] = useState('');

### ADD unit presets constant (after imports, before component)
  const UNIT_PRESETS = [
    'Tablet', 'Bottle', 'Vial', 'Box', 'Pack', 'Sachet', 'Tube',
    'kg', 'g', 'ml', 'l', 'unit', 'dose', 'Ampoule', 'Capsule',
    'Syringe', 'Other'
  ];

### UPDATE openNew() (around line 244-248)
KEEP the auto-generated SKU logic. KEEP all fields except REMOVE cost: 0.
Change unit default from 'unit' to '' (empty — forces user to select).

REPLACE the openNew body with:
  const openNew = () =&gt; {
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

### UPDATE handleSaveItem (around line 97-137)
REMOVE the cost field from the payload entirely.
The payload should be:
  const payload: InventoryItem = {
    id: editingItem ? editingItem.id : crypto.randomUUID(),
    sku: formData.sku!.trim(),
    name: formData.name!.trim(),
    category: formData.category as ItemCategory,
    price: Number(formData.price) || 0,
    cost: 0, // deprecated — batch-level only
    stock: !editingItem ? 0 : (isPhysical ? (Number(formData.stock) || 0) : 0),
    minStock: isPhysical ? (Number(formData.minStock) || 0) : 0,
    unit: formData.unit || 'unit',
    location: formData.location || '',
    labParameters: isLab ? (formData.labParameters || []) : undefined,
    is_deleted: editingItem ? (editingItem.is_deleted || false) : false
  };

### REPLACE the entire modal form JSX (the &lt;form&gt; inside &lt;Modal&gt;, lines ~536-652)
KEEP the &lt;Modal&gt; wrapper and its title/footer props. Only replace the &lt;form&gt; contents.

REPLACE with this exact structure:

&lt;form id="inventoryForm" onSubmit={handleSaveItem} className="space-y-5"&gt;
  &lt;fieldset disabled={isSaving} className="contents"&gt;
    
    {/* BASIC INFO */}
    &lt;div className="space-y-3"&gt;
      &lt;div className="text-[10px] font-black text-slate-400 uppercase tracking-widest"&gt;Basic Information&lt;/div&gt;
      &lt;div className="grid grid-cols-2 gap-3"&gt;
        &lt;div className="col-span-2"&gt;
          &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5"&gt;Item / Test Name *&lt;/label&gt;
          &lt;input 
            type="text" 
            required 
            value={formData.name || ''} 
            onChange={e =&gt; setFormData({...formData, name: e.target.value})}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
            placeholder="e.g. Amoxicillin 250mg"
          /&gt;
        &lt;/div&gt;
        &lt;div&gt;
          &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5"&gt;SKU / Barcode *&lt;/label&gt;
          &lt;input 
            type="text" 
            required 
            value={formData.sku || ''} 
            onChange={e =&gt; setFormData({...formData, sku: e.target.value})}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
          /&gt;
        &lt;/div&gt;
        &lt;div&gt;
          &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5"&gt;Master Category&lt;/label&gt;
          &lt;select 
            value={formData.category || 'retail'} 
            onChange={e =&gt; setFormData({...formData, category: e.target.value as ItemCategory, unit: e.target.value === 'service' || e.target.value === 'lab_service' ? '' : formData.unit})}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
          &gt;
            &lt;option value="retail"&gt;Retail & Supplies&lt;/option&gt;
            &lt;option value="prescription"&gt;Pharmacy Rx&lt;/option&gt;
            &lt;option value="vaccine"&gt;Vaccine&lt;/option&gt;
            &lt;option value="service"&gt;Clinical Service&lt;/option&gt;
            &lt;option value="lab_service"&gt;Lab Test (Diagnostic)&lt;/option&gt;
            &lt;option value="food"&gt;Food & Feeding&lt;/option&gt;
          &lt;/select&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;

    {/* PRICING */}
    &lt;div className="space-y-3"&gt;
      &lt;div className="text-[10px] font-black text-slate-400 uppercase tracking-widest"&gt;Pricing&lt;/div&gt;
      &lt;div className="bg-slate-50 rounded-xl border border-slate-200 p-4"&gt;
        &lt;div&gt;
          &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5"&gt;Selling Price (Rs.) *&lt;/label&gt;
          &lt;input 
            type="number" 
            step="0.01" 
            min="0" 
            required 
            value={formData.price || 0} 
            onChange={e =&gt; setFormData({...formData, price: parseFloat(e.target.value)})}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
          /&gt;
        &lt;/div&gt;
        &lt;p className="mt-2 text-[10px] text-slate-400"&gt;Cost is tracked per batch when receiving stock.&lt;/p&gt;
      &lt;/div&gt;
    &lt;/div&gt;

    {/* PHYSICAL ITEMS: Stock Settings */}
    {isFormPhysical && (
      &lt;div className="space-y-3"&gt;
        &lt;div className="text-[10px] font-black text-slate-400 uppercase tracking-widest"&gt;Stock Settings&lt;/div&gt;
        &lt;div className="grid grid-cols-3 gap-3"&gt;
          {editingItem && (
            &lt;div&gt;
              &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5"&gt;Current Stock&lt;/label&gt;
              &lt;input 
                type="number" 
                value={formData.stock || 0} 
                onChange={e =&gt; setFormData({...formData, stock: parseInt(e.target.value)})}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
              /&gt;
              &lt;p className="mt-1 text-[10px] text-amber-600"&gt;Manual adjustment only&lt;/p&gt;
            &lt;/div&gt;
          )}
          &lt;div&gt;
            &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5"&gt;Alert Minimum&lt;/label&gt;
            &lt;input 
              type="number" 
              value={formData.minStock || 0} 
              onChange={e =&gt; setFormData({...formData, minStock: parseInt(e.target.value)})}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
            /&gt;
          &lt;/div&gt;
          &lt;div&gt;
            &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5"&gt;Unit Metric *&lt;/label&gt;
            &lt;select 
              required
              value={formData.unit || ''} 
              onChange={e =&gt; {
                const val = e.target.value;
                setFormData({...formData, unit: val === '__OTHER__' ? customUnit || '' : val});
                if (val !== '__OTHER__') setCustomUnit('');
              }}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
            &gt;
              &lt;option value=""&gt;Select unit...&lt;/option&gt;
              {UNIT_PRESETS.map(u =&gt; (
                &lt;option key={u} value={u === 'Other' ? '__OTHER__' : u}&gt;{u}&lt;/option&gt;
              ))}
            &lt;/select&gt;
          &lt;/div&gt;
          {(formData.unit === '__OTHER__' || (!UNIT_PRESETS.includes(formData.unit || '') && formData.unit)) && (
            &lt;div className="col-span-full"&gt;
              &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5"&gt;Custom Unit&lt;/label&gt;
              &lt;input 
                type="text" 
                required
                placeholder="e.g. strip, pouch"
                value={customUnit} 
                onChange={e =&gt; {
                  setCustomUnit(e.target.value);
                  setFormData({...formData, unit: e.target.value});
                }}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
              /&gt;
            &lt;/div&gt;
          )}
        &lt;/div&gt;
      &lt;/div&gt;
    )}

    {/* SERVICE INFO (non-physical, non-lab) */}
    {!isFormPhysical && !isFormLab && (
      &lt;div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4 flex items-start gap-3"&gt;
        &lt;Info className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" /&gt;
        &lt;div&gt;
          &lt;div className="text-xs font-bold text-indigo-800"&gt;Service Item&lt;/div&gt;
          &lt;p className="text-[10px] text-indigo-600 mt-0.5"&gt;Stock tracking is disabled. Set quantity at billing time. No expiry dates.&lt;/p&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    )}

    {/* LAB PARAMETERS */}
    {isFormLab && (
      &lt;div className="space-y-3"&gt;
        &lt;div className="text-[10px] font-black text-slate-400 uppercase tracking-widest"&gt;Diagnostic Parameters&lt;/div&gt;
        {/* KEEP the existing lab parameter builder JSX here — do not change the parameter builder logic, only wrap it in this section header */}
      &lt;/div&gt;
    )}

    {/* LOT/EXPIRY — edit only, prescription/vaccine */}
    {editingItem && ['prescription', 'vaccine'].includes(formData.category || '') && (
      &lt;div className="space-y-3"&gt;
        &lt;div className="text-[10px] font-black text-slate-400 uppercase tracking-widest"&gt;Batch Override (Edit Only)&lt;/div&gt;
        &lt;div className="grid grid-cols-2 gap-3"&gt;
          &lt;div&gt;
            &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5"&gt;Lot Number&lt;/label&gt;
            &lt;input 
              type="text" 
              value={formData.lotNumber || ''} 
              onChange={e =&gt; setFormData({...formData, lotNumber: e.target.value})}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
            /&gt;
          &lt;/div&gt;
          &lt;div&gt;
            &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5"&gt;Expiry Date&lt;/label&gt;
            &lt;input 
              type="date" 
              value={formData.expiryDate || ''} 
              onChange={e =&gt; setFormData({...formData, expiryDate: e.target.value})}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
            /&gt;
          &lt;/div&gt;
        &lt;/div&gt;
        &lt;p className="text-[10px] text-amber-600"&gt;⚠ This overrides the soonest-expiring batch display only. Use Receive Stock for actual batch management.&lt;/p&gt;
      &lt;/div&gt;
    )}

  &lt;/fieldset&gt;
&lt;/form&gt;

### ADD import
Add `Info` to the existing lucide-react imports:
  Info,

## CONSTRAINTS
- Do NOT change the &lt;Modal&gt; wrapper props (title, footer, size, onClose)
- Do NOT change the lab parameter builder logic — only rewrap it in the section header
- Do NOT remove the editingItem check for Current Stock and Lot/Expiry
- Do NOT change any data-fetching or save logic outside handleSaveItem
- Run npx tsc --noEmit