# Phase H1: Suppliers — Database Layer, Types, and Config
# Mission: Add Supplier type, batch fields, and DB functions. No UI changes.

## FILE 1: src/types.ts

### ADD Supplier interface (after InventoryBatch, before exports)

```typescript
export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  payment_terms?: string;
  is_active?: boolean;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}
UPDATE InventoryBatch interface
ADD two fields to the existing interface (keep all existing fields):
TypeScript
  supplier_id?: string;   // UUID FK → suppliers.id
  origin?: 'purchase' | 'opening_stock' | 'adjustment';
FILE 2: src/components/SystemSettings.tsx
UPDATE SystemConfig interface
ADD one field to the existing interface (keep all existing fields):
TypeScript
  setupModeActive?: boolean;
FILE 3: src/lib/db.ts
ADD functions (append at the end of the file, after upsertSystemConfig)
TypeScript
// ==========================================
// SUPPLIERS
// ==========================================

export async function fetchSuppliers(): Promise<Supplier[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_deleted', false)
    .order('name', { ascending: true });
  if (error) { console.error('[DB]', error.message); return []; }
  return (data || []) as Supplier[];
}

export async function upsertSupplier(supplier: Supplier): Promise<void> {
  if (!supplier || !supplier.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('suppliers').upsert(supplier);
  if (error) throw error;
}

export async function deleteSupplier(id: string): Promise<void> {
  if (!id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('suppliers').update({ is_deleted: true }).eq('id', id);
  if (error) throw error;
}
ADD import
Ensure Supplier is imported from '../types' in the existing import block.
CONSTRAINTS
Do NOT change fetchInventoryBatches or upsertInventoryBatch (select('*') automatically gets new columns)
Do NOT remove the old supplier?: string field from InventoryBatch (backward compat)
Do NOT change any UI components
Run npx tsc --noEmit