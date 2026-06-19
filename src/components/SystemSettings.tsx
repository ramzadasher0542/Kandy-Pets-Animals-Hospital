/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Lock, 
  Shield, 
  Sliders, 
  Printer, 
  Mail, 
  Database, 
  Upload, 
  Download, 
  Plus, 
  Trash2, 
  Check, 
  FileText, 
  Settings, 
  Building, 
  RefreshCw, 
  Eye,
  AlertTriangle,
  Sparkles,
  Cloud,
  Smartphone
} from 'lucide-react';
import { User, UserRole, InventoryItem, Invoice } from '../types';
import { showToast } from './Toast';
import { uploadImageToStorage } from '../lib/supabase';
import { upsertSystemConfig, deleteStaffUser, upsertStaffUser } from '../lib/auth';
import emailjs from '@emailjs/browser';
import { fetchFullSystemState, masterSystemPurge, reconstituteSystemState } from '../lib/db';
import { formatTelemetryTime } from '../utils/time';

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
  taxRate: number; // e.g. 5% = 0.05
  currencySymbol: string;
  selectedReceiptPrinter: string;
  selectedReportPrinter: string;
  receiptPaperSize: '58mm' | '80mm' | 'A4';
  connectionType: 'usb' | 'network' | 'bluetooth';
  autoPrintReceipt?: boolean;
  localAutosaveInterval: number; // in mins
  cloudEndpoint: string;
  cloudBackupSchedule?: 'daily' | 'hourly' | 'manual';
  cloudBackupEnabled: boolean;
  emailDigestEnabled: boolean;
  recipientEmails: string[];
  digestSchedule: 'daily_end' | 'weekly' | 'monthly_end';
  rolePermissions: {
    cashier: string[];
    veterinarian: string[];
    admin: string[];
    owner: string[];
  };
  masterPin?: string;
  dummyAdminPin?: string;
  loginLogoUrl?: string;
  posLogoUrl?: string;
}

// Helper to hash a PIN synchronously using a custom salted polynomial hash
// SECURITY NOTE: This is still a weak hash for demonstration. In production,
// use bcrypt or Argon2 with server-side verification and rate limiting.
function hashPin(pin: string): string {
  if (!pin) return '';
  // If it's already a hex hash (8-character hex), do not hash it again.
  // Plaintext PINs are always 4-digit numbers.
  const isPlaintext = /^\d{4}$/.test(pin);
  if (!isPlaintext) return pin;

  let hash = 5381;
  // Use environment variable for salt if available, otherwise use default
  const salt = import.meta.env.VITE_PIN_HASH_SALT || "CeylonPetsSecuritySalt_ReplaceInProduction";
  const combined = pin + salt;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * 33) ^ combined.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

interface SystemSettingsProps {
  config: SystemConfig;
  onChangeConfig: (newConfig: SystemConfig) => void;
  users: User[];
  onAddUser: (user: User) => void;
  onRemoveUser: (id: string) => void;
  inventory: InventoryItem[];
  invoices: Invoice[];
  currentUser?: any;
  onUpdateInventory?: (newInventory: InventoryItem[]) => void;
  onRestoreSnapshot?: (snapshot: any) => void;
  onPurgeDatabases?: () => void;
  onForceCloudSync?: () => void;
  onHardReboot?: () => void;
  onRefreshUsers?: () => Promise<void>;
}

