/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './ui/Modal';
import { createPortal } from 'react-dom';
import { Building2, Printer, Users, ShieldAlert, Save, Plus, 
  Trash2, Database, X, Lock, CheckCircle2, User,
  FileText, Download, Upload, Layers, AlertTriangle, Smartphone, DownloadCloud, UploadCloud, Banknote } from 'lucide-react';
import PhoneInput from './PhoneInput';
import { showToast } from './Toast';
import { fetchInventory, exportFullDatabase, restoreFullDatabase } from '../lib/db';
import { ItemCategory, InventoryItem } from '../types';
import { requireAuth, ACTION_POLICIES, ALL_ACTION_ROLES, AuthAction, ROOT_ROLES, canViewSettingsTab, SettingsTab, isProviderOnlyAction } from '../lib/requireAuth';

export interface SystemConfig {
  appName: string;
  resellerName: string;
  hospitalName: string;
  hospitalAddress: string;
  hospitalPhone: string;
  hospitalEmail: string;
  invoiceLogo: string;
  invoiceFooterMessage: string;
  invoiceSubFooterMessage: string;
  invoiceExtraFooterMessage: string;
  taxRate: number;
  currencySymbol: string;
  selectedReceiptPrinter: string;
  selectedReportPrinter: string;
  receiptPaperSize: string;
  connectionType: string;
  localAutosaveInterval: number;
  cloudEndpoint: string;
  cloudBackupEnabled: boolean;
  emailDigestEnabled: boolean;
  recipientEmails: string[];
  digestSchedule: string;
  rolePermissions: {
    cashier: string[];
    veterinarian: string[];
    admin: string[];
    owner: string[];
  };
  masterPin?: string;
  /** AUTH-4: admin-editable overrides for requireAuth's ACTION_POLICIES.
   *  Shape: { [AuthAction]: ActionRole[] }. Absent action = use the default. */
  actionPolicies?: Record<string, string[]>;
  // F-5: EmailJS credentials for emailing the Z-Report (owner-configured, never hardcoded)
  emailjsServiceId?: string;
  emailjsTemplateId?: string;
  emailjsPublicKey?: string;
  boardingRates?: {
    catNofoodCents: number;
    catWithfoodCents: number;
    dogNofoodCents: number;
    dogWithfoodCents: number;
    catLitterCents: number;
    dogLitterCents: number;
    milkCupCents: number;
  };
  defaultDepositCents?: number;
  dummyAdminPin?: string;
  idleLogoutMinutes?: number;
}

interface SettingsProps {
  config: SystemConfig;
  onChangeConfig: (config: SystemConfig) => void;
  users: any[];
  onForceCloudSync: () => Promise<void>;
  onRefreshUsers: () => Promise<void>;
  onAddUser: (user: any) => Promise<void>;
  onRemoveUser: (id: string) => Promise<void>;
  inventory?: any[];
  invoices?: any[];
  currentUser: any;
  onUpdateInventory?: (item: any) => Promise<void>;
  onDeleteInventory?: (id: string) => Promise<void>;
  onRestoreSnapshot?: () => Promise<boolean>;
  onPurgeDatabases: () => void;
  onWipeCloudAndPurge?: () => Promise<void>;
  cloudSyncEnabled?: boolean;
  onVerifyMasterPin?: (pin: string) => boolean;
  onChangePassword?: (target: any, newPassword: string) => Promise<void>;
}

