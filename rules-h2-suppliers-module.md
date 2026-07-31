# Phase H2: Suppliers Sidebar Module
# Mission: Add a Suppliers management page to the sidebar

## ALSO FIXES
# Maps setupModeActive ↔ setup_mode_active in fetchSystemConfig / upsertSystemConfig
# so the Setup Mode toggle in Phase H3 will actually persist.

## FILE 1: src/lib/db.ts

### UPDATE fetchSystemConfig (in the return object mapping)
ADD this line inside the returned object (after idleLogoutMinutes):
  setupModeActive: data.setup_mode_active ?? false,

### UPDATE upsertSystemConfig (in the payload object)
ADD this line inside the payload object (after idle_logout_minutes):
  setup_mode_active: config.setupModeActive,

## FILE 2: src/App.tsx

### ADD icon import
Add to the existing lucide-react imports:
  Truck,

### ADD nav item
In the navItems array (around line 1709), add after the inventory item:
  { id: 'suppliers', label: 'Suppliers', icon: Truck, isLive: true },

### ADD renderCanvas case
In the renderCanvas() switch statement, add after the 'inventory' case:
  case 'suppliers':
    return &lt;SuppliersManager currentUser={currentUser} /&gt;;

### ADD role permission
In the default rolePermissions (useState initializer around line 223), add 'suppliers' to:
  manager:   [... 'inventory', 'suppliers', 'boarding' ...]
  admin:     [... 'inventory', 'suppliers', 'reminders' ...]
  owner:     [... 'inventory', 'suppliers', 'reminders' ...]
  provider:  [... 'inventory', 'suppliers', 'invoices' ...]

## FILE 3: src/components/SuppliersManager.tsx (NEW FILE)

Create this new file with the exact content below:

import React, { useState, useEffect } from 'react';
import { Truck, Plus, Edit2, Trash2, Phone, Mail, MapPin, User } from 'lucide-react';
import { Supplier } from '../types';
import { fetchSuppliers, upsertSupplier, deleteSupplier } from '../lib/db';
import { PageShell } from './PageShell';

