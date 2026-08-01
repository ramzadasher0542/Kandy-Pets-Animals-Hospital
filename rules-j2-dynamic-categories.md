# Phase J2: Dynamic Inventory Categories

# Mission: Stop hardcoding categories. Load from DB. Manage from Inventory page.



## FILE 1: src/types.ts



### ADD after Supplier interface

export interface InventoryCategory {

  id: string;

  name: string;

  label: string;

  is_service: boolean;

  is_lab: boolean;

  sort_order: number;

  is_deleted?: boolean;

  created_at?: string;

  updated_at?: string;

}



### FIND and REPLACE

FROM: export type ItemCategory = 'retail' | 'prescription' | 'lab_service' | 'service' | 'vaccine' | 'food';

TO:   export type ItemCategory = string;



### ADD inside InventoryItem interface (after the `category` field line)

  category_id?: string;



## FILE 2: src/lib/db.ts



### ADD after deleteSupplier()

export async function fetchInventoryCategories(): Promise&lt;InventoryCategory[]&gt; {

  if (!supabase) return [];

  const { data, error } = await supabase

    .from('inventory_categories')

    .select('*')

    .eq('is_deleted', false)

    .order('sort_order', { ascending: true });

  if (error) { console.error('[DB]', error.message); return []; }

  return (data || []) as InventoryCategory[];

}



export async function upsertInventoryCategory(cat: InventoryCategory): Promise&lt;void&gt; {

  if (!cat || !cat.id) return;

  if (!supabase) throw new Error('No internet connection');

  const { error } = await supabase.from('inventory_categories').upsert(cat);

  if (error) throw error;

}



export async function deleteInventoryCategory(id: string): Promise&lt;void&gt; {

  if (!id) return;

  if (!supabase) throw new Error('No internet connection');

  const { error } = await supabase.from('inventory_categories').update({ is_deleted: true }).eq('id', id);

  if (error) throw error;

}



## FILE 3: src/components/InventoryManager.tsx



### ADD to lucide-react imports

Settings2, Trash2



### ADD imports

import { InventoryCategory } from '../types';

import { fetchInventoryCategories, upsertInventoryCategory, deleteInventoryCategory } from '../lib/db';



### ADD constant (after imports, before component function)

const CATEGORY_CHIP_COLORS = [

  'bg-sky-50 text-sky-700 border-sky-200',

  'bg-emerald-50 text-emerald-700 border-emerald-200',

  'bg-amber-50 text-amber-700 border-amber-200',

  'bg-indigo-50 text-indigo-700 border-indigo-200',

  'bg-rose-50 text-rose-700 border-rose-200',

  'bg-teal-50 text-teal-700 border-teal-200',

  'bg-violet-50 text-violet-700 border-violet-200',

  'bg-orange-50 text-orange-700 border-orange-200',

  'bg-cyan-50 text-cyan-700 border-cyan-200',

  'bg-lime-50 text-lime-700 border-lime-200',

];



### ADD state (inside component, near other useState declarations)

const [categories, setCategories] = useState&lt;InventoryCategory[]&gt;([]);

const [showCategoryManager, setShowCategoryManager] = useState(false);

const [newCategoryLabel, setNewCategoryLabel] = useState('');

const [newCategoryIsService, setNewCategoryIsService] = useState(false);



### ADD effect and loader (inside component)

useEffect(() =&gt; {

  loadCategories();

}, []);



const loadCategories = async () =&gt; {

  const cats = await fetchInventoryCategories();

  setCategories(cats);

};



### ADD handlers (inside component)

const handleAddCategory = async () =&gt; {

  if (!newCategoryLabel.trim()) { showToast('Category name is required.', 'error'); return; }

  const name = newCategoryLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  if (categories.find(c =&gt; c.name === name)) { showToast('Category already exists.', 'error'); return; }

  const newCat: InventoryCategory = {

    id: crypto.randomUUID(),

    name,

    label: newCategoryLabel.trim(),

    is_service: newCategoryIsService,

    is_lab: false,

    sort_order: categories.length + 1,

    is_deleted: false

  };

  await upsertInventoryCategory(newCat);

  await loadCategories();

  setNewCategoryLabel('');

  setNewCategoryIsService(false);

  showToast('Category added.', 'success');

};



const handleUpdateCategory = async (id: string, updates: Partial&lt;InventoryCategory&gt;) =&gt; {

  const cat = categories.find(c =&gt; c.id === id);

  if (!cat) return;

  await upsertInventoryCategory({ ...cat, ...updates });

  await loadCategories();

};



const handleDeleteCategory = async (id: string) =&gt; {

  const cat = categories.find(c =&gt; c.id === id);

  if (!cat) return;

  const inUse = inventory.some(i =&gt; i.category === cat.name);

  if (inUse) { showToast('Cannot delete — items still use this category.', 'error'); return; }

  await deleteInventoryCategory(id);

  await loadCategories();

  showToast('Category removed.', 'success');

};



### REPLACE isFormPhysical and isFormLab

Find these exact lines:

  const isFormPhysical = !['service', 'lab_service'].includes(formData.category as string);

  const isFormLab = formData.category === 'lab_service';



