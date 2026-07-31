# \# BUG FIXES: Void Invoice + Shift Detection

# 

# \## BUG 1: Invoice void reads from dead IndexedDB

# 

# File: src/App.tsx

# Function: handleVoidInvoice (around line 1227)

# 

# FIND:

# &#x20; const target = await db.invoices.getItem\&lt;Invoice\&gt;(id);

# 

# REPLACE WITH:

# &#x20; const { data: targetData, error: targetError } = await supabase.from('invoices').select('\*').eq('id', id).maybeSingle();

# &#x20; if (targetError) throw targetError;

# &#x20; const target = targetData as Invoice | null;

# 

# If `supabase` is not already imported in App.tsx, add:

# &#x20; import { supabase } from './lib/supabase';

# 

# \## BUG 2: Shift detection reads from dead IndexedDB

# 

# File: src/App.tsx

# Boot sequence (around line 453)

# 

# FIND:

# &#x20; const hActiveShift = await db.system.getItem('active\_shift') || null;

# 

# REPLACE WITH:

# &#x20; let hActiveShift = await db.system.getItem('active\_shift') || null;

# &#x20; if (!hActiveShift) {

# &#x20;   const { shift: cloudShift } = await fetchActiveShiftDetails();

# &#x20;   if (cloudShift) {

# &#x20;     hActiveShift = {

# &#x20;       id: cloudShift.id,

# &#x20;       openedAt: cloudShift.startTime,

# &#x20;       openedBy: cloudShift.openedBy,

# &#x20;       openedByName: cloudShift.openedBy,

# &#x20;       openingFloat: cloudShift.opening\_float || (cloudShift.openingFloatCents || 0) / 100

# &#x20;     };

# &#x20;   }

# &#x20; }

# 

# If `fetchActiveShiftDetails` is not already imported in App.tsx, add it to the import from '../lib/db'.

# 

# CONSTRAINTS:

# \- Keep all existing logic inside if (target) block intact

# \- Keep the db.system.getItem('config') line as-is

# \- Run npx tsc --noEmit

