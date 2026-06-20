/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Building2, Printer, Users, ShieldAlert, Save, Plus, 
  Trash2, Database, Power, X, Lock, CheckCircle2, User,
  FileText, Download, Upload, Layers, AlertTriangle
} from 'lucide-react';
import { showToast } from './Toast';
import { fetchInventory, upsertInventoryItem } from '../lib/db';
import { ItemCategory, InventoryItem } from '../types';

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
  dummyAdminPin?: string;
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
  onUpdateInventory?: (items: any[]) => void;
  onRestoreSnapshot?: () => Promise<boolean>;
  onPurgeDatabases: () => void;
  onHardReboot: () => void;
}

export default function SystemSettings({
  config, onChangeConfig, users, onAddUser, onRemoveUser, onPurgeDatabases, onHardReboot, onUpdateInventory
}: SettingsProps) {
  
  const [activeTab, setActiveTab] = useState<'profile' | 'pos' | 'staff' | 'database'>('profile');
  const [localConfig, setLocalConfig] = useState<SystemConfig>(config);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Modal States
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', username: '', role: 'veterinarian', pin: '' });

  // Bulk CSV States
  const [stagedImports, setStagedImports] = useState<any[]>([]);
  const [showStagingModal, setShowStagingModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (newStaff.role === 'cashier') avatarColor = 'bg-blue-100 text-blue-700 border-blue-200';
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

      await upsertInventoryItem(payload);
    }

    // Force Global Sync so POS and Dashboard update instantly
    const updatedInventory = await fetchInventory();
    if (onUpdateInventory) onUpdateInventory(updatedInventory);
    
    setStagedImports([]);
    setShowStagingModal(false);
    showToast(`Successfully synced ${validItems.length} items to the database.`, 'success');
  };

  const TABS = [
    { id: 'profile', label: 'Hospital Profile', icon: Building2 },
    { id: 'pos', label: 'Hardware & POS', icon: Printer },
    { id: 'staff', label: 'Staff & Security', icon: Users },
    { id: 'database', label: 'Data & Operations', icon: Database, danger: true }
  ];

  return (
    <div className="flex h-[calc(100vh-80px)] w-full bg-slate-50 overflow-hidden font-sans gap-6 p-6">
      
      {/* LEFT NAVIGATION PANE */}
      <aside className="w-64 shrink-0 flex flex-col gap-2">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm mb-2">
          <h2 className="text-lg font-black text-slate-800 tracking-tight">System Root</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Enterprise Configuration</p>
        </div>
        
        <nav className="flex-1 space-y-2">
          {TABS.map(tab => {
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
                <div className="grid grid-cols-2 gap-5">
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
                    <input type="text" value={localConfig.hospitalPhone} onChange={e => updateConfig('hospitalPhone', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Public Email</label>
                    <input type="email" value={localConfig.hospitalEmail} onChange={e => updateConfig('hospitalEmail', e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2"><Printer className="w-4 h-4 text-indigo-500" /> POS & Invoice Defaults</h3>
                <div className="grid grid-cols-2 gap-5">
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
                <div className="grid grid-cols-2 gap-5">
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
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><Lock className="w-4 h-4 text-blue-500" /> Access Control & Registry</h3>
                  <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Manage clinical staff and terminal PINs</p>
                </div>
                <button onClick={() => setShowAddStaff(true)} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-sm text-[10px] uppercase tracking-widest flex items-center gap-2 transition-colors cursor-pointer">
                  <Plus className="w-4 h-4" /> Issue ID Card
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
                {users.map(u => (
                  <div key={u.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col relative group">
                    <div className="h-12 bg-slate-50 border-b border-slate-100 flex items-center justify-center shrink-0">
                       <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Terminal Access Key</span>
                    </div>
                    <div className="p-5 text-center flex-1 flex flex-col items-center justify-center relative">
                      <button onClick={() => onRemoveUser(u.id)} className="absolute top-2 right-2 p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100" title="Revoke Access">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center mb-3 shadow-sm ${u.avatarColor || 'bg-slate-100 border-slate-200'}`}>
                        <User className="w-6 h-6" />
                      </div>
                      <h4 className="text-base font-black text-slate-800 leading-tight">{u.name}</h4>
                      <p className="text-xs font-mono font-bold text-slate-500 mt-1">@{u.username}</p>
                    </div>
                    <div className={`p-2.5 text-center border-t text-[10px] font-black uppercase tracking-widest shrink-0 ${u.role === 'admin' || u.role === 'owner' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : u.role === 'veterinarian' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
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
            </div>
          )}

          {/* TAB 4: DATA & OPERATIONS (Previously Danger Zone) */}
          {activeTab === 'database' && (
            <div className="space-y-6 animate-fade-in">
              
              {/* SECTION: Bulk Inventory Logistics */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Layers className="w-5 h-5 text-indigo-500" /> Mass Inventory Import / Export</h3>
                  <p className="text-xs font-bold text-slate-500 mt-1">Safely backup the live registry or stage bulk CSV uploads to update stock quantities.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button onClick={exportTemplate} className="p-4 bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer group">
                    <div className="w-10 h-10 bg-white text-indigo-600 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform"><FileText className="w-5 h-5"/></div>
                    <span className="text-xs font-black text-slate-800">Download Template</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Empty CSV Format</span>
                  </button>
                  
                  <button onClick={exportCurrentInventory} className="p-4 bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer group">
                    <div className="w-10 h-10 bg-white text-emerald-600 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform"><Download className="w-5 h-5"/></div>
                    <span className="text-xs font-black text-slate-800">Export Registry</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Backup Live DB Stock</span>
                  </button>

                  <div className="p-4 bg-slate-50 border border-slate-200 hover:border-sky-300 hover:bg-sky-50 rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer relative overflow-hidden group">
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                    <div className="w-10 h-10 bg-white text-sky-600 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform"><Upload className="w-5 h-5"/></div>
                    <span className="text-xs font-black text-slate-800">Upload CSV</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Stage for Import</span>
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
                    <div className="bg-white border border-rose-100 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                      <div>
                        <h4 className="text-sm font-black text-slate-800 flex items-center gap-2"><Database className="w-4 h-4 text-rose-500" /> Purge Local Database</h4>
                        <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Wipes all tables, inventory, and charts. Reboots app.</p>
                      </div>
                      <button onClick={onPurgeDatabases} className="px-6 py-3 bg-rose-100 hover:bg-rose-600 hover:text-white text-rose-700 font-black rounded-xl text-[10px] uppercase tracking-widest transition-colors cursor-pointer whitespace-nowrap">
                        Execute Local Purge
                      </button>
                    </div>

                    <div className="bg-white border border-rose-100 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                      <div>
                        <h4 className="text-sm font-black text-slate-800 flex items-center gap-2"><Power className="w-4 h-4 text-rose-500" /> Factory System Reset</h4>
                        <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Destroys database, configs, users, and localStorage.</p>
                      </div>
                      <button onClick={onHardReboot} className="px-6 py-3 bg-rose-600 hover:bg-rose-800 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-colors cursor-pointer whitespace-nowrap">
                        Force Hard Reboot
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>
      </main>

      {/* MODAL: CSV Import Staging Area */}
      {showStagingModal && createPortal(
        <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full animate-scale-up flex flex-col overflow-hidden max-h-[90vh]">
            
            <div className="p-6 border-b border-slate-100 shrink-0 flex justify-between items-start bg-slate-50/50">
              <div>
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><Layers className="w-5 h-5 text-indigo-600" /> Pre-Sync Staging Area</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Verify parsed data before overwriting the master registry</p>
              </div>
              <button onClick={() => { setShowStagingModal(false); setStagedImports([]); }} className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-400 rounded-xl cursor-pointer transition-colors"><X className="w-4 h-4"/></button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col p-6 bg-slate-100/50">
              <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden flex flex-col h-full">
                <div className="bg-slate-800 p-3 flex justify-between items-center shrink-0">
                  <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2"><Database className="w-4 h-4 text-sky-400" /> Parsed CSV Data</h4>
                  <span className="text-[10px] font-black bg-white/20 text-white px-2 py-0.5 rounded shadow-sm">{stagedImports.length} Rows Detected</span>
                </div>
                <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">SKU</th>
                        <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                        <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                        <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Stock/Min</th>
                        <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Cost/Price</th>
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
                          <td className="px-4 py-2 text-[9px] uppercase tracking-wider font-bold text-indigo-600">{row.category}</td>
                          <td className="px-4 py-2 font-mono font-bold text-right">{row.stock}/{row.minstock || row.minStock}</td>
                          <td className="px-4 py-2 font-mono font-bold text-right">{row.cost}/{row.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-6 bg-white border-t border-slate-200 shrink-0 flex justify-between items-center z-10">
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">
                {stagedImports.filter(i => !i._isValid).length} Errors detected. Invalid rows will be ignored during sync.
              </p>
              <div className="flex gap-3">
                <button onClick={() => { setShowStagingModal(false); setStagedImports([]); }} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Cancel Import</button>
                <button onClick={approveAndCommitImports} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                  <Database className="w-4 h-4"/> Overwrite Master Registry
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: Issue ID Card (Add Staff) */}
      {showAddStaff && createPortal(
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full animate-scale-up overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
              <div>
                <h3 className="text-base font-black text-slate-800">Issue Access Card</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Register new terminal user</p>
              </div>
              <button onClick={() => setShowAddStaff(false)} className="p-1.5 hover:bg-slate-200 text-slate-400 rounded-lg transition-colors cursor-pointer"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleCreateStaff} className="p-6 space-y-4">
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
                  <option value="veterinarian">Veterinarian / Doctor</option>
                  <option value="cashier">Cashier / Receptionist</option>
                  <option value="admin">Clinic Administrator</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1"><Lock className="w-3 h-3"/> 4-Digit Passcode *</label>
                <input type="text" required maxLength={4} pattern="\d{4}" placeholder="e.g. 1234" value={newStaff.pin} onChange={e => setNewStaff({...newStaff, pin: e.target.value.replace(/\D/g, '')})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-lg font-black font-mono tracking-widest text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div className="pt-2">
                <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest cursor-pointer flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4"/> Authorize Staff
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