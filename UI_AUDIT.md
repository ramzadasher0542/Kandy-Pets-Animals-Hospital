# UI Audit — deviations from DESIGN_SYSTEM.md

This is the work order for UI-2 through UI-5. **No changes were made to any panel in
this session** — this file only lists what needs to change, with real line numbers.

## Scope note

The task asked for "all 14" panels. The actual count of components under
`src/components/` is **20 files**; of those, **19 have at least one deviation** (only
`PhoneInput.tsx` and `Toast.tsx` are near-clean, and even they have 1 and 3 respectively
— see below). If "14" meant only the nav-routed screens (POS, Dashboard, Appointments,
Pets/PatientPortal, Customers, Vaccinations, Examinations/MedicalRecords, Laboratory,
Boarding, Grooming, Inventory, Invoices, Shift, Reports, Staff — that's actually **15**,
plus SystemSettings reached via the gear icon = **16**), I audited **all 20** rather than
guess which 6 to skip. `POSReceipt.tsx` (a print template, not an interactive panel) had
zero deviations and is omitted from the tables below.

## Categories audited (per DESIGN_SYSTEM.md's "DO NOT USE" list)

- Deleted radius: `rounded-lg`, `rounded-md`, `rounded-3xl` (except confirmed Modal
  shells, which keep `rounded-3xl` per the canonical spec — flagged separately for
  manual confirmation, not counted as an error)
- Deleted text sizes: `text-[8px]`, `text-[9px]`, `text-[11px]`
- Deleted weights: `font-semibold`, `font-extrabold`, `font-medium`
- Deleted spacing: `p-5`/`px-5`/`py-5`/`gap-5`, `p-7`/`px-7`/`py-7`/`gap-7`
- Off-palette colors: any `red`/`green`/`yellow`/`orange`/`violet`/`purple`/`fuchsia`/
  `pink`/`lime`/`teal`/`cyan`/`gray`/`zinc`/`neutral`/`stone` family — **WRONG SEMANTIC**,
  none of these are in the 6-color canonical palette
- `blue-*` → flagged for migration to `sky-*` (the actual measured informational
  standard — see DESIGN_SYSTEM.md's disagreement writeup)

**Not automatically flagged** (would require deeper semantic parsing than a grep pass
can safely do without false positives): whether a given `emerald`/`rose`/`amber` badge's
*meaning* matches its label. I hand-sampled ~80 of these during measurement (see
DESIGN_SYSTEM.md) and found the palette-to-meaning mapping is **already highly
consistent** — the real problems are the off-palette strays and the radius/text-size/
weight/spacing drift listed exhaustively below, not widespread meaning violations.

Auto-classification is best-effort: entries marked "context-dependent — verify manually"
mean the script couldn't determine card vs. interactive vs. badge from surrounding text
alone; a human pass should confirm before batch-fixing.

## Summary (worst panel first)

| Panel | Deviations |
|---|---|
| CustomersManager.tsx | 109 |
| AppointmentsManager.tsx | 98 |
| StaffManager.tsx | 74 |
| PatientPortal.tsx | 55 |
| ReportsManager.tsx | 55 |
| MedicalRecordsManager.tsx | 45 |
| BoardingManager.tsx | 43 |
| LaboratoryManager.tsx | 37 |
| InventoryManager.tsx | 36 |
| SystemSettings.tsx | 33 |
| GroomingManager.tsx | 27 |
| ShiftManager.tsx | 25 |
| POSRegister.tsx | 21 |
| DashboardAnalytics.tsx | 19 |
| InvoicesManager.tsx | 16 |
| NotificationsModal.tsx | 16 |
| VaccinationsManager.tsx | 13 |
| Toast.tsx | 3 |
| PhoneInput.tsx | 1 |
| **TOTAL** | **726** |

---

## Per-panel detail

### CustomersManager.tsx
**109 deviations**

- Line 441: `text-[8px]` on `...00 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 442: `text-[8px]` on `...00 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 444: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 449: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 451: `font-medium` on micro-label/badge -> should be font-black | `...className={`text-[10px] font-medium ${isSelected ? 'text-ind...`
- Line 471: `font-extrabold` on body text -> should be font-bold | `...<h4 className="text-sm font-extrabold text-rose-700">RESTRICTE...`
- Line 491: `rounded-lg` on `...00 hover:text-indigo-600 rounded-lg transition-colors cursor...` -> context-dependent -> verify manually (default rounded-xl)
- Line 495: `font-semibold` on body text -> should be font-bold | `...enter gap-4 mt-2 text-xs font-semibold text-slate-500">...`
- Line 501: `font-semibold` on body text -> should be font-bold | `...ms-start gap-1.5 text-xs font-semibold text-slate-500 max-w-sm"...`
- Line 509: `font-extrabold` on micro-label/badge -> should be font-black | `...v className="text-[10px] font-extrabold text-slate-400 uppercase...`
- Line 521: `font-extrabold` on body text -> should be font-bold | `...<h3 className="text-sm font-extrabold text-slate-800 flex item...`
- Line 529: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...id-cols-2 lg:grid-cols-3 gap-5">...`
- Line 539: `rounded-md` on `...bg-slate-100 px-2.5 py-1 rounded-md">{pet.petType}</div>...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 553: `font-semibold` on body text -> should be font-bold | `...<div className="text-xs font-semibold text-slate-500 truncate...`
- Line 554: `font-medium` on micro-label/badge -> should be font-black | `...v className="text-[10px] font-medium text-slate-400 truncate...`
- Line 557: `rounded-lg` on `...ppercase tracking-widest rounded-lg transition-colors cursor...` -> interactive element -> should be rounded-xl
- Line 573: `font-extrabold` on body text -> should be font-bold | `...<h3 className="text-sm font-extrabold text-slate-800 flex item...`
- Line 590: `font-semibold` on micro-label/badge -> should be font-black | `...v className="text-[10px] font-semibold text-slate-500 mt-0.5">{...`
- Line 594: `text-[9px]` on `...<div className={`text-[9px] font-extrabold uppercase...` -> should be `text-[10px]`
- Line 594: `font-extrabold` on micro-label/badge -> should be font-black | `...v className={`text-[9px] font-extrabold uppercase mt-0.5 ${inv.p...`
- Line 607: `font-extrabold` on body text -> should be font-bold | `...<h3 className="text-sm font-extrabold text-slate-800 flex item...`
- Line 624: `font-semibold` on micro-label/badge -> should be font-black | `...v className="text-[10px] font-semibold text-slate-500 mt-0.5">{...`
- Line 627: `text-[9px]` on `...<div className={`text-[9px] px-1.5 py-0.5 rounded fo...` -> should be `text-[10px]`
- Line 627: `font-extrabold` on micro-label/badge -> should be font-black | `...x] px-1.5 py-0.5 rounded font-extrabold uppercase mt-0.5 ${...`
- Line 660: `rounded-lg` on `...ppercase tracking-widest rounded-lg transition-colors flex i...` -> interactive element -> should be rounded-xl
- Line 668: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...sName="flex items-center gap-5">...`
- Line 686: `text-[9px]` on `...<div className="text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 690: `text-[9px]` on `...<div className="text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 694: `text-[9px]` on `...<div className="text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 705: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...'timeline')} className={`px-5 py-2.5 text-[10px] font-...`
- Line 708: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...ab('exams')} className={`px-5 py-2.5 text-[10px] font-...`
- Line 711: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Tab('labs')} className={`px-5 py-2.5 text-[10px] font-...`
- Line 714: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...'vaccines')} className={`px-5 py-2.5 text-[10px] font-...`
- Line 731: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 738: `text-[9px]` on `...me={`px-2 py-0.5 rounded text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 745: `text-[9px]` on `...<div className="text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 753: `text-[9px]` on `...<div className="text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 756: `rounded-md` on `...px] font-black px-2 py-1 rounded-md shadow-xs">...` -> context-dependent -> verify manually (default rounded-xl)
- Line 756: `text-[9px]` on `...digo-100 text-indigo-700 text-[9px] font-black px-2 py-1 rou...` -> should be `text-[10px]`
- Line 777: `p-5` -> should be p-4 or p-6 (nearest canonical) | `....id} className="bg-white p-5 rounded-2xl border borde...`
- Line 792: `font-medium` on micro-label/badge -> should be font-black | `...v className="text-[10px] font-medium text-rose-700 mt-2 itali...`
- Line 807: `text-[9px]` on `...acking-widest font-black text-[9px]">...` -> should be `text-[10px]`
- Line 808: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Date</th>...`
- Line 809: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Test Name</th>...`
- Line 810: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Status</th>...`
- Line 811: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Results / Notes</th>...`
- Line 820: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-bold text-slate-600...`
- Line 821: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-black text-slate-80...`
- Line 822: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5">...`
- Line 823: `rounded-md` on `...className={`px-2.5 py-1 rounded-md text-[9px] font-black up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 823: `text-[9px]` on `...{`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 827: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5">...`
- Line 846: `text-[9px]` on `...acking-widest font-black text-[9px]">...` -> should be `text-[10px]`
- Line 847: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Date Administered</th>...`
- Line 848: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Vaccine / Preventative<...`
- Line 849: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Next Due Date</th>...`
- Line 850: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Status</th>...`
- Line 861: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-bold text-slate-600...`
- Line 862: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-black text-slate-80...`
- Line 863: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className={`py-4 px-5 font-bold ${isOverdue ?...`
- Line 864: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5">...`
- Line 865: `rounded-md` on `...className={`px-2.5 py-1 rounded-md text-[9px] font-black up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 865: `text-[9px]` on `...{`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 889: `font-extrabold` on body text -> should be font-bold | `...<h2 className="text-sm font-extrabold text-slate-800 tracking-...`
- Line 899: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-xs font-semibold text-slate-800 focus:out...`
- Line 918: `font-extrabold` on body text -> should be font-bold | `...<div className={`font-extrabold truncate ${isSelected ?...`
- Line 943: `font-medium` on body text -> should be font-bold | `...nter py-8 text-slate-400 font-medium text-xs">No clients matc...`
- Line 967: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-sky-100 ma...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 974: `rounded-lg` on `...slate-100 text-slate-400 rounded-lg cursor-pointer transitio...` -> interactive element -> should be rounded-xl
- Line 982: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 986: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 990: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 999: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1003: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1010: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 1014: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1018: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1029: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1033: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1037: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1045: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1052: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 1053: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1060: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Modal(false)} className="px-5 py-2.5 border border-sla...`
- Line 1075: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-sky-100 ma...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 1081: `rounded-lg` on `...slate-200 text-slate-400 rounded-lg cursor-pointer transitio...` -> interactive element -> should be rounded-xl
- Line 1088: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1092: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1103: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1107: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1117: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1121: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1128: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Modal(false)} className="px-5 py-2.5 border border-sla...`
- Line 1142: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-sky-100 ma...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 1148: `rounded-lg` on `...slate-200 text-slate-400 rounded-lg cursor-pointer transitio...` -> interactive element -> should be rounded-xl
- Line 1155: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1159: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1163: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1167: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1171: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1175: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1182: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Modal(false)} className="px-5 py-2.5 border border-sla...`
- Line 1201: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-rose-100 m...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 1212: `rounded-lg` on `...:bg-white text-slate-400 rounded-lg cursor-pointer transitio...` -> interactive element -> should be rounded-xl
- Line 1224: `text-[11px]` on `...<p className="text-[11px] font-bold text-rose-700...` -> should be `text-[10px]`
- Line 1236: `text-[11px]` on `...<span className="text-[11px] font-bold text-rose-800"...` -> should be `text-[10px]`
- Line 1241: `text-[11px]` on `...<p className="text-[11px] font-bold text-slate-600...` -> should be `text-[10px]`
- Line 1248: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1262: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Target(null)} className="px-5 py-2.5 border border-sla...`

