import React, { useState, useEffect } from 'react';
import { Truck, Plus, Edit2, Trash2, Phone, Mail, MapPin, User } from 'lucide-react';
import { Supplier } from '../types';
import { fetchSuppliers, upsertSupplier, deleteSupplier } from '../lib/db';
import PageShell from './ui/PageShell';

export default function SuppliersManager({ currentUser }: { currentUser: any }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<Partial<Supplier>>({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    payment_terms: '',
    is_active: true
  });

  const loadSuppliers = async () => {
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

  useEffect(() => {
    loadSuppliers();
  }, []);

  const openAdd = () => {
    setEditingSupplier(null);
    setFormData({ name: '', contact_person: '', phone: '', email: '', address: '', payment_terms: '', is_active: true });
    setShowModal(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({ ...supplier });
    setShowModal(true);
  };

  const handleSave = async () => {
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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this supplier?')) return;
    try {
      await deleteSupplier(id);
      loadSuppliers();
    } catch (e: any) {
      alert(e.message || 'Delete failed.');
    }
  };

  return (
    <PageShell
      title="Suppliers"
      subtitle="Manage vendors and supply sources"
      actions={
        <button onClick={openAdd} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] uppercase tracking-widest font-black rounded-xl shadow-md flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap">
          <Plus className="w-4 h-4" /> Add Supplier
        </button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400 text-xs font-bold">Loading suppliers...</div>
      ) : suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <Truck className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-xs font-bold">No suppliers registered yet.</p>
          <button onClick={openAdd} className="mt-4 text-indigo-600 hover:text-indigo-700 text-xs font-bold">Add your first supplier</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map(s => (
            <div key={s.id} className={`bg-white rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${s.is_active === false ? 'opacity-60 border-slate-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-800">{s.name}</h3>
                  {s.contact_person && <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><User className="w-3 h-3" />{s.contact_person}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(s.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="space-y-1.5">
                {s.phone && <p className="text-xs text-slate-600 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" />{s.phone}</p>}
                {s.email && <p className="text-xs text-slate-600 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-slate-400" />{s.email}</p>}
                {s.address && <p className="text-xs text-slate-600 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400" />{s.address}</p>}
              </div>
              {s.payment_terms && <p className="mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Terms: {s.payment_terms}</p>}
              {s.is_active === false && <span className="mt-2 inline-block text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded">Inactive</span>}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-800">{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Name *</label>
                <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Contact Person</label>
                <input type="text" value={formData.contact_person || ''} onChange={e => setFormData({...formData, contact_person: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Phone</label>
                  <input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Email</label>
                  <input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Address</label>
                <input type="text" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Payment Terms</label>
                <input type="text" value={formData.payment_terms || ''} onChange={e => setFormData({...formData, payment_terms: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.is_active !== false} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500" />
                <span className="text-xs font-bold text-slate-700">Active</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-colors">Save Supplier</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