export default function SuppliersManager({ currentUser }: { currentUser: any }) {
  const [suppliers, setSuppliers] = useState&lt;Supplier[]&gt;([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState&lt;Supplier | null&gt;(null);
  const [formData, setFormData] = useState&lt;Partial&lt;Supplier&gt;&gt;({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    payment_terms: '',
    is_active: true
  });

  const loadSuppliers = async () =&gt; {
    setLoading(true);
    try {
      const data = await fetchSuppliers();
      setSuppliers(data);
    } catch (e: any) {
      if (import.meta.env.DEV) console.error('[Suppliers]', e);
      alert('Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() =&gt; {
    loadSuppliers();
  }, []);

  const openAdd = () =&gt; {
    setEditingSupplier(null);
    setFormData({ name: '', contact_person: '', phone: '', email: '', address: '', payment_terms: '', is_active: true });
    setShowModal(true);
  };

  const openEdit = (supplier: Supplier) =&gt; {
    setEditingSupplier(supplier);
    setFormData({ ...supplier });
    setShowModal(true);
  };

  const handleSave = async () =&gt; {
    if (!formData.name?.trim()) {
      alert('Supplier name is required.');
      return;
    }
    try {
      const payload: Supplier = {
        id: editingSupplier?.id || crypto.randomUUID(),
        name: formData.name.trim(),
        contact_person: formData.contact_person || '',
        phone: formData.phone || '',
        email: formData.email || '',
        address: formData.address || '',
        payment_terms: formData.payment_terms || '',
        is_active: formData.is_active !== false,
        is_deleted: false,
        created_at: editingSupplier?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await upsertSupplier(payload);
      setShowModal(false);
      loadSuppliers();
    } catch (e: any) {
      alert(e.message || 'Save failed.');
    }
  };

  const handleDelete = async (id: string) =&gt; {
    if (!confirm('Delete this supplier?')) return;
    try {
      await deleteSupplier(id);
      loadSuppliers();
    } catch (e: any) {
      alert(e.message || 'Delete failed.');
    }
  };

  return (
    &lt;PageShell
      title="Suppliers"
      subtitle="Manage vendors and supply sources"
      action={{ label: 'Add Supplier', icon: Plus, onClick: openAdd }}
    &gt;
      {loading ? (
        &lt;div className="flex items-center justify-center h-64 text-slate-400 text-xs font-bold"&gt;Loading suppliers...&lt;/div&gt;
      ) : suppliers.length === 0 ? (
        &lt;div className="flex flex-col items-center justify-center h-64 text-slate-400"&gt;
          &lt;Truck className="w-12 h-12 mb-4 opacity-30" /&gt;
          &lt;p className="text-xs font-bold"&gt;No suppliers registered yet.&lt;/p&gt;
          &lt;button onClick={openAdd} className="mt-4 text-indigo-600 hover:text-indigo-700 text-xs font-bold"&gt;Add your first supplier&lt;/button&gt;
        &lt;/div&gt;
      ) : (
        &lt;div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"&gt;
          {suppliers.map(s =&gt; (
            &lt;div key={s.id} className={`bg-white rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${s.is_active === false ? 'opacity-60 border-slate-200' : 'border-slate-200'}`}&gt;
              &lt;div className="flex items-start justify-between mb-3"&gt;
                &lt;div&gt;
                  &lt;h3 className="text-sm font-black text-slate-800"&gt;{s.name}&lt;/h3&gt;
                  {s.contact_person && &lt;p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"&gt;&lt;User className="w-3 h-3" /&gt;{s.contact_person}&lt;/p&gt;}
                &lt;/div&gt;
                &lt;div className="flex gap-1"&gt;
                  &lt;button onClick={() =&gt; openEdit(s)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"&gt;&lt;Edit2 className="w-4 h-4" /&gt;&lt;/button&gt;
                  &lt;button onClick={() =&gt; handleDelete(s.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"&gt;&lt;Trash2 className="w-4 h-4" /&gt;&lt;/button&gt;
                &lt;/div&gt;
              &lt;/div&gt;
              &lt;div className="space-y-1.5"&gt;
                {s.phone && &lt;p className="text-xs text-slate-600 flex items-center gap-1.5"&gt;&lt;Phone className="w-3.5 h-3.5 text-slate-400" /&gt;{s.phone}&lt;/p&gt;}
                {s.email && &lt;p className="text-xs text-slate-600 flex items-center gap-1.5"&gt;&lt;Mail className="w-3.5 h-3.5 text-slate-400" /&gt;{s.email}&lt;/p&gt;}
                {s.address && &lt;p className="text-xs text-slate-600 flex items-center gap-1.5"&gt;&lt;MapPin className="w-3.5 h-3.5 text-slate-400" /&gt;{s.address}&lt;/p&gt;}
              &lt;/div&gt;
              {s.payment_terms && &lt;p className="mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider"&gt;Terms: {s.payment_terms}&lt;/p&gt;}
              {s.is_active === false && &lt;span className="mt-2 inline-block text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded"&gt;Inactive&lt;/span&gt;}
            &lt;/div&gt;
          ))}
        &lt;/div&gt;
      )}

      {showModal && (
        &lt;div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"&gt;
          &lt;div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"&gt;
            &lt;h3 className="text-sm font-black text-slate-800"&gt;{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}&lt;/h3&gt;
            &lt;div className="space-y-3"&gt;
              &lt;div&gt;
                &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1"&gt;Name *&lt;/label&gt;
                &lt;input type="text" value={formData.name || ''} onChange={e =&gt; setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" /&gt;
              &lt;/div&gt;
              &lt;div&gt;
                &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1"&gt;Contact Person&lt;/label&gt;
                &lt;input type="text" value={formData.contact_person || ''} onChange={e =&gt; setFormData({...formData, contact_person: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" /&gt;
              &lt;/div&gt;
              &lt;div className="grid grid-cols-2 gap-3"&gt;
                &lt;div&gt;
                  &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1"&gt;Phone&lt;/label&gt;
                  &lt;input type="text" value={formData.phone || ''} onChange={e =&gt; setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" /&gt;
                &lt;/div&gt;
                &lt;div&gt;
                  &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1"&gt;Email&lt;/label&gt;
                  &lt;input type="email" value={formData.email || ''} onChange={e =&gt; setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" /&gt;
                &lt;/div&gt;
              &lt;/div&gt;
              &lt;div&gt;
                &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1"&gt;Address&lt;/label&gt;
                &lt;input type="text" value={formData.address || ''} onChange={e =&gt; setFormData({...formData, address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" /&gt;
              &lt;/div&gt;
              &lt;div&gt;
                &lt;label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1"&gt;Payment Terms&lt;/label&gt;
                &lt;input type="text" value={formData.payment_terms || ''} onChange={e =&gt; setFormData({...formData, payment_terms: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" /&gt;
              &lt;/div&gt;
              &lt;label className="flex items-center gap-2 cursor-pointer"&gt;
                &lt;input type="checkbox" checked={formData.is_active !== false} onChange={e =&gt; setFormData({...formData, is_active: e.target.checked})} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500" /&gt;
                &lt;span className="text-xs font-bold text-slate-700"&gt;Active&lt;/span&gt;
              &lt;/label&gt;
            &lt;/div&gt;
            &lt;div className="flex justify-end gap-2 pt-2"&gt;
              &lt;button onClick={() =&gt; setShowModal(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"&gt;Cancel&lt;/button&gt;
              &lt;button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-colors"&gt;Save Supplier&lt;/button&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      )}
    &lt;/PageShell&gt;
  );
}

## CONSTRAINTS
- Do NOT change InventoryManager.tsx
- Do NOT change any database functions except the two setupModeActive mapping lines
- Use the exact same styling tokens as the rest of the app
- Run npx tsc --noEmit