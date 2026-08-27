import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Building2, CheckCircle2, Home, LoaderCircle, Plus,
  ReceiptText, RefreshCw, Scissors, ShieldCheck
} from 'lucide-react';
import { Clinic, ClinicSettings, User } from '../types';
import {
  createClinic, fetchAllClinicSettings, fetchClinics, upsertClinicSettings
} from '../lib/db';
import { showToast } from './Toast';

interface SuperAdminDashboardProps { currentUser: User; }

const defaults = (clinicId: string): ClinicSettings => ({
  clinicId,
  taxEnabled: true,
  groomingEnabled: true,
  boardingEnabled: true,
});

const featureRows = [
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
      const clinic = await createClinic(newClinic);
      setClinics(prev => [...prev, clinic].sort((a, b) => a.name.localeCompare(b.name)));
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

  const handleToggle = async (clinicId: string, key: keyof Omit<ClinicSettings, 'clinicId'>) => {
    const previous = settings[clinicId] || defaults(clinicId);
    const next = { ...previous, [key]: !previous[key] };
    setSettings(prev => ({ ...prev, [clinicId]: next }));
    setBusyClinic(clinicId);
    try {
      await upsertClinicSettings(next);
    } catch (err: any) {
      setSettings(prev => ({ ...prev, [clinicId]: previous }));
      showToast(`Feature setting failed: ${err?.message || 'Unknown error'}`, 'error');
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
              return (
                <article key={clinic.id} className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="p-5 sm:p-6 flex items-start justify-between gap-4 border-b border-slate-100">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5" /></div>
                      <div className="min-w-0"><h2 className="text-lg font-black text-slate-900 truncate">{clinic.name}</h2><p className="mt-1 text-xs font-medium text-slate-500 truncate">{clinic.address || 'Address not configured'}{clinic.phone ? ` · ${clinic.phone}` : ''}</p></div>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">Tenant</span>
                  </div>
                  <div className="p-5 sm:p-6 space-y-3">
                    {featureRows.map(row => {
                      const Icon = row.icon;
                      const enabled = clinicSettings[row.key];
                      return (
                        <label key={row.key} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 cursor-pointer hover:bg-slate-50">
                          <span className="flex items-center gap-3 min-w-0"><Icon className={`w-5 h-5 shrink-0 ${row.color}`} /><span className="min-w-0"><span className="block text-sm font-black text-slate-800">{row.label}</span><span className="block mt-1 text-[11px] font-medium text-slate-500">{row.description}</span></span></span>
                          <span className="relative shrink-0"><input type="checkbox" className="peer sr-only" checked={enabled} disabled={isBusy} onChange={() => void handleToggle(clinic.id, row.key)} /><span className="block h-7 w-12 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500 peer-disabled:opacity-50" /><span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" /></span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="px-5 sm:px-6 py-3 border-t border-slate-100 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Settings save instantly</div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
