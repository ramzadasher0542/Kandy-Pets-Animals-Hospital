import re

def update_file():
    with open('src/components/StaffManager.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Imports
    content = content.replace("import { User, StaffProfile } from '../types';", "import { User, StaffProfile, TimeEntry } from '../types';")
    content = content.replace("import { UserCog, Plus, X, Edit, Trash2, Link, Unlink, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';", "import { UserCog, Plus, X, Edit, Trash2, Link, Unlink, ChevronDown, ChevronUp, CheckCircle2, Clock } from 'lucide-react';")

    # 2. Props
    props_orig = """interface StaffManagerProps {
  staffProfiles: StaffProfile[];
  users: User[];
  currentUser: User;
  onSaveProfile: (p: StaffProfile) => Promise<void>;
  onDeactivateProfile: (id: string) => Promise<void>;
}"""
    props_new = """interface StaffManagerProps {
  staffProfiles: StaffProfile[];
  users: User[];
  currentUser: User;
  timeEntries: TimeEntry[];
  onSaveTimeEntry: (entry: TimeEntry) => Promise<void>;
  onSaveProfile: (p: StaffProfile) => Promise<void>;
  onDeactivateProfile: (id: string) => Promise<void>;
}"""
    content = content.replace(props_orig, props_new)

    # 3. Component signature
    sig_orig = "export default function StaffManager({ staffProfiles, users, currentUser, onSaveProfile, onDeactivateProfile }: StaffManagerProps) {\n  const [activeTab, setActiveTab] = useState<'roster' | 'link'>('roster');"
    sig_new = "export default function StaffManager({ staffProfiles, users, currentUser, timeEntries, onSaveTimeEntry, onSaveProfile, onDeactivateProfile }: StaffManagerProps) {\n  const [activeTab, setActiveTab] = useState<'roster' | 'link' | 'clock'>('roster');"
    content = content.replace(sig_orig, sig_new)

    # 4. State variables
    state_orig = """  // Link Tab state
  const [selectedUserIds, setSelectedUserIds] = useState<Record<string, string>>({}); // profileId -> userId

  const linkedUserIds = linkedProfiles.map(p => p.userId);
  const availableUsers = users.filter(u => !linkedUserIds.includes(u.id));

  const openNew = () => {"""
    state_new = """  // Link Tab state
  const [selectedUserIds, setSelectedUserIds] = useState<Record<string, string>>({}); // profileId -> userId

  const linkedUserIds = linkedProfiles.map(p => p.userId);
  const availableUsers = users.filter(u => !linkedUserIds.includes(u.id));

  // Time Clock State
  const [clockSelectedStaff, setClockSelectedStaff] = useState<string>('');
  const [manualClockData, setManualClockData] = useState({ staffId: '', date: new Date().toISOString().split('T')[0], clockIn: '', clockOut: '', notes: '' });

  const todayISO = new Date().toISOString().split('T')[0];
  const todaysEntries = timeEntries ? timeEntries.filter(t => t.date.startsWith(todayISO)).sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime()) : [];
  const selectedStaffOpenEntry = timeEntries ? timeEntries.find(t => t.staffId === clockSelectedStaff && t.date.startsWith(todayISO) && !t.clockOut) : undefined;

  const openNew = () => {"""
    content = content.replace(state_orig, state_new)

    # 5. Handlers
    handlers_orig = """  const handleUnlink = async (profile: StaffProfile) => {
    try {
      const updated = stampRecord({ ...profile, userId: undefined });
      await onSaveProfile(updated);
      showToast('Profile unlinked successfully.', 'success');
    } catch (e: any) {
      showToast(`Error unlinking profile: ${e.message}`, 'error');
    }
  };

  return ("""
    handlers_new = """  const handleUnlink = async (profile: StaffProfile) => {
    try {
      const updated = stampRecord({ ...profile, userId: undefined });
      await onSaveProfile(updated);
      showToast('Profile unlinked successfully.', 'success');
    } catch (e: any) {
      showToast(`Error unlinking profile: ${e.message}`, 'error');
    }
  };

  const handleClockIn = async () => {
    if (!clockSelectedStaff) return showToast('Select a staff member first', 'error');
    if (selectedStaffOpenEntry) return showToast('Staff member is already clocked in', 'error');

    const profile = staffProfiles.find(p => p.id === clockSelectedStaff);
    const source = profile?.userId === currentUser.id ? 'self' : 'manager';

    const newEntry: TimeEntry = {
      id: crypto.randomUUID(),
      staffId: clockSelectedStaff,
      date: todayISO,
      clockIn: new Date().toISOString(),
      enteredBy: currentUser.id,
      source,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      _dirty: true
    };

    try {
      await onSaveTimeEntry(stampRecord(newEntry) as TimeEntry);
      showToast('Clocked in successfully', 'success');
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    }
  };

  const handleClockOut = async () => {
    if (!clockSelectedStaff || !selectedStaffOpenEntry) return showToast('No open time entry found', 'error');

    const clockOutTime = new Date();
    const clockInTime = new Date(selectedStaffOpenEntry.clockIn);
    const durationMinutes = Math.round((clockOutTime.getTime() - clockInTime.getTime()) / 60000);

    const updatedEntry: TimeEntry = {
      ...selectedStaffOpenEntry,
      clockOut: clockOutTime.toISOString(),
      durationMinutes
    };

    try {
      await onSaveTimeEntry(stampRecord(updatedEntry) as TimeEntry);
      showToast('Clocked out successfully', 'success');
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    }
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualClockData.staffId || !manualClockData.date || !manualClockData.clockIn) {
      return showToast('Staff, Date, and Clock In time are required.', 'error');
    }

    const clockInIso = new Date(`${manualClockData.date}T${manualClockData.clockIn}:00`).toISOString();
    let clockOutIso = undefined;
    let durationMinutes = undefined;
    
    if (manualClockData.clockOut) {
      clockOutIso = new Date(`${manualClockData.date}T${manualClockData.clockOut}:00`).toISOString();
      durationMinutes = Math.round((new Date(clockOutIso).getTime() - new Date(clockInIso).getTime()) / 60000);
    }

    const newEntry: TimeEntry = {
      id: crypto.randomUUID(),
      staffId: manualClockData.staffId,
      date: manualClockData.date,
      clockIn: clockInIso,
      clockOut: clockOutIso,
      durationMinutes,
      enteredBy: currentUser.id,
      source: 'manager',
      notes: manualClockData.notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      _dirty: true
    };

    try {
      await onSaveTimeEntry(stampRecord(newEntry) as TimeEntry);
      showToast('Manual entry saved', 'success');
      setManualClockData({ staffId: '', date: todayISO, clockIn: '', clockOut: '', notes: '' });
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    }
  };

  return ("""
    content = content.replace(handlers_orig, handlers_new)

    # 6. Tab button
    tab_orig = """          <div className="flex gap-2">
            <button onClick={() => setActiveTab('roster')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'roster' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Roster</button>
            <button onClick={() => setActiveTab('link')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'link' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Link to Login</button>
          </div>"""
    tab_new = """          <div className="flex gap-2">
            <button onClick={() => setActiveTab('roster')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'roster' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Roster</button>
            <button onClick={() => setActiveTab('link')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'link' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Link to Login</button>
            <button onClick={() => setActiveTab('clock')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'clock' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Time Clock</button>
          </div>"""
    content = content.replace(tab_orig, tab_new)

    # 7. Tab UI
    ui_orig = """              </table>
            </div>
          </div>
        )}
      </main>"""
    ui_new = """              </table>
            </div>
          </div>
        ) : activeTab === 'clock' ? (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center">
                <h2 className="text-lg font-extrabold text-slate-800 tracking-tight flex items-center gap-2 mb-6"><Clock className="w-5 h-5 text-indigo-500"/> Quick Clock Panel</h2>
                <div className="w-full max-w-sm space-y-6">
                  <select value={clockSelectedStaff} onChange={e => setClockSelectedStaff(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="">-- Select Staff Member --</option>
                    {activeProfiles.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                  </select>
                  
                  <div className="flex gap-4">
                    <button onClick={handleClockIn} disabled={!!selectedStaffOpenEntry} className={`flex-1 py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all ${!!selectedStaffOpenEntry ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md'}`}>Clock In</button>
                    <button onClick={handleClockOut} disabled={!selectedStaffOpenEntry} className={`flex-1 py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all ${!selectedStaffOpenEntry ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-rose-600 text-white hover:bg-rose-700 shadow-md'}`}>Clock Out</button>
                  </div>
                  
                  <div className="text-center">
                    {clockSelectedStaff ? (
                      selectedStaffOpenEntry ? (
                        <p className="text-sm font-bold text-emerald-600 bg-emerald-50 py-2 rounded-lg border border-emerald-100">{activeProfiles.find(p => p.id === clockSelectedStaff)?.fullName} is currently CLOCKED IN since {new Date(selectedStaffOpenEntry.clockIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      ) : (
                        <p className="text-sm font-bold text-slate-500 bg-slate-50 py-2 rounded-lg border border-slate-200">{activeProfiles.find(p => p.id === clockSelectedStaff)?.fullName} is not clocked in today.</p>
                      )
                    ) : (
                       <p className="text-sm font-bold text-slate-400">Select a profile to view status</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-extrabold text-slate-800 tracking-tight mb-6">Manager Override — Edit / Add Entry</h2>
                <form onSubmit={handleManualSave} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Staff Profile</label>
                      <select required value={manualClockData.staffId} onChange={e => setManualClockData({...manualClockData, staffId: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500">
                        <option value="">-- Select --</option>
                        {activeProfiles.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Date</label>
                      <input required type="date" value={manualClockData.date} onChange={e => setManualClockData({...manualClockData, date: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Clock In Time</label>
                      <input required type="time" value={manualClockData.clockIn} onChange={e => setManualClockData({...manualClockData, clockIn: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Clock Out Time (Optional)</label>
                      <input type="time" value={manualClockData.clockOut} onChange={e => setManualClockData({...manualClockData, clockOut: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes (Optional)</label>
                    <input type="text" value={manualClockData.notes} onChange={e => setManualClockData({...manualClockData, notes: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="Reason for override..." />
                  </div>
                  <div className="pt-2 flex justify-end">
                    <button type="submit" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition-colors text-[10px] uppercase tracking-widest cursor-pointer">Save Entry</button>
                  </div>
                </form>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">Today's Entries</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-widest font-black text-slate-500">
                  <tr><th className="p-4">Staff Member</th><th className="p-4">Time In / Out</th><th className="p-4">Duration</th><th className="p-4">Source</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todaysEntries.map(entry => {
                    const profile = staffProfiles.find(p => p.id === entry.staffId);
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/50">
                        <td className="p-4 font-extrabold text-slate-800">{profile?.fullName || 'Unknown'}</td>
                        <td className="p-4 font-mono text-xs text-slate-600">
                          {new Date(entry.clockIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {entry.clockOut ? new Date(entry.clockOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : <span className="text-emerald-600 font-bold bg-emerald-50 px-1 py-0.5 rounded">Still in</span>}
                        </td>
                        <td className="p-4 text-slate-600 font-bold text-xs">{entry.durationMinutes !== undefined ? `${Math.floor(entry.durationMinutes/60)}h ${entry.durationMinutes%60}m` : '--'}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${entry.source === 'manager' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{entry.source}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {todaysEntries.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400 font-bold text-sm">No time entries recorded today.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </main>"""
    content = content.replace(ui_orig, ui_new)

    with open('src/components/StaffManager.tsx', 'w', encoding='utf-8') as f:
        f.write(content)

update_file()
