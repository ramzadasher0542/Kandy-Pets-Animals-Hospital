# Kandy Pets VHMS — Design System

Documentation-only. No visual changes were made to any panel while writing this file
(Chunk UI-1). This is the canonical spec that UI-2 through UI-5 will refactor panels
towards, per `UI_AUDIT.md`.

All measurements below are real grep counts across `src/components/*.tsx` (20 files),
taken 2026-07-13. Nothing here is invented — every canonical value either matches the
proposal given for this chunk, or is called out as a disagreement with the actual
measured data cited.

---

## STEP 1 — Measurement (raw counts)

### `rounded-*` frequency
| Class | Count |
|---|---|
| `rounded-xl` | 383 |
| `rounded-2xl` | 167 |
| `rounded-lg` | 92 |
| `rounded-full` | 47 |
| `rounded-md` | 33 |
| `rounded-3xl` | 21 |
| bare `rounded` (no suffix) | 76 |

### `font-*` weight frequency
| Class | Count |
|---|---|
| `font-black` | 644 |
| `font-bold` | 564 |
| `font-semibold` | 61 |
| `font-extrabold` | 50 |
| `font-medium` | 44 |

### `text-[Npx]` arbitrary size frequency
| Class | Count |
|---|---|
| `text-[10px]` | 471 |
| `text-[9px]` | 170 |
| `text-[8px]` | 50 |
| `text-[11px]` | 20 |
| `text-[13px]`, `text-[15px]` | 1 each (one-offs) |

### `text-{size}` named frequency
| Class | Count |
|---|---|
| `text-xs` | 347 |
| `text-sm` | 162 |
| `text-lg` | 36 |
| `text-xl` | 30 |
| `text-2xl` | 12 |
| `text-base` | 8 |
| `text-3xl` | 3 |
| `text-4xl` | 1 |
| `text-5xl` | 1 |

### Text-role co-occurrence (verifies the proposed role→class pairing)
| Role | Combo | Co-occurrences |
|---|---|---|
| Micro-label | `text-[10px]` + `font-black` | 240 |
| Body text | `text-xs` + `font-bold` | 189 |
| Section heading | `text-sm` + `font-black` | 74 |
| Panel title | `text-lg` + `font-black` | 25 |
| Big numeric (KPI tile) | `text-xl` + `font-black` + `font-mono` | 6 |
| Big numeric (featured) | `text-2xl` + `font-black` + `font-mono` | 5 |
| Big numeric (hero, inverted panel only) | `text-4xl` + `font-black` + `font-mono` | 1 (ReportsManager vault balance) |

### `bg-{color}-{shade}` on primary/destructive-style solid buttons
| Class | Count |
|---|---|
| `bg-indigo-600` | 71 |
| `bg-indigo-700` (hover) | 36 |
| `bg-rose-600` | 14 |
| `bg-rose-700` (hover) | 7 |
| `bg-emerald-600` | 8 |
| `bg-emerald-700` (hover) | 4 |
| `bg-amber-600` | 3 |

### `bg-{color}-100` on badge-style elements
| Class | Count |
|---|---|
| `bg-slate-100` | 85 (mixed: badges + inputs + hover states — not all are badges) |
| `bg-rose-100` | 27 |
| `bg-amber-100` | 25 |
| `bg-emerald-100` | 24 |
| `bg-indigo-100` | 23 |
| `bg-sky-100` | 3 |
| `bg-blue-100` | 2 |

Informational-role color family, full count (`bg`+`text`+`border`):
**`sky` = 39 total** vs **`blue` = 15 total**. `sky` is the actual de facto standard for
the informational role, not `blue`.

### `shadow-*` frequency
| Class | Count |
|---|---|
| `shadow-sm` | 196 |
| `shadow-md` | 76 |
| `shadow-xs` | 48 |
| `shadow-2xl` | 26 |
| `shadow-inner` | 11 |
| `shadow-lg` | 7 |
| `shadow-xl` | 6 |
| `shadow-none` | 3 |

