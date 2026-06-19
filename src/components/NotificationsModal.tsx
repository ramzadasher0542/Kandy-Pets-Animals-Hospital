/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Bell, 
  Mail, 
  MessageSquare, 
  Send, 
  Trash2, 
  Check, 
  AlertOctagon, 
  AlertTriangle, 
  Info,
  CalendarCheck,
  CheckCircle2,
  Bookmark
} from 'lucide-react';
import { ClientNotification, SystemAlert } from '../types';

interface AlertsProps {
  notifications: ClientNotification[];
  alerts: SystemAlert[];
  onDismissAlert: (id: string) => void;
  onSendNotification: (id: string) => void;
}

export default function NotificationsModal({ 
  notifications, 
  alerts, 
  onDismissAlert, 
  onSendNotification 
}: AlertsProps) {

  const getAlertIcon = (severity: string, category: string) => {
    switch (severity) {
      case 'urgent':
        return <AlertOctagon className="h-5 w-5 text-rose-600 animate-bounce" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      default:
        return <Info className="h-5 w-5 text-sky-500" />;
    }
  };

  const getAlertBg = (severity: string) => {
    switch (severity) {
      case 'urgent':
        return 'bg-rose-50 border-rose-100 text-rose-950';
      case 'warning':
        return 'bg-amber-50 border-amber-100 text-amber-950';
      default:
        return 'bg-slate-50 border-slate-100 text-slate-900';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="reminders-panel">
      
      {/* Clinician urgent warnings (6 Cols) */}
      <div className="lg:col-span-6 bg-white p-5 rounded-2xl border border-sky-100 shadow-sm space-y-4 text-xs h-[34rem] flex flex-col justify-between">
        
        <div className="flex-1 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between pb-3 border-b">
            <div>
              <h4 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Bell className="h-5 w-5 text-rose-500" />
                Urgent Hospital Alerts
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5">Critical vaccine checks, lab releases, and low-stocks warnings</p>
            </div>
            <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-lg">
              {alerts.filter(a => !a.read).length} Unread
            </span>
          </div>

          <div className="space-y-2">
            {alerts.filter(a => !a.read).map(alert => (
              <div 
                key={alert.id} 
                className={`p-3.5 border rounded-xl flex items-start gap-3 transition-all relative group ${getAlertBg(alert.severity)}`}
              >
                <div className="mt-0.5">{getAlertIcon(alert.severity, alert.category)}</div>
                
                <div className="flex-1 pr-6">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider block opacity-70 mb-0.5">
                    {alert.category} • {alert.severity}
                  </span>
                  <p className="font-semibold leading-relaxed text-xs">{alert.message}</p>
                  <span className="text-[9px] font-medium font-mono block mt-1.5 opacity-50">
                    Logged: {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <button
                  onClick={() => onDismissAlert(alert.id)}
                  className="absolute right-3 top-3.5 p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100/50 rounded-lg cursor-pointer transition-colors"
                  title="Dismiss alert notification"
                >
                  ✕
                </button>
              </div>
            ))}
            {alerts.filter(a => !a.read).length === 0 && (
              <div className="text-center py-24 text-slate-400">
                Hospital logs optimal. No unread system alarms.
              </div>
            )}
          </div>
        </div>

        <div className="p-3 bg-indigo-50 border border-indigo-100 text-indigo-950 font-medium rounded-xl flex gap-3 mt-4 items-start">
          <AlertTriangle className="h-5 w-5 text-indigo-600 mt-0.5 min-w-[20px]" />
          <div>
            <span className="font-bold block">HIPAA Medical Warning</span>
            Discharging patient medical entries or inventory lists flags reordering protocols here automatically. Keep tabs regularly.
          </div>
        </div>
      </div>

      {/* Automated outbound CRM reminder queues (6 Cols) */}
      <div className="lg:col-span-6 bg-white p-5 rounded-2xl border border-sky-100 shadow-sm space-y-4 text-xs h-[34rem] overflow-y-auto">
        
        <div className="flex items-center justify-between pb-3 border-b">
          <div>
            <h4 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-emerald-500" />
              Outbound Client Reminders Queue
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5">Simulate push triggers, automated vaccinations alerts, and SMS pings</p>
          </div>
          <span className="px-2.5 py-0.5 bg-sky-100 text-sky-850 text-[10px] font-bold rounded-lg font-mono">
            {notifications.filter(n => n.status === 'queued').length} Pending
          </span>
        </div>

        <div className="space-y-3.5">
          {notifications.map(notif => (
            <div 
              key={notif.id} 
              className="p-4 border border-sky-50 bg-slate-50/50 rounded-2xl flex items-start justify-between gap-4 hover:border-sky-200 transition-colors"
            >
              <div className="space-y-1.5 flex-1 pr-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-sm">{notif.petName}s Owner ({notif.ownerName})</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 font-mono font-bold text-[9px] rounded uppercase">
                    {(notif.type || '').replace('_',' ')}
                  </span>
                </div>

                <p className="text-slate-600 leading-relaxed font-medium">{notif.message}</p>
                
                <div className="flex items-center gap-4 text-[10px] text-slate-400 font-mono font-bold">
                  <span className="flex items-center gap-1">
                    {notif.channel === 'email' ? <Mail className="w-3.5 h-3.5 text-sky-400" /> : <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />}
                    {notif.recipient}
                  </span>
                  <span>Scheduled Sync: {notif.scheduledTime}</span>
                </div>
              </div>

              {/* CRM trigger triggers */}
              <div>
                {notif.status === 'queued' ? (
                  <button
                    onClick={() => onSendNotification(notif.id)}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:scale-95 text-[11px]"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send SMS/Mail</span>
                  </button>
                ) : (
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase rounded-lg flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Dispatch
                  </span>
                )}
              </div>
            </div>
          ))}
          {notifications.length === 0 && (
            <div className="text-center py-24 text-slate-400">
              Reminders queue empty. Scheduled booster dates trigger alerts here!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
