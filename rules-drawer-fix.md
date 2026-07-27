# \# FIX DRAWER MATH — Remove Fake Cash Adjustment on Shift Open

# 

# \## CONTEXT

# \- File: src/components/ShiftManager.tsx

# \- Bug: handleOpenShift creates a CashAdjustment of type 'IN' with the opening float amount

# \- This causes expected drawer to be openingFloat + adjustIn = double

# 

# \## FIX

# In handleOpenShift, remove the entire block that creates `newAdj` (the CashAdjustment for starting float) and the `setAdjustments` call that follows it.

# 

# Keep everything else: the shift creation, localStorage, setActiveShift, showToast.

# 

# \## CONSTRAINTS

# 1\. DO NOT change the drawer calculation formula

# 2\. DO NOT change the UI

# 3\. DO NOT remove the Cash Adjustment modal or functionality

# 4\. Run npx tsc --noEmit