export default function SystemSettings({
  config, onChangeConfig, users, onAddUser, onRemoveUser, onPurgeDatabases, onWipeCloudAndPurge, cloudSyncEnabled, onUpdateInventory, onDeleteInventory, onVerifyMasterPin, currentUser, onChangePassword
}: SettingsProps) {

  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgePin, setPurgePin] = useState('');
  const [showCloudWipeModal, setShowCloudWipeModal] = useState(false);
  const [cloudWipePin, setCloudWipePin] = useState('');
  const [cloudWipeConfirmText, setCloudWipeConfirmText] = useState('');
  const [cloudWipeBusy, setCloudWipeBusy] = useState(false);

  const handleConfirmCloudWipe = async () => {
    if (cloudWipeConfirmText !== 'DELETE') {
      showToast('Type DELETE exactly to confirm. Nothing was erased.', 'error');
      return;
    }
    const auth = await requireAuth(currentUser || null, 'wipe_cloud_database');
    if (!auth.allowed) {
      showToast('Authorization failed. Nothing was erased.', 'error');
      return;
    }
    setCloudWipeBusy(true);
    try {
      if (onWipeCloudAndPurge) await onWipeCloudAndPurge();
    } finally {
      setCloudWipeBusy(false);
    }
  };

  const handleConfirmPurge = async () => {
    const auth = await requireAuth(currentUser || null, 'erase_local_database');
    if (!auth.allowed) {
      showToast('Authorization failed. Database was NOT erased.', 'error');
      return;
    }
    setShowPurgeModal(false);
    setPurgePin('');
    onPurgeDatabases();
  };
  
  const [activeTab, setActiveTab] = useState<'profile' | 'pos' | 'staff' | 'database' | 'rates'>('profile');
  const [localConfig, setLocalConfig] = useState<SystemConfig>(config);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Modal States
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', username: '', role: 'veterinarian', pin: '' });

  // AUTH-6: never leave the user stranded on a provider-only tab (e.g. a provider
  // signs out and an admin signs in while 'database' was active).
  useEffect(() => {
    if (!canViewSettingsTab(currentUser?.role, activeTab as SettingsTab)) {
      setActiveTab('profile');
    }
  }, [currentUser, activeTab]);

  // ---- AUTH-4: admin-editable access matrix -------------------------------
  // Root tier only (admin today, provider above it). Settings is already
  // root-gated by isViewPermitted, but dummy_admin can also reach Settings —
  // so gate explicitly.
  const canEditMatrix = ROOT_ROLES.includes(currentUser?.role);
  const effectiveRolesFor = (action: AuthAction): string[] =>
    (localConfig.actionPolicies?.[action]) ?? ACTION_POLICIES[action].allowedRoles;

  const toggleMatrix = (action: AuthAction, role: string) => {
    if (role === 'admin') return; // admin is universally permitted — never editable
    const current = effectiveRolesFor(action);
    const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
    const merged = { ...(localConfig.actionPolicies || {}), [action]: next };
    const updated = { ...localConfig, actionPolicies: merged };
    setLocalConfig(updated);
    onChangeConfig(updated); // persist immediately so requireAuth picks it up
    showToast(`${ACTION_POLICIES[action].description}: ${role} ${next.includes(role) ? 'granted' : 'revoked'}.`, 'success');
  };

  // ---- AUTH-4: change password --------------------------------------------
  const [pwTarget, setPwTarget] = useState<any | null>(null);
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const passwordStrength = (v: string): { label: string; tone: string } => {
    if (v.length < 8) return { label: 'Too short — minimum 8 characters', tone: 'text-rose-600' };
    let score = 0;
    if (v.length >= 12) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/\d/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    if (score >= 3) return { label: 'Strong', tone: 'text-emerald-600' };
    if (score === 2) return { label: 'Reasonable', tone: 'text-amber-600' };
    return { label: 'Weak — but allowed', tone: 'text-amber-600' };
  };

  const handleChangePassword = async () => {
    if (!pwTarget) return;
    if (pwNew.length < 8) { showToast('New password must be at least 8 characters.', 'error'); return; }
    if (pwNew !== pwConfirm) { showToast('Passwords do not match.', 'error'); return; }

    // Confirm the OPERATOR's own current credential before setting a new one.
    const auth = await requireAuth(currentUser || null, 'change_password');
    if (!auth.allowed) { showToast('Authorization failed. Password unchanged.', 'error'); return; }

    setPwBusy(true);
    try {
      if (onChangePassword) await onChangePassword(pwTarget, pwNew);
      showToast(`Password updated for ${pwTarget.name}.`, 'success');
      setPwTarget(null); setPwNew(''); setPwConfirm('');
    } finally {
      setPwBusy(false);
    }
  };

  // Bulk CSV States
  const [stagedImports, setStagedImports] = useState<any[]>([]);
  const [showStagingModal, setShowStagingModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalConfig(config);
    setHasChanges(false);
  }, [config]);

  const updateConfig = (key: keyof SystemConfig, value: any) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const saveSettings = () => {
    onChangeConfig(localConfig);
    setHasChanges(false);
    showToast('System configuration saved globally.', 'success');
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaff.name || !newStaff.username || !newStaff.pin) {
      showToast('Name, username, and PIN are required.', 'error');
      return;
    }
    
    let avatarColor = 'bg-slate-100 text-slate-700 border-slate-200';
    if (newStaff.role === 'veterinarian') avatarColor = 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (newStaff.role === 'cashier') avatarColor = 'bg-sky-100 text-sky-700 border-sky-200';
    if (newStaff.role === 'manager') avatarColor = 'bg-amber-100 text-amber-700 border-amber-200';
    if (newStaff.role === 'admin' || newStaff.role === 'owner') avatarColor = 'bg-indigo-100 text-indigo-700 border-indigo-200';

    await onAddUser({
      id: crypto.randomUUID(),
      name: newStaff.name.trim(),
      username: newStaff.username.trim(),
      role: newStaff.role,
      pin: newStaff.pin,
      avatarColor
    });
    
    setShowAddStaff(false);
    setNewStaff({ name: '', username: '', role: 'veterinarian', pin: '' });
  };

  // ==========================================
  // CSV BULK LOGISTICS ENGINE
  // ==========================================

  const downloadCSV = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportTemplate = () => {
    const headers = "sku,name,category,price,cost,stock,minStock,unit,location\n";
    const sample = "SKU-SAMPLE-01,Premium Dog Food,retail,45.00,25.00,50,10,bag,Shelf A\n";
    downloadCSV('ceylonpets_inventory_template.csv', headers + sample);
    showToast('Template downloaded.', 'success');
  };

  const exportCurrentInventory = async () => {
    const liveItems = await fetchInventory();
    if (liveItems.length === 0) {
      showToast('Inventory database is currently empty.', 'error');
      return;
    }
    const headers = "sku,name,category,price,cost,stock,minStock,unit,location\n";
    const rows = liveItems.map(i => {
      const name = `"${i.name.replace(/"/g, '""')}"`;
      const loc = `"${(i.location || '').replace(/"/g, '""')}"`;
      return `${i.sku},${name},${i.category},${i.price},${i.cost},${i.stock},${i.minStock},${i.unit},${loc}`;
    }).join('\n');
    downloadCSV(`master_inventory_export_${new Date().toISOString().split('T')[0]}.csv`, headers + rows);
    showToast('Registry exported successfully.', 'success');
  };

  const handleDownloadBackup = async () => {
    try {
      const json = await exportFullDatabase();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ceylonpets_backup_FULL_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Full system backup downloaded successfully.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to download system backup.', 'error');
    }
  };

  const handleRestoreBackupTrigger = async () => {
    const auth = await requireAuth(currentUser || null, 'system_restore');
    if (!auth.allowed) {
      showToast('Authorization failed. Restore cancelled.', 'error');
      return;
    }
    backupInputRef.current?.click();
  };

  const handleBackupFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      try {
        await restoreFullDatabase(text);
        showToast('System successfully restored from backup! Rebooting...', 'success');
        setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
        console.error(error);
        showToast('Failed to restore backup. Invalid or corrupt file.', 'error');
      }
    };
    reader.readAsText(file);
    if (backupInputRef.current) backupInputRef.current.value = '';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      
      const lines = text.split('\n').filter(l => l.trim() !== '');
      if (lines.length < 2) {
        showToast('CSV is empty or missing headers.', 'error');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const parsedData = [];

      for (let i = 1; i < lines.length; i++) {
        // Regex to split by comma, ignoring commas inside quotes
        const match = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        const values = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim());
        
        const obj: any = {};
        headers.forEach((h, index) => {
          obj[h] = values[index] || '';
        });

        obj._isValid = !!obj.sku && !!obj.name;
        obj._validationMessage = obj._isValid ? 'Ready to sync' : 'Missing SKU or Name';
        
        const validCategories = ['retail', 'prescription', 'vaccine', 'service', 'lab_service'];
        if (!validCategories.includes(obj.category)) {
          obj.category = 'retail';
        }
        parsedData.push(obj);
      }

      setStagedImports(parsedData);
      setShowStagingModal(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const approveAndCommitImports = async () => {
    const validItems = stagedImports.filter(i => i._isValid);
    if (validItems.length === 0) return;

    // Fetch the live database to check for existing SKUs to overwrite
    const currentLiveInventory = await fetchInventory();

    for (const raw of validItems) {
      const existing = currentLiveInventory.find(i => i.sku === raw.sku);
      const isPhysical = !['service', 'lab_service'].includes(raw.category);

      const payload: InventoryItem = {
        id: existing ? existing.id : crypto.randomUUID(),
        sku: raw.sku,
        name: raw.name,
        category: raw.category as ItemCategory,
        price: Number(raw.price) || 0,
        cost: Number(raw.cost) || 0,
        stock: isPhysical ? (Number(raw.stock) || 0) : 0,
        minStock: isPhysical ? (Number(raw.minstock || raw.minStock) || 0) : 0,
        unit: raw.unit || 'unit',
        location: raw.location || ''
      };

      if (onUpdateInventory) {
        await onUpdateInventory(payload);
      }
    }
    
    setStagedImports([]);
    setShowStagingModal(false);
    showToast(`Successfully synced ${validItems.length} items to the database.`, 'success');
  };

  const TABS = [
    { id: 'profile', label: 'Hospital Profile', icon: Building2 },
    { id: 'pos', label: 'Hardware & POS', icon: Printer },
    { id: 'staff', label: 'Staff & Security', icon: Users },
    { id: 'database', label: 'Data & Operations', icon: Database, danger: true },
    { id: 'rates', label: 'Billing & Rates', icon: Banknote }
  ];

  // AUTH-6: provider-only surfaces (db-level config) are filtered out of the nav
  // entirely for anyone who isn't 'provider' — admin included, by design.
  const visibleTabs = TABS.filter(t => canViewSettingsTab(currentUser?.role, t.id as SettingsTab));

  return (
    <div className="flex h-[calc(100vh-80px)] w-full bg-slate-50 overflow-hidden font-sans gap-6 p-6">
      
      {/* LEFT NAVIGATION PANE */}
      <aside className="w-64 shrink-0 flex flex-col gap-2">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm mb-2">
          <h2 className="text-lg font-black text-slate-800 tracking-tight">System Root</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Enterprise Configuration</p>
        </div>
        
        <nav className="flex-1 space-y-2">
          {visibleTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                  isActive 
                    ? tab.danger 
                      ? 'bg-rose-600 text-white shadow-md' 
                      : 'bg-slate-800 text-white shadow-md'
                    : tab.danger
                      ? 'bg-white border border-slate-200 text-rose-600 hover:bg-rose-50'
                      : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" /> {tab.label}
              </button>
            );
          })}
        </nav>

        {hasChanges && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-auto shadow-sm">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3 text-center">Unsaved Changes</p>
            <button onClick={saveSettings} className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer">
              <Save className="w-4 h-4" /> Apply Config
            </button>
          </div>
        )}
      </aside>

      {/* RIGHT CONTENT PANE */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-20">
          
          {/* TAB 1: HOSPITAL PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-500" /> Identity & Branding</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Hospital Name</label>
                    <input type="text" value={localConfig.hospitalName} onChange={e => updateConfig('hospitalName', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">System Name (App Title)</label>
                    <input type="text" value={localConfig.appName} onChange={e => updateConfig('appName', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Hospital Address</label>
                    <input type="text" value={localConfig.hospitalAddress} onChange={e => updateConfig('hospitalAddress', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Contact Phone</label>
                    <PhoneInput value={localConfig.hospitalPhone} onChange={val => updateConfig('hospitalPhone', val)} />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Public Email</label>
                    <input type="email" value={localConfig.hospitalEmail} onChange={e => updateConfig('hospitalEmail', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                </div>
              </div>

              {/* F-5: EmailJS configuration for Z-Report delivery */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-500" /> Email (Z-Report) — EmailJS</h3>
                <p className="text-[10px] font-bold text-slate-400 -mt-3">Configure your own EmailJS account to email the end-of-day Z-Report. Nothing is sent until all three fields are filled. Recipients use the "Public Email" above.</p>
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">EmailJS Service ID</label>
                    <input type="text" value={localConfig.emailjsServiceId || ''} onChange={e => updateConfig('emailjsServiceId', e.target.value)} placeholder="service_xxxxxxx" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">EmailJS Template ID</label>
                    <input type="text" value={localConfig.emailjsTemplateId || ''} onChange={e => updateConfig('emailjsTemplateId', e.target.value)} placeholder="template_xxxxxxx" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">EmailJS Public Key</label>
                    <input type="text" value={localConfig.emailjsPublicKey || ''} onChange={e => updateConfig('emailjsPublicKey', e.target.value)} placeholder="Your EmailJS public key" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2"><Printer className="w-4 h-4 text-indigo-500" /> POS & Invoice Defaults</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Currency Symbol</label>
                    <input type="text" value={localConfig.currencySymbol} onChange={e => updateConfig('currencySymbol', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Tax Rate (e.g. 0.08 for 8%)</label>
                    <input type="number" step="0.01" value={localConfig.taxRate} onChange={e => updateConfig('taxRate', parseFloat(e.target.value))} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Invoice Footer Message</label>
                    <input type="text" value={localConfig.invoiceFooterMessage} onChange={e => updateConfig('invoiceFooterMessage', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Receipt Sub-Footer Message</label>
                    <input type="text" value={localConfig.invoiceSubFooterMessage} onChange={e => updateConfig('invoiceSubFooterMessage', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HARDWARE & POS */}
          {activeTab === 'pos' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2"><Printer className="w-4 h-4 text-emerald-500" /> Receipt Printer Configuration</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Primary Target Printer (Browser Match)</label>
                    <input type="text" value={localConfig.selectedReceiptPrinter} onChange={e => updateConfig('selectedReceiptPrinter', e.target.value)} placeholder="e.g. EPSON TM-T20III" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Receipt Paper Width</label>
                    <select value={localConfig.receiptPaperSize} onChange={e => updateConfig('receiptPaperSize', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer">
                      <option value="80mm">80mm (Standard POS)</option>
                      <option value="58mm">58mm (Compact POS)</option>
                      <option value="A4">A4 (Laser Printer)</option>
                    </select>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Connection Interface</label>
                    <select value={localConfig.connectionType} onChange={e => updateConfig('connectionType', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer">
                      <option value="usb">USB / Network Print Spooler</option>
                      <option value="bluetooth">Bluetooth</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: STAFF & SECURITY */}
          {activeTab === 'staff' && (
            <div className="space-y-6 animate-fade-in flex flex-col h-full">
              <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                <div>
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><Lock className="w-4 h-4 text-sky-500" /> Access Control & Registry</h3>
                  <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Manage clinical staff and terminal PINs</p>
                </div>
                <button onClick={() => setShowAddStaff(true)} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-sm text-[10px] uppercase tracking-widest flex items-center gap-2 transition-colors cursor-pointer">
                  <Plus className="w-4 h-4" /> Issue ID Card
                </button>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                <div className="mb-3">
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><Lock className="w-4 h-4 text-sky-500" /> Session Security</h3>
                  <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Automatic logout due to terminal inactivity</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 max-w-[200px]">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Idle Timeout (Minutes)</label>
                    <input 
                      type="number" 
                      min="1"
                      disabled={localConfig.idleLogoutMinutes === undefined}
                      value={localConfig.idleLogoutMinutes || ''}
                      onChange={e => updateConfig('idleLogoutMinutes', parseInt(e.target.value) || 15)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed" 
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <input 
                      type="checkbox" 
                      id="neverLogout"
                      checked={localConfig.idleLogoutMinutes === undefined || localConfig.idleLogoutMinutes === 0}
                      onChange={e => updateConfig('idleLogoutMinutes', e.target.checked ? undefined : 15)}
                      className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <label htmlFor="neverLogout" className="text-xs font-bold text-slate-700 cursor-pointer">Never (Stay logged in)</label>
                  </div>
                </div>
              </div>

              {/* AUTH-4: Access matrix — provider/admin only */}
              {canEditMatrix && (
                <div data-testid="access-matrix" className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm shrink-0 overflow-x-auto">
                  <div className="mb-3">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-indigo-500" /> Action Access Matrix</h3>
                    <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Who may perform each privileged action. Administrator always retains full access.</p>
                  </div>
                  <table className="w-full text-left border-collapse min-w-[640px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase tracking-widest font-black text-[10px]">
                        <th className="py-3 px-3">Action</th>
                        {ALL_ACTION_ROLES.map(r => <th key={r} className="py-3 px-3 text-center">{r}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(Object.keys(ACTION_POLICIES) as AuthAction[]).filter(a => !isProviderOnlyAction(a)).map(action => {
                        const roles = effectiveRolesFor(action);
                        return (
                          <tr key={action} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-3">
                              <div className="text-xs font-black text-slate-800 capitalize">{action.replace(/_/g, ' ')}</div>
                              <div className="text-[10px] font-bold text-slate-400">{ACTION_POLICIES[action].description}</div>
                            </td>
                            {ALL_ACTION_ROLES.map(role => {
                              const isAdmin = role === 'admin';
                              const checked = isAdmin || roles.includes(role);
                              return (
                                <td key={role} className="py-3 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    data-testid={`matrix-${action}-${role}`}
                                    checked={checked}
                                    disabled={isAdmin}
                                    onChange={() => toggleMatrix(action, role)}
                                    title={isAdmin ? 'Administrator always has full access' : undefined}
                                    className={`w-4 h-4 rounded ${isAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer accent-indigo-600'}`}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
                {users.map(u => (
                  <div key={u.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col relative group">
                    <div className="h-12 bg-slate-50 border-b border-slate-100 flex items-center justify-center shrink-0">
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Terminal Access Key</span>
                    </div>
                    <div className="p-6 text-center flex-1 flex flex-col items-center justify-center relative">
                      <button onClick={() => onRemoveUser(u.id)} className="absolute top-2 right-2 p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-xl transition-colors cursor-pointer opacity-0 group-hover:opacity-100" title="Revoke Access">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center mb-3 shadow-sm ${u.avatarColor || 'bg-slate-100 border-slate-200'}`}>
                        <User className="w-6 h-6" />
                      </div>
                      <h4 className="text-base font-black text-slate-800 leading-tight">{u.name}</h4>
                      <p className="text-xs font-mono font-bold text-slate-500 mt-1">@{u.username}</p>
                      {/* AUTH-4: password change is for password-roles only —
                          cashier/vet keep the fast 4-digit PIN. */}
                      {['owner', 'manager', 'admin'].includes(u.role) && (
                        <button
                          data-testid={`btn-change-password-${u.username}`}
                          onClick={() => { setPwTarget(u); setPwNew(''); setPwConfirm(''); }}
                          className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-[10px] uppercase tracking-widest transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <Lock className="w-3 h-3" /> Change Password
                        </button>
                      )}
                    </div>
                    <div className={`p-2.5 text-center border-t text-[10px] font-black uppercase tracking-widest shrink-0 ${u.role === 'admin' || u.role === 'owner' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : u.role === 'veterinarian' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-sky-50 text-sky-700 border-sky-100'}`}>
                      {u.role} Clearance
                    </div>
                  </div>
                ))}
                {users.length === 0 && (
                  <div className="col-span-3 text-center p-12 bg-white border border-slate-200 border-dashed rounded-2xl">
                    <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-500">No staff registered. Only the system root admin can log in.</p>
                  </div>
                )}
              </div>

              {/* AUTH-4: Change Password */}
              <Modal
                open={!!pwTarget}
                onClose={() => { setPwTarget(null); setPwNew(''); setPwConfirm(''); }}
                size="sm"
                icon={<Lock className="w-5 h-5 text-indigo-600" />}
                title={`Change Password — ${pwTarget?.name || ''}`}
                footer={
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => { setPwTarget(null); setPwNew(''); setPwConfirm(''); }} className="px-5 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl text-[10px] uppercase tracking-widest hover:bg-slate-50 cursor-pointer transition-colors">Cancel</button>
                    <button
                      data-testid="btn-save-password"
                      onClick={handleChangePassword}
                      disabled={pwBusy}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Save Password
                    </button>
                  </div>
                }
              >
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">New Password (min 8 characters)</label>
                    <input
                      data-testid="input-new-password"
                      type="password"
                      value={pwNew}
                      onChange={e => setPwNew(e.target.value)}
                      autoFocus
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    {pwNew.length > 0 && (
                      <p data-testid="password-strength" className={`text-[10px] font-black mt-1.5 ${passwordStrength(pwNew).tone}`}>
                        {passwordStrength(pwNew).label}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Confirm New Password</label>
                    <input
                      data-testid="input-confirm-password"
                      type="password"
                      value={pwConfirm}
                      onChange={e => setPwConfirm(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 leading-snug">
                    You'll confirm your own credential before this is applied.
                  </p>
                </div>
              </Modal>
            </div>
          )}

          {/* TAB 4: DATA & OPERATIONS (Previously Danger Zone) */}
          {activeTab === 'database' && canViewSettingsTab(currentUser?.role, 'database') && (
            <div className="space-y-6 animate-fade-in">
              
              {/* SECTION: Bulk Inventory Logistics */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Layers className="w-5 h-5 text-indigo-500" /> Data Security & Backups</h3>
                  <p className="text-xs font-bold text-slate-500 mt-1">Safely backup the full system, live registry, or stage bulk CSV uploads to update stock quantities.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button onClick={handleDownloadBackup} className="p-6 bg-gradient-to-br from-indigo-50 to-white border border-indigo-200 hover:border-indigo-400 hover:shadow-md rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform"><DownloadCloud className="w-6 h-6"/></div>
                    <span className="text-sm font-black text-slate-800 mt-1">Download Full System Backup</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Complete JSON Snapshot</span>
                  </button>

                  <button onClick={handleRestoreBackupTrigger} className="p-6 bg-gradient-to-br from-amber-50 to-white border border-amber-200 hover:border-amber-400 hover:shadow-md rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer group">
                    <input type="file" accept=".json" ref={backupInputRef} onChange={handleBackupFileUpload} className="hidden" />
                    <div className="w-12 h-12 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform"><UploadCloud className="w-6 h-6"/></div>
                    <span className="text-sm font-black text-slate-800 mt-1">Restore System from Backup</span>
                    <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Requires Master PIN</span>
                  </button>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">CSV Inventory Management</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button onClick={exportTemplate} className="p-4 bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer group">
                      <div className="w-10 h-10 bg-white text-indigo-600 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform"><FileText className="w-5 h-5"/></div>
                      <span className="text-xs font-black text-slate-800">Download Template</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Empty CSV Format</span>
                    </button>
                    
                    <button onClick={exportCurrentInventory} className="p-4 bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer group">
                      <div className="w-10 h-10 bg-white text-emerald-600 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform"><Download className="w-5 h-5"/></div>
                      <span className="text-xs font-black text-slate-800">Export Registry</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Backup Live DB Stock</span>
                    </button>

                    <div className="p-4 bg-slate-50 border border-slate-200 hover:border-sky-300 hover:bg-sky-50 rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer relative overflow-hidden group">
                      <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                      <div className="w-10 h-10 bg-white text-sky-600 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform"><Upload className="w-5 h-5"/></div>
                      <span className="text-xs font-black text-slate-800">Upload CSV</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stage for Import</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: The Danger Zone */}
              <div className="bg-rose-50 p-6 rounded-2xl border border-rose-200 shadow-sm space-y-6 relative overflow-hidden">
                <div className="absolute -right-12 -top-12 opacity-10"><ShieldAlert className="w-64 h-64 text-rose-500" /></div>
                <div className="relative z-10">
                  <h3 className="text-lg font-black text-rose-800 flex items-center gap-2 mb-2"><ShieldAlert className="w-6 h-6" /> Critical Data Operations</h3>
                  <p className="text-xs font-bold text-rose-600/80 mb-6 max-w-2xl">Actions executed in this sector are irreversible. Bypassing these safety interlocks will result in permanent deletion of the IndexedDB vault and local system configurations.</p>
                  
                  <div className="space-y-4">
                    <div className="bg-white border border-rose-100 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                      <div>
                        <h4 className="text-sm font-black text-slate-800 flex items-center gap-2"><Database className="w-4 h-4 text-rose-500" /> Erase Entire Database</h4>
                        <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Permanently deletes every record and all configuration. Requires your admin password.</p>
                      </div>
                      <button onClick={() => { setPurgePin(''); setShowPurgeModal(true); }} className="px-6 py-3 bg-rose-600 hover:bg-rose-800 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-colors cursor-pointer whitespace-nowrap">
                        Erase Everything
                      </button>
                    </div>

                    {cloudSyncEnabled && (
                      <div className="bg-white border-2 border-rose-300 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                        <div>
                          <h4 className="text-sm font-black text-rose-900 flex items-center gap-2"><Database className="w-4 h-4 text-rose-600" /> Erase Cloud Database Too</h4>
                          <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Also deletes every record from the Supabase cloud backup — affects every device synced to this project. Cannot be undone.</p>
                        </div>
                        <button onClick={() => { setCloudWipePin(''); setCloudWipeConfirmText(''); setShowCloudWipeModal(true); }} className="px-6 py-3 bg-rose-800 hover:bg-rose-950 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-colors cursor-pointer whitespace-nowrap">
                          Erase Cloud + Local
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Password-gated total wipe */}
              <Modal
                open={showPurgeModal}
                onClose={() => { setShowPurgeModal(false); setPurgePin(''); }}
                title="Erase Entire Database"
                icon={<ShieldAlert className="w-5 h-5 text-rose-600" />}
                size="sm"
                footer={
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => { setShowPurgeModal(false); setPurgePin(''); }} className="px-5 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl text-[10px] uppercase tracking-widest hover:bg-slate-50 cursor-pointer transition-colors">Cancel</button>
                    <button
                      onClick={handleConfirmPurge}
                      disabled={!purgePin}
                      className={`px-5 py-2.5 font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-colors ${purgePin ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      Permanently Delete Everything
                    </button>
                  </div>
                }
              >
                <div className="p-6 space-y-4">
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-rose-700 leading-relaxed">This permanently deletes <span className="font-black">all data</span> — clients, pets, appointments, invoices, inventory, staff, charts, and system configuration. This cannot be undone.</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Enter Admin Password (Login PIN)</label>
                    <input
                      type="password"
                      value={purgePin}
                      onChange={e => setPurgePin(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && purgePin) handleConfirmPurge(); }}
                      placeholder="••••"
                      autoFocus
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold tracking-widest text-center text-slate-800 outline-none focus:ring-2 focus:ring-rose-500/30"
                    />
                  </div>
                </div>
              </Modal>

              {/* Cloud + local wipe — requires typing DELETE plus admin password */}
              <Modal
                open={showCloudWipeModal}
                onClose={() => { if (!cloudWipeBusy) { setShowCloudWipeModal(false); setCloudWipePin(''); setCloudWipeConfirmText(''); } }}
                title="Erase Cloud Database Too"
                icon={<ShieldAlert className="w-5 h-5 text-rose-700" />}
                size="sm"
                footer={
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => { setShowCloudWipeModal(false); setCloudWipePin(''); setCloudWipeConfirmText(''); }} disabled={cloudWipeBusy} className="px-5 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl text-[10px] uppercase tracking-widest hover:bg-slate-50 cursor-pointer transition-colors disabled:opacity-50">Cancel</button>
                    <button
                      onClick={handleConfirmCloudWipe}
                      disabled={cloudWipeConfirmText !== 'DELETE' || !cloudWipePin || cloudWipeBusy}
                      className={`px-5 py-2.5 font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-colors ${cloudWipeConfirmText === 'DELETE' && cloudWipePin && !cloudWipeBusy ? 'bg-rose-800 hover:bg-rose-950 text-white cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      {cloudWipeBusy ? 'Erasing…' : 'Permanently Erase Cloud + Local'}
                    </button>
                  </div>
                }
              >
                <div className="p-6 space-y-4">
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-rose-800 leading-relaxed">This deletes <span className="font-black">every row in the Supabase cloud database</span> — not just this browser. Any other device or staff member synced to this project loses their data too. There is no undo.</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Type <span className="font-mono text-rose-700">DELETE</span> to confirm</label>
                    <input
                      type="text"
                      value={cloudWipeConfirmText}
                      onChange={e => setCloudWipeConfirmText(e.target.value)}
                      placeholder="DELETE"
                      autoFocus
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold tracking-widest text-center text-slate-800 outline-none focus:ring-2 focus:ring-rose-500/30"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Enter Admin Password (Login PIN)</label>
                    <input
                      type="password"
                      value={cloudWipePin}
                      onChange={e => setCloudWipePin(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && cloudWipeConfirmText === 'DELETE' && cloudWipePin) handleConfirmCloudWipe(); }}
                      placeholder="••••"
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold tracking-widest text-center text-slate-800 outline-none focus:ring-2 focus:ring-rose-500/30"
                    />
                  </div>
                </div>
              </Modal>

            </div>
          )}

          {/* TAB: Billing & Rates */}
          {activeTab === 'rates' && (
            <div className="animate-fade-in p-6 space-y-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2"><Banknote className="w-5 h-5 text-indigo-500" /> Boarding Rates</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Configure daily rates for the boarding hotel</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center justify-between">
                      <span>Cat (No Food) / Day</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">{localConfig.currencySymbol}</span>
                      <input 
                        type="number" step="0.01" min="0"
                        value={localConfig.boardingRates?.catNofoodCents ? (localConfig.boardingRates.catNofoodCents / 100).toFixed(2) : ''}
                        onChange={e => {
                          const val = Math.max(0, parseFloat(e.target.value) || 0);
                          setLocalConfig(prev => ({...prev, boardingRates: { ...(prev.boardingRates || {} as any), catNofoodCents: Math.round(val * 100) }}));
                          setHasChanges(true);
                        }}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center justify-between">
                      <span>Cat (With Food) / Day</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">{localConfig.currencySymbol}</span>
                      <input 
                        type="number" step="0.01" min="0"
                        value={localConfig.boardingRates?.catWithfoodCents ? (localConfig.boardingRates.catWithfoodCents / 100).toFixed(2) : ''}
                        onChange={e => {
                          const val = Math.max(0, parseFloat(e.target.value) || 0);
                          setLocalConfig(prev => ({...prev, boardingRates: { ...(prev.boardingRates || {} as any), catWithfoodCents: Math.round(val * 100) }}));
                          setHasChanges(true);
                        }}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center justify-between">
                      <span>Dog (No Food) / Day</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">{localConfig.currencySymbol}</span>
                      <input 
                        type="number" step="0.01" min="0"
                        value={localConfig.boardingRates?.dogNofoodCents ? (localConfig.boardingRates.dogNofoodCents / 100).toFixed(2) : ''}
                        onChange={e => {
                          const val = Math.max(0, parseFloat(e.target.value) || 0);
                          setLocalConfig(prev => ({...prev, boardingRates: { ...(prev.boardingRates || {} as any), dogNofoodCents: Math.round(val * 100) }}));
                          setHasChanges(true);
                        }}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center justify-between">
                      <span>Dog (With Food) / Day</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">{localConfig.currencySymbol}</span>
                      <input 
                        type="number" step="0.01" min="0"
                        value={localConfig.boardingRates?.dogWithfoodCents ? (localConfig.boardingRates.dogWithfoodCents / 100).toFixed(2) : ''}
                        onChange={e => {
                          const val = Math.max(0, parseFloat(e.target.value) || 0);
                          setLocalConfig(prev => ({...prev, boardingRates: { ...(prev.boardingRates || {} as any), dogWithfoodCents: Math.round(val * 100) }}));
                          setHasChanges(true);
                        }}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center justify-between">
                      <span>Cat Litter / Day Extra</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">{localConfig.currencySymbol}</span>
                      <input 
                        type="number" step="0.01" min="0"
                        value={localConfig.boardingRates?.catLitterCents ? (localConfig.boardingRates.catLitterCents / 100).toFixed(2) : ''}
                        onChange={e => {
                          const val = Math.max(0, parseFloat(e.target.value) || 0);
                          setLocalConfig(prev => ({...prev, boardingRates: { ...(prev.boardingRates || {} as any), catLitterCents: Math.round(val * 100) }}));
                          setHasChanges(true);
                        }}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center justify-between">
                      <span>Dog Litter / Day Extra</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">{localConfig.currencySymbol}</span>
                      <input 
                        type="number" step="0.01" min="0"
                        value={localConfig.boardingRates?.dogLitterCents ? (localConfig.boardingRates.dogLitterCents / 100).toFixed(2) : ''}
                        onChange={e => {
                          const val = Math.max(0, parseFloat(e.target.value) || 0);
                          setLocalConfig(prev => ({...prev, boardingRates: { ...(prev.boardingRates || {} as any), dogLitterCents: Math.round(val * 100) }}));
                          setHasChanges(true);
                        }}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center justify-between">
                      <span>Milk Cup Extra</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">{localConfig.currencySymbol}</span>
                      <input 
                        type="number" step="0.01" min="0"
                        value={localConfig.boardingRates?.milkCupCents ? (localConfig.boardingRates.milkCupCents / 100).toFixed(2) : ''}
                        onChange={e => {
                          const val = Math.max(0, parseFloat(e.target.value) || 0);
                          setLocalConfig(prev => ({...prev, boardingRates: { ...(prev.boardingRates || {} as any), milkCupCents: Math.round(val * 100) }}));
                          setHasChanges(true);
                        }}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h4 className="text-sm font-black text-slate-800 tracking-tight mb-4">Admission / Boarding Deposit</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center justify-between">
                      <span>Standard Admission Deposit (Rs.)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">{localConfig.currencySymbol}</span>
                      <input
                        data-testid="default-deposit-input"
                        type="number" step="0.01" min="0"
                        value={localConfig.defaultDepositCents ? (localConfig.defaultDepositCents / 100).toFixed(2) : ''}
                        onChange={e => {
                          const val = Math.max(0, parseFloat(e.target.value) || 0);
                          setLocalConfig(prev => ({...prev, defaultDepositCents: Math.round(val * 100)}));
                          setHasChanges(true);
                        }}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 mt-1">Flat deposit collected at every intake, regardless of estimated stay. All charges run against this at discharge.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* MODAL: CSV Import Staging Area */}
      <Modal
        open={showStagingModal}
        onClose={() => { setShowStagingModal(false); setStagedImports([]); }}
        size="lg"
        title={
          <div>
            <div className="text-lg font-black text-slate-800 flex items-center gap-2">Pre-Sync Staging Area</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Verify parsed data before overwriting the master registry</div>
          </div>
        }
        icon={<div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl"><Layers className="w-5 h-5" /></div>}
        footer={
          <>
            <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest flex items-center">
              {stagedImports.filter(i => !i._isValid).length} Errors detected. Invalid rows will be ignored during sync.
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setShowStagingModal(false); setStagedImports([]); }} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Cancel Import</button>
              <button onClick={approveAndCommitImports} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                <Database className="w-4 h-4"/> Overwrite Master Registry
              </button>
            </div>
          </>
        }
      >
        <div className="h-full flex flex-col bg-slate-100/50 -mx-6 -my-4 p-6">
              <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden flex flex-col h-full">
                <div className="bg-slate-800 p-3 flex justify-between items-center shrink-0">
                  <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2"><Database className="w-4 h-4 text-sky-400" /> Parsed CSV Data</h4>
                  <span className="text-[10px] font-black bg-white/20 text-white px-2 py-0.5 rounded shadow-sm">{stagedImports.length} Rows Detected</span>
                </div>
                <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">SKU</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Stock/Min</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Cost/Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stagedImports.map((row, idx) => (
                        <tr key={idx} className={row._isValid ? 'hover:bg-slate-50' : 'bg-rose-50'}>
                          <td className="px-4 py-2">
                            {row._isValid ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-rose-500" title={row._validationMessage} />}
                          </td>
                          <td className="px-4 py-2 font-mono font-bold text-slate-600">{row.sku || 'MISSING'}</td>
                          <td className="px-4 py-2 font-bold text-slate-800">{row.name || 'MISSING'}</td>
                          <td className="px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-indigo-600">{row.category}</td>
                          <td className="px-4 py-2 font-mono font-bold text-right">{row.stock}/{row.minstock || row.minStock}</td>
                          <td className="px-4 py-2 font-mono font-bold text-right">{row.cost}/{row.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
      </Modal>

      {/* MODAL: Issue ID Card (Add Staff) */}
      <Modal
        open={showAddStaff}
        onClose={() => setShowAddStaff(false)}
        size="sm"
        title={
          <div>
            <div className="text-base font-black text-slate-800">Issue Access Card</div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Register new terminal user</div>
          </div>
        }
        footer={
          <button type="submit" form="addStaffForm" className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest cursor-pointer flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4"/> Authorize Staff
          </button>
        }
      >
        <form id="addStaffForm" onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Staff Full Name *</label>
                <input type="text" required value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Login Username *</label>
                <input type="text" required value={newStaff.username} onChange={e => setNewStaff({...newStaff, username: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Clearance Level (Role)</label>
                <select value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer">
                  {/* AUTH-6: 'admin' removed — it is vendor-root (universally
                      permitted), so it must never be issuable from a staff UI.
                      'owner' and 'provider' are likewise never offered here. */}
                  <option value="veterinarian">Veterinarian / Doctor</option>
                  <option value="cashier">Cashier / Receptionist</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1"><Lock className="w-3 h-3"/> 4-Digit Passcode *</label>
                <input type="text" required maxLength={4} pattern="\d{4}" placeholder="e.g. 1234" value={newStaff.pin} onChange={e => setNewStaff({...newStaff, pin: e.target.value.replace(/\D/g, '')})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-lg font-black font-mono tracking-widest text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
        </form>
      </Modal>

    </div>
  );
}