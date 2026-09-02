import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronUp, Home,
  LayoutGrid, LoaderCircle, MapPin, Phone, Plus, ReceiptText, RefreshCw,
  Save, Scissors, ShieldCheck
} from 'lucide-react';
import { Clinic, ClinicSettings, DEFAULT_CLINIC_PANELS, User } from '../types';
import {
  createClinic, fetchAllClinicSettings, fetchClinics, updateClinic, upsertClinicSettings
} from '../lib/db';
import { PANEL_VIEWS } from '../lib/requireAuth';
import { showToast } from './Toast';

interface SuperAdminDashboardProps { currentUser: User; }

const defaults = (clinicId: string): ClinicSettings => ({
  clinicId,
  taxEnabled: true,
  groomingEnabled: true,
  boardingEnabled: true,
  enabledPanels: [...DEFAULT_CLINIC_PANELS],
});

const featureRows: Array<{ key: 'taxEnabled' | 'groomingEnabled' | 'boardingEnabled'; label: string; description: string; icon: typeof ReceiptText; color: string }> = [
  { key: 'taxEnabled' as const, label: 'Tax', description: 'Apply configured tax at checkout.', icon: ReceiptText, color: 'text-sky-600' },
  { key: 'groomingEnabled' as const, label: 'Grooming Salon', description: 'Expose grooming workflows to clinic staff.', icon: Scissors, color: 'text-violet-600' },
  { key: 'boardingEnabled' as const, label: 'Boarding / Hotel', description: 'Expose boarding and kennel workflows to clinic staff.', icon: Home, color: 'text-amber-600' },
];