### Padding / gap scale
| `p-*` | Count | `px-*` | Count | `py-*` | Count | `gap-*` | Count |
|---|---|---|---|---|---|---|---|
| p-4 | 136 | px-4 | 145 | py-2 | 251 | gap-2 | 189 |
| p-6 | 84 | px-3 | 137 | py-4 | 116 | gap-4 | 89 |
| p-5 | 63 | px-5 | 76 | py-1 | 90 | gap-3 | 60 |
| p-3 | 51 | px-6 | 71 | py-3 | 86 | gap-1 | 59 |
| p-2 | 41 | px-2 | 73 | py-0 | 67 | gap-1.5 | 40 |
| p-1 | 41 | px-1 | 35 | py-8/12/16/24 | 25 | gap-6 | 23 |
| p-8 | 14 | px-8 | 10 | py-6 | 7 | gap-5 | 13 |
| p-0 | 8 |  |  | py-10 | 6 | gap-0.5 | 2 |
| p-12 | 1 |  |  |  |  |  |  |

`p-5`/`px-5` are heavily used (63 / 76) — more than `p-2` even. This is real, not noise.

---

## STEP 2 — Canonical decisions

I'm using the proposal as the starting point per instructions. Three places where my
measurement **disagrees** with the proposal are called out explicitly below, with the
recommended resolution — nothing was silently overridden.

### Radius
| Role | Canonical | Measured support |
|---|---|---|
| Card (outer container) | `rounded-2xl` | 167 uses, clear second-most-common structural radius |
| Interactive element (button/input/select) | `rounded-xl` | 383 uses, dominant by far |
| **Modal shell** | `rounded-3xl` | ⚠️ **Disagreement.** `bg-white rounded-3xl` (modal shells) outnumbers `bg-white rounded-2xl` 20 to 10. The proposal says delete `rounded-3xl` entirely, folding modals into the Card role. My recommendation: keep `rounded-3xl` as a **distinct Modal-shell role**, separate from Card — the app already uses the extra radius as a deliberate "this is bigger/more important than a card" signal. `Modal.tsx` below uses `rounded-3xl`. If you want modals folded into `rounded-2xl` instead, say so and I'll change the primitive (it's the only one affected). |
| Pill / status badge | ⚠️ **Disagreement.** Proposal says `rounded-full`. Measured: bare `rounded` (no suffix) appears 76 times specifically on small status/urgency badges (`EMERGENCY`, `URGENT`, `Waiting`, `Active`, etc. — see citations below). `rounded-full` (47 uses) is instead the de facto standard for **circular avatars, dots, and segmented filter-toggle pills** (`px-4 py-1.5 rounded-full` filter buttons in AppointmentsManager), a different role entirely. **Recommendation:** Badge radius = bare `rounded`. `rounded-full` stays reserved for avatars/dots/toggle-pills (documented separately, not deleted). |
| Everything else | Deleted | `rounded-lg` (92), `rounded-md` (33) — no legitimate remaining role once Card/Interactive/Modal/Badge are covered. |

### Typography
| Role | Canonical | Measured support |
|---|---|---|
| Micro-label | `text-[10px] font-black` (+ `uppercase tracking-widest`) | 240 co-occurrences, dominant |
| Body text | `text-xs font-bold` | 189 co-occurrences, dominant |
| Section heading | `text-sm font-black` | 74 co-occurrences, dominant |
| Panel title | `text-lg font-black` | 25 co-occurrences, consistent (one per panel header, so naturally rarer) |
| Big numeric | ⚠️ **Disagreement.** Proposal says `text-4xl font-black font-mono` for all money/counts. Measured: `text-4xl` appears **exactly once**, reserved for the single "Vault Balance" hero number on the inverted dark panel in ReportsManager. The actual numeric hierarchy in use is: `text-xl font-black font-mono` for grid KPI tiles (Inventory, Invoices, Reports, Shift — 6 instances), `text-2xl font-black font-mono` for featured/secondary numbers (Customers balance, POS total, Reports revenue/patients/avg-txn — 5 instances), `text-4xl` only for the one hero display. **Recommendation:** canonical default = `text-xl font-black font-mono` (KPI tile, most common); `text-2xl` for a featured number within a section; `text-4xl` reserved exclusively for a single hero number on an inverted (`bg-slate-900`) panel. All three documented below, not collapsed into one. |

Deleted: `text-[8px]`, `text-[9px]`, `text-[11px]`, `font-semibold`, `font-extrabold`, `font-medium`.

