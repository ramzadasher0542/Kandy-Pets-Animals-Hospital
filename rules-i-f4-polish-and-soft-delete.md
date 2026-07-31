# Phase I + F4: UI Polish + Soft Delete
# Mission: Unify empty states, fix shell color, add mobile sidebar, soft-delete inventory

## FILE 1: src/App.tsx — COLOR FIX (Blue → Indigo)

### FIND the logo tile div
Search for: className="bg-blue-600 p-1.5 rounded-xl shadow-sm"
REPLACE bg-blue-600 with: bg-indigo-600

### FIND the active nav item background
Search for: bg-blue-50 (appears in active nav item and Settings active nav)
REPLACE all bg-blue-50 with: bg-indigo-50

### FIND the active nav item text color
Search for: text-blue-700 (appears in active nav item and Settings active nav)
REPLACE all text-blue-700 with: text-indigo-700

### FIND the active nav icon color
Search for: text-blue-600
REPLACE with: text-indigo-600

## FILE 2: src/App.tsx — MOBILE RESPONSIVE SIDEBAR

### ADD import
Add Menu to the existing lucide-react imports:
  Menu,

### ADD state (near other useState declarations, around line 200)
  const [sidebarOpen, setSidebarOpen] = useState(false);

### UPDATE the &lt;aside&gt; element
FIND the exact opening tag:
  &lt;aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 z-20 shadow-sm"&gt;

REPLACE with:
  &lt;aside className={`w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 z-30 shadow-sm fixed md:relative inset-y-0 left-0 transform transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}&gt;

### ADD mobile overlay (immediately after the &lt;/aside&gt; closing tag, before &lt;main&gt;)
  {sidebarOpen && (
    &lt;div 
      className="fixed inset-0 bg-black/30 z-20 md:hidden" 
      onClick={() =&gt; setSidebarOpen(false)} 
    /&gt;
  )}

### ADD hamburger button (find the header/top-bar inside &lt;main&gt;, before the Bell icon or user avatar)
Add this button as the first element in the header row:
  &lt;button 
    onClick={() =&gt; setSidebarOpen(!sidebarOpen)} 
    className="md:hidden p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
  &gt;
    &lt;Menu className="w-5 h-5" /&gt;
  &lt;/button&gt;

## FILE 3: src/lib/db.ts — SOFT DELETE INVENTORY

### FIND deleteInventoryItem()
It currently does:
  await supabase.from('inventory_batches').delete().eq('inventoryItemId', id);
  await supabase.from('inventory').delete().eq('id', id);

REPLACE the entire function with:
  export async function deleteInventoryItem(id: string): Promise&lt;void&gt; {
    if (!id) return;
    if (!supabase) throw new Error('No internet connection');
    
    // Soft delete batches first
    const { error: batchError } = await supabase
      .from('inventory_batches')
      .update({ is_deleted: true })
      .eq('inventoryItemId', id);
    if (batchError) throw batchError;

    // Soft delete inventory item
    const { error } = await supabase
      .from('inventory')
      .update({ is_deleted: true })
      .eq('id', id);
    if (error) throw error;
  }

## FILE 4: src/components/DashboardAnalytics.tsx — EMPTY STATE

### ADD import
  import { EmptyState } from './ui/EmptyState';

### ADD empty check (at the top of the component render, after props destructuring)
After the useMemo hooks, before the return statement, add:
  const hasAnyData = invoices.length &gt; 0 || appointments.length &gt; 0 || records.length &gt; 0 || inventory.length &gt; 0;
  if (!hasAnyData) {
    return (
      &lt;EmptyState 
        title="No data yet" 
        description="Start creating invoices, appointments, and patient records to see your analytics dashboard." 
      /&gt;
    );
  }

## FILE 5: src/components/AppointmentsManager.tsx — EMPTY STATE

### ADD import
  import { EmptyState } from './ui/EmptyState';

### FIND the empty table row
Search for the exact text: No appointments scheduled for today.
It appears inside a &lt;tr&gt;&lt;td colSpan={...}&gt;.

REPLACE that entire &lt;tr&gt;...&lt;/tr&gt; block with:
  &lt;tr&gt;&lt;td colSpan={6}&gt;&lt;EmptyState title="No appointments scheduled for today" /&gt;&lt;/td&gt;&lt;/tr&gt;

## FILE 6: src/components/ReportsManager.tsx — EMPTY STATE

### ADD import
  import { EmptyState } from './ui/EmptyState';

### FIND the plain-text empty messages
Search for these exact strings and replace each with &lt;EmptyState&gt;:

1. "No revenue in this range." → &lt;EmptyState title="No revenue in this range" /&gt;
2. "No sales." → &lt;EmptyState title="No sales recorded" /&gt;
3. "No completed appointments." → &lt;EmptyState title="No completed appointments" /&gt;
4. "No deletions recorded." → &lt;EmptyState title="No deletions recorded" /&gt;

Wrap each replacement in a &lt;div className="py-8"&gt; if the parent layout needs padding.

## FILE 7: src/components/GroomingManager.tsx — EMPTY STATE

### ADD import
  import { EmptyState } from './ui/EmptyState';

### FIND the plain-text empty messages
Search for these exact strings and replace:

1. "No patients found." → &lt;EmptyState title="No patients found" /&gt;
2. "No historical grooming sessions found." → &lt;EmptyState title="No grooming sessions found" /&gt;

## FILE 8: src/components/VaccinationsManager.tsx — EMPTY STATE

### ADD import
  import { EmptyState } from './ui/EmptyState';

### FIND the plain-text empty messages
Search for these exact strings and replace:

1. "No patients found." → &lt;EmptyState title="No patients found" /&gt;
2. "No vaccines available in inventory." → &lt;EmptyState title="No vaccines in inventory" /&gt;
3. "No historical vaccinations recorded." → &lt;EmptyState title="No vaccinations recorded" /&gt;

## CONSTRAINTS
- Do NOT change ShiftManager or BoardingManager (their custom empty UI is functional, not a bug)
- Do NOT change any data-fetching logic
- Do NOT remove the old supplier text field from InventoryBatch
- Run npx tsc --noEmit