Replace with:

  const selectedCategory = categories.find(c =&gt; c.name === formData.category);

  const isFormPhysical = selectedCategory ? !selectedCategory.is_service : true;

  const isFormLab = selectedCategory ? selectedCategory.is_lab : false;



### REPLACE filter chips

Find the hardcoded CATEGORIES constant array (e.g., `const CATEGORIES = [...]`) and DELETE it entirely.



Find where CATEGORIES is mapped to render filter chips (e.g., `{CATEGORIES.map(cat =&gt; (...))}`).

Replace that entire map block with:

  {(() =&gt; {

    const filterChips = [

      { id: 'all', label: 'All Items', count: inventory.length, color: 'bg-slate-100 text-slate-700 border-slate-200' },

      ...categories.map((cat, idx) =&gt; ({

        id: cat.name,

        label: cat.label,

        count: inventory.filter(i =&gt; i.category === cat.name).length,

        color: CATEGORY_CHIP_COLORS[idx % CATEGORY_CHIP_COLORS.length]

      }))

    ];

    return filterChips.map(chip =&gt; (

      &lt;button

        key={chip.id}

        onClick={() =&gt; setActiveCategory(chip.id)}

        className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${

          activeCategory === chip.id

            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'

            : `${chip.color} hover:opacity-80`

        }`}

      &gt;

        {chip.label}

        &lt;span className="ml-1.5 opacity-70"&gt;{chip.count}&lt;/span&gt;

      &lt;/button&gt;

    ));

  })()}



Immediately after that block, ADD:

  &lt;button

    onClick={() =&gt; setShowCategoryManager(true)}

    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all"

  &gt;

    &lt;Settings2 className="w-3.5 h-3.5" /&gt;

    Manage

  &lt;/button&gt;



### REPLACE category dropdown options in Add Item modal

Find the category &lt;select&gt; inside the New Inventory Record modal.

Delete all hardcoded &lt;option&gt; elements inside it.

Replace them with:

  {categories.map(cat =&gt; (

    &lt;option key={cat.name} value={cat.name}&gt;{cat.label}&lt;/option&gt;

  ))}



### ADD category_id to save payload

In handleSaveItem (or the function that builds the InventoryItem payload), find the object being saved.

ADD this property inside that object:

  category_id: categories.find(c =&gt; c.name === formData.category)?.id,



### ADD category management modal

Add this JSX near the other modals in the component:



{showCategoryManager && (

  &lt;Modal onClose={() =&gt; setShowCategoryManager(false)} title="Manage Categories" size="md" footer={

    &lt;button onClick={() =&gt; setShowCategoryManager(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"&gt;Done&lt;/button&gt;

  }&gt;

    &lt;div className="space-y-4 max-h-[60vh] overflow-y-auto"&gt;

      {categories.map(cat =&gt; (

        &lt;div key={cat.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200"&gt;

          &lt;div className="flex-1"&gt;

            &lt;input

              value={cat.label}

              onChange={e =&gt; handleUpdateCategory(cat.id, { label: e.target.value })}

              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"

            /&gt;

          &lt;/div&gt;

          &lt;label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 whitespace-nowrap cursor-pointer"&gt;

            &lt;input

              type="checkbox"

              checked={cat.is_service}

              onChange={e =&gt; handleUpdateCategory(cat.id, { is_service: e.target.checked })}

              className="w-4 h-4 rounded text-indigo-600"

            /&gt;

            Service

          &lt;/label&gt;

          &lt;button

            onClick={() =&gt; handleDeleteCategory(cat.id)}

            className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"

          &gt;

            &lt;Trash2 className="w-4 h-4" /&gt;

          &lt;/button&gt;

        &lt;/div&gt;

      ))}



      &lt;div className="border-t border-slate-200 pt-4 space-y-3"&gt;

        &lt;div className="text-[10px] font-black text-slate-400 uppercase tracking-widest"&gt;Add New Category&lt;/div&gt;

        &lt;div className="flex items-center gap-3"&gt;

          &lt;input

            placeholder="e.g. Pet Toys"

            value={newCategoryLabel}

            onChange={e =&gt; setNewCategoryLabel(e.target.value)}

            onKeyDown={e =&gt; { if (e.key === 'Enter') handleAddCategory(); }}

            className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"

          /&gt;

          &lt;label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 whitespace-nowrap cursor-pointer"&gt;

            &lt;input

              type="checkbox"

              checked={newCategoryIsService}

              onChange={e =&gt; setNewCategoryIsService(e.target.checked)}

              className="w-4 h-4 rounded text-indigo-600"

            /&gt;

            Service

          &lt;/label&gt;

          &lt;button

            onClick={handleAddCategory}

            className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700"

          &gt;

            Add

          &lt;/button&gt;

        &lt;/div&gt;

      &lt;/div&gt;

    &lt;/div&gt;

  &lt;/Modal&gt;

)}



## CONSTRAINTS

- Do NOT change SystemSettings.tsx

- Do NOT change fetchShiftMetrics or fetchLowStockCount in db.ts

- Do NOT remove CATEGORY_DISPLAY_MAP from types.ts

- Run npx tsc --noEmit