### Action colors
| Role | Canonical | Measured support |
|---|---|---|
| Primary | `bg-indigo-600 hover:bg-indigo-700 text-white` | 71 / 36 uses, overwhelming majority |
| Destructive | `bg-rose-600 hover:bg-rose-700 text-white` | 14 / 7 uses, consistent |
| Secondary | `bg-slate-100 hover:bg-slate-200 text-slate-700` | consistent across GroomingManager, LaboratoryManager, ShiftManager, StaffManager |
| Surface | `bg-slate-50` | ubiquitous |
| Card | `bg-white border border-slate-200` | ubiquitous |
| Inverted panel | `bg-slate-900 text-white` (vault/cash surfaces only) | ReportsManager, StaffManager payslip summary |

**Note (not in original proposal, found in measurement):** there is a real, recurring 4th
action pattern — `bg-emerald-600 hover:bg-emerald-700 text-white` — used 8 times for
**positive-confirm actions** that aren't simply "primary" (Cash In, Clock In, Save
Payslip Draft, Mark Paid; ShiftManager, StaffManager ×3, VaccinationsManager selected
state). This is a legitimate 4th variant the proposal doesn't cover. I did **not** add
it to the canonical set unilaterally — flagging it here for a decision. `Button.tsx`
below implements exactly the 3 requested variants (`primary`/`secondary`/`destructive`)
plus `ghost`, not this emerald one.

### Semantic badge colors
One meaning each, no exceptions — this is the most important part of the whole spec,
because a badge's color is how staff make split-second triage decisions:

| Color | Meaning |
|---|---|
| `indigo` | primary / admin / owner |
| `emerald` | success / paid / active / healthy |
| `amber` | warning / pending / expiring / urgent |
| `rose` | danger / emergency / expired / void / overdue |
| **`sky`** | informational / cashier / boarding |
| `slate` | neutral / inactive / draft |

⚠️ **Disagreement:** proposal says `blue` for the informational role. Measured: `sky` is
used **3× more** than `blue` for the exact same role (informational badges, "Scheduled"
status, boarding-adjacent info tags — 39 vs 15 total uses across bg/text/border). I'm
canonicalizing on `sky`, matching what the app actually converged on. 16 `blue-*`
instances need to migrate to `sky-*` — tracked in `UI_AUDIT.md`.

**Caveat found during measurement:** a handful of badges use semantic colors purely as
*categorical* distinguishers (not status meaning) — e.g. StaffManager's role badges
(`groomer` = amber, `hourly` = amber, `manager`-sourced entries = amber) and
InventoryManager's category chips (`Clinical Services` = purple, `Food & Feeding` =
orange). These aren't status badges, they're enum/category tags recruiting spare colors
for visual distinction. They still need remapping onto the 6-color palette (tracked in
`UI_AUDIT.md`), but the fix is "pick one of the 6 that doesn't clash with its
neighbors," not "this badge's meaning is wrong."

### Spacing scale
Proposal: 2, 3, 4, 6, 8 only. Measured: **`p-5`/`px-5` are real and heavily used** (63 /
76 occurrences — more common than `p-2`). This is not noise to be waved away, it's the
modal/card interior-padding convention (`p-5`/`p-6` split roughly evenly depending on
container size). Per the proposal's explicit "delete p-5, p-7" instruction, I am
following it as given — but flagging that `p-5`'s removal is the single largest
migration in `UI_AUDIT.md` by volume, and recommend UI-2 batch it first since it's
almost always a mechanical `p-5 → p-4` or `p-5 → p-6` swap depending on whether the
container reads as "compact" or "spacious" in context.

Canonical: `p-2, p-3, p-4, p-6, p-8` (and `px-*`/`py-*`/`gap-*` equivalents). Delete
`p-5`, `p-7`, and all arbitrary bracket values (`p-[Npx]` — none found, good).

---

## STEP 3 — Component recipes

Every recipe below is copied verbatim (only prop names templated) from a real,
cited usage — nothing invented.

### Card container
Source: `ReportsManager.tsx:526`
```html
<div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
  <!-- content -->
</div>
```
Note: cited usage uses `p-5` (see Spacing disagreement above) — canonical primitive
below uses `p-4` per the delete-p-5 instruction.

### Primary button
Source: `CustomersManager.tsx:1061`
```html
<button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-[10px] uppercase tracking-widest cursor-pointer shadow-md transition-colors flex items-center gap-2">
  Confirm
</button>
```

