# \# INVENTORY FIX 2 — Auto-Compute Stock from Batch Totals

# 

# \## CONTEXT

# \- File: src/lib/db.ts

# \- Problem: item.stock and batch quantities drift. item.stock is manual, batches are automatic.

# \- Fix: After any batch change, recompute item.stock from sum of batch.quantityRemaining

# 

# \## WHAT TO DO

# In src/lib/db.ts:

# 

# 1\. Create a helper function:

# &#x20;  async function recomputeItemStockFromBatches(itemId: string): Promise\&lt;number\&gt; {

# &#x20;    // Sum all non-deleted batches for this item

# &#x20;    let total = 0;

# &#x20;    await db.inventoryBatches.iterate((b: InventoryBatch) =\&gt; {

# &#x20;      if (b \&\& !b.is\_deleted \&\& b.inventoryItemId === itemId) {

# &#x20;        total += b.quantityRemaining;

# &#x20;      }

# &#x20;    });

# &#x20;    // Update the item

# &#x20;    const item = await db.inventory.getItem\&lt;InventoryItem\&gt;(itemId);

# &#x20;    if (item) {

# &#x20;      item.stock = total;

# &#x20;      // Also update expiry/lot to soonest active batch

# &#x20;      const batches: InventoryBatch\[] = \[];

# &#x20;      await db.inventoryBatches.iterate((b: InventoryBatch) =\&gt; {

# &#x20;        if (b \&\& !b.is\_deleted \&\& b.inventoryItemId === itemId \&\& b.quantityRemaining \&gt; 0) {

# &#x20;          batches.push(b);

# &#x20;        }

# &#x20;      });

# &#x20;      batches.sort((a, b) =\&gt; new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

# &#x20;      if (batches.length \&gt; 0) {

# &#x20;        item.expiryDate = batches\[0].expiryDate;

# &#x20;        item.lotNumber = batches\[0].lotNumber;

# &#x20;      } else {

# &#x20;        item.expiryDate = undefined;

# &#x20;        item.lotNumber = undefined;

# &#x20;      }

# &#x20;      // Save to Supabase + local

# &#x20;      if (supabase) {

# &#x20;        const { error } = await supabase.from('inventory').upsert(item);

# &#x20;        if (error) throw new Error(`CLOUD\_SAVE\_FAILED: ${error.message}`);

# &#x20;      }

# &#x20;      await safeDbWrite(db.inventory, itemId, stampRecord(item));

# &#x20;    }

# &#x20;    return total;

# &#x20;  }

# 

# 2\. Call this function at the END of:

# &#x20;  - upsertInventoryBatch (after creating/updating a batch)

# &#x20;  - atomicStockDecrement (after consuming batches, BEFORE returning)

# 

# 3\. In atomicStockDecrement, REMOVE the manual `item.stock = newStock` line (line where it sets stock directly). Let the recompute function handle it.

# 

# \## CONSTRAINTS

# 1\. DO NOT change function signatures

# 2\. DO NOT change POSRegister

# 3\. DO NOT change InventoryManager UI

# 4\. Run npx tsc --noEmit