export default function SuperAdminDashboard({ currentUser }: SuperAdminDashboardProps) {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [settings, setSettings] = useState<Record<string, ClinicSettings>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyClinic, setBusyClinic] = useState<string | null>(null);
  const [showAddClinic, setShowAddClinic] = useState(false);
  const [expandedClinicId, setExpandedClinicId] = useState<string | null>(null);
  const [clinicDrafts, setClinicDrafts] = useState<Record<string, Pick<Clinic, 'name' | 'address' | 'phone'>>>({});
  const [newClinic, setNewClinic] = useState({ name: '', address: '', phone: '' });

  const refresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [clinicRows, settingRows] = await Promise.all([fetchClinics(), fetchAllClinicSettings()]);
      const nextSettings: Record<string, ClinicSettings> = {};
       clinicRows.forEach(clinic => { nextSettings[clinic.id] = defaults(clinic.id); });
       settingRows.forEach(row => { nextSettings[row.clinicId] = row; });
       setClinics(clinicRows);
       setClinicDrafts(Object.fromEntries(clinicRows.map(clinic => [clinic.id, {
         name: clinic.name,
         address: clinic.address || '',
         phone: clinic.phone || '',
       }])));
       setSettings(nextSettings);
    } catch (err: any) {
      setError(err?.message || 'Clinic network could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const handleAddClinic = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newClinic.name.trim()) return;
    setBusyClinic('new');
    try {
      const clinic = await createClinic(newClinic, currentUser);
      setClinics(prev => [...prev, clinic].sort((a, b) => a.name.localeCompare(b.name)));
      setClinicDrafts(prev => ({ ...prev, [clinic.id]: { name: clinic.name, address: clinic.address || '', phone: clinic.phone || '' } }));
      setSettings(prev => ({ ...prev, [clinic.id]: defaults(clinic.id) }));
      setNewClinic({ name: '', address: '', phone: '' });
      setShowAddClinic(false);
      showToast(`${clinic.name} added to the clinic network.`, 'success');
    } catch (err: any) {
      showToast(`Clinic creation failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setBusyClinic(null);
    }
  };

  const handleToggle = async (clinicId: string, key: 'taxEnabled' | 'groomingEnabled' | 'boardingEnabled') => {
    const previous = settings[clinicId] || defaults(clinicId);
    const next = { ...previous, [key]: !previous[key] };
    setSettings(prev => ({ ...prev, [clinicId]: next }));
    setBusyClinic(clinicId);
    try {
      await upsertClinicSettings(next, currentUser);
    } catch (err: any) {
      setSettings(prev => ({ ...prev, [clinicId]: previous }));
      showToast(`Feature setting failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setBusyClinic(null);
    }
  };

  const handlePanelToggle = async (clinicId: string, panelId: string) => {
    const previous = settings[clinicId] || defaults(clinicId);
    const enabledPanels = previous.enabledPanels.includes(panelId)
      ? previous.enabledPanels.filter(panel => panel !== panelId)
      : [...previous.enabledPanels, panelId];
    const next = { ...previous, enabledPanels };
    setSettings(prev => ({ ...prev, [clinicId]: next }));
    setBusyClinic(clinicId);
    try {
      await upsertClinicSettings(next, currentUser);
    } catch (err: any) {
      setSettings(prev => ({ ...prev, [clinicId]: previous }));
      showToast(`Panel entitlement failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setBusyClinic(null);
    }
  };

  const handleClinicInfoSave = async (clinicId: string, event: React.FormEvent) => {
    event.preventDefault();
    const draft = clinicDrafts[clinicId];
    if (!draft) return;
    setBusyClinic(clinicId);
    try {
      const updatedClinic = await updateClinic(clinicId, draft, currentUser);
      setClinics(prev => prev.map(clinic => clinic.id === clinicId ? updatedClinic : clinic));
      setClinicDrafts(prev => ({ ...prev, [clinicId]: { name: updatedClinic.name, address: updatedClinic.address || '', phone: updatedClinic.phone || '' } }));
      showToast(`${updatedClinic.name} business information saved.`, 'success');
    } catch (err: any) {
      showToast(`Business information failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setBusyClinic(null);
    }
  };

  if (!currentUser.isSuperadmin) return null;

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-10 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
              <ShieldCheck className="w-3.5 h-3.5" /> Network control plane
            </div>
            <h1 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight text-slate-950">Clinic network</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">Manage tenant clinics and their product surface from one isolated superadmin workspace.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => void refresh()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={() => setShowAddClinic(value => !value)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-slate-900/15 hover:bg-slate-800">
              <Plus className="w-4 h-4" /> Add Clinic
            </button>
          </div>
        </header>

        {showAddClinic && (
          <form onSubmit={handleAddClinic} className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-sm font-black text-slate-900">Register a tenant clinic</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">A new clinic starts with all tenant features enabled.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input required value={newClinic.name} onChange={e => setNewClinic(prev => ({ ...prev, name: e.target.value }))} placeholder="Clinic name *" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/30" />
              <input value={newClinic.address} onChange={e => setNewClinic(prev => ({ ...prev, address: e.target.value }))} placeholder="Address" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/30" />
              <input value={newClinic.phone} onChange={e => setNewClinic(prev => ({ ...prev, phone: e.target.value }))} placeholder="Phone" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/30" />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowAddClinic(false)} className="rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={busyClinic === 'new'} className="rounded-xl bg-amber-400 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300 disabled:opacity-60">
                {busyClinic === 'new' ? 'Creating...' : 'Create clinic'}
              </button>
            </div>
          </form>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-slate-950 p-5 text-white"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Registered clinics</p><p className="mt-2 text-3xl font-black">{clinics.length}</p></div>
          <div className="rounded-2xl bg-white p-5 border border-slate-200"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Feature flags</p><p className="mt-2 text-3xl font-black text-slate-900">{clinics.length * 3}</p></div>
          <div className="rounded-2xl bg-amber-50 p-5 border border-amber-200"><p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Authority</p><p className="mt-2 text-sm font-black text-amber-950 truncate">{currentUser.username}</p></div>
        </section>

        {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800"><AlertTriangle className="w-5 h-5 shrink-0" />{error}</div>}

        {isLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-14 flex items-center justify-center gap-3 text-sm font-bold text-slate-500"><LoaderCircle className="w-5 h-5 animate-spin" /> Loading clinic network...</div>
        ) : clinics.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-14 text-center"><Building2 className="w-10 h-10 mx-auto text-slate-300" /><p className="mt-3 text-sm font-black text-slate-700">No clinics registered yet.</p></div>
         ) : (
           <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
             {clinics.map(clinic => {
               const clinicSettings = settings[clinic.id] || defaults(clinic.id);
               const isBusy = busyClinic === clinic.id;
               const isExpanded = expandedClinicId === clinic.id;
               const clinicDraft = clinicDrafts[clinic.id] || { name: clinic.name, address: clinic.address || '', phone: clinic.phone || '' };
               return (
                 <article key={clinic.id} className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                   <button
                     type="button"
                     onClick={() => setExpandedClinicId(current => current === clinic.id ? null : clinic.id)}
                     aria-expanded={isExpanded}
                     className="w-full p-5 sm:p-6 flex items-start justify-between gap-4 text-left border-b border-slate-100 hover:bg-slate-50 transition-colors"
                   >
                     <span className="flex items-start gap-3 min-w-0">
                       <span className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5" /></span>
                       <span className="min-w-0"><span className="block text-lg font-black text-slate-900 truncate">{clinic.name}</span><span className="block mt-1 text-xs font-medium text-slate-500 truncate">{clinic.address || 'Address not configured'}{clinic.phone ? ` · ${clinic.phone}` : ''}</span></span>
                     </span>
                     <span className="shrink-0 flex items-center gap-2">
                       <span className="hidden sm:inline rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">Tenant</span>
                       {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                     </span>
                   </button>
                   {isExpanded && (
                     <div className="p-5 sm:p-6 space-y-7">
                       <form onSubmit={event => void handleClinicInfoSave(clinic.id, event)} className="space-y-4">
                         <div className="flex items-start justify-between gap-4">
                           <div>
                             <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-500" /> Business information</h3>
                             <p className="mt-1 text-[11px] font-medium text-slate-500">This is the tenant registry record shown to the clinic.</p>
                           </div>
                           <button type="submit" disabled={isBusy} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-700 disabled:opacity-60"><Save className="w-3.5 h-3.5" /> Save</button>
                         </div>
                         <div className="grid grid-cols-1 gap-3">
                           <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Business name<input required value={clinicDraft.name} onChange={event => setClinicDrafts(prev => ({ ...prev, [clinic.id]: { ...clinicDraft, name: event.target.value } }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" /></label>
                           <label className="text-[10px] font-black uppercase tracking-widest text-slate-500"><span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> Address</span><input value={clinicDraft.address || ''} onChange={event => setClinicDrafts(prev => ({ ...prev, [clinic.id]: { ...clinicDraft, address: event.target.value } }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" /></label>
                           <label className="text-[10px] font-black uppercase tracking-widest text-slate-500"><span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</span><input value={clinicDraft.phone || ''} onChange={event => setClinicDrafts(prev => ({ ...prev, [clinic.id]: { ...clinicDraft, phone: event.target.value } }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" /></label>
                         </div>
                       </form>

                       <section className="space-y-3">
                         <div>
                           <h3 className="text-sm font-black text-slate-900">Premium feature access</h3>
                           <p className="mt-1 text-[11px] font-medium text-slate-500">These tenant-level switches control product capability, not staff role permissions.</p>
                         </div>
                         {featureRows.map(row => {
                           const Icon = row.icon;
                           return (
                             <label key={row.key} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 cursor-pointer hover:bg-slate-50">
                               <span className="flex items-center gap-3 min-w-0"><Icon className={`w-5 h-5 shrink-0 ${row.color}`} /><span className="min-w-0"><span className="block text-sm font-black text-slate-800">{row.label}</span><span className="block mt-1 text-[11px] font-medium text-slate-500">{row.description}</span></span></span>
                               <span className="relative shrink-0"><input type="checkbox" className="peer sr-only" checked={clinicSettings[row.key]} disabled={isBusy} onChange={() => void handleToggle(clinic.id, row.key)} /><span className="block h-7 w-12 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500 peer-disabled:opacity-50" /><span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" /></span>
                             </label>
                           );
                         })}
                       </section>

                       <section className="space-y-3">
                         <div className="flex items-start justify-between gap-4">
                           <div>
                             <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><LayoutGrid className="w-4 h-4 text-indigo-500" /> VHMS panel access</h3>
                             <p className="mt-1 text-[11px] font-medium text-slate-500">Disable a panel here and it disappears from every staff member in this clinic.</p>
                           </div>
                           <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">{clinicSettings.enabledPanels.length}/{PANEL_VIEWS.length} enabled</span>
                         </div>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                           {PANEL_VIEWS.map(panel => {
                             const enabled = clinicSettings.enabledPanels.includes(panel.id);
                             return (
                               <label key={panel.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 cursor-pointer transition-colors ${enabled ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
                                 <span className="text-xs font-black text-slate-700">{panel.label}</span>
                                 <input type="checkbox" data-testid={`entitlement-${panel.id}-${clinic.id}`} checked={enabled} disabled={isBusy} onChange={() => void handlePanelToggle(clinic.id, panel.id)} className="h-4 w-4 rounded accent-emerald-600" />
                               </label>
                             );
                           })}
                         </div>
                       </section>

                       <div className="pt-1 border-t border-slate-100 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Changes are protected by the Super Admin database policy</div>
                     </div>
                   )}
                 </article>
               );
             })}
          </section>
        )}
      </div>
    </div>
  );
}