### Secondary button
Source: `ShiftManager.tsx:470`
```html
<button className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-widest cursor-pointer transition-colors">
  Cancel
</button>
```

### Destructive button
Source: `CustomersManager.tsx:1267` (F-3 deletion-confirm modal)
```html
<button className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-[10px] uppercase tracking-widest cursor-pointer shadow-md flex items-center gap-2 transition-colors">
  Delete
</button>
```

### Micro-label
Source: `BoardingManager.tsx:722`
```html
<label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
  Food Item
</label>
```

### Badges — one per semantic color
Sources: `ReportsManager.tsx:807` (indigo), `DashboardAnalytics.tsx:412` (emerald),
`AppointmentsManager.tsx:858` (amber), `AppointmentsManager.tsx:857` (rose),
`DashboardAnalytics.tsx:413` (sky, canonical informational — see disagreement above),
`CustomersManager.tsx:738` (slate)
```html
<span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">Client</span>
<span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">Active</span>
<span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">Urgent</span>
<span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">Emergency</span>
<span className="bg-sky-100 text-sky-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">Scheduled</span>
<span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">Inactive</span>
```
Badge radius is bare `rounded`, not `rounded-full` — see disagreement above.

### Text input
Source: `BoardingManager.tsx:742-747` (color-normalized to canonical indigo focus ring;
cited usage used an orange ring local to that modal's accent)
```html
<input
  type="text"
  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
/>
```

### Select
Source: `BoardingManager.tsx:723-733`
```html
<select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
  <option value="">— Select —</option>
</select>
```

### Modal shell
Source: `BoardingManager.tsx:711-712` (overlay + panel), header/footer pattern
matched against `CustomersManager.tsx`'s F-3 deletion modal
```html
<div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
  <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl animate-scale-up flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
    <div className="flex justify-between items-start p-6 pb-4 border-b border-slate-100">
      <h3 className="text-lg font-black text-slate-800">Title</h3>
      <button onClick={onClose} className="p-1.5 hover:bg-slate-100 text-slate-400 rounded-lg cursor-pointer transition-colors">✕</button>
    </div>
    <div className="p-6 space-y-4">
      <!-- body -->
    </div>
    <div className="flex gap-3 p-6 pt-0 justify-end">
      <!-- footer buttons -->
    </div>
  </div>
</div>
```
Modal shell radius is `rounded-3xl`, distinct from Card's `rounded-2xl` — see
disagreement above.

### Empty state
Source: `DashboardAnalytics.tsx:294-296`
```html
<div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-3">
  <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-2">
    <CheckCircle className="w-6 h-6 text-emerald-500" />
  </div>
  <div className="text-xs uppercase tracking-widest font-black text-center text-emerald-600">All clear</div>
</div>
```

### Table row
Source: `AppointmentsManager.tsx` (`renderAptRow`)
```html
<tr className="hover:bg-slate-50 transition-colors group">
  <td className="py-4 px-4">
    <!-- cell content -->
  </td>
</tr>
```

---

## DO NOT USE (deleted tokens)

- `rounded-lg`, `rounded-md` (92 + 33 = 125 instances to migrate)
- `rounded-3xl` **except** on Modal shells (see disagreement — 21 instances, most are
  legitimate modal shells, a few are not — itemized in `UI_AUDIT.md`)
- `rounded-full` **except** on avatars/dots/segmented-filter-toggle-pills (badges using
  it need to move to bare `rounded` — see disagreement)
- `text-[8px]`, `text-[9px]`, `text-[11px]` (240 instances combined)
- `font-semibold`, `font-extrabold`, `font-medium` (155 instances combined)
- `p-5`, `p-7` and matching `px-5`/`py-5`/`gap-5` etc. where not already covered by an
  approved role (63+ instances just for `p-5`)
- `blue-*` (16 instances — migrate to `sky-*`, see disagreement)
- Any color family outside `indigo` / `emerald` / `amber` / `rose` / `sky` / `slate` on
  a status badge: `red`, `green`, `yellow`, `orange`, `violet`, `purple`, `fuchsia`,
  `pink`, `lime`, `teal`, `cyan`, `gray`/`zinc`/`neutral`/`stone` (17 instances found —
  BoardingManager, InventoryManager, ShiftManager)
- `text-4xl` on anything except the single inverted-panel hero number