### AppointmentsManager.tsx
**98 deviations**

- Line 675: `rounded-md` on `...-amber-50 text-amber-600 rounded-md text-[10px] font-bold up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 676: `rounded-md` on `...1 bg-sky-50 text-sky-600 rounded-md text-[10px] font-bold up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 677: `rounded-md` on `...rald-50 text-emerald-600 rounded-md text-[10px] font-bold up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 678: `rounded-md` on `...bg-rose-50 text-rose-600 rounded-md text-[10px] font-bold up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 679: `rounded-md` on `...-slate-50 text-slate-600 rounded-md text-[10px] font-bold up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 685: `bg-blue-50` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...ype === 'OPD') colors = 'bg-blue-50 text-blue-700 border-blu...`
- Line 685: `text-blue-700` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...D') colors = 'bg-blue-50 text-blue-700 border-blue-200';...`
- Line 685: `border-blue-200` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...bg-blue-50 text-blue-700 border-blue-200';...`
- Line 689: `rounded-md` on `...className={`px-2 py-0.5 rounded-md text-[10px] font-bold bo...` -> context-dependent -> verify manually (default rounded-xl)
- Line 734: `rounded-lg` on `...Name={`text-[10px] p-1.5 rounded-lg truncate shadow-xs font-...` -> context-dependent -> verify manually (default rounded-xl)
- Line 734: `font-medium` on micro-label/badge -> should be font-black | `...ed-lg truncate shadow-xs font-medium transition-colors flex i...`
- Line 750: `rounded-lg` on `...te-50 hover:bg-indigo-50 rounded-lg transition-colors border...` -> context-dependent -> verify manually (default rounded-xl)
- Line 750: `text-[9px]` on `...className="text-[9px] font-bold text-slate-500...` -> should be `text-[10px]`
- Line 793: `font-extrabold` on body text -> should be font-bold | `...<div className={`text-sm font-extrabold mt-0.5 ${d.toDateString(...`
- Line 831: `font-medium` on body text -> should be font-bold | `...uncate opacity-80 mt-0.5 font-medium">{a.ownerName} - {a.aptN...`
- Line 851: `font-medium` on micro-label/badge -> should be font-black | `...xt-[10px] text-slate-500 font-medium">{formatDisplayTime(apt....`
- Line 857: `text-[9px]` on `...00 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 858: `text-[9px]` on `...00 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 862: `font-medium` on micro-label/badge -> should be font-black | `...xt-[10px] text-slate-500 font-medium">{apt.petType} - {apt.br...`
- Line 865: `text-[9px]` on `...00 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 871: `font-medium` on micro-label/badge -> should be font-black | `...xt-[10px] text-slate-500 font-medium font-mono mt-0.5 flex it...`
- Line 878: `font-medium` on micro-label/badge -> should be font-black | `...xt-[10px] text-slate-500 font-medium flex items-center gap-1....`
- Line 889: `rounded-lg` on `...ls" className="px-2 py-1 rounded-lg text-[9px] font-black up...` -> interactive element -> should be rounded-xl
- Line 889: `text-[9px]` on `...me="px-2 py-1 rounded-lg text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 894: `rounded-lg` on `...ck In" className={`p-1.5 rounded-lg transition-colors ${isLo...` -> interactive element -> should be rounded-xl
- Line 898: `rounded-lg` on `...ails"} className={`p-1.5 rounded-lg transition-colors ${isLo...` -> interactive element -> should be rounded-xl
- Line 901: `rounded-lg` on `...ment"} className={`p-1.5 rounded-lg transition-colors ${isLo...` -> interactive element -> should be rounded-xl
- Line 953: `font-medium` on body text -> should be font-bold | `...xt-center text-slate-400 font-medium">No appointments schedul...`
- Line 969: `font-medium` on body text -> should be font-bold | `...xt-center text-slate-400 font-medium">No upcoming appointment...`
- Line 986: `font-medium` on body text -> should be font-bold | `...xt-center text-slate-400 font-medium">No past appointments fo...`
- Line 1029: `font-extrabold` on body text -> should be font-bold | `...<h2 className="text-lg font-extrabold text-slate-800 tracking-...`
- Line 1033: `rounded-lg` on `...} className={`p-1.5 px-3 rounded-lg flex items-center gap-2...` -> interactive element -> should be rounded-xl
- Line 1036: `rounded-lg` on `...} className={`p-1.5 px-3 rounded-lg flex items-center gap-2...` -> interactive element -> should be rounded-xl
- Line 1043: `font-extrabold` on micro-label/badge -> should be font-black | `...0 rounded-xl text-[10px] font-extrabold shadow-xs flex items-cen...`
- Line 1044: `rounded-md` on `...me="bg-white px-2 py-0.5 rounded-md border border-slate-100...` -> context-dependent -> verify manually (default rounded-xl)
- Line 1046: `font-extrabold` on micro-label/badge -> should be font-black | `...0 rounded-xl text-[10px] font-extrabold shadow-xs flex items-cen...`
- Line 1047: `rounded-md` on `...me="bg-white px-2 py-0.5 rounded-md border border-amber-100...` -> context-dependent -> verify manually (default rounded-xl)
- Line 1049: `font-extrabold` on micro-label/badge -> should be font-black | `...0 rounded-xl text-[10px] font-extrabold shadow-xs flex items-cen...`
- Line 1050: `rounded-md` on `...me="bg-white px-2 py-0.5 rounded-md border border-sky-100 te...` -> context-dependent -> verify manually (default rounded-xl)
- Line 1062: `rounded-lg` on `...border border-slate-200 rounded-lg hover:bg-slate-50 text-s...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 1065: `rounded-lg` on `...border border-slate-200 rounded-lg hover:bg-slate-50 text-[...` -> interactive element -> should be rounded-xl
- Line 1065: `font-extrabold` on micro-label/badge -> should be font-black | `...:bg-slate-50 text-[10px] font-extrabold text-slate-700 shadow-xs...`
- Line 1074: `rounded-lg` on `...border border-slate-200 rounded-lg hover:bg-slate-50 text-s...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 1077: `text-[11px]` on `...<div className="px-3 text-[11px] font-extrabold text-slat...` -> should be `text-[10px]`
- Line 1077: `font-extrabold` on micro-label/badge -> should be font-black | `...ssName="px-3 text-[11px] font-extrabold text-slate-800 min-w-[14...`
- Line 1091: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-xs font-semibold text-slate-800 focus:out...`
- Line 1098: `rounded-lg` on `...className={`px-3 py-1.5 rounded-lg text-[10px] font-bold ca...` -> interactive element -> should be rounded-xl
- Line 1125: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...der-slate-200 shadow-2xl p-5 max-w-sm w-full animate-...`
- Line 1126: `rounded-lg` on `...e-400 hover:bg-slate-100 rounded-lg transition-colors cursor...` -> interactive element -> should be rounded-xl
- Line 1127: `font-extrabold` on body text -> should be font-bold | `...<h3 className="text-sm font-extrabold text-slate-800 mb-1">App...`
- Line 1128: `font-medium` on micro-label/badge -> should be font-black | `...xt-[10px] text-slate-500 font-medium mb-4">{overflowPopover.d...`
- Line 1144: `text-[9px]` on `...etName} <span className="text-[9px] text-slate-400 ml-1">{a....` -> should be `text-[10px]`
- Line 1146: `text-[9px]` on `...<span className="text-[9px] font-mono bg-white px-1...` -> should be `text-[10px]`
- Line 1150: `font-medium` on micro-label/badge -> should be font-black | `...e opacity-80 text-[10px] font-medium">{a.ownerName} - {a.reas...`
- Line 1163: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...der-slate-200 shadow-2xl p-5 max-w-sm w-full animate-...`
- Line 1164: `rounded-lg` on `...e-400 hover:bg-slate-100 rounded-lg transition-colors cursor...` -> interactive element -> should be rounded-xl
- Line 1166: `font-extrabold` on body text -> should be font-bold | `...<h3 className="text-sm font-extrabold text-slate-800">{selecte...`
- Line 1169: `font-medium` on micro-label/badge -> should be font-black | `...xt-[10px] text-slate-500 font-medium mb-4">{selectedPopoverAp...`
- Line 1171: `rounded-lg` on `...rder-amber-300 px-2 py-1 rounded-lg text-[9px] font-black up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 1171: `text-[9px]` on `...300 px-2 py-1 rounded-lg text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 1213: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-sky-100 ma...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 1220: `rounded-lg` on `...slate-100 text-slate-400 rounded-lg cursor-pointer transitio...` -> interactive element -> should be rounded-xl
- Line 1233: `text-[9px]` on `...ld text-indigo-900 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1244: `text-[9px]` on `...ld text-indigo-900 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1258: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 1259: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...lex flex-col md:flex-row gap-5 mb-5">...`
- Line 1261: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1265: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1278: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1288: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...id-cols-1 md:grid-cols-2 gap-5">...`
- Line 1291: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 1295: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1300: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1311: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1319: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1323: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1337: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 1354: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1359: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1368: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1379: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 1383: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1387: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1391: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1398: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1403: `p-5` -> should be p-4 or p-6 (nearest canonical) | `..."bg-amber-50 rounded-2xl p-5 border border-amber-200...`
- Line 1414: `text-[9px]` on `...old text-amber-800 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1447: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Modal(false)} className="px-5 py-2.5 border border-sla...`
- Line 1460: `rounded-3xl` on `...<div className="bg-white rounded-3xl shadow-2xl w-full max-w-...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 1461: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...iv className="bg-rose-50 p-5 border-b border-rose-100...`
- Line 1466: `font-semibold` on body text -> should be font-bold | `...text-rose-600/80 text-xs font-semibold mt-1">Bypass triage and...`
- Line 1475: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1480: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1485: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1490: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 1497: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="p-5 border-t border-slate-10...`
- Line 1498: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Modal(false)} className="px-5 py-2.5 bg-white border b...`
- Line 1501: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...rgencyIntake} className="px-5 py-2.5 bg-rose-600 hover...`

### StaffManager.tsx
**74 deviations**

- Line 417: `bg-blue-100` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...udes('cashier')) return 'bg-blue-100 text-blue-700 border-blu...`
- Line 417: `text-blue-700` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...r')) return 'bg-blue-100 text-blue-700 border-blue-200';...`
- Line 417: `border-blue-200` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...g-blue-100 text-blue-700 border-blue-200';...`
- Line 485: `font-extrabold` on body text -> should be font-bold | `...<h2 className="text-lg font-extrabold text-slate-800 tracking-...`
- Line 486: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...ick={openNew} className="px-5 py-2.5 bg-indigo-600 hov...`
- Line 493: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...border border-slate-200 p-5 rounded-2xl shadow-sm fl...`
- Line 498: `text-[8px]` on `...me={`px-2 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 502: `text-[8px]` on `...ame="px-2 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 524: `font-extrabold` on body text -> should be font-bold | `...ems-center gap-2 text-sm font-extrabold text-slate-500 hover:tex...`
- Line 530: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...border border-slate-200 p-5 rounded-2xl flex flex-co...`
- Line 536: `text-[8px]` on `...ame="px-2 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 551: `font-extrabold` on body text -> should be font-bold | `...<div className="text-sm font-extrabold text-slate-800">...`
- Line 556: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...eModal(true)} className="px-5 py-2.5 bg-indigo-600 hov...`
- Line 569: `font-extrabold` on body text -> should be font-bold | `...<div className="text-lg font-extrabold text-slate-800">{date.ge...`
- Line 576: `rounded-lg` on `...solute top-1 right-1 p-1 rounded-lg opacity-0 group-hover:op...` -> interactive element -> should be rounded-xl
- Line 577: `font-extrabold` on body text -> should be font-bold | `...<div className="font-extrabold text-xs">{p?.fullName ||...`
- Line 578: `text-[9px]` on `...<div className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 594: `font-extrabold` on body text -> should be font-bold | `...<h3 className="text-sm font-extrabold text-slate-800 flex item...`
- Line 605: `font-extrabold` on body text -> should be font-bold | `...<div className="font-extrabold text-slate-800">{p.fullN...`
- Line 609: `rounded-lg` on `...border border-slate-200 rounded-lg text-xs font-semibold fo...` -> interactive element -> should be rounded-xl
- Line 609: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-lg text-xs font-semibold focus:outline-none focus...`
- Line 615: `rounded-lg` on `...bg-indigo-700 text-white rounded-lg text-[10px] font-black u...` -> interactive element -> should be rounded-xl
- Line 626: `font-extrabold` on body text -> should be font-bold | `...<h3 className="text-sm font-extrabold text-slate-800 flex item...`
- Line 637: `font-extrabold` on body text -> should be font-bold | `...<td className="p-4 font-extrabold text-slate-800">{p.fullN...`
- Line 640: `rounded-lg` on `...ose-600 hover:bg-rose-50 rounded-lg text-[10px] font-black u...` -> interactive element -> should be rounded-xl
- Line 654: `font-extrabold` on body text -> should be font-bold | `...<h2 className="text-lg font-extrabold text-slate-800 tracking-...`
- Line 656: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 669: `rounded-lg` on `...d-600 bg-emerald-50 py-2 rounded-lg border border-emerald-10...` -> context-dependent -> verify manually (default rounded-xl)
- Line 671: `rounded-lg` on `...ate-500 bg-slate-50 py-2 rounded-lg border border-slate-200"...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 681: `font-extrabold` on body text -> should be font-bold | `...<h2 className="text-lg font-extrabold text-slate-800 tracking-...`
- Line 686: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 693: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 699: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 703: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 708: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 711: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...type="submit" className="px-5 py-2.5 bg-indigo-600 hov...`
- Line 719: `font-extrabold` on body text -> should be font-bold | `...<h3 className="text-sm font-extrabold text-slate-800 flex item...`
- Line 730: `font-extrabold` on body text -> should be font-bold | `...<td className="p-4 font-extrabold text-slate-800">{profile...`
- Line 736: `text-[8px]` on `...me={`px-2 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 750: `font-extrabold` on body text -> should be font-bold | `...<h2 className="text-lg font-extrabold text-slate-800 tracking-...`
- Line 754: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 763: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 767: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 784: `rounded-lg` on `...s font-mono bg-white p-2 rounded-lg border border-slate-100"...` -> context-dependent -> verify manually (default rounded-xl)
- Line 815: `rounded-lg` on `...ppercase tracking-widest rounded-lg transition-colors cursor...` -> interactive element -> should be rounded-xl
- Line 819: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-xs font-semibold focus:outline-none focus...`
- Line 820: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-xs font-semibold focus:outline-none focus...`
- Line 821: `rounded-lg` on `...ose-600 hover:bg-rose-50 rounded-lg transition-colors cursor...` -> interactive element -> should be rounded-xl
- Line 838: `font-extrabold` on body text -> should be font-bold | `...<h3 className="text-sm font-extrabold text-slate-800 flex item...`
- Line 848: `font-extrabold` on body text -> should be font-bold | `...<div className="font-extrabold text-slate-800 truncate"...`
- Line 853: `text-[9px]` on `...me={`px-2 py-0.5 rounded text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 856: `rounded-lg` on `...ppercase tracking-widest rounded-lg transition-colors cursor...` -> interactive element -> should be rounded-xl
- Line 856: `text-[9px]` on `...bg-indigo-700 text-white text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 859: `rounded-lg` on `...ppercase tracking-widest rounded-lg transition-colors cursor...` -> interactive element -> should be rounded-xl
- Line 859: `text-[9px]` on `...g-emerald-700 text-white text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 862: `rounded-lg` on `...ppercase tracking-widest rounded-lg transition-colors cursor...` -> interactive element -> should be rounded-xl
- Line 862: `text-[9px]` on `...border border-indigo-200 text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 879: `font-extrabold` on body text -> should be font-bold | `...<h3 className="font-extrabold text-slate-800">{isEditi...`
- Line 885: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 890: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 894: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 900: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 907: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 914: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 920: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 930: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Modal(false)} className="px-5 py-2.5 bg-white border b...`
- Line 943: `font-extrabold` on body text -> should be font-bold | `...<h3 className="font-extrabold text-slate-800">Add Shif...`
- Line 949: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 957: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 961: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 974: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 978: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 983: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-sm font-semibold focus:outline-none focus...`
- Line 987: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Modal(false)} className="px-5 py-2.5 bg-white border b...`

### PatientPortal.tsx
**55 deviations**

- Line 173: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="p-5 border-b border-slate-10...`
- Line 178: `rounded-lg` on `...border border-slate-200 rounded-lg p-0.5 shadow-xs">...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 179: `rounded-md` on `...ppercase tracking-widest rounded-md transition-colors ${show...` -> interactive element -> should be rounded-xl
- Line 179: `text-[9px]` on `...)} className={`px-3 py-1 text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 180: `rounded-md` on `...ppercase tracking-widest rounded-md transition-colors ${!sho...` -> interactive element -> should be rounded-xl
- Line 180: `text-[9px]` on `...)} className={`px-3 py-1 text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 188: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-xs font-semibold focus:outline-none focus...`
- Line 204: `text-[8px]` on `...me={`px-2 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 207: `font-semibold` on micro-label/badge -> should be font-black | `...className={`text-[10px] font-semibold mt-2 pt-2 border-t flex...`
- Line 229: `rounded-lg` on `...ppercase tracking-widest rounded-lg transition-colors flex i...` -> interactive element -> should be rounded-xl
- Line 234: `rounded-lg` on `...ppercase tracking-widest rounded-lg transition-colors flex i...` -> interactive element -> should be rounded-xl
- Line 242: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...sName="flex items-center gap-5">...`
- Line 262: `text-[9px]` on `...<div className="text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 266: `text-[9px]` on `...<div className="text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 270: `text-[9px]` on `...<div className="text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 306: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 311: `text-[8px]` on `...ald-100 text-emerald-700 text-[8px] px-1.5 py-0.5 rounded up...` -> should be `text-[10px]`
- Line 316: `text-[9px]` on `...me={`px-2 py-0.5 rounded text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 323: `text-[9px]` on `...<div className="text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 331: `text-[9px]` on `...<div className="text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 334: `rounded-md` on `...px] font-black px-2 py-1 rounded-md shadow-xs">...` -> context-dependent -> verify manually (default rounded-xl)
- Line 334: `text-[9px]` on `...digo-100 text-indigo-700 text-[9px] font-black px-2 py-1 rou...` -> should be `text-[10px]`
- Line 355: `p-5` -> should be p-4 or p-6 (nearest canonical) | `....id} className="bg-white p-5 rounded-2xl border borde...`
- Line 374: `font-medium` on micro-label/badge -> should be font-black | `...v className="text-[10px] font-medium text-rose-700 mt-2 itali...`
- Line 389: `text-[9px]` on `...acking-widest font-black text-[9px]">...` -> should be `text-[10px]`
- Line 390: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Date</th>...`
- Line 391: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Diagnostic Test</th>...`
- Line 392: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Status</th>...`
- Line 393: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Results / Matrix</th>...`
- Line 402: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-bold text-slate-600...`
- Line 403: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-black text-slate-80...`
- Line 404: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5">...`
- Line 405: `rounded-md` on `...className={`px-2.5 py-1 rounded-md text-[9px] font-black up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 405: `text-[9px]` on `...{`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 409: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5">...`
- Line 430: `text-[9px]` on `...acking-widest font-black text-[9px]">...` -> should be `text-[10px]`
- Line 431: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Date Administered</th>...`
- Line 432: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Vaccine / Preventative<...`
- Line 433: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Next Due Date</th>...`
- Line 434: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Status</th>...`
- Line 445: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-bold text-slate-600...`
- Line 446: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-black text-slate-80...`
- Line 447: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className={`py-4 px-5 font-bold ${isOverdue ?...`
- Line 448: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5">...`
- Line 449: `rounded-md` on `...className={`px-2.5 py-1 rounded-md text-[9px] font-black up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 449: `text-[9px]` on `...{`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 469: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-sky-100 ma...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 475: `rounded-lg` on `...slate-200 text-slate-400 rounded-lg cursor-pointer transitio...` -> interactive element -> should be rounded-xl
- Line 482: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 486: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 497: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 501: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 511: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 515: `text-[9px]` on `...old text-slate-500 block text-[9px] uppercase tracking-wides...` -> should be `text-[10px]`
- Line 522: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Modal(false)} className="px-5 py-2.5 border border-sla...`

### ReportsManager.tsx
**55 deviations**

- Line 505: `rounded-lg` on `...className={`px-3 py-1.5 rounded-lg text-[10px] font-black u...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 510: `rounded-lg` on `...} className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg...` -> interactive element -> should be rounded-xl
- Line 512: `rounded-lg` on `...} className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg...` -> interactive element -> should be rounded-xl
- Line 515: `rounded-lg` on `...ssName="ml-2 px-3 py-1.5 rounded-lg text-[10px] font-black u...` -> interactive element -> should be rounded-xl
- Line 526: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...border border-slate-200 p-5 rounded-2xl shadow-sm">...`
- Line 527: `text-[9px]` on `...<span className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 530: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...border border-slate-200 p-5 rounded-2xl shadow-sm">...`
- Line 531: `text-[9px]` on `...<span className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 534: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...border border-slate-200 p-5 rounded-2xl shadow-sm">...`
- Line 535: `text-[9px]` on `...<span className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 538: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...border border-slate-200 p-5 rounded-2xl shadow-sm">...`
- Line 539: `text-[9px]` on `...<span className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 542: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...border border-slate-200 p-5 rounded-2xl shadow-sm">...`
- Line 543: `text-[9px]` on `...<span className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 546: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...border border-slate-200 p-5 rounded-2xl shadow-sm re...`
- Line 548: `text-[9px]` on `...<span className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 552: `text-[9px]` on `...<p className="text-[9px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 559: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...border border-slate-200 p-5 rounded-2xl shadow-sm">...`
- Line 560: `text-[9px]` on `...<span className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 562: `text-[9px]` on `...<span className="text-[9px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 564: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...border border-slate-200 p-5 rounded-2xl shadow-sm">...`
- Line 565: `text-[9px]` on `...<span className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 567: `text-[9px]` on `...<span className="text-[9px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 569: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...border border-slate-200 p-5 rounded-2xl shadow-sm">...`
- Line 570: `text-[9px]` on `...<span className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 572: `text-[9px]` on `...<span className="text-[9px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 623: `text-[9px]` on `...<span className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 628: `text-[9px]` on `...<p className="text-[9px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 632: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...00 rounded-2xl shadow-sm p-5">...`
- Line 636: `text-[11px]` on `...<span className="text-[11px] font-bold text-slate-700...` -> should be `text-[10px]`
- Line 637: `text-[11px]` on `...<span className="text-[11px] font-mono font-black tex...` -> should be `text-[10px]`
- Line 642: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...00 rounded-2xl shadow-sm p-5">...`
- Line 646: `text-[11px]` on `...<span className="text-[11px] font-bold text-slate-700...` -> should be `text-[10px]`
- Line 647: `text-[11px]` on `...<span className="text-[11px] font-mono font-black tex...` -> should be `text-[10px]`
- Line 652: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...00 rounded-2xl shadow-sm p-5">...`
- Line 656: `text-[11px]` on `...<span className="text-[11px] font-bold text-slate-700...` -> should be `text-[10px]`
- Line 657: `text-[11px]` on `...<span className="text-[11px] font-mono font-black tex...` -> should be `text-[10px]`
- Line 676: `rounded-lg` on `...} className="px-3 py-1.5 rounded-lg text-[10px] font-black u...` -> interactive element -> should be rounded-xl
- Line 677: `rounded-lg` on `...} className="px-3 py-1.5 rounded-lg text-[10px] font-black u...` -> interactive element -> should be rounded-xl
- Line 721: `text-[11px]` on `...me="flex justify-between text-[11px] font-bold text-slate-600...` -> should be `text-[10px]`
- Line 741: `text-[9px]` on `...ustify-center gap-4 mt-4 text-[9px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 763: `text-[8px]` on `...me={`px-2 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 764: `text-[9px]` on `...<span className="text-[9px] font-mono text-slate-400...` -> should be `text-[10px]`
- Line 792: `text-[9px]` on `...acking-widest font-black text-[9px]">...` -> should be `text-[10px]`
- Line 793: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Type</th>...`
- Line 794: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Name</th>...`
- Line 795: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Deleted By</th>...`
- Line 796: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">When</th>...`
- Line 797: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">History</th>...`
- Line 806: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5">...`
- Line 807: `text-[8px]` on `...me={`px-2 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 809: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-black text-slate-80...`
- Line 810: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-bold text-slate-600...`
- Line 811: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-mono text-slate-500...`
- Line 812: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5">...`

### MedicalRecordsManager.tsx
**45 deviations**

- Line 346: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 347: `text-[11px]` on `...<h3 className="text-[11px] font-black text-indigo-6...` -> should be `text-[10px]`
- Line 382: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 383: `text-[11px]` on `...<h3 className="text-[11px] font-black text-indigo-6...` -> should be `text-[10px]`
- Line 389: `rounded-lg` on `...className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tr...` -> interactive element -> should be rounded-xl
- Line 400: `rounded-lg` on `...className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tr...` -> interactive element -> should be rounded-xl
- Line 411: `rounded-lg` on `...className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tr...` -> interactive element -> should be rounded-xl
- Line 425: `font-medium` on body text -> should be font-bold | `...ded-xl px-4 py-3 text-xs font-medium text-slate-800 focus:rin...`
- Line 436: `font-medium` on body text -> should be font-bold | `...ded-xl px-4 py-3 text-xs font-medium text-slate-800 focus:rin...`
- Line 468: `text-[9px]` on `...g-rose-100 text-rose-700 text-[9px] px-2 py-0.5 rounded-full...` -> should be `text-[10px]`
- Line 478: `rounded-lg` on `...order border-emerald-200 rounded-lg text-[10px] font-bold cu...` -> context-dependent -> verify manually (default rounded-xl)
- Line 494: `rounded-lg` on `...className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tr...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 506: `font-medium` on body text -> should be font-bold | `...ded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:rin...`
- Line 520: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 521: `text-[11px]` on `...<h3 className="text-[11px] font-black text-indigo-6...` -> should be `text-[10px]`
- Line 531: `font-medium` on body text -> should be font-bold | `...ded-xl px-4 py-3 text-xs font-medium text-slate-800 focus:rin...`
- Line 540: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 541: `text-[11px]` on `...<h3 className="text-[11px] font-black text-amber-60...` -> should be `text-[10px]`
- Line 576: `rounded-lg` on `...className={`px-4 py-1.5 rounded-lg text-[10px] font-bold tr...` -> interactive element -> should be rounded-xl
- Line 577: `rounded-lg` on `...className={`px-4 py-1.5 rounded-lg text-[10px] font-bold tr...` -> interactive element -> should be rounded-xl
- Line 588: `font-medium` on body text -> should be font-bold | `...ded-xl px-4 py-3 text-xs font-medium text-slate-800 focus:rin...`
- Line 619: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 620: `text-[11px]` on `...<h3 className="text-[11px] font-black text-indigo-6...` -> should be `text-[10px]`
- Line 706: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...assName="flex-1 bg-white p-5 rounded-2xl border borde...`
- Line 709: `font-medium` on body text -> should be font-bold | `...nter py-8 text-slate-400 font-medium text-xs border-2 border-...`
- Line 716: `font-medium` on micro-label/badge -> should be font-black | `...v className="text-[10px] font-medium text-indigo-700 mt-0.5">...`
- Line 721: `rounded-md` on `...Name="bg-white px-2 py-1 rounded-md text-[10px] font-black t...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 722: `rounded-lg` on `...-100 hover:text-rose-600 rounded-lg transition-colors cursor...` -> interactive element -> should be rounded-xl
- Line 773: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="bg-white p-5 rounded-2xl border borde...`
- Line 774: `text-[11px]` on `...<h3 className="text-[11px] font-black text-rose-600...` -> should be `text-[10px]`
- Line 843: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...assName="flex-1 bg-white p-5 rounded-2xl border borde...`
- Line 846: `text-[9px]` on `...<span className="text-[9px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 850: `font-medium` on body text -> should be font-bold | `...nter py-8 text-slate-400 font-medium text-xs border-2 border-...`
- Line 861: `font-medium` on micro-label/badge -> should be font-black | `...v className="text-[10px] font-medium text-slate-600 mb-1">...`
- Line 885: `font-extrabold` on body text -> should be font-bold | `...<h2 className="text-lg font-extrabold text-slate-800 flex item...`
- Line 888: `rounded-lg` on `...ppercase tracking-widest rounded-lg transition-all ${showQue...` -> interactive element -> should be rounded-xl
- Line 889: `rounded-lg` on `...ppercase tracking-widest rounded-lg transition-all ${!showQu...` -> interactive element -> should be rounded-xl
- Line 895: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-xs font-semibold text-slate-800 focus:out...`
- Line 924: `text-[8px]` on `...ald-100 text-emerald-700 text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 927: `text-[8px]` on `...amber-100 text-amber-700 text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 936: `font-medium` on micro-label/badge -> should be font-black | `...xt-[10px] text-slate-500 font-medium font-mono">{patient.owne...`
- Line 964: `rounded-lg` on `...className={`px-3 py-1.5 rounded-lg border text-[10px] font-...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 974: `rounded-lg` on `...className={`px-3 py-1.5 rounded-lg border text-[10px] font-...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 986: `rounded-3xl` on `...className="bg-slate-100 rounded-3xl border border-indigo-100...` -> context-dependent -> verify manually (default rounded-xl)
- Line 990: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="p-5 border-b border-slate-10...`

### BoardingManager.tsx
**43 deviations**

- Line 352: `text-[8px]` on `...00 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 353: `text-[8px]` on `...00 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 355: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 360: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 362: `font-medium` on micro-label/badge -> should be font-black | `...className={`text-[10px] font-medium ${selectedPatientId ===...`
- Line 372: `text-[9px]` on `...kdrop-blur-md text-white text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 386: `rounded-md` on `...racking-widest px-2 py-1 rounded-md shadow-sm ${isAdmission...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 386: `text-[8px]` on `...ge-${cage}`} className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 386: `bg-blue-500` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...-white text-rose-700' : 'bg-blue-500 text-white'}`}>{isAdmiss...`
- Line 387: `text-[8px]` on `...<span className="text-[8px] font-bold text-rose-100"...` -> should be `text-[10px]`
- Line 391: `rounded-md` on `...d text-white bg-black/25 rounded-md p-2 border border-white/...` -> context-dependent -> verify manually (default rounded-xl)
- Line 391: `text-[9px]` on `...tab-${cage}`} className="text-[9px] font-bold text-white bg-...` -> should be `text-[10px]`
- Line 394: `text-red-300` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...lassName={balance < 0 ? 'text-red-300 font-black' : 'text-emer...`
- Line 410: `text-[9px]` on `...ose-700 hover:bg-rose-50 text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 421: `font-extrabold` on body text -> should be font-bold | `...<h2 className="text-sm font-extrabold text-slate-800 tracking-...`
- Line 447: `rounded-md` on `...st bg-black/20 px-2 py-1 rounded-md backdrop-blur-sm border...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 453: `rounded-md` on `...te bg-black/20 px-2 py-1 rounded-md inline-block mt-2 border...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 455: `rounded-md` on `...50 bg-black/20 px-2 py-1 rounded-md inline-block mt-1 border...` -> context-dependent -> verify manually (default rounded-xl)
- Line 455: `text-[9px]` on `...lan-${cage}`} className="text-[9px] font-bold text-rose-50 b...` -> should be `text-[10px]`
- Line 497: `rounded-md` on `...bg-black/20 px-2.5 py-1 rounded-md backdrop-blur-sm border...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 503: `rounded-md` on `...te bg-black/20 px-2 py-1 rounded-md inline-block mb-3 border...` -> context-dependent -> verify manually (default rounded-xl)
- Line 505: `rounded-md` on `...50 bg-black/20 px-2 py-1 rounded-md inline-block mb-2 border...` -> context-dependent -> verify manually (default rounded-xl)
- Line 505: `text-[9px]` on `...lan-${cage}`} className="text-[9px] font-bold text-rose-50 b...` -> should be `text-[10px]`
- Line 539: `font-extrabold` on body text -> should be font-bold | `...<h3 className="text-sm font-extrabold text-slate-500">Select a...`
- Line 540: `font-medium` on body text -> should be font-bold | `...<p className="text-xs font-medium mt-1 text-slate-400">Cho...`
- Line 593: `font-medium` on micro-label/badge -> should be font-black | `...p className="text-[10px] font-medium text-slate-400">For plan...`
- Line 661: `font-semibold` on body text -> should be font-bold | `...: 2 })} <span className="font-semibold text-emerald-600">(stand...`
- Line 662: `font-semibold` on body text -> should be font-bold | `...text-xs text-emerald-700 font-semibold mt-1">All charges will r...`
- Line 669: `font-semibold` on body text -> should be font-bold | `...="text-xs text-amber-700 font-semibold leading-relaxed">Booking...`
- Line 687: `rounded-3xl` on `...<div className="bg-white rounded-3xl p-6 max-w-sm w-full text...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 692: `font-semibold` on body text -> should be font-bold | `...="text-slate-500 text-xs font-semibold mt-2 px-2">System protoc...`
- Line 712: `rounded-3xl` on `...<div className="bg-white rounded-3xl p-6 max-w-md w-full spac...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 714: `bg-orange-100` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-...`
- Line 714: `text-orange-600` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `..."w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl flex items-c...`
- Line 764: `bg-orange-600` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...className="flex-[2] py-3 bg-orange-600 hover:bg-orange-700 text...`
- Line 764: `bg-orange-700` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...py-3 bg-orange-600 hover:bg-orange-700 text-white font-black ro...`
- Line 780: `rounded-3xl` on `...<div className="bg-white rounded-3xl p-6 max-w-sm w-full text...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 785: `font-semibold` on body text -> should be font-bold | `...="text-slate-500 text-xs font-semibold mt-2 px-2">Settle the ac...`
- Line 789: `font-semibold` on body text -> should be font-bold | `...etween"><span className="font-semibold text-slate-500">Deposit...`
- Line 790: `font-semibold` on body text -> should be font-bold | `...etween"><span className="font-semibold text-slate-500">Charges...`
- Line 795: `text-red-600` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...an className="font-black text-red-600">Collect additional</spa...`
- Line 795: `text-red-600` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...an className="font-black text-red-600">Collect additional</spa...`
- Line 813: `rounded-3xl` on `...<div className="bg-white rounded-3xl p-6 max-w-md w-full spac...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card

### LaboratoryManager.tsx
**37 deviations**

- Line 231: `text-[8px]` on `...00 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 232: `text-[8px]` on `...00 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 234: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 239: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 241: `font-medium` on micro-label/badge -> should be font-black | `...className={`text-[10px] font-medium ${selectedPatientId ===...`
- Line 255: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="p-5 border-b border-slate-10...`
- Line 260: `rounded-lg` on `...border border-slate-200 rounded-lg p-0.5 shadow-xs">...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 261: `rounded-md` on `...ppercase tracking-widest rounded-md transition-colors ${show...` -> interactive element -> should be rounded-xl
- Line 261: `text-[9px]` on `...)} className={`px-3 py-1 text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 262: `rounded-md` on `...ppercase tracking-widest rounded-md transition-colors ${!sho...` -> interactive element -> should be rounded-xl
- Line 262: `text-[9px]` on `...)} className={`px-3 py-1 text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 270: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-xs font-semibold focus:outline-none focus...`
- Line 288: `text-[8px]` on `...me={`px-2 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 291: `font-semibold` on micro-label/badge -> should be font-black | `...className={`text-[10px] font-semibold mt-2 pt-2 border-t flex...`
- Line 338: `font-medium` on body text -> should be font-bold | `...xt-xs text-rose-600 mt-2 font-medium">Go to Inventory Manager...`
- Line 349: `text-[8px]` on `...slate-100 text-slate-500 text-[8px] font-black px-1.5 py-0.5...` -> should be `text-[10px]`
- Line 350: `text-[8px]` on `...slate-100 text-slate-500 text-[8px] font-black px-1.5 py-0.5...` -> should be `text-[10px]`
- Line 370: `text-[9px]` on `...acking-widest font-black text-[9px]">...` -> should be `text-[10px]`
- Line 371: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Request Date</th>...`
- Line 372: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Diagnostic Test</th>...`
- Line 373: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5">Status</th>...`
- Line 374: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<th className="py-4 px-5 text-right">Action</th>...`
- Line 383: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-bold text-slate-600...`
- Line 384: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 font-black text-slate-80...`
- Line 385: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5">...`
- Line 386: `rounded-md` on `...className={`px-2.5 py-1 rounded-md text-[9px] font-black up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 386: `text-[9px]` on `...{`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 390: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<td className="py-4 px-5 text-right">...`
- Line 392: `rounded-lg` on `...bg-indigo-700 text-white rounded-lg text-[10px] font-black u...` -> interactive element -> should be rounded-xl
- Line 396: `rounded-lg` on `...slate-200 text-slate-700 rounded-lg text-[10px] font-black u...` -> interactive element -> should be rounded-xl
- Line 415: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-slate-200...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 420: `text-[11px]` on `...<p className="text-[11px] text-indigo-600 font-bla...` -> should be `text-[10px]`
- Line 427: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...er-slate-200 rounded-2xl p-5">...`
- Line 434: `text-[9px]` on `...<span className="text-[9px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 442: `rounded-lg` on `...`w-full px-3 py-2 border rounded-lg text-sm font-bold font-m...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 460: `font-semibold` on body text -> should be font-bold | `...rder rounded-2xl text-xs font-semibold focus:outline-none resiz...`
- Line 468: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Modal(false)} className="px-5 py-2.5 border border-sla...`

### InventoryManager.tsx
**36 deviations**

- Line 19: `bg-blue-50` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...ail & Supplies', color: 'bg-blue-50 text-blue-700' },...`
- Line 19: `text-blue-700` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...ies', color: 'bg-blue-50 text-blue-700' },...`
- Line 22: `bg-purple-50` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...nical Services', color: 'bg-purple-50 text-purple-700' },...`
- Line 22: `text-purple-700` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...s', color: 'bg-purple-50 text-purple-700' },...`
- Line 24: `bg-orange-50` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...Food & Feeding', color: 'bg-orange-50 text-orange-700' }...`
- Line 24: `text-orange-700` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...g', color: 'bg-orange-50 text-orange-700' }...`
- Line 318: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...ick={openNew} className="px-5 py-2.5 bg-indigo-600 hov...`
- Line 352: `text-[8px]` on `...g-rose-100 text-rose-600 text-[8px] px-1.5 py-0.5 rounded up...` -> should be `text-[10px]`
- Line 411: `text-[8px]` on `...digo-100 text-indigo-600 text-[8px] px-1.5 py-0.5 rounded fl...` -> should be `text-[10px]`
- Line 421: `text-[9px]` on `...<div className="mt-1 text-[9px] font-black text-amber-60...` -> should be `text-[10px]`
- Line 427: `rounded-lg` on `...className={`px-2.5 py-1 rounded-lg text-[9px] font-black up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 427: `text-[9px]` on `...{`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 433: `text-[9px]` on `...<div className="text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 441: `text-[9px]` on `....stock} <span className="text-[9px] opacity-70 ml-0.5 upperc...` -> should be `text-[10px]`
- Line 443: `text-[8px]` on `...sLow && <span className="text-[8px] font-black text-rose-500...` -> should be `text-[10px]`
- Line 444: `text-[8px]` on `...red' && <span className="text-[8px] font-black text-rose-600...` -> should be `text-[10px]`
- Line 445: `text-[8px]` on `...oon' && <span className="text-[8px] font-black text-amber-60...` -> should be `text-[10px]`
- Line 453: `rounded-lg` on `...digo-100 text-indigo-700 rounded-lg transition-colors text-[...` -> interactive element -> should be rounded-xl
- Line 477: `text-[9px]` on `...<th className="px-4 py-2 text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 478: `text-[9px]` on `...<th className="px-4 py-2 text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 479: `text-[9px]` on `...<th className="px-4 py-2 text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 480: `text-[9px]` on `...<th className="px-4 py-2 text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 493: `text-[8px]` on `...g-rose-100 text-rose-600 text-[8px] px-1.5 py-0.5 rounded up...` -> should be `text-[10px]`
- Line 494: `text-[8px]` on `...amber-100 text-amber-600 text-[8px] px-1.5 py-0.5 rounded up...` -> should be `text-[10px]`
- Line 519: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-slate-200...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 568: `text-[8px]` on `...<p className="text-[8px] font-bold text-amber-600...` -> should be `text-[10px]`
- Line 596: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...r-indigo-100 rounded-2xl p-5 animate-fade-in shadow-i...`
- Line 600: `text-[9px]` on `...<p className="text-[9px] font-bold text-indigo-60...` -> should be `text-[10px]`
- Line 602: `rounded-lg` on `...bg-indigo-700 text-white rounded-lg text-[10px] font-black u...` -> interactive element -> should be rounded-xl
- Line 620: `rounded-lg` on `...border border-slate-200 rounded-lg text-xs font-bold text-s...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 627: `rounded-lg` on `...border border-slate-200 rounded-lg text-xs font-mono font-b...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 634: `rounded-lg` on `...border border-slate-200 rounded-lg text-xs font-mono font-b...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 639: `rounded-lg` on `...ose-600 hover:bg-rose-50 rounded-lg transition-colors cursor...` -> context-dependent -> verify manually (default rounded-xl)
- Line 654: `font-semibold` on micro-label/badge -> should be font-black | `...p className="text-[10px] font-semibold text-indigo-700 mt-1 lea...`
- Line 675: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-slate-200...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 712: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-slate-200...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card

### SystemSettings.tsx
**33 deviations**

- Line 125: `bg-blue-100` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...cashier') avatarColor = 'bg-blue-100 text-blue-700 border-blu...`
- Line 125: `text-blue-700` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...atarColor = 'bg-blue-100 text-blue-700 border-blue-200';...`
- Line 125: `border-blue-200` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...g-blue-100 text-blue-700 border-blue-200';...`
- Line 374: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...ssName="grid grid-cols-2 gap-5">...`
- Line 402: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...ssName="grid grid-cols-2 gap-5">...`
- Line 420: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...ssName="grid grid-cols-2 gap-5">...`
- Line 447: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...ssName="grid grid-cols-2 gap-5">...`
- Line 477: `text-blue-500` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...<Lock className="w-4 h-4 text-blue-500" /> Access Control & Reg...`
- Line 480: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...dStaff(true)} className="px-5 py-2.5 bg-indigo-600 hov...`
- Line 489: `text-[9px]` on `...<span className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 491: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="p-5 text-center flex-1 flex...`
- Line 492: `rounded-lg` on `...e-50 hover:text-rose-500 rounded-lg transition-colors cursor...` -> interactive element -> should be rounded-xl
- Line 501: `bg-blue-50` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...0 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blu...`
- Line 501: `text-blue-700` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...erald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>...`
- Line 501: `border-blue-100` -> unify onto `sky` (measured 3x more common for informational role, see DESIGN_SYSTEM.md) | `...bg-blue-50 text-blue-700 border-blue-100'}`}>...`
- Line 528: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...wnloadBackup} className="p-5 bg-gradient-to-br from-i...`
- Line 534: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...ackupTrigger} className="p-5 bg-gradient-to-br from-a...`
- Line 548: `text-[9px]` on `...<span className="text-[9px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 554: `text-[9px]` on `...<span className="text-[9px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 561: `text-[9px]` on `...<span className="text-[9px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 575: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...der-rose-100 rounded-2xl p-5 flex flex-col md:flex-ro...`
- Line 585: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...der-rose-100 rounded-2xl p-5 flex flex-col md:flex-ro...`
- Line 769: `font-medium` on micro-label/badge -> should be font-black | `...p className="text-[10px] font-medium text-slate-400 mt-1">Fla...`
- Line 782: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-slate-200...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 802: `text-[9px]` on `...<th className="px-4 py-3 text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 803: `text-[9px]` on `...<th className="px-4 py-3 text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 804: `text-[9px]` on `...<th className="px-4 py-3 text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 805: `text-[9px]` on `...<th className="px-4 py-3 text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 806: `text-[9px]` on `...<th className="px-4 py-3 text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 807: `text-[9px]` on `...<th className="px-4 py-3 text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 818: `text-[9px]` on `...<td className="px-4 py-2 text-[9px] uppercase tracking-wider...` -> should be `text-[10px]`
- Line 848: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-slate-200...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 854: `rounded-lg` on `...slate-200 text-slate-400 rounded-lg transition-colors cursor...` -> interactive element -> should be rounded-xl

### GroomingManager.tsx
**27 deviations**

- Line 300: `text-[8px]` on `...00 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 301: `text-[8px]` on `...00 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 303: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 308: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 310: `font-medium` on micro-label/badge -> should be font-black | `...className={`text-[10px] font-medium ${selectedPatientId ===...`
- Line 326: `font-extrabold` on body text -> should be font-bold | `...<h2 className="text-sm font-extrabold text-slate-800 tracking-...`
- Line 334: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-xs font-semibold focus:outline-none focus...`
- Line 347: `font-extrabold` on body text -> should be font-bold | `...<div className="font-extrabold truncate text-sm text-sl...`
- Line 362: `font-extrabold` on body text -> should be font-bold | `...<h3 className="text-sm font-extrabold text-slate-500">Select a...`
- Line 363: `font-medium` on body text -> should be font-bold | `...<p className="text-xs font-medium mt-1 text-slate-400">Cho...`
- Line 389: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...er-slate-200 rounded-2xl p-5 shadow-sm">...`
- Line 403: `rounded-md` on `...<div className={`w-5 h-5 rounded-md flex items-center justif...` -> context-dependent -> verify manually (default rounded-xl)
- Line 439: `rounded-lg` on `...ose-50 hover:bg-rose-100 rounded-lg transition-colors">Clear...` -> interactive element -> should be rounded-xl
- Line 446: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...er-slate-200 rounded-2xl p-5 shadow-sm h-fit">...`
- Line 459: `rounded-md` on `...<div className={`w-5 h-5 rounded-md flex items-center justif...` -> context-dependent -> verify manually (default rounded-xl)
- Line 472: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...r-indigo-200 rounded-2xl p-5 flex items-center justif...`
- Line 475: `font-semibold` on body text -> should be font-bold | `..."text-xs text-indigo-700 font-semibold mt-1">Selected services...`
- Line 496: `text-[9px]` on `...racking-widest font-bold text-[9px]">...` -> should be `text-[10px]`
- Line 534: `text-[9px]` on `...sName="px-2 py-1 rounded text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 539: `text-[9px]` on `...sName="px-2 py-1 rounded text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 545: `text-[9px]` on `...sName="px-2 py-1 rounded text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 549: `rounded-lg` on `...00 text-[10px] font-bold rounded-lg transition-colors border...` -> interactive element -> should be rounded-xl
- Line 568: `rounded-3xl` on `...<div className="bg-white rounded-3xl shadow-2xl w-full max-w-...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 573: `font-medium` on body text -> should be font-bold | `...<p className="text-sm font-medium text-amber-800 mt-2">No...`
- Line 576: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Modal(false)} className="px-5 py-2.5 text-xs font-bold...`
- Line 577: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Finalization} className="px-5 py-2.5 bg-amber-600 hove...`
- Line 587: `rounded-lg` on `..."border border-slate-200 rounded-lg w-full md:w-[400px]" />...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)

### ShiftManager.tsx
**25 deviations**

- Line 245: `font-extrabold` on body text -> should be font-bold | `...<h2 className="text-lg font-extrabold text-slate-800 tracking-...`
- Line 256: `font-extrabold` on micro-label/badge -> should be font-black | `...0 rounded-xl text-[10px] font-extrabold shadow-xs flex items-cen...`
- Line 257: `rounded-md` on `...me="bg-white px-2 py-0.5 rounded-md border border-indigo-100...` -> context-dependent -> verify manually (default rounded-xl)
- Line 273: `font-semibold` on body text -> should be font-bold | `...<p className="text-xs font-semibold text-slate-500 mt-1">Ent...`
- Line 299: `font-semibold` on body text -> should be font-bold | `..."text-xs text-indigo-900 font-semibold mt-0.5">Opened at {new D...`
- Line 302: `text-[9px]` on `...<p className="text-[9px] text-indigo-500 font-bol...` -> should be `text-[10px]`
- Line 311: `text-[9px]` on `...<p className="text-[9px] font-black text-emerald-...` -> should be `text-[10px]`
- Line 316: `text-[9px]` on `...<p className="text-[9px] font-black text-sky-700...` -> should be `text-[10px]`
- Line 319: `bg-violet-50` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...<div className="bg-violet-50 border border-violet-200...`
- Line 319: `border-violet-200` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...ame="bg-violet-50 border border-violet-200 rounded-xl p-4 text-cent...`
- Line 320: `text-violet-600` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...ding2 className="w-5 h-5 text-violet-600 mx-auto mb-2" />...`
- Line 321: `text-[9px]` on `...<p className="text-[9px] font-black text-violet-7...` -> should be `text-[10px]`
- Line 321: `text-violet-700` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...e="text-[9px] font-black text-violet-700 uppercase tracking-wides...`
- Line 322: `text-violet-900` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...-xl font-black font-mono text-violet-900 mt-1">{formatCurrency(dr...`
- Line 327: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...bg-slate-900 rounded-2xl p-5 text-white">...`
- Line 334: `text-yellow-300` OFF-PALETTE COLOR -> WRONG SEMANTIC, remap to indigo/emerald/amber/rose/sky/slate | `...pt-2 text-sm font-black text-yellow-300"><span>= Expected Drawer...`
- Line 336: `text-[9px]` on `...ify-between items-center text-[9px] text-slate-500 uppercase...` -> should be `text-[10px]`
- Line 350: `rounded-lg` on `...border border-slate-100 rounded-lg flex justify-between ite...` -> context-dependent -> verify manually (default rounded-xl)
- Line 352: `text-[8px]` on `...={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${a...` -> should be `text-[10px]`
- Line 353: `font-semibold` on body text -> should be font-bold | `...<span className="ml-2 font-semibold text-slate-700">{adj.rea...`
- Line 365: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...er-slate-300 rounded-2xl p-5 space-y-4">...`
- Line 394: `rounded-3xl` on `...<div className="bg-white rounded-3xl shadow-2xl w-full max-w-...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 401: `rounded-lg` on `...ppercase tracking-widest rounded-lg transition-all cursor-po...` -> interactive element -> should be rounded-xl
- Line 402: `rounded-lg` on `...ppercase tracking-widest rounded-lg transition-all cursor-po...` -> interactive element -> should be rounded-xl
- Line 431: `font-semibold` on body text -> should be font-bold | `...w-full px-4 py-3 text-xs font-semibold text-slate-800 bg-slate-...`

### POSRegister.tsx
**21 deviations**

- Line 391: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="p-5 border-b border-slate-10...`
- Line 415: `rounded-lg` on `...border border-indigo-200 rounded-lg text-[10px] font-bold te...` -> interactive element -> should be rounded-xl
- Line 439: `rounded-lg` on `...border border-slate-200 rounded-lg overflow-hidden shadow-i...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 447: `rounded-lg` on `...-100 hover:text-rose-600 rounded-lg transition-colors cursor...` -> interactive element -> should be rounded-xl
- Line 457: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...order-t border-slate-200 p-5 shrink-0 shadow-[0_-10px...`
- Line 479: `rounded-lg` on `...lassName={`flex-1 py-1.5 rounded-lg text-[10px] font-black u...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 488: `rounded-lg` on `...lassName={`flex-1 py-1.5 rounded-lg text-[10px] font-black u...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 537: `text-[11px]` on `...ppercase tracking-widest text-[11px] flex items-center justif...` -> should be `text-[10px]`
- Line 548: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="p-5 border-b border-slate-10...`
- Line 559: `font-medium` on micro-label/badge -> should be font-black | `...0px] text-slate-500 mt-2 font-medium">...`
- Line 577: `text-[9px]` on `...<div className="text-[9px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 582: `text-[9px]` on `...<div className={`text-[9px] font-bold ${item.stock <...` -> should be `text-[10px]`
- Line 602: `text-[9px]` on `...<h4 className="text-[9px] font-bold text-slate-500...` -> should be `text-[10px]`
- Line 622: `text-[8px]` on `...00 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 623: `text-[8px]` on `...00 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 625: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 630: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 635: `text-[9px]` on `...<div className={`text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 649: `text-[9px]` on `...<h4 className="text-[9px] font-bold text-slate-500...` -> should be `text-[10px]`
- Line 667: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 674: `text-[9px]` on `...<div className={`text-[9px] font-black uppercase tra...` -> should be `text-[10px]`

### DashboardAnalytics.tsx
**19 deviations**

- Line 233: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...dow-sm flex items-center gap-5">...`
- Line 245: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...dow-sm flex items-center gap-5">...`
- Line 257: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...dow-sm flex items-center gap-5">...`
- Line 269: `gap-5` -> should be gap-4 or gap-6 (nearest canonical) | `...dow-sm flex items-center gap-5">...`
- Line 286: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="p-5 border-b border-slate-10...`
- Line 292: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...-y-auto custom-scrollbar p-5 space-y-3">...`
- Line 318: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...00 rounded-2xl shadow-sm p-5 shrink-0">...`
- Line 331: `text-[9px]` on `...bg-slate-800 text-white text-[9px] font-bold px-2 py-1 roun...` -> should be `text-[10px]`
- Line 335: `text-[8px]` on `...<div className="text-[8px] font-bold text-slate-400...` -> should be `text-[10px]`
- Line 356: `text-[9px]` on `...<div className="text-[9px] font-bold text-slate-500...` -> should be `text-[10px]`
- Line 374: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...<div className="p-5 border-b border-slate-10...`
- Line 382: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...-y-auto custom-scrollbar p-5 space-y-3">...`
- Line 401: `text-[9px]` on `...g-rose-100 text-rose-700 text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 402: `text-[9px]` on `...amber-100 text-amber-700 text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 405: `text-[9px]` on `...<div className="text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 412: `rounded-lg` on `...ppercase tracking-widest rounded-lg shadow-xs">Active</span>...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 412: `text-[9px]` on `...ald-100 text-emerald-700 text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 413: `rounded-lg` on `...ppercase tracking-widest rounded-lg shadow-xs">Scheduled</sp...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 413: `text-[9px]` on `...bg-sky-100 text-sky-700 text-[9px] font-black uppercase tra...` -> should be `text-[10px]`

### InvoicesManager.tsx
**16 deviations**

- Line 153: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...Name={`whitespace-nowrap px-5 py-2 rounded-xl text-[10...`
- Line 232: `text-[9px]` on `...<div className="text-[9px] font-black text-slate-40...` -> should be `text-[10px]`
- Line 237: `rounded-lg` on `...an className={`px-3 py-1 rounded-lg text-[9px] font-black up...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 237: `text-[9px]` on `...e={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 247: `rounded-lg` on `...r:bg-indigo-50 font-bold rounded-lg text-[10px] uppercase tr...` -> interactive element -> should be rounded-xl
- Line 268: `rounded-lg` on `...className={`p-2 rounded-lg border transition-all ${...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 278: `rounded-lg` on `...className={`p-2 rounded-lg border transition-all ${...` -> card-like container -> should be rounded-2xl (or rounded-3xl if this is a modal shell -- verify)
- Line 290: `rounded-3xl` on `...<div className="bg-white rounded-3xl border border-slate-200...` -> likely a Modal shell (canonical role, see DESIGN_SYSTEM.md) -- confirm this is a real modal panel wrapper, not a stray card
- Line 296: `text-[9px]` on `...<p className="text-[9px] font-bold text-slate-500...` -> should be `text-[10px]`
- Line 315: `font-semibold` on body text -> should be font-bold | `...<p className="text-xs font-semibold text-slate-500 mt-1">{sy...`
- Line 316: `font-semibold` on body text -> should be font-bold | `...<p className="text-xs font-semibold text-slate-500">{systemC...`
- Line 323: `font-semibold` on body text -> should be font-bold | `...petName && <p className="font-semibold text-slate-600 text-xs m...`
- Line 328: `font-semibold` on body text -> should be font-bold | `...<p className="font-mono font-semibold text-slate-500 text-xs m...`
- Line 349: `font-semibold` on micro-label/badge -> should be font-black | `...v className="text-[10px] font-semibold text-slate-400">@ {curre...`
- Line 392: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...={handleVoid} className="px-5 py-2.5 bg-white border b...`
- Line 396: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...<div className="px-5 py-2.5 bg-slate-200 text...`

### NotificationsModal.tsx
**16 deviations**

- Line 63: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...="lg:col-span-6 bg-white p-5 rounded-2xl border borde...`
- Line 68: `font-extrabold` on body text -> should be font-bold | `...<h4 className="text-base font-extrabold text-slate-800 flex item...`
- Line 74: `rounded-lg` on `...00 text-[10px] font-bold rounded-lg">...` -> context-dependent -> verify manually (default rounded-xl)
- Line 88: `text-[9px]` on `...<span className="text-[9px] font-mono font-bold uppe...` -> should be `text-[10px]`
- Line 91: `font-semibold` on body text -> should be font-bold | `...<p className="font-semibold leading-relaxed text-xs"...`
- Line 92: `text-[9px]` on `...<span className="text-[9px] font-medium font-mono bl...` -> should be `text-[10px]`
- Line 92: `font-medium` on micro-label/badge -> should be font-black | `...an className="text-[9px] font-medium font-mono block mt-1.5 o...`
- Line 99: `rounded-lg` on `...00 hover:bg-slate-100/50 rounded-lg cursor-pointer transitio...` -> context-dependent -> verify manually (default rounded-xl)
- Line 114: `font-medium` on body text -> should be font-bold | `...digo-100 text-indigo-950 font-medium rounded-xl flex gap-3 mt...`
- Line 124: `p-5` -> should be p-4 or p-6 (nearest canonical) | `...="lg:col-span-6 bg-white p-5 rounded-2xl border borde...`
- Line 128: `font-extrabold` on body text -> should be font-bold | `...<h4 className="text-base font-extrabold text-slate-800 flex item...`
- Line 134: `rounded-lg` on `...50 text-[10px] font-bold rounded-lg font-mono">...` -> context-dependent -> verify manually (default rounded-xl)
- Line 148: `text-[9px]` on `...-500 font-mono font-bold text-[9px] rounded uppercase">...` -> should be `text-[10px]`
- Line 153: `font-medium` on body text -> should be font-bold | `...late-600 leading-relaxed font-medium">{notif.message}</p>...`
- Line 169: `text-[11px]` on `...hadow-xs active:scale-95 text-[11px]"...` -> should be `text-[10px]`
- Line 175: `rounded-lg` on `...0px] font-bold uppercase rounded-lg flex items-center gap-1"...` -> badge/pill -> should be bare `rounded` (see Pill radius note)

### VaccinationsManager.tsx
**13 deviations**

- Line 114: `text-[8px]` on `...00 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 115: `text-[8px]` on `...00 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 117: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 122: `text-[8px]` on `...<div className={`text-[8px] font-black uppercase tra...` -> should be `text-[10px]`
- Line 124: `font-medium` on micro-label/badge -> should be font-black | `...className={`text-[10px] font-medium ${selectedPatientId ===...`
- Line 141: `font-extrabold` on body text -> should be font-bold | `...<h2 className="text-sm font-extrabold text-slate-800 tracking-...`
- Line 150: `font-semibold` on body text -> should be font-bold | `...e-200 rounded-xl text-xs font-semibold focus:outline-none focus...`
- Line 163: `font-extrabold` on body text -> should be font-bold | `...<div className="font-extrabold truncate text-sm text-sl...`
- Line 178: `font-extrabold` on body text -> should be font-bold | `...<h3 className="text-sm font-extrabold text-slate-500">Select a...`
- Line 179: `font-medium` on body text -> should be font-bold | `...<p className="text-xs font-medium mt-1 text-slate-400">Vie...`
- Line 205: `font-extrabold` on body text -> should be font-bold | `...<div className="text-xs font-extrabold text-slate-800 leading-t...`
- Line 212: `rounded-lg` on `...ame={`mt-3 w-full py-1.5 rounded-lg text-[10px] font-black u...` -> badge/pill -> should be bare `rounded` (see Pill radius note)
- Line 230: `text-[9px]` on `...racking-widest font-bold text-[9px]">...` -> should be `text-[10px]`

### Toast.tsx
**3 deviations**

- Line 55: `px-5` -> should be px-4 or px-6 (nearest canonical) | `...flex items-center gap-3 px-5 py-4 rounded-2xl shadow-...`
- Line 70: `font-semibold` on body text -> should be font-bold | `...<span className="font-semibold text-[15px] text-slate-1...`
- Line 76: `font-medium` on body text -> should be font-bold | `...<span className="font-medium text-[13px] text-slate-3...`

### PhoneInput.tsx
**1 deviations**

- Line 40: `font-medium` on body text -> should be font-bold | `...ndigo-500 transition-all font-medium text-sm text-slate-700 p...`
## Remaining exceptions

All remaining instances of `rounded-3xl` are legitimate exceptions as they serve as canonical Modal panel shells or modal-like full-page centered dialogs. The complete list of files retaining `rounded-3xl` for this purpose is:

- src/App.tsx (Login dialog and Welcome panel)
- src/components/AppointmentsManager.tsx (Add/Edit and Details modals)
- src/components/BoardingManager.tsx (Admission/Discharge modals)
- src/components/CustomersManager.tsx (Add/Edit Client/Pet modals)
- src/components/GroomingManager.tsx (Instructions modal)
- src/components/InventoryManager.tsx (Add Item, Adjust Stock modals)
- src/components/InvoicesManager.tsx (Receipt modal)
- src/components/LaboratoryManager.tsx (Lab Result modal)
- src/components/MedicalRecordsManager.tsx (Medical Record fullscreen modal)
- src/components/PatientPortal.tsx (Add History Entry modal)
- src/components/ShiftManager.tsx (Drawer Adjustment modal)
- src/components/SystemSettings.tsx (Settings and User modals)
- src/components/ui/Modal.tsx (Canonical Modal primitive)

All occurrences of `rounded-lg`, `rounded-md`, `text-[8px]`, `text-[9px]`, `text-[11px]`, `font-medium`, `font-semibold`, and `font-extrabold` have been reduced to zero.