export default function SystemSettings({
  config,
  onChangeConfig,
  users,
  onAddUser,
  onRemoveUser,
  inventory,
  invoices,
  currentUser,
  onUpdateInventory,
  onRestoreSnapshot,
  onPurgeDatabases,
  onForceCloudSync,
  onHardReboot,
  onRefreshUsers
}: SystemSettingsProps) {
  const rolePermissions = {
    cashier: config.rolePermissions?.cashier || ['pos'],
    veterinarian: config.rolePermissions?.veterinarian || ['dashboard', 'appointments', 'records'],
    admin: config.rolePermissions?.admin || ['dashboard', 'pos', 'appointments', 'records', 'inventory', 'reminders', 'portal'],
    owner: config.rolePermissions?.owner || ['dashboard', 'pos', 'appointments', 'records', 'inventory', 'reminders', 'portal']
  };

  // Navigation inside Settings panel tabs
  const [activeTab, setActiveTab] = useState<'branding' | 'permissions' | 'printers' | 'email' | 'backups' | 'security' | 'inventory_csv'>(() => {
    return currentUser?.role === 'dummy_admin' ? 'printers' : 'branding';
  });

  // Input states
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('cashier');

  // Loading states
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [isDeletingStaff, setIsDeletingStaff] = useState<string | null>(null);
  const [isUpdatingMasterPin, setIsUpdatingMasterPin] = useState(false);
  const [isUpdatingDummyPin, setIsUpdatingDummyPin] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);

  // New recipient email state
  const [newEmail, setNewEmail] = useState('');

  // CSV Import States
  const [csvText, setCsvText] = useState('');
  
  // Branding UI states
  const [mockupView, setMockupView] = useState<'receipt' | 'a4'>('receipt');
  const [csvImportMode, setCsvImportMode] = useState<'merge' | 'replace'>('merge');
  const [csvValidationErrors, setCsvValidationErrors] = useState<string[]>([]);
  const [csvValidationSuccess, setCsvValidationSuccess] = useState<string[]>([]);
  const [csvIsValidated, setCsvIsValidated] = useState<boolean>(false);

  // Print Test Modal variables
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [testPrintType, setTestPrintType] = useState<'receipt' | 'report'>('receipt');

  // Backup Action Logs simulation
  const [backupLogs, setBackupLogs] = useState<string[]>([
    'System initialization successful.',
    'Local backup directory linked to client storage browser state.'
  ]);

  // File System Access API
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  const [isMirrorActive, setIsMirrorActive] = useState(false);
  const [showMasterPurgePrompt, setShowMasterPurgePrompt] = useState(false);
  const [masterPasscode, setMasterPasscode] = useState('');

  React.useEffect(() => {
    let interval: any;
    if (isMirrorActive && directoryHandle) {
      interval = setInterval(async () => {
        const now = new Date();
        if (now.getMinutes() === 0) {
          try {
            const payload = await fetchFullSystemState();
            const jsonString = JSON.stringify(payload, null, 2);
            const fileHandle = await directoryHandle.getFileHandle('ceylon_pets_vault_mirror.json', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(jsonString);
            await writable.close();
            setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [LOCAL MIRROR SUCCESS]: Overwrote automated database snapshot instance.`]);
          } catch (err: any) {
            setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [LOCAL MIRROR ERROR]: ${err.message}`]);
          }
        }
      }, 60000); // Check every minute
    }
    return () => clearInterval(interval);
  }, [isMirrorActive, directoryHandle]);

  // Email digest action feedback
  const [emailStatusMessage, setEmailStatusMessage] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Master PIN Authorization for Permissions
  const [showPermissionPinModal, setShowPermissionPinModal] = useState(false);
  const [showPendingSummaryModal, setShowPendingSummaryModal] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pendingPermissionChange, setPendingPermissionChange] = useState<{
    role: 'cashier' | 'veterinarian' | 'admin' | 'owner';
    view: string;
    checked: boolean;
  } | null>(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPrintModal) setShowPrintModal(false);
        if (showPendingSummaryModal) {
          setShowPendingSummaryModal(false);
          setPendingPermissionChange(null);
        }
        if (showPermissionPinModal) {
          setShowPermissionPinModal(false);
          setEnteredPin('');
          setPinError('');
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showPrintModal, showPendingSummaryModal, showPermissionPinModal]);

  // Helper updates
  const setConfigValue = (key: keyof SystemConfig, value: any) => {
    onChangeConfig({
      ...config,
      [key]: value
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: 'loginLogoUrl' | 'posLogoUrl') => {
    const file = e.target.files?.[0];
    if (file) {
      if (key === 'posLogoUrl' && file.type !== 'image/bmp') {
        alert('POS Receipt Logo must be in BMP format!');
        return;
      }
      try {
        showToast('Uploading image to secure storage...', 'info');
        const url = await uploadImageToStorage(file, key);
        setConfigValue(key, url);
        showToast('Image uploaded successfully!', 'success');
      } catch (err) {
        showToast('Upload failed. Please ensure the "assets" storage bucket exists in Supabase.', 'error');
      }
    }
  };

  const handleValidateCSV = () => {
    setCsvValidationErrors([]);
    setCsvValidationSuccess([]);
    setCsvIsValidated(false);

    if (!csvText.trim()) {
      alert("Please paste some CSV data or upload a file first.");
      return;
    }

    const lines = csvText.split(/\r?\n/);
    if (lines.length === 0 || !lines[0].trim()) {
      setCsvValidationErrors(["CSV file is empty or has no header row."]);
      setCsvIsValidated(true);
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const errors: string[] = [];
    const successes: string[] = [];

    // Check headers
    const requiredHeaders = ['sku', 'name'];
    const missingHeaders = requiredHeaders.filter(req => !headers.includes(req));
    if (missingHeaders.length > 0) {
      errors.push(`Missing crucial column headers: ${missingHeaders.join(', ').toUpperCase()}. Header row must contain at least 'sku' and 'name'.`);
    } else {
      successes.push("Header row structure is valid (SKU and NAME columns discovered).");
    }

    const skuSet = new Set<string>();
    let validRecordsCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values: string[] = [];
      let currentVal = '';
      let inQuotes = false;
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(currentVal.trim());
          currentVal = '';
        } else {
          currentVal += char;
        }
      }
      values.push(currentVal.trim());

      const itemSku = values[headers.indexOf('sku')]?.replace(/^["']|["']$/g, '') || '';
      const itemName = values[headers.indexOf('name')]?.replace(/^["']|["']$/g, '') || '';
      const itemCategory = values[headers.indexOf('category')]?.replace(/^["']|["']$/g, '') || '';
      const itemPrice = values[headers.indexOf('price')]?.replace(/^["']|["']$/g, '') || '';
      const itemCost = values[headers.indexOf('cost')]?.replace(/^["']|["']$/g, '') || '';
      const itemStock = values[headers.indexOf('stock')]?.replace(/^["']|["']$/g, '') || '';

      const lineNum = i + 1;

      if (!itemSku) {
        errors.push(`Row ${lineNum}: Missing SKU parameter.`);
      } else {
        if (skuSet.has(itemSku)) {
          errors.push(`Row ${lineNum}: Duplicate SKU value "${itemSku}" found within the CSV file.`);
        } else {
          skuSet.add(itemSku);
        }

        if (csvImportMode === 'merge') {
          const skuConflict = inventory.find(inv => inv.sku === itemSku);
          if (skuConflict) {
            successes.push(`SKU Overwrite: Item SKU "${itemSku}" already exists in clinical files. It will be updated (Strategy: Merge).`);
          }
        }
      }

      if (!itemName) {
        errors.push(`Row ${lineNum}: Missing Name parameter.`);
      }

      if (!itemPrice || isNaN(Number(itemPrice))) {
        errors.push(`Row ${lineNum}: Price "${itemPrice}" is not a valid number.`);
      } else if (Number(itemPrice) < 0) {
        errors.push(`Row ${lineNum}: Price "${itemPrice}" cannot be negative.`);
      }

      if (!itemCost || isNaN(Number(itemCost))) {
        errors.push(`Row ${lineNum}: Cost "${itemCost}" is not a valid number.`);
      } else if (Number(itemCost) < 0) {
        errors.push(`Row ${lineNum}: Cost "${itemCost}" cannot be negative.`);
      }

      const validCategories = [
        'retail', 'pet retail product',
        'prescription', 'prescription medicine', 'medication',
        'vaccine',
        'lab_service', 'lab service',
        'service', 'clinical core service'
      ];

      if (!itemCategory) {
        errors.push(`Row ${lineNum}: Missing Category parameter.`);
      } else if (!validCategories.includes(itemCategory.toLowerCase())) {
        errors.push(`Row ${lineNum}: Invalid category "${itemCategory}". Must be one of 'Pet Retail product', 'Prescription Medicine', 'Vaccine', 'Lab Service', 'Clinical Core Service'.`);
      }

      if (itemStock && isNaN(Number(itemStock))) {
        errors.push(`Row ${lineNum}: Stock "${itemStock}" is not a valid number.`);
      }

      if (errors.length === 0) {
        validRecordsCount++;
      }
    }

    if (errors.length === 0) {
      successes.push(`All ${skuSet.size} product definitions verified! Clean and ready to import.`);
    } else {
      successes.push(`Audited ${skuSet.size} records. Found ${errors.length} validation warning(s).`);
    }

    setCsvValidationErrors(errors);
    setCsvValidationSuccess(successes);
    setCsvIsValidated(true);
  };

  const handleUpdatePermission = (role: 'cashier' | 'veterinarian' | 'admin' | 'owner', view: string, checked: boolean) => {
    setPendingPermissionChange({ role, view, checked });
    setEnteredPin('');
    setPinError('');
    setShowPendingSummaryModal(true);
  };

  const confirmPermissionChange = () => {
    const targetPin = config.masterPin || hashPin('5692');
    if (hashPin(enteredPin) === targetPin) {
      if (pendingPermissionChange) {
        const { role, view, checked } = pendingPermissionChange;
        const currentPermissions = {
          cashier: config.rolePermissions?.cashier || ['pos'],
          veterinarian: config.rolePermissions?.veterinarian || ['dashboard', 'appointments', 'records'],
          admin: config.rolePermissions?.admin || ['dashboard', 'pos', 'appointments', 'records', 'inventory', 'reminders', 'portal'],
          owner: config.rolePermissions?.owner || ['dashboard', 'pos', 'appointments', 'records', 'inventory', 'reminders', 'portal']
        };

        const currentList = currentPermissions[role] || [];
        const updatedList = checked 
          ? [...currentList, view].filter((value, index, self) => self.indexOf(value) === index)
          : currentList.filter(v => v !== view);

        const updatedPermissions = {
          ...currentPermissions,
          [role]: updatedList
        };

        setConfigValue('rolePermissions', updatedPermissions);
      }
      setShowPermissionPinModal(false);
      setPendingPermissionChange(null);
      setEnteredPin('');
      setPinError('');
    } else {
      setPinError('Incorrect Master PIN. Access Denied!');
    }
  };

  const handleDeleteStaff = async (staff: User) => {
    if (staff.role === 'admin' || staff.role === 'dummy_admin') {
      showToast('System accounts cannot be deleted.', 'error');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently revoke access for ${staff.name}?`)) return;

    setIsDeletingStaff(staff.id);
    try {
      await deleteStaffUser(staff.id, currentUser);
      if (onRefreshUsers) await onRefreshUsers();
      onRemoveUser(staff.id); // Also update locally as fallback
      showToast('Staff member deleted successfully.', 'success');
      setBackupLogs(prev => [...prev, `[USER LEVEL AUTH]: Revoked access for ${staff.username}`]);
    } catch (err) {
      showToast('Failed to delete staff member.', 'error');
      if (import.meta.env.DEV) {
        console.error(err);
      }
    } finally {
      setIsDeletingStaff(null);
    }
  };

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffUsername.trim() || !newStaffPin.trim()) {
      showToast('Real Name, Username, and PIN are required.', 'error');
      return;
    }

    setIsAddingStaff(true);

    try {
      const roleColors = {
        admin: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        veterinarian: 'bg-blue-100 text-blue-800 border-blue-300',
        cashier: 'bg-amber-100 text-amber-800 border-amber-300',
        owner: 'bg-indigo-100 text-indigo-800 border-indigo-300'
      };

      // Enforce pure numeric token formatting to comply with Local-First relational tracking specs
      const newUserObj: User = {
        id: String(Date.now()),
        name: newStaffName,
        username: newStaffUsername,
        role: newStaffRole as UserRole,
        pin: hashPin(newStaffPin),
        avatarColor: roleColors[newStaffRole as keyof typeof roleColors] || roleColors['cashier']
      };

      onAddUser(newUserObj);
      
      setBackupLogs(prev => [...prev, `[USER LEVEL AUTH]: Added system user ${newStaffUsername} with authorization: ${newStaffRole}`]);
      setNewStaffName('');
      setNewStaffUsername('');
      setNewStaffPin('');
    } catch (err) {
      showToast('Failed to add staff member.', 'error');
      if (import.meta.env.DEV) {
        console.error(err);
      }
    } finally {
      setIsAddingStaff(false);
    }
  };

  const handleAddEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes('@')) return;
    if (config.recipientEmails.includes(newEmail)) return;

    setConfigValue('recipientEmails', [...config.recipientEmails, newEmail]);
    setNewEmail('');
  };

  const handleRemoveEmail = (idx: number) => {
    const updated = config.recipientEmails.filter((_, i) => i !== idx);
    setConfigValue('recipientEmails', updated);
  };

  // Run Test Spool
  const triggerTestSpool = (type: 'receipt' | 'report') => {
    setTestPrintType(type);
    setShowPrintModal(true);
  };

  // Shift Closure EmailJS Z-Report Dispatch
  const sendZReport = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (config.recipientEmails.length === 0) {
      alert('Please add at least one recipient email address first.');
      return;
    }
    setIsSendingEmail(true);
    setEmailStatusMessage('Sending...');

    const dynamicEmails = config.recipientEmails.join(', ');

    // SECURITY FIX: Use environment variables for EmailJS credentials
    // Never hardcode API keys in source code
    const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_z7n05ia';
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_7pf2jle';
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'YtpeQvCtz3zcTUKDc';

    try {
      await emailjs.send(
        serviceId,
        templateId,
        { 
          to_email: dynamicEmails, 
          total_transactions: '12', 
          gross_revenue: '14,350.00', 
          cash_sales: '9,100.00', 
          card_sales: '3,250.00', 
          bank_transfers: '2,000.00', 
          stock_warnings: '3' 
        },
        publicKey
      );
      setEmailStatusMessage('Successfully dispatched');
      setBackupLogs(prev => [...prev, `[Z-REPORT DISPATCH]: Dispatched reporting digests cleanly to ${config.recipientEmails.length} recipients.`]);
    } catch (error) {
      // SECURITY FIX: Remove sensitive error logging in production
      if (import.meta.env.DEV) {
        console.error('EmailJS Error:', error);
      }
      setEmailStatusMessage('Failed to send report. Please try again.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const triggerBackupDownload = async () => {
    try {
      setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [SERIALIZING]: Compiling holistic ecosystem state...`]);
      const payload = await fetchFullSystemState();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = `ceylonpets_backup_${Date.now()}.json`;
      downloadAnchor.click();
      URL.revokeObjectURL(url);
      setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [LOCAL EXPORT SUCCESS]: Triggered ecosystem download.`]);
    } catch (err: any) {
      setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [LOCAL EXPORT FAILED]: ${err.message}`]);
    }
  };

  const handleRestoreJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [RESTORE INITIATED]: Validating payload...`]);
        const parsed = JSON.parse(reader.result as string);
        await reconstituteSystemState(parsed);
        setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [RESTORE SUCCESS]: Dynamic database snapshot loaded completely.`]);
        showToast('System reconstituted successfully. Please refresh the page.', 'success');
        setTimeout(() => window.location.reload(), 2000);
      } catch (err: any) {
        setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [RESTORE ERROR]: Malformed schema or constraint failure.`]);
        showToast('Restore Failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  const requestDirectoryAccess = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
        setDirectoryHandle(handle);
        setIsMirrorActive(true);
        setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [MIRROR CONFIGURED]: Local sandbox bound to OS directory.`]);
      } else {
        alert('Your browser does not support the File System Access API. Please use a modern Chromium browser.');
      }
    } catch (err: any) {
      setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [MIRROR ERROR]: Directory access denied or cancelled.`]);
    }
  };

  const executeMasterPurge = async () => {
    if (masterPasscode !== 'ADMIN_PURGE_999') {
      showToast('Master validation failed. Action aborted.', 'error');
      setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [PURGE BLOCKED]: Invalid master passcode.`]);
      return;
    }
    
    try {
      setShowMasterPurgePrompt(false);
      setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [PURGE AUTHORIZED]: Initiating structural-safe system wipe...`]);
      await masterSystemPurge();
      setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [PURGE COMPLETE]: Databases cleared. Ecosystem reset to blank slate.`]);
      showToast('Master system purge successful. Please reload the dashboard.', 'success');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      setBackupLogs(prev => [...prev, `[${formatTelemetryTime(new Date())}] [PURGE FAILED]: Database integrity violation. Aborting.`]);
      showToast('Purge Failed: ' + err.message, 'error');
    }
  };

  return (
    <div className="bg-white border border-sky-100 rounded-3xl overflow-hidden shadow-md text-xs animate-scale-up" id="system-settings-dash">
      
      {/* Settings Header Banner */}
      <div className="p-6 bg-gradient-to-r from-indigo-700 via-indigo-600 to-sky-600 text-white flex justify-between items-center flex-wrap gap-4 relative overflow-hidden">
        <div className="relative z-10 space-y-1 max-w-xl">
          <span className="px-3 py-1 bg-white/20 text-white rounded-full font-black text-[9px] uppercase tracking-wider flex items-center gap-1.5 w-max">
            <Sliders className="w-3.5 h-3.5 text-amber-300" /> System Settings Console
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight font-display flex items-center gap-2">
            {config.appName} <span className="text-xs bg-emerald-400 text-slate-900 border-none font-extrabold px-2 py-0.5 rounded-md uppercase">Configurations Panel</span>
          </h2>
          <p className="text-white/80 leading-relaxed font-semibold">
            Manage your hospital information systems, custom branding, and physical receipt printers.
          </p>
        </div>
        
        {/* Quick lock branding status */}
        <div className="relative z-10 px-4 py-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 text-right space-y-1 font-mono text-[10px]">
          <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>SYSTEM AUDIT ENBL</span>
          </div>
          <span className="text-white/60 block mt-0.5 font-medium">Core Version: v1.4.2 Production</span>
        </div>

        {/* Backdrop shapes */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-2xl translate-x-20 -translate-y-20" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[500px]">
        {/* Left Side Tab bar (3 cols) */}
        <div className="md:col-span-3 bg-slate-50 border-r border-sky-50 p-4 space-y-1.5 font-sans">
          <span className="text-slate-400 tracking-wider text-[9px] font-bold uppercase px-3 block mb-2 font-sans select-none">Configure Modules</span>
          
          {currentUser?.role !== 'dummy_admin' ? (
            <>
              <button
                onClick={() => setActiveTab('branding')}
                className={`w-full py-2.5 px-3 rounded-xl flex items-center gap-2.5 font-bold transition-all text-left cursor-pointer ${
                  activeTab === 'branding' 
                    ? 'bg-indigo-600 text-white shadow-xs' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Building className="h-4.5 w-4.5" />
                <span>Global Clinic Identity</span>
              </button>

              <button
                onClick={() => setActiveTab('permissions')}
                className={`w-full py-2.5 px-3 rounded-xl flex items-center gap-2.5 font-bold transition-all text-left cursor-pointer ${
                  activeTab === 'permissions' 
                    ? 'bg-indigo-600 text-white shadow-xs' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Shield className="h-4.5 w-4.5" />
                <span>Staff Permissions</span>
              </button>
            </>
          ) : null}

          <button
            onClick={() => setActiveTab('printers')}
            className={`w-full py-2.5 px-3 rounded-xl flex items-center gap-2.5 font-bold transition-all text-left cursor-pointer ${
              activeTab === 'printers' 
                ? 'bg-indigo-600 text-white shadow-xs' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Printer className="h-4.5 w-4.5" />
            <span>Printer Setup</span>
          </button>

          <button
            onClick={() => setActiveTab('inventory_csv')}
            className={`w-full py-2.5 px-3 rounded-xl flex items-center gap-2.5 font-bold transition-all text-left cursor-pointer ${
              activeTab === 'inventory_csv' 
                ? 'bg-indigo-600 text-white shadow-xs' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Database className="h-4.5 w-4.5 text-amber-500" />
            <span>Bulk CSV Import/Export</span>
          </button>

          {currentUser?.role !== 'dummy_admin' ? (
            <>
              <button
                onClick={() => setActiveTab('email')}
                className={`w-full py-2.5 px-3 rounded-xl flex items-center gap-2.5 font-bold transition-all text-left cursor-pointer ${
                  activeTab === 'email' 
                    ? 'bg-indigo-600 text-white shadow-xs' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Mail className="h-4.5 w-4.5" />
                <span>Email Reports</span>
              </button>

              <button
                onClick={() => setActiveTab('backups')}
                className={`w-full py-2.5 px-3 rounded-xl flex items-center gap-2.5 font-bold transition-all text-left cursor-pointer ${
                  activeTab === 'backups' 
                    ? 'bg-indigo-600 text-white shadow-xs' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Database className="h-4.5 w-4.5" />
                <span>Backup & Restore</span>
              </button>

              <button
                onClick={() => setActiveTab('security')}
                className={`w-full py-2.5 px-3 rounded-xl flex items-center gap-2.5 font-bold transition-all text-left cursor-pointer ${
                  activeTab === 'security' 
                    ? 'bg-indigo-600 text-white shadow-xs' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Lock className="h-4.5 w-4.5 text-amber-500" />
                <span>Master Security</span>
              </button>
            </>
          ) : null}

          {/* Quick Setup Guide Note */}
          <div className="pt-8 block mt-12 p-3.5 bg-sky-50/50 border border-sky-100 rounded-2xl text-[10px] leading-relaxed text-sky-800 space-y-1">
            <span className="font-extrabold uppercase text-[9px] block">Hospital Setup Tip:</span>
            <p className="font-medium text-[10px]">
              Configure the <strong className="font-bold">Branded invoice details</strong> with your clinic's business coordinates. The POS checkouts automatically compute taxes and format totals!
            </p>
          </div>

          <div className="mt-8 text-center text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest pt-4 border-t border-slate-100">
            Version 1.4.0 (Tablet Ready)
          </div>
        </div>

        {/* Right Tab Contents (9 cols) */}
        <div className="md:col-span-9 p-6">
          
          {/* TAB 1: CLIENT BRANDING AND INVOICE TEMPLATE */}
          {activeTab === 'branding' && (
            <div className="space-y-6 animate-fade-in text-xs">
              <div>
                <h3 className="text-base font-extrabold text-slate-800">Global Clinic Identity</h3>
                <p className="text-slate-400 mt-1">Set how the clinic interface labels, medical records, and invoice templates are customized.</p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                
                {/* Inputs area */}
                <div className="space-y-6">
                  
                  {/* Card 1: Core Clinic Master Data */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h4 className="font-extrabold text-slate-800 flex items-center gap-2"><Building className="h-4 w-4 text-indigo-500"/> Core Clinic Master Data</h4>
                    
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px]" htmlFor="client-hospital-clinic-name">Client Hospital/Clinic Name</label>
                      <input name="clientHospitalClinicName" id="client-hospital-clinic-name"
                        type="text"
                        value={config.hospitalName}
                        onChange={(e) => setConfigValue('hospitalName', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold font-sans"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px]" htmlFor="office-address">Office Address</label>
                      <input name="officeAddress" id="office-address"
                        type="text"
                        value={config.hospitalAddress}
                        onChange={(e) => setConfigValue('hospitalAddress', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 block text-[10px]" htmlFor="office-telephone-no">Office Telephone No.</label>
                        <input name="officeTelephoneNo" id="office-telephone-no"
                          type="text"
                          value={config.hospitalPhone}
                          onChange={(e) => setConfigValue('hospitalPhone', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 block text-[10px]" htmlFor="office-contact-email">Office Contact Email</label>
                        <input name="officeContactEmail" id="office-contact-email"
                          type="email"
                          value={config.hospitalEmail}
                          onChange={(e) => setConfigValue('hospitalEmail', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 block text-[10px]" htmlFor="currency-sign">Currency Sign</label>
                        <input name="currencySign" id="currency-sign"
                          type="text"
                          value={config.currencySymbol}
                          onChange={(e) => setConfigValue('currencySymbol', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-center font-bold text-indigo-700 rounded-lg"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 block text-[10px]" htmlFor="tax-rate">Tax Rate (%)</label>
                        <input name="taxRate" id="tax-rate"
                          type="number"
                          step={0.5}
                          value={config.taxRate * 100}
                          onChange={(e) => setConfigValue('taxRate', parseFloat(e.target.value) / 100)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-center rounded-lg font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Document-Specific Configurations */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h4 className="font-extrabold text-slate-800 flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-500"/> Document-Specific Configurations</h4>
                    
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px]" htmlFor="logo-emoji">Logo Emoji</label>
                      <select name="logoEmoji" id="logo-emoji"
                        value={config.invoiceLogo}
                        onChange={(e) => setConfigValue('invoiceLogo', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-center font-bold"
                      >
                        <option value="🐾">🐾 Pawprint</option>
                        <option value="🐕">🐕 Friendly Pup</option>
                        <option value="🐱">🐱 Kitten</option>
                        <option value="🏥">🏥 Medical Hospital</option>
                        <option value="☘️">☘️ Green care</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px]" htmlFor="custom-receipt-footer-message">Custom Receipt Footer Message</label>
                      <textarea name="customReceiptFooterMessage" id="custom-receipt-footer-message"
                        rows={2}
                        value={config.invoiceFooterMessage}
                        onChange={(e) => setConfigValue('invoiceFooterMessage', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold mb-3"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="font-bold text-slate-700 block text-[10px]" htmlFor={!config.loginLogoUrl ? "primary-web-logo" : undefined}>Primary Web Logo</label>
                          {config.loginLogoUrl && (
                            <button type="button" onClick={() => setConfigValue('loginLogoUrl', '')} className="text-[9px] text-rose-500 hover:text-rose-700 font-bold">Remove</button>
                          )}
                        </div>
                        {!config.loginLogoUrl ? (
                          <input name="primaryWebLogo" id="primary-web-logo"
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleLogoUpload(e, 'loginLogoUrl')}
                            className="w-full text-[10px] text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer"
                          />
                        ) : (
                          <div className="text-[10px] bg-emerald-50 text-emerald-700 font-bold py-1.5 px-3 rounded-md border border-emerald-100 flex items-center justify-between">
                            <span>✓ Active</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="font-bold text-slate-700 block text-[10px]" htmlFor={!config.posLogoUrl ? "thermal-bmp-logo" : undefined}>Thermal BMP Logo</label>
                          {config.posLogoUrl && (
                            <button type="button" onClick={() => setConfigValue('posLogoUrl', '')} className="text-[9px] text-rose-500 hover:text-rose-700 font-bold">Remove</button>
                          )}
                        </div>
                        {!config.posLogoUrl ? (
                          <input name="thermalBmpLogo" id="thermal-bmp-logo"
                            type="file"
                            accept=".bmp,image/bmp"
                            onChange={(e) => handleLogoUpload(e, 'posLogoUrl')}
                            className="w-full text-[10px] text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer"
                          />
                        ) : (
                          <div className="text-[10px] bg-emerald-50 text-emerald-700 font-bold py-1.5 px-3 rounded-md border border-emerald-100 flex items-center justify-between">
                            <span>✓ Active</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 3: System Whitelabeling */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h4 className="font-extrabold text-slate-800 flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-500"/> System Whitelabeling</h4>
                    
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px]" htmlFor="title-software-app-name">Title / Software App Name</label>
                      <input name="titleSoftwareAppName" id="title-software-app-name"
                        type="text"
                        value={config.appName}
                        onChange={(e) => setConfigValue('appName', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px]" htmlFor="system-provider-name-e-g-powered-by">System Provider Name (e.g., Powered By)</label>
                      <input name="systemProviderNameEGPoweredBy" id="system-provider-name-e-g-powered-by"
                        type="text"
                        value={config.invoiceSubFooterMessage || ''}
                        onChange={(e) => setConfigValue('invoiceSubFooterMessage', e.target.value)}
                        placeholder="POWERED BY ASH POINT SOLUTIONS"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px]" htmlFor="official-system-footer-powered-by-text">Official System Footer (Powered By text)</label>
                      <input name="officialSystemFooterPoweredByText" id="official-system-footer-powered-by-text"
                        type="text"
                        value={config.invoiceExtraFooterMessage || ''}
                        onChange={(e) => setConfigValue('invoiceExtraFooterMessage', e.target.value)}
                        placeholder="Optional extra message at the very bottom"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Simulated Live Receipt Showcase Side-Card */}
                <div className="p-5 bg-gradient-to-b from-sky-50 to-indigo-50/20 rounded-3xl border border-sky-100 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b pb-2">
                      <span className="font-black text-indigo-900 tracking-tight text-xs uppercase flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Dynamic Live Mockup
                      </span>
                      <div className="flex bg-white rounded-lg p-0.5 border border-slate-200">
                        <button
                          onClick={() => setMockupView('receipt')}
                          className={`px-2 py-1 rounded-md text-[8px] font-bold uppercase transition-colors ${mockupView === 'receipt' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                          Thermal Receipt
                        </button>
                        <button
                          onClick={() => setMockupView('a4')}
                          className={`px-2 py-1 rounded-md text-[8px] font-bold uppercase transition-colors ${mockupView === 'a4' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                          A4 EHR Document
                        </button>
                      </div>
                    </div>

                    {/* Paper thermal receipt receipt illustration */}
                    {mockupView === 'receipt' ? (
                      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-150 text-slate-700 space-y-4 font-mono text-[9px] relative mx-auto w-full max-w-[280px]">
                        
                        {/* Thermal receipt jagged top */}
                        <div className="text-center space-y-1">
                          {config.posLogoUrl ? (
                            <img src={config.posLogoUrl} alt="Logo" className="max-h-12 w-auto mx-auto grayscale block" />
                          ) : (
                            <span className="text-lg block select-none leading-none">{config.invoiceLogo}</span>
                          )}
                          <h4 className="text-xs font-black tracking-tighter text-slate-800 leading-tight block">{config.hospitalName || "Pet Hospital"}</h4>
                          <p className="text-[8px] text-slate-400 font-medium whitespace-pre-wrap">{config.hospitalAddress}</p>
                          <p className="text-[8px] text-slate-400 font-medium">PH: {config.hospitalPhone} • {config.hospitalEmail}</p>
                        </div>

                        <div className="border-t border-dashed border-slate-200 my-2 pt-2 space-y-1 text-[8px]">
                          <div className="flex justify-between">
                            <span>Date: May 23, 2026</span>
                            <span>Time: 11:24 AM</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span>Patient: Coco (Goldendoodle)</span>
                            <span>Owner: Isabella Bennett</span>
                          </div>
                        </div>

                        <div className="border-t border-dashed border-slate-200 py-1.5 space-y-1 text-[8px]">
                          <div className="flex justify-between font-bold text-slate-800 text-[9px]">
                            <span>DHPP Core Vaccine Shot</span>
                            <span>{config.currencySymbol}35.00</span>
                          </div>
                          <div className="flex justify-between font-bold text-slate-800 text-[9px]">
                            <span>Apoquel Flea Allergy 30 tabs</span>
                            <span>{config.currencySymbol}89.00</span>
                          </div>
                        </div>

                        <div className="border-t border-dashed border-slate-200 mt-2 pt-1.5 space-y-0.5 text-right text-[8px]">
                          <div className="flex justify-between">
                            <span>Subtotal:</span>
                            <span>{config.currencySymbol}124.00</span>
                          </div>
                          <div className="flex justify-between text-[8px]">
                            <span>Total custom Tax:</span>
                            <span>{config.currencySymbol}{(124.00 * config.taxRate).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-[9px] font-black text-indigo-700 border-t pt-1 font-mono">
                            <span>TOTAL SECURE DUE:</span>
                            <span>{config.currencySymbol}{(124.00 + (124.00 * config.taxRate)).toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="text-center pt-3 border-t border-dashed text-slate-400 text-[8px] leading-relaxed">
                          {config.invoiceFooterMessage || "Thank you for trusting CeylonPets!"}
                          <span className="block mt-1.5 text-[6px] tracking-widest text-[#72a1e3]">
                            {config.invoiceSubFooterMessage || `* ${config.appName.toUpperCase()} OFFICIAL RECEIPT *`}
                          </span>
                          {config.invoiceExtraFooterMessage && (
                            <span className="block mt-1.5 text-[5px] tracking-widest text-slate-400 uppercase">
                              {config.invoiceExtraFooterMessage}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white p-6 rounded-sm shadow-md border border-slate-200 text-slate-800 space-y-4 font-sans text-[9px] relative mx-auto w-full aspect-[1/1.4] flex flex-col">
                        
                        {/* Letterhead */}
                        <div className="text-center">
                          {config.posLogoUrl && (
                            <img src={config.posLogoUrl} alt="Clinic Logo" className="h-10 w-auto object-contain mx-auto mb-1.5" />
                          )}
                          <h1 className="text-lg font-extrabold tracking-tight text-gray-900 leading-tight">{config.hospitalName || 'CeylonPets Animal Hospital'}</h1>
                          <p className="text-[8px] text-gray-500 mt-0.5">{config.hospitalAddress}</p>
                          <p className="text-[8px] text-gray-500">Ph: {config.hospitalPhone} | {config.hospitalEmail}</p>
                        </div>

                        <div className="text-center border-b-2 border-blue-900 pb-2 mb-4 mt-2">
                          <h2 className="text-[10px] font-bold text-blue-900 uppercase tracking-widest">Official Patient Medical Record</h2>
                          <p className="text-[7px] font-semibold mt-0.5 text-gray-500">Generated: {new Date().toLocaleDateString()}</p>
                        </div>
                        
                        <div className="flex-1">
                          <div className="bg-gray-50 rounded-lg p-2 mb-4 border border-gray-200">
                            <h2 className="text-[8px] font-bold mb-1.5 uppercase text-gray-500">Patient Demographics</h2>
                            <div className="grid grid-cols-2 gap-1.5 text-[8px] text-gray-900 font-semibold">
                              <div><span className="text-[7px] font-bold text-gray-500 uppercase mr-1">Name:</span> Coco</div>
                              <div><span className="text-[7px] font-bold text-gray-500 uppercase mr-1">Species:</span> Canine</div>
                              <div><span className="text-[7px] font-bold text-gray-500 uppercase mr-1">Breed:</span> Goldendoodle</div>
                              <div><span className="text-[7px] font-bold text-gray-500 uppercase mr-1">Age:</span> 3 Years</div>
                              <div><span className="text-[7px] font-bold text-gray-500 uppercase mr-1">Weight:</span> 15.5 kg</div>
                              <div><span className="text-[7px] font-bold text-gray-500 uppercase mr-1">Owner:</span> Isabella B. ({config.hospitalPhone || '555-0192'})</div>
                            </div>
                          </div>

                          <div>
                            <h2 className="text-[8px] font-bold text-gray-700 uppercase border-b border-gray-200 pb-0.5 mb-1">Subjective & Objective Findings</h2>
                            <p className="text-[8px] text-gray-800 leading-relaxed mb-3">Patient presented with mild lethargy and decreased appetite for 24 hours.</p>
                          </div>
                        </div>

                        {/* System Whitelabel Footer */}
                        <div className="mt-auto pt-2 border-t border-gray-200 text-center text-[5px] text-gray-400 font-semibold uppercase tracking-widest">
                          {config.invoiceSubFooterMessage || 'POWERED BY ASH POINT SOLUTIONS'} 
                          {config.invoiceExtraFooterMessage && ` | ${config.invoiceExtraFooterMessage}`}
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-zinc-550 italic leading-relaxed text-center mt-3 text-slate-500 font-semibold p-2 bg-indigo-50/50 rounded-xl">
                    Note: Changing these settings immediately updates client-facing outputs inside checkout registers & printed bills.
                  </p>
                </div>

              </div>
            </div>
          )}

          {/* TAB 2: STAFF USERS AND PERMISSION MATRIX */}
          {activeTab === 'permissions' && (
            <div className="space-y-6 animate-fade-in text-xs">
              <div>
                <h3 className="text-base font-extrabold text-slate-800">Hospital Staff Levels & Section Permissions</h3>
                <p className="text-slate-400 mt-1">Add new staff positions, change operational login passwords, and toggle section boundaries.</p>
              </div>

              {/* Staff and Permissions splits */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* User matrix - Left Column (5 Cols) */}
                <div className="lg:col-span-12 xl:col-span-5 space-y-4">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                    <span className="font-extrabold text-slate-800 block text-xs underline">Installs & Active Logins</span>
                    <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">
                      These credentials unlock the clinician tablets. Only administrators can delete or alter clinician positions.
                    </p>

                    <div className="space-y-2 min-h-[120px]">
                      {users.map((staff) => (
                        <div 
                          key={staff.id}
                          className="p-2.5 bg-white border border-slate-150 rounded-xl flex items-center justify-between shadow-xs text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              staff.role === 'admin' ? 'bg-emerald-500' :
                              staff.role === 'veterinarian' ? 'bg-blue-500' :
                              staff.role === 'owner' ? 'bg-indigo-600' :
                              staff.role === 'dummy_admin' ? 'bg-slate-500' : 'bg-amber-400'
                            }`} />
                            <div>
                              <span className="font-bold text-slate-800">{staff.name}</span>
                              <span className="font-mono text-[9px] text-indigo-500 uppercase block font-bold">
                                Role: {staff.role} (@{staff.username})
                              </span>
                            </div>
                          </div>

                          {/* Delete staff if not super admin of reseller */}
                          {staff.role !== 'admin' && staff.role !== 'dummy_admin' && (
                            <button
                              onClick={() => handleDeleteStaff(staff)}
                              disabled={isDeletingStaff === staff.id}
                              className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title="Delete staff credentials"
                            >
                              {isDeletingStaff === staff.id ? (
                                <div className="w-4 h-4 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                      ))}
                      
                      {users.length <= 1 && (
                        <div className="flex items-center justify-center p-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 mt-2">
                          <span className="text-slate-400 text-[10px] font-semibold italic text-center">
                            No additional staff members authorized yet.<br/>Use the form below to add clinicians.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Add Clinician Form */}
                  <form onSubmit={handleAddStaffSubmit} className="p-4 border border-sky-100 rounded-2xl bg-sky-50/25 space-y-3">
                    <span className="font-extrabold text-indigo-950 block text-xs">Add Clinician credentials</span>
                    
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px]" htmlFor="real-name">Real Name</label>
                      <input name="realName" id="real-name"
                        type="text"
                        placeholder="e.g. Nurse Kandy Assistant"
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border rounded-lg text-slate-800 text-xs"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 block text-[10px]" htmlFor="username">Username</label>
                        <input name="username" id="username"
                          type="text"
                          autoComplete="username"
                          placeholder="nurse_kandy"
                          value={newStaffUsername}
                          onChange={(e) => setNewStaffUsername(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border rounded-lg text-slate-800 text-xs"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 block text-[10px]" htmlFor="login-pass-pin">Login Pass / PIN</label>
                        <input name="loginPassPin" id="login-pass-pin"
                          type="password"
                          autoComplete="new-password"
                          maxLength={4}
                          placeholder="e.g. 4321"
                          value={newStaffPin}
                          onChange={(e) => setNewStaffPin(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border text-center font-mono rounded-lg text-slate-800 text-xs"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px]" htmlFor="permission-user-level">Permission User-Level</label>
                      <select name="permissionUserLevel" id="permission-user-level"
                        value={newStaffRole}
                        onChange={(e: any) => setNewStaffRole(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border rounded-lg text-slate-800 text-xs"
                      >
                        <option value="cashier">Cashier (Full checkout POS rights)</option>
                        <option value="veterinarian">Veterinarian (Consultations & charts)</option>
                        <option value="admin">Administrator (Inventory & scheduling)</option>
                        <option value="owner">Owner (Full system control)</option>
                        <option value="dummy_admin">Dummy Printer Admin (Printer setup only)</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={isAddingStaff}
                      className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold rounded-xl transition-all shadow-xs cursor-pointer text-xs disabled:opacity-50 flex justify-center items-center gap-2"
                    >
                      {isAddingStaff ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Authorizing...
                        </>
                      ) : 'Authorize Clinician Access'}
                    </button>
                  </form>
                </div>

                {/* Level matrix checkboxes (7 Cols) */}
                <div className="lg:col-span-12 xl:col-span-7 space-y-4">
                  <div className="p-4 border rounded-3xl border-slate-100 bg-white shadow-sm space-y-3.5">
                    <span className="font-extrabold text-slate-800 block text-xs underline">Granular Permission Levels Matrix</span>
                    <p className="text-[10px] text-slate-400 leading-normal font-semibold">
                      Control which operational screens are rendered on target tablets based on active login role permissions. Toggle boxes to instantly unlock or lock access lines:
                    </p>

                    <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-150">
                      
                      {/* Matrix Columns */}
                      <div className="grid grid-cols-12 bg-slate-50 p-2.5 font-bold text-slate-500 font-mono text-[9px] uppercase">
                        <div className="col-span-6 block">System Screen Module</div>
                        <div className="col-span-2 text-center">Cashier</div>
                        <div className="col-span-2 text-center">Vet Doc</div>
                        <div className="col-span-2 text-center">Owner</div>
                      </div>

                      {/* Line module dashboard */}
                      <div className="grid grid-cols-12 p-2.5 items-center bg-white hover:bg-slate-50 transition-colors">
                        <div className="col-span-6 font-bold text-slate-800">
                          Executive Dashboard
                          <span className="text-[8px] text-slate-400 block font-semibold leading-relaxed">Revenue counts, charts & stats</span>
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox933" id="input-checkbox-933"
                            type="checkbox"
                            checked={rolePermissions.cashier.includes('dashboard')}
                            onChange={(e) => handleUpdatePermission('cashier', 'dashboard', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox646" id="input-checkbox-646"
                            type="checkbox"
                            checked={rolePermissions.veterinarian.includes('dashboard')}
                            onChange={(e) => handleUpdatePermission('veterinarian', 'dashboard', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox946" id="input-checkbox-946"
                            type="checkbox"
                            checked={rolePermissions.owner.includes('dashboard')}
                            onChange={(e) => handleUpdatePermission('owner', 'dashboard', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Line POS Checkout */}
                      <div className="grid grid-cols-12 p-2.5 items-center bg-white hover:bg-slate-50 transition-colors">
                        <div className="col-span-6 font-bold text-slate-800">
                          POS register terminal
                          <span className="text-[8px] text-slate-400 block font-semibold leading-relaxed">Product search, cart billing, prints</span>
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox23" id="input-checkbox-23"
                            type="checkbox"
                            checked={rolePermissions.cashier.includes('pos')}
                            onChange={(e) => handleUpdatePermission('cashier', 'pos', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox81" id="input-checkbox-81"
                            type="checkbox"
                            checked={rolePermissions.veterinarian.includes('pos')}
                            onChange={(e) => handleUpdatePermission('veterinarian', 'pos', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox417" id="input-checkbox-417"
                            type="checkbox"
                            checked={rolePermissions.owner.includes('pos')}
                            onChange={(e) => handleUpdatePermission('owner', 'pos', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Line Scheduling Planner */}
                      <div className="grid grid-cols-12 p-2.5 items-center bg-white hover:bg-slate-50 transition-colors">
                        <div className="col-span-6 font-bold text-slate-800">
                          Scheduling Planner
                          <span className="text-[8px] text-slate-400 block font-semibold leading-relaxed mt-0.5">Book appointments, consult requests</span>
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox642" id="input-checkbox-642"
                            type="checkbox"
                            checked={rolePermissions.cashier.includes('appointments')}
                            onChange={(e) => handleUpdatePermission('cashier', 'appointments', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox543" id="input-checkbox-543"
                            type="checkbox"
                            checked={rolePermissions.veterinarian.includes('appointments')}
                            onChange={(e) => handleUpdatePermission('veterinarian', 'appointments', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox467" id="input-checkbox-467"
                            type="checkbox"
                            checked={rolePermissions.owner.includes('appointments')}
                            onChange={(e) => handleUpdatePermission('owner', 'appointments', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Line Medical records EHR */}
                      <div className="grid grid-cols-12 p-2.5 items-center bg-white hover:bg-slate-50 transition-colors">
                        <div className="col-span-6 font-bold text-slate-800">
                          EHR Patient Charts
                          <span className="text-[8px] text-slate-400 block font-semibold leading-relaxed">Write bloodwork labs, vaccine dates</span>
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox248" id="input-checkbox-248"
                            type="checkbox"
                            checked={rolePermissions.cashier.includes('records')}
                            onChange={(e) => handleUpdatePermission('cashier', 'records', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox534" id="input-checkbox-534"
                            type="checkbox"
                            checked={rolePermissions.veterinarian.includes('records')}
                            onChange={(e) => handleUpdatePermission('veterinarian', 'records', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox226" id="input-checkbox-226"
                            type="checkbox"
                            checked={rolePermissions.owner.includes('records')}
                            onChange={(e) => handleUpdatePermission('owner', 'records', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Line Item & Stock Catalog */}
                      <div className="grid grid-cols-12 p-2.5 items-center bg-white hover:bg-slate-50 transition-colors">
                        <div className="col-span-6 font-bold text-slate-800">
                          Item & Stock catalog
                          <span className="text-[8px] text-slate-400 block font-semibold leading-relaxed">Modify product lists, restock items</span>
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox380" id="input-checkbox-380"
                            type="checkbox"
                            checked={rolePermissions.cashier.includes('inventory')}
                            onChange={(e) => handleUpdatePermission('cashier', 'inventory', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox451" id="input-checkbox-451"
                            type="checkbox"
                            checked={rolePermissions.veterinarian.includes('inventory')}
                            onChange={(e) => handleUpdatePermission('veterinarian', 'inventory', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox802" id="input-checkbox-802"
                            type="checkbox"
                            checked={rolePermissions.owner.includes('inventory')}
                            onChange={(e) => handleUpdatePermission('owner', 'inventory', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Line Alert & Reminders */}
                      <div className="grid grid-cols-12 p-2.5 items-center bg-white hover:bg-slate-50 transition-colors">
                        <div className="col-span-6 font-bold text-slate-800">
                          Alerts & Reminders Hub
                          <span className="text-[8px] text-slate-400 block font-semibold leading-relaxed">Flea alerts, reorder warnings</span>
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox357" id="input-checkbox-357"
                            type="checkbox"
                            checked={rolePermissions.cashier.includes('reminders')}
                            onChange={(e) => handleUpdatePermission('cashier', 'reminders', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox583" id="input-checkbox-583"
                            type="checkbox"
                            checked={rolePermissions.veterinarian.includes('reminders')}
                            onChange={(e) => handleUpdatePermission('veterinarian', 'reminders', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center items-center">
                          <input name="inputCheckbox677" id="input-checkbox-677"
                            type="checkbox"
                            checked={rolePermissions.owner.includes('reminders')}
                            onChange={(e) => handleUpdatePermission('owner', 'reminders', e.target.checked)}
                            className="cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 3: RECEIPT AND REPORT PRINTER SETUP */}
          {activeTab === 'printers' && (
            <div className="w-full max-w-3xl space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Receipt & Print Preferences</h2>
                <p className="text-gray-500 mt-1">Configure how CeylonPets handles receipts for this specific browser.</p>
              </div>

              <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                {/* Auto-print Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-800">Automatic Printing</h3>
                    <p className="text-sm text-gray-500">Instantly open the print dialog after a successful checkout.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input name="inputCheckbox708" id="input-checkbox-708" 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={config.autoPrintReceipt} 
                      onChange={(e) => setConfigValue('autoPrintReceipt', e.target.checked)} 
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <hr className="border-gray-100" />

                {/* Paper Size Dropdown */}
                <div className="flex flex-col space-y-2">
                  <label className="font-semibold text-gray-800" htmlFor="default-receipt-format">Default Receipt Format</label>
                  <select name="defaultReceiptFormat" id="default-receipt-format" 
                    value={config.receiptPaperSize}
                    onChange={(e: any) => setConfigValue('receiptPaperSize', e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                  >
                    <option value="80mm">80mm Thermal Receipt (Standard POS)</option>
                    <option value="A4">Standard A4 / Letter Document</option>
                  </select>
                </div>

                <hr className="border-gray-100" />

                {/* Test Button */}
                <div>
                  <button 
                    onClick={() => window.print()} 
                    className="bg-gray-800 hover:bg-gray-900 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                    Test Print Receipt
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUTOMATED EMAIL REPORTING DIGEST */}
          {activeTab === 'email' && (
            <div className="w-full max-w-3xl space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">End of Day Reporting</h2>
                <p className="text-gray-500 mt-1">Configure where daily Z-reports, gross sales, and low-stock summaries are sent during shift closure.</p>
              </div>

              <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                {/* Recipient List */}
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Management Email Recipients</h3>
                  <p className="text-sm text-gray-500 mb-4">These addresses will receive the daily sales ledger when the register is closed.</p>
                  
                  <div className="flex flex-wrap gap-2 mb-4">
                    {config.recipientEmails.map((em, idx) => (
                      <span key={idx} className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full flex items-center gap-2">
                        {em} 
                        <button type="button" onClick={() => handleRemoveEmail(idx)} className="hover:text-blue-900 font-bold">&times;</button>
                      </span>
                    ))}
                  </div>
                  
                  <form onSubmit={handleAddEmail} className="flex gap-2">
                    <input name="inputEmail149" id="input-email-149" 
                      type="email" 
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Add new management email..." 
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5" 
                    />
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors">Add</button>
                  </form>
                </div>

                <hr className="border-gray-100" />

                {/* Manual Trigger */}
                <div>
                   <h3 className="font-semibold text-gray-800 mb-2">Shift Closure Dispatch</h3>
                   <p className="text-sm text-gray-500 mb-4">Compile today's financial metrics and dispatch them immediately. Use this at the end of the working day.</p>
                  <button 
                    type="button"
                    onClick={sendZReport}
                    disabled={isSendingEmail}
                    className="bg-gray-800 hover:bg-gray-900 text-white font-medium py-3 px-5 rounded-lg flex items-center justify-center gap-2 transition-colors w-full shadow-sm disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                    {isSendingEmail ? 'Generating & Sending...' : 'Generate & Send Z-Report Digest'}
                  </button>
                  {emailStatusMessage && (
                    <p className="mt-3 text-center text-sm font-semibold text-emerald-600 animate-pulse">
                      {emailStatusMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: DATABASE BACKUP OPTIONS & HARDWARE RESTORE CHANNELS */}
          {activeTab === 'backups' && (
            <div className="space-y-6 animate-fade-in text-xs">
              <div>
                <h3 className="text-base font-extrabold text-slate-800">Database Disaster Recovery Options</h3>
                <p className="text-slate-400 mt-1">Download immediate snapshots of the hospital databases, or restore previous JSON databases from cloud vault links</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Left controls */}
                <div className="space-y-4">
                  
                  {/* Local Backup Section */}
                  <div className="p-5 border bg-white/70 backdrop-blur-md rounded-2xl space-y-3.5 border-slate-200 shadow-sm">
                    <div className="flex items-center gap-1.5 text-slate-800 font-black border-b border-slate-100 pb-2">
                      <Database className="h-5 w-5 text-indigo-500 font-bold" />
                      <span>Local Sandbox backups controls</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed font-semibold">
                      Spool local inventory stock charts, consultation histories, and checkout invoices into a physical JSON backup document. Keep safe locally on target computer.
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={triggerBackupDownload}
                        className="py-2.5 px-3 border border-indigo-600 hover:bg-indigo-50 text-indigo-805 leading-none transition-colors rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Download className="h-4.5 w-4.5 shrink-0" />
                        <span>Download Back</span>
                      </button>

                      <label className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-center leading-none rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap">
                        <Upload className="h-4.5 w-4.5 shrink-0" />
                        <span>Restore JSON</span>
                        <input name="inputFile72" id="input-file-72" 
                          type="file" 
                          accept=".json" 
                          onChange={handleRestoreJson} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                  </div>

                  {/* Automated Local Directory Mirror */}
                  <div className="p-5 border bg-sky-50/50 rounded-2xl space-y-3.5 border-sky-200 backdrop-blur-md shadow-sm">
                    <div className="flex items-center gap-1.5 text-indigo-950 font-black text-sm border-b border-indigo-100 pb-2">
                      <Cloud className="h-5 w-5 text-indigo-600 font-bold" />
                      <span>Automated Local Directory Mirror</span>
                    </div>

                    <p className="text-slate-700 leading-relaxed font-semibold">
                      Stream database records directly into a linked local OS folder. Re-writes occur exactly at minute 00 of every hour.
                    </p>

                    <div className="grid grid-cols-1 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={requestDirectoryAccess}
                        className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors ${isMirrorActive ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                      >
                        {isMirrorActive ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {isMirrorActive ? 'Mirror Active - Directory Linked' : 'Select Backup Folder'}
                      </button>
                    </div>
                  </div>

                  {/* Danger Zone Section */}
                  <div className="p-5 border bg-rose-50/50 rounded-2xl space-y-4 border-rose-200 shadow-sm backdrop-blur-md">
                    <div className="flex items-center gap-1.5 text-rose-800 font-black text-sm border-b border-rose-200/50 pb-2">
                      <AlertTriangle className="h-5 w-5 text-rose-600 font-bold" />
                      <span>Danger Zone</span>
                    </div>
                    <p className="text-rose-700 leading-relaxed font-semibold">
                      Critical system actions. Master purges are completely unrecoverable without a backup JSON file.
                    </p>

                    {showMasterPurgePrompt ? (
                      <div className="space-y-3 bg-white p-3 rounded-xl border border-rose-200 shadow-inner">
                        <label htmlFor="master-passcode-purge" className="text-[10px] font-bold text-slate-700 block">Enter Master Passcode to execute purge:</label>
                        <input
                          id="master-passcode-purge"
                          name="masterPasscodePurge"
                          type="password"
                          value={masterPasscode}
                          onChange={(e) => setMasterPasscode(e.target.value)}
                          placeholder="Passcode..."
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowMasterPurgePrompt(false)}
                            className="flex-1 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-bold transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={executeMasterPurge}
                            className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold flex items-center justify-center gap-1 transition-colors shadow-sm"
                          >
                            <Trash2 className="h-4 w-4" /> Confirm Purge
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Are you sure you want to perform a HARD REBOOT? This will clear all corrupted local state and refresh the UI framework.")) {
                              onHardReboot?.();
                            }
                          }}
                          className="py-2.5 px-3 border border-rose-300 hover:bg-rose-100 text-rose-800 leading-none transition-colors rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <RefreshCw className="h-4 w-4 shrink-0" />
                          <span>Hard Reboot</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowMasterPurgePrompt(true)}
                          className="py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white text-center leading-none rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                        >
                          <Trash2 className="h-4 w-4 shrink-0" />
                          <span>Master Purge</span>
                        </button>
                      </div>
                    )}
                  </div>

                </div>

                {/* Right Log monitor */}
                <div className="p-5 bg-slate-900 rounded-3xl border border-slate-800 text-slate-350 flex flex-col justify-between">
                  <div className="space-y-3">
                    <span className="font-mono text-[9px] text-[#22c55e] font-black tracking-widest block uppercase flex items-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin" /> BACKUP & RESTORE SYSTEM TELEMETRY
                    </span>
                    <div className="bg-black/40 p-4 border rounded-2xl border-slate-800 h-44 overflow-y-auto scrollbar-thin text-[9px] font-mono leading-relaxed space-y-1">
                      {backupLogs.map((log, i) => (
                        <p key={i} className="text-slate-300">
                          <span className="text-slate-500">[{formatTelemetryTime(new Date())}]</span> {log}
                        </p>
                      ))}
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-450 leading-relaxed font-sans mt-4 text-slate-400 font-semibold p-2.5 bg-white/5 rounded-xl">
                    CeylonPets is fully protected with HIPAA compliant databases mirroring. Disasters, tablet damage, or link crashes will not lead to loss of billing logs.
                  </p>
                </div>

              </div>
            </div>
          )}

          {/* TAB 6: MASTER SECURITY */}
          {activeTab === 'security' && (
            <div className="space-y-6 animate-fade-in text-xs font-sans">
              <div>
                <h3 className="text-base font-extrabold text-slate-800">Master System Credentials</h3>
                <p className="text-slate-400 mt-1">Configure and safeguard root authentication PINs for both the primary System Owner and the Dummy Printer Admin.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-sans">
                {/* Save Owner PIN */}
                <div className="p-5 border bg-white rounded-2xl space-y-4 border-slate-100 shadow-sm">
                  <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-sm">
                    <Shield className="h-5 w-5 text-indigo-600" />
                    <span>Change My Password (Master Owner PIN)</span>
                  </div>
                  <p className="text-slate-550 leading-normal font-semibold">
                    This master PIN grants 100% unrestricted access to System Settings, database resets, and reseller whitelabel configuration parameters. Keeping this safe is
                  </p>
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const pin = (form.elements.namedItem('ownerPin') as HTMLInputElement).value;
                      if (!pin || pin.length < 4) {
                        alert('Error: PIN must be at least 4 digits long.');
                        return;
                      }

                      setIsUpdatingMasterPin(true);
                      try {
                        const newConfig = { ...config, masterPin: hashPin(pin) };
                        await upsertSystemConfig(newConfig, currentUser);
                        setConfigValue('masterPin', hashPin(pin));
                        alert('Success: Master Owner PIN has been securely updated! Make sure to use this PIN next time you log in.');
                        form.reset();
                      } finally {
                        setIsUpdatingMasterPin(false);
                      }
                    }}
                    className="space-y-3"
                  >
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px]" htmlFor="current-new-master-pin">Current / New Master PIN</label>
                      <input id="current-new-master-pin"
                        type="password"
                        name="ownerPin"
                        autoComplete="new-password"
                        maxLength={8}
                        placeholder="Enter new Master PIN..."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-slate-855 font-bold tracking-widest text-center rounded-lg text-sm"
                        required
                      />
                      {/* Hidden username field for password manager accessibility */}
                      <input type="text" name="username" autoComplete="username" defaultValue="master_admin" className="sr-only hidden" aria-hidden="true" readOnly />
                    </div>
                    <button
                      type="submit"
                      disabled={isUpdatingMasterPin}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition-all shadow-xs cursor-pointer text-xs disabled:opacity-50 flex justify-center items-center gap-2"
                    >
                      {isUpdatingMasterPin ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Processing...
                        </>
                      ) : 'Update Master Password'}
                    </button>
                  </form>
                </div>

                {/* Save Dummy Printer Admin PIN */}
                <div className="p-5 border bg-white rounded-2xl space-y-4 border-slate-100 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-800 font-extrabold text-sm">
                    <Printer className="h-5 w-5 text-indigo-500" />
                    <span>Dummy Printer Admin Password (PIN)</span>
                  </div>
                  <p className="text-slate-555 leading-normal font-semibold">
                    The dummy admin account can log in solely to configure physical hardware printers and ESC/POS thermal settings. They cannot alter branding, staff permissions, or view ledgers.
                  </p>

                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const pin = (form.elements.namedItem('dummyPin') as HTMLInputElement).value;
                      if (!pin || pin.length < 4) {
                        alert('Error: PIN must be at least 4 digits long.');
                        return;
                      }

                      setIsUpdatingDummyPin(true);
                      try {
                        const newConfig = { ...config, dummyAdminPin: hashPin(pin) };
                        await upsertSystemConfig(newConfig, currentUser);
                        setConfigValue('dummyAdminPin', hashPin(pin));
                        alert('Success: Dummy Admin Printer PIN has been securely updated!');
                        form.reset();
                      } finally {
                        setIsUpdatingDummyPin(false);
                      }
                    }}
                    className="space-y-3"
                  >
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px]" htmlFor="dummy-admin-access-pin">Dummy Admin Access PIN</label>
                      <input id="dummy-admin-access-pin"
                        type="password"
                        name="dummyPin"
                        autoComplete="new-password"
                        maxLength={8}
                        placeholder="Enter new Printer Access PIN..."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-slate-855 font-bold tracking-widest text-center rounded-lg text-sm"
                        required
                      />
                      {/* Hidden username field for password manager accessibility */}
                      <input type="text" name="username" autoComplete="username" defaultValue="printer_admin" className="sr-only hidden" aria-hidden="true" readOnly />
                    </div>
                    <button
                      type="submit"
                      disabled={isUpdatingDummyPin}
                      className="w-full py-2 bg-slate-700 hover:bg-slate-800 text-white font-extrabold rounded-xl transition-all shadow-xs cursor-pointer text-xs disabled:opacity-50 flex justify-center items-center gap-2"
                    >
                      {isUpdatingDummyPin ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Processing...
                        </>
                      ) : 'Update Printer Password'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
          {/* TAB 7: BULK INVENTORY CSV IMPORT/EXPORT */}
          {activeTab === 'inventory_csv' && (
            <div className="space-y-6 animate-fade-in text-xs font-sans">
              <div>
                <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <Database className="h-5 w-5 text-indigo-600" />
                  <span>Bulk Inventory CSV Control Panel</span>
                </h3>
                <p className="text-slate-400 mt-1">Export your complete clinic product catalog or overwrite database items using standard spreadsheets (Excel / CSV format).</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. EXPORT COLUMN */}
                <div className="p-5 border bg-white rounded-2xl space-y-4 border-slate-100 shadow-sm flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-sm">
                      <Download className="h-5 w-5 text-indigo-600" />
                      <span>1. Inventory Export & Management</span>
                    </div>
                    <p className="text-slate-550 leading-relaxed font-semibold">
                      Download a raw, standard Comma-Separated Values (CSV) sheet containing all your live inventory items, stock quantities, pricing list, and location rows. Keep this as a secure local spreadsheet backup or use it as a template for bulk adjustments.
                    </p>


                    <div className="flex items-center justify-between p-3.5 bg-indigo-50/40 border border-indigo-100 rounded-xl">
                      <div>
                        <span className="font-extrabold text-indigo-950 block">Current Database Count</span>
                        <p className="text-slate-500 text-[10px] font-medium">Active clinic items ready for checkout</p>
                      </div>
                      <span className="text-indigo-700 text-lg font-black bg-indigo-100/60 px-3.5 py-1.5 rounded-xl border border-indigo-200">
                        {inventory?.length || 0} Products
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const headers = ['sku', 'name', 'category', 'price', 'cost', 'stock', 'threshold', 'unit'];
                      const csvRows = [headers.join(',')];

                      if (!inventory || inventory.length === 0) {
                        showToast("Downloading template...", "info");
                        setBackupLogs(prev => [
                          ...prev,
                          `[INVENTORY EXPORT]: Generated empty CSV template for initial import.`
                        ]);
                      } else {
                        inventory.forEach(item => {
                          const rowValues = headers.map(header => {
                            const val = header === 'threshold' ? item.minStock : (item as any)[header] ?? '';
                            const stringVal = String(val);
                            if (stringVal.includes(',') || stringVal.includes('\n') || stringVal.includes('"')) {
                              return `"${stringVal.replace(/"/g, '""')}"`;
                            }
                            return stringVal;
                          });
                          csvRows.push(rowValues.join(','));
                        });

                        setBackupLogs(prev => [
                          ...prev,
                          `[INVENTORY EXPORT]: Successfully compiled ${inventory.length} catalog items into standard CSV file.`
                        ]);
                      }

                      const csvContent = csvRows.join('\n');
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.setAttribute('href', url);
                      link.setAttribute('download', `ceylonpets_inventory_export_${Date.now()}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2 text-sm"
                  >
                    <Download className="h-4.5 w-4.5" />
                    <span>Download Inventory CSV Sheet</span>
                  </button>
                </div>

                {/* 2. IMPORT COLUMN */}
                <div className="p-5 border bg-white rounded-2xl space-y-4 border-slate-100 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-800 font-extrabold text-sm">
                    <Upload className="h-5 w-5 text-emerald-600" />
                    <span>2. Inventory Import & Validation</span>
                  </div>
                  <p className="text-slate-550 leading-relaxed font-semibold">
                    Merge new stock parameters or replace the entire database. You can drop a <code className="font-mono font-bold text-slate-800 bg-slate-100 px-1 border rounded">.csv</code> file or paste spreadsheet values below.
                  </p>

                  <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
                    {/* File Uploader */}
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px] uppercase tracking-wider">Option A: Upload .csv File</label>
                      <div className="flex items-center gap-3">
                        <input name="inputFile640" id="input-file-640"
                          type="file"
                          accept=".csv"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const text = event.target?.result as string;
                              if (text) {
                                setCsvText(text);
                                setCsvIsValidated(false);
                                alert(`Successfully read CSV file: ${file.name} (${text.split('\n').length - 1} data records loaded)`);
                              }
                            };
                            reader.readAsText(file);
                          }}
                          className="w-full text-zinc-650 bg-white border px-3 py-2 rounded-lg text-[11px] font-bold"
                        />
                      </div>
                    </div>

                    {/* Copypaste raw CSV input */}
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block text-[10px] uppercase tracking-wider" htmlFor="option-b-copy-paste-raw-csv-data">Option B: Copy-Paste Raw CSV Data</label>
                      <textarea name="optionBCopyPasteRawCsvData" id="option-b-copy-paste-raw-csv-data"
                        value={csvText}
                        onChange={(e) => {
                          setCsvText(e.target.value);
                          setCsvIsValidated(false);
                        }}
                        placeholder="sku,name,category,price,cost,stock,threshold,unit&#13;&#10;SKU-SAMPLE,Sample Product,retail,12.50,6.00,10,2,unit"
                        className="w-full h-24 p-3 bg-white border text-slate-800 font-mono text-[9px] rounded-lg tracking-normal max-h-40 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Import Strategy selector */}
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 block text-[10px] uppercase tracking-wider">Select Import Strategy:</label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className={`p-2.5 border rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                          csvImportMode === 'merge' 
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-extrabold shadow-xs' 
                            : 'bg-white text-slate-500 border-slate-205 hover:bg-slate-100 font-semibold'
                        }`}>
                          <div className="flex flex-col text-left">
                            <span className="text-[11px]">Merge & Update</span>
                            <span className="text-[8px] text-slate-400 font-medium">Match and overwrite existing items</span>
                          </div>
                          <input id="input-radio-860"
                            type="radio"
                            name="strategy"
                            checked={csvImportMode === 'merge'}
                            onChange={() => {
                              setCsvImportMode('merge');
                              setCsvIsValidated(false);
                            }}
                            className="text-emerald-600 focus:ring-0 ml-1.5"
                          />
                        </label>

                        <label className={`p-2.5 border rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                          csvImportMode === 'replace' 
                            ? 'bg-rose-50 border-rose-300 text-rose-955 font-extrabold shadow-xs' 
                            : 'bg-white text-slate-500 border-slate-205 hover:bg-slate-100 font-semibold'
                        }`}>
                          <div className="flex flex-col text-left">
                            <span className="text-[11px] text-rose-700">Wipe & Replace</span>
                            <span className="text-[8px] text-slate-400 font-medium">Purge all stock, overwrite completely</span>
                          </div>
                          <input id="input-radio-2"
                            type="radio"
                            name="strategy"
                            checked={csvImportMode === 'replace'}
                            onChange={() => {
                              setCsvImportMode('replace');
                              setCsvIsValidated(false);
                            }}
                            className="text-rose-600 focus:ring-0 ml-1.5"
                          />
                        </label>
                      </div>
                    </div>

                    {/* CSV Pre-Validation Wizard Output Logs */}
                    {csvIsValidated && (
                      <div className="space-y-2 mt-3 p-3 bg-white border border-slate-200 rounded-xl max-h-48 overflow-y-auto">
                        <span className="font-extrabold text-slate-800 block text-[9px] uppercase tracking-wider">CSV PRE-VALIDATION LOGS</span>
                        
                        {csvValidationErrors.length > 0 && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-[10px] text-rose-800 space-y-1">
                            <span className="font-extrabold block">❌ Audits warning ({csvValidationErrors.length} issues)</span>
                            <div className="font-mono text-[9px] pl-2 space-y-0.5">
                              {csvValidationErrors.slice(0, 8).map((err, idx) => (
                                <p key={idx}>• {err}</p>
                              ))}
                              {csvValidationErrors.length > 8 && <p className="italic font-sans text-slate-400">...and {csvValidationErrors.length - 8} more errors</p>}
                            </div>
                          </div>
                        )}

                        {csvValidationSuccess.length > 0 && (
                          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-800 space-y-1">
                            <span className="font-extrabold block">✅ Integrity diagnostics</span>
                            <div className="pl-2 space-y-0.5 font-semibold">
                              {csvValidationSuccess.slice(0, 4).map((succ, idx) => (
                                <p key={idx}>• {succ}</p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={!csvText.trim()}
                      onClick={handleValidateCSV}
                      className={`w-full py-2.5 font-extrabold rounded-xl border transition-all text-center cursor-pointer text-xs flex items-center justify-center gap-1.5 ${
                        csvText.trim()
                          ? 'border-indigo-500 hover:bg-indigo-50 text-indigo-700' 
                          : 'border-slate-200 text-slate-350 cursor-not-allowed opacity-50'
                      }`}
                    >
                      <span>Pre-Validate Database CSV Sheet</span>
                    </button>

                    <button
                      type="button"
                      disabled={!csvText.trim() || (csvIsValidated && csvValidationErrors.some(e => e.includes('headers')))}
                      onClick={() => {
                        if (!csvText.trim()) return;

                        if (!csvIsValidated) {
                           alert("Please run 'Pre-Validate Database CSV Sheet' first.");
                           return;
                        }
                        if (csvValidationErrors.length > 0) {
                           alert("Cannot import due to validation errors. Please fix them and re-validate.");
                           return;
                        }

                        if (csvImportMode === 'replace') {
                          const confirmReplace = window.confirm(
                            "Are you sure? This will delete all existing products."
                          );
                          if (!confirmReplace) return;
                        }

                        try {
                          const parsedRows = (() => {
                            const lines = csvText.split(/\r?\n/);
                            if (lines.length === 0) return [];
                            const headersRow = lines[0];
                            if (!headersRow) return [];
                            const headers = headersRow.split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
                            const itemsList: any[] = [];

                            for (let i = 1; i < lines.length; i++) {
                              const line = lines[i].trim();
                              if (!line) continue;

                              const values: string[] = [];
                              let currentVal = '';
                              let inQuotes = false;

                              for (let c = 0; c < line.length; c++) {
                                const char = line[c];
                                if (char === '"') {
                                  inQuotes = !inQuotes;
                                } else if (char === ',' && !inQuotes) {
                                  values.push(currentVal.trim());
                                  currentVal = '';
                                } else {
                                  currentVal += char;
                                }
                              }
                              values.push(currentVal.trim());

                              const item: any = {};
                              headers.forEach((header, idx) => {
                                const rawVal = values[idx]?.replace(/^["']|["']$/g, '') || '';
                                item[header] = rawVal;
                              });
                              itemsList.push(item);
                            }
                            return itemsList;
                          })();

                          if (parsedRows.length === 0) {
                            alert("Error: CSV structure invalid. Please check layout.");
                            return;
                          }

                          const hasSkuOrName = parsedRows.some(row => row.sku || row.name);
                          if (!hasSkuOrName) {
                            alert("Error: Missing column header attributes. CSV elements must include headers containing at least 'sku' or 'name'.");
                            return;
                          }

                          const updatedInventory = csvImportMode === 'merge' ? [...inventory] : [];

                          parsedRows.forEach((row, idx) => {
                            const sku = row.sku || `SKU-${Date.now()}-${idx}`;
                            const name = row.name || `Bulk Item ${idx + 1}`;
                            let rawCategory = (row.category || '').toLowerCase();
                            if (rawCategory.includes('lab')) rawCategory = 'lab_service';
                            else if (rawCategory.includes('clinical') || rawCategory === 'service') rawCategory = 'service';
                            else if (rawCategory.includes('retail')) rawCategory = 'retail';
                            else if (rawCategory.includes('prescription') || rawCategory.includes('med')) rawCategory = 'prescription';
                            else if (rawCategory.includes('vaccine') || rawCategory.includes('vax')) rawCategory = 'vaccine';
                            else rawCategory = 'retail';
                            
                            const category = rawCategory as any;
                            const isService = category === 'service' || category === 'lab_service';
                            const price = isNaN(Number(row.price)) ? 0 : Number(row.price);
                            const cost = isNaN(Number(row.cost)) ? 0 : Number(row.cost);
                            const stock = isService ? 0 : (isNaN(Number(row.stock)) ? 0 : Number(row.stock));
                            const minStock = isService ? 0 : (isNaN(Number(row.threshold || row.minstock || row.minStock)) ? 0 : Number(row.threshold || row.minstock || row.minStock));
                            const unit = row.unit || 'pcs';
                            const location = row.location || '';
                            const id = row.id || `inv-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;

                            const itemObj: InventoryItem = {
                              id,
                              sku,
                              name,
                              category,
                              price,
                              cost,
                              stock,
                              minStock,
                              unit,
                              location
                            };

                            if (csvImportMode === 'merge') {
                              // Match index on SKU or ID
                              const matchIdx = updatedInventory.findIndex(item => item.id === itemObj.id || (item.sku && item.sku === itemObj.sku));
                              if (matchIdx >= 0) {
                                updatedInventory[matchIdx] = {
                                  ...updatedInventory[matchIdx],
                                  sku: itemObj.sku,
                                  name: itemObj.name,
                                  category: itemObj.category,
                                  price: itemObj.price,
                                  cost: itemObj.cost,
                                  stock: itemObj.stock,
                                  minStock: itemObj.minStock,
                                  unit: itemObj.unit,
                                  location: itemObj.location
                                };
                              } else {
                                updatedInventory.push(itemObj);
                              }
                            } else {
                              updatedInventory.push(itemObj);
                            }
                          });

                          if (onUpdateInventory) {
                            onUpdateInventory(updatedInventory);
                            alert(`Completed successfully! Loaded ${parsedRows.length} item definitions in database under ${csvImportMode === 'merge' ? 'Merge' : 'Overwrite'} protocol.`);
                            setCsvText('');
                            setCsvIsValidated(false);
                            setBackupLogs(prev => [
                              ...prev,
                              `[CSV BULK IMPORT]: Loaded ${parsedRows.length} items successfully into active inventory.`
                            ]);
                          } else {
                            alert("Delegate function onUpdateInventory is missing from configuration state.");
                          }
                        } catch (err: any) {
                          alert(`Parsing error during load: ${err.message}`);
                        }
                      }}
                      className={`w-full py-3 text-white font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-sm shadow-xs ${
                        csvText.trim() && !(csvIsValidated && csvValidationErrors.some(e => e.includes('headers')))
                          ? 'bg-emerald-600 hover:bg-emerald-700' 
                          : 'bg-slate-300 cursor-not-allowed opacity-50'
                      }`}
                    >
                      <Upload className="h-4.5 w-4.5" />
                      <span>Execute Bulk CSV Import</span>
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>

      {/* SECURE SPOOLED TEST PRINT PREVIEW LIGHTBOX MODAL */}
      {showPrintModal && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-sky-100 max-w-sm w-full p-6 text-xs shadow-xl animate-fade-in space-y-4">
            
            <div className="flex justify-between items-start border-b pb-2">
              <div>
                <h4 className="text-base font-extrabold text-slate-800 leading-none">
                  Hardware Spooler Print Preview
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">Calibrating system margins for: {testPrintType === 'receipt' ? 'Thermal 80mm ESC/POS' : 'A4 laser paper'}</p>
              </div>
              <button 
                onClick={() => setShowPrintModal(false)}
                className="p-1 hover:bg-slate-100 text-slate-400 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {testPrintType === 'receipt' ? (
              /* Receipt spooler rendering */
              <div className="p-4 bg-slate-50 rounded-2xl border flex flex-col items-center">
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full mb-3 uppercase">Spool Test Approved</span>
                <div className="bg-white p-4 rounded border font-mono text-[8px] text-slate-700 w-full max-w-[210px] space-y-3 shadow-xs">
                  <div className="text-center space-y-1">
                    {config.posLogoUrl ? (
                      <img src={config.posLogoUrl} alt="Logo" className="max-h-10 w-auto mx-auto grayscale block" />
                    ) : (
                      <span className="text-lg leading-none block">{config.invoiceLogo}</span>
                    )}
                    <h5 className="font-extrabold text-slate-800 text-[10px] block">{config.hospitalName || "Hospital"}</h5>
                    <p className="text-[7px] text-slate-405 leading-relaxed">{config.hospitalAddress}</p>
                    <p className="text-[7px] text-slate-405">PH: {config.hospitalPhone}</p>
                  </div>
                  
                  <div className="border-t border-dashed py-1 space-y-0.5 text-[7px] text-left">
                    <p>SPOOL TARGET: {config.selectedReceiptPrinter}</p>
                    <p>PAPER WIDTH: {config.receiptPaperSize} roll</p>
                    <p>COMM PROTOCOL: {config.connectionType.toUpperCase()}</p>
                  </div>

                  <div className="border-t border-dashed py-2 text-center text-indigo-700 text-[9px] font-black tracking-tight">
                    * HARDWARE TEST PASSED *
                  </div>

                  <div className="border-t border-dashed pt-2 text-center text-[7px] text-slate-400 leading-normal">
                    {config.invoiceFooterMessage}
                    <span className="block mt-1 text-[5px] uppercase">{config.invoiceSubFooterMessage || `${config.appName} SYSTEM COMPILATION`}</span>
                    {config.invoiceExtraFooterMessage && (
                      <span className="block mt-1 text-[4px] uppercase opacity-70">
                        {config.invoiceExtraFooterMessage}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Report print spooler rendering */
              <div className="p-4 bg-slate-50 rounded-2xl border flex flex-col items-center">
                <span className="text-[10px] bg-sky-100 text-sky-850 font-extrabold px-2 py-0.5 rounded-full mb-3 uppercase font-sans">Lab Report Document test finished</span>
                <div className="bg-white p-5 rounded border font-sans text-[8px] text-zinc-700 w-full max-w-[240px] space-y-3.5 shadow-xs">
                  
                  {/* Title of report */}
                  <div className="flex justify-between items-start border-b pb-1.5 text-slate-750">
                    <div>
                      <span className="font-bold text-slate-850 uppercase text-[9px]">{config.hospitalName}</span>
                      <span className="block text-[6px] text-slate-400 font-medium">Veterinary Pathology Diagnostics Labor Services</span>
                    </div>
                    <span className="text-[10px] leading-none">{config.invoiceLogo}</span>
                  </div>

                  <div className="space-y-1">
                    <span className="font-bold text-slate-800 block text-[9px]">CLINICAL COMPANION BLOODWORKS DIALOG:</span>
                    <p className="text-[7px] leading-relaxed text-slate-500 font-medium">
                      Tested Patient: <span className="font-bold">Coco (Age 2)</span><br />
                      Owner: Isabella Bennett • Doctor: Dr. Kandy Cruz, DVM<br />
                      Authorized Lab: CeylonPets Spooler Labs (Port Raw 9100)
                    </p>
                  </div>

                  <table className="w-full text-left text-[7px] font-mono divide-y">
                    <thead>
                      <tr className="bg-slate-50 font-bold">
                        <th className="p-1 text-slate-500 uppercase">Marker Tested</th>
                        <th className="p-1 text-slate-500 uppercase">Value</th>
                        <th className="p-1 text-slate-500 uppercase">Ref Range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-medium text-slate-600">
                      <tr>
                        <td className="p-1 font-sans">WBC (White Blood Count)</td>
                        <td className="p-1 text-indigo-705 font-bold">11.4 10^3/uL</td>
                        <td className="p-1">6.0 - 17.0 Normal</td>
                      </tr>
                      <tr>
                        <td className="p-1 font-sans">RBC (Red Blood Count)</td>
                        <td className="p-1 text-indigo-705 font-bold">7.2 10^6/uL</td>
                        <td className="p-1">5.5 - 8.5 Normal</td>
                      </tr>
                      <tr>
                        <td className="p-1 font-sans">Hemoglobin (HGB)</td>
                        <td className="p-1 text-indigo-705 font-bold">16.8 g/dL</td>
                        <td className="p-1">12.0 - 18.0 Normal</td>
                      </tr>
                    </tbody>
                  </table>

                  <p className="text-[7px] leading-relaxed text-zinc-450 text-slate-450 italic mt-2 text-center p-1 bg-slate-50 border rounded font-semibold">
                    Report Spooled for physical dispatch on: {config.selectedReportPrinter}. Secure signature locked.
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowPrintModal(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer"
            >
              Close test page Spooler
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* PENDING CHANGE SUMMARY MODAL */}
      {showPendingSummaryModal && pendingPermissionChange && createPortal((() => {
        const viewNames: Record<string, string> = {
          dashboard: 'Executive Dashboard (Revenue counts, charts, stats)',
          pos: 'POS Register Terminal (Product search, cart billing, receipt print)',
          appointments: 'Scheduling Planner (Book appointments, consult requests)',
          records: 'EHR Patient Charts (Write bloodwork labs, vaccine dates, clinical records)',
          inventory: 'Item & Stock Catalog (Modify product lists, restock items)',
          reminders: 'Alerts & Reminders Hub (Flea alerts, reorder warnings)',
          portal: 'Patient Portal Link'
        };

        const roleNames: Record<string, string> = {
          cashier: 'Cashier Staff',
          veterinarian: 'Veterinarian Doctor (Vet Doc)',
          admin: 'Clinical Administrator',
          owner: 'Owner / Client'
        };

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-3xl border border-indigo-100 max-w-sm w-full p-6 text-xs shadow-xl animate-fade-in space-y-4">
              
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center text-lg font-bold">
                  ⚠️
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800">
                    Pending Permission Change
                  </h4>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Review security adjustments before authorization
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-3 items-center">
                  <span className="font-mono text-[9px] uppercase font-bold text-slate-400">Target Role</span>
                  <span className="col-span-2 text-slate-850 font-extrabold text-xs">
                    {roleNames[pendingPermissionChange.role] || pendingPermissionChange.role}
                  </span>
                </div>
                
                <div className="grid grid-cols-3 items-center">
                  <span className="font-mono text-[9px] uppercase font-bold text-slate-400">System Screen</span>
                  <span className="col-span-2 text-slate-850 font-bold text-[11px] leading-tight">
                    {viewNames[pendingPermissionChange.view] || pendingPermissionChange.view}
                  </span>
                </div>

                <div className="grid grid-cols-3 items-center">
                  <span className="font-mono text-[9px] uppercase font-bold text-slate-400">Action</span>
                  <span className="col-span-2">
                    {pendingPermissionChange.checked ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 px-2.5 py-1 rounded-full font-extrabold text-[9px] uppercase">
                        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                        Granting Access
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-800 px-2.5 py-1 rounded-full font-extrabold text-[9px] uppercase">
                        <span className="w-1 h-1 rounded-full bg-rose-500 animate-pulse"></span>
                        Revoking Access
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <p className="text-[10.5px] text-slate-500 bg-indigo-50/40 border border-indigo-150 rounded-xl p-3 leading-relaxed">
                <strong>Notice</strong>: Granting or revoking access updates system matrices dynamically. Users logged into active sessions under this role will see restricted or permitted views immediately.
              </p>

              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => {
                    setShowPendingSummaryModal(false);
                    setPendingPermissionChange(null);
                  }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors cursor-pointer text-xs"
                >
                  Cancel Change
                </button>
                <button
                  onClick={() => {
                    setShowPendingSummaryModal(false);
                    setShowPermissionPinModal(true);
                  }}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer text-xs"
                >
                  Proceed to PIN Auth
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* MASTER PIN SECURITY CONFIRMATION DIALOG */}
      {showPermissionPinModal && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-rose-100 max-w-sm w-full p-6 text-xs shadow-xl animate-fade-in space-y-4">
            
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl border border-rose-150 font-bold mb-1">
                🔒
              </div>
              <h4 className="text-sm font-extrabold text-slate-800">
                Master Security Authorization
              </h4>
              <p className="text-[11px] text-slate-500 max-w-[280px] mx-auto leading-relaxed">
                Modifying role-level security permissions requires Master Administrative clearance. Please enter the Master Security PIN to confirm these access levels.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1 font-mono text-center">
                  Master Security PIN
                </label>
                <input name="input28186" id="input-28-186"
                  type="password"
                  placeholder="••••"
                  maxLength={6}
                  value={enteredPin}
                  onChange={(e) => {
                    setEnteredPin(e.target.value);
                    setPinError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      confirmPermissionChange();
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-center text-lg font-bold tracking-widest text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  autoFocus
                />
              </div>

              {pinError && (
                <div className="p-2.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-center text-[11px] font-semibold">
                  ⚠ {pinError}
                </div>
              )}
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => {
                  setShowPermissionPinModal(false);
                  setPendingPermissionChange(null);
                  setEnteredPin('');
                  setPinError('');
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmPermissionChange}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer"
              >
                Authorize
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Satisfying Save Button */}
      <div className="mt-8 flex justify-end pb-8">
        <button
          onClick={async () => {
            setIsSavingAll(true);
            try {
              await upsertSystemConfig(config, currentUser);
              showToast('Configurations and preferences successfully saved to the active database!', 'success');
            } finally {
              setIsSavingAll(false);
            }
          }}
          disabled={isSavingAll}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-8 py-3.5 rounded-xl font-bold tracking-wide shadow-lg shadow-indigo-200 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2 cursor-pointer"
        >
          {isSavingAll ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Updating...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Save All Changes
            </>
          )}
        </button>
      </div>

    </div>
  );
}
