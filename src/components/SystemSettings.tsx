/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Building2, Printer, Users, ShieldAlert, Save, Plus, 
  Trash2, Database, Cloud, RefreshCw, Power, X, Lock, CheckCircle2, User
} from 'lucide-react';
import { showToast } from './Toast';

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
  config, onChangeConfig, users, onAddUser, onRemoveUser, onPurgeDatabases, onHardReboot
}: SettingsProps) {
  
  const [activeTab, setActiveTab] = useState<'profile' | 'pos' | 'staff' | 'danger'>('profile');
  const [localConfig, setLocalConfig] = useState<SystemConfig>(config);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Modal States
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', username: '', role: 'veterinarian', pin: '' });

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

  const TABS = [
    { id: 'profile', label: 'Hospital Profile', icon: Building2 },
    { id: 'pos', label: 'Hardware & POS', icon: Printer },
    { id: 'staff', label: 'Staff & Security', icon: Users },
    { id: 'danger', label: 'Danger Zone', icon: ShieldAlert, danger: true }
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

          {/* TAB 4: THE DANGER ZONE */}
          {activeTab === 'danger' && (
            <div className="space-y-6 animate-fade-in">
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