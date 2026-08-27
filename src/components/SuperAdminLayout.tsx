import React from 'react';
import { Building2, LogOut, ShieldCheck } from 'lucide-react';
import { User } from '../types';
import SuperAdminDashboard from './SuperAdminDashboard';

interface SuperAdminLayoutProps {
  currentUser: User;
  onSignOut: () => Promise<void>;
}

export default function SuperAdminLayout({ currentUser, onSignOut }: SuperAdminLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      <aside className="hidden md:flex w-72 shrink-0 border-r border-white/10 bg-slate-950 flex-col">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-400/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight">Ash Point Solutions</p>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300 mt-1">Super Admin</p>
            </div>
          </div>
        </div>
        <nav className="p-4 space-y-2 flex-1">
          <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white">
            <Building2 className="w-5 h-5 text-amber-300" />
            Clinic Network
          </div>
        </nav>
        <div className="p-5 border-t border-white/10">
          <p className="text-xs font-black truncate">{currentUser.name}</p>
          <p className="text-[10px] font-bold text-slate-400 truncate mt-1">{currentUser.username}</p>
          <button
            onClick={() => void onSignOut()}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 bg-slate-100 text-slate-900">
        <SuperAdminDashboard currentUser={currentUser} />
      </main>
    </div>
  );
}
