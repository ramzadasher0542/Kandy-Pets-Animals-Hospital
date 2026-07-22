# INVENTORY FIX 1 — Remove Conflicting Fields from Add Item Form

## CONTEXT
- File: src/components/InventoryManager.tsx
- Problem: Add Item form has stock, lotNumber, expiryDate fields that conflict with batch system
- New items should start with stock=0, no lot/expiry (set via Receive Stock batches)

## WHAT TO DO
1. In the Add Item form (the modal/form for creating new inventory items):
   - REMOVE the "stock" input field
   - REMOVE the "lotNumber" input field  
   - REMOVE the "expiryDate" input field
2. When creating a new item, set:
   - stock: 0 (hardcoded)
   - lotNumber: undefined
   - expiryDate: undefined
3. Keep ALL other fields: name, sku, category, cost, price, minStock, unit
4. The "Edit Item" form can keep these fields for backward compatibility (editing existing items), but hide them for NEW items

## CONSTRAINTS
1. DO NOT change the batch receive form
2. DO NOT change atomicStockDecrement
3. DO NOT change POSRegister
4. Run npx tsc --noEmit