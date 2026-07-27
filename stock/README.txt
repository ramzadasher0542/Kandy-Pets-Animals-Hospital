KANDY PETS — STOCK ENTRY TEMPLATES
==================================

Give these Excel files to the hospital to type their stock into. Each workbook
has three tabs:
  • Stock List  — the sheet you fill in (one item per row)
  • How to Use   — full instructions
  • Examples     — filled-in sample rows for reference (NOT imported)

FILES
-----
  STOCK_TEMPLATE_MASTER.xlsx      All categories in one sheet (category dropdown).
  retail_products.xlsx            Pre-set to "retail" (food, accessories, etc.).
  medicines_prescription.xlsx     Pre-set to "prescription" (medicines).
  vaccines.xlsx                   Pre-set to "vaccine".
  services_and_lab.xlsx           Services + lab tests (no stock counts).

THE COLUMNS  (do NOT rename or reorder — the app reads them by name/position)
-----------
  sku        REQUIRED. Unique code, e.g. RX-001. If a SKU already exists in the
             system that item is OVERWRITTEN; a new SKU adds a new item.
  name       REQUIRED. Item name shown at the POS.
  category   One of: retail, prescription, vaccine, service, lab_service
  price      Selling price in whole Rupees (e.g. 450.00, not cents).
  cost       Purchase cost in Rupees (0 if unknown).
  stock      Quantity ON HAND now. This REPLACES the current count — enter the
             new TOTAL, not an amount to add.
  minStock   Low-stock alert level.
  unit       tablet, bottle, bag, dose, ml, piece, test, ...
  location   Shelf / fridge / storage location (optional).

  Rows missing sku OR name are skipped. service / lab_service ignore stock (0).

HOW TO LOAD IT INTO THE SYSTEM
------------------------------
  1. Fill in the "Stock List" tab; delete blank rows you don't need.
  2. Excel: File > Save As > CSV (Comma delimited) (*.csv)  (saves the active tab).
  3. In the app: Settings > Inventory & Stock > Upload CSV.
  4. Review the staging preview, then click "Overwrite Master Registry".

  You can also download a blank CSV anytime from
  Settings > Inventory & Stock > Download Template.
