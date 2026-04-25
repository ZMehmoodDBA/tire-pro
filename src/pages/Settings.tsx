import { useState, useEffect } from 'react';
import {
  Building2, FileText, Tag, Save, Loader2, CheckCircle,
  Plus, Pencil, Trash2, GripVertical, X, AlertCircle, Package,
} from 'lucide-react';
import { api } from '../api/client';
import { formatCurrency } from '../lib/utils';

type Tab = 'company' | 'defaults' | 'lookups' | 'products';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'company',  label: 'Company Profile',      icon: Building2 },
  { id: 'defaults', label: 'Invoice & PO Defaults', icon: FileText },
  { id: 'products', label: 'Products',              icon: Package  },
  { id: 'lookups',  label: 'Lookup Tables',         icon: Tag      },
];

function Field({
  label, help, children,
}: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">{label}</label>
      {children}
      {help && <p className="text-xs text-slate-400 mt-1">{help}</p>}
    </div>
  );
}

function Input({
  value, onChange, placeholder, type = 'text', prefix,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; prefix?: string;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full text-sm border border-slate-200 rounded-xl py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 ${prefix ? 'pl-10 pr-3' : 'px-3'}`}
      />
    </div>
  );
}

// ── Company Tab ────────────────────────────────────────────────────────────────
function CompanyTab({
  settings, onChange,
}: { settings: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div className="sm:col-span-2">
        <Field label="Company Name" help="Appears on invoices, POs, and all printouts">
          <Input value={settings.company_name ?? ''} onChange={v => onChange('company_name', v)} placeholder="e.g. TirePro" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Tagline" help="Short description shown below company name on documents">
          <Input value={settings.company_tagline ?? ''} onChange={v => onChange('company_tagline', v)} placeholder="e.g. Tyre & Wheel Solutions" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Address" help="Full postal address printed on invoices and purchase orders">
          <textarea
            value={settings.company_address ?? ''}
            onChange={e => onChange('company_address', e.target.value)}
            placeholder="123 Industrial Zone, Lahore, Pakistan"
            rows={2}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 resize-none"
          />
        </Field>
      </div>
      <Field label="Phone" help="Customer-facing phone number on documents">
        <Input value={settings.company_phone ?? ''} onChange={v => onChange('company_phone', v)} placeholder="+92-42-1234567" />
      </Field>
      <Field label="Email" help="Business email shown on invoices">
        <Input value={settings.company_email ?? ''} onChange={v => onChange('company_email', v)} placeholder="info@company.pk" type="email" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Announcement / News Banner" help="Shows a banner at the top of the app for all users. Leave blank to hide.">
          <textarea
            value={settings.announcement ?? ''}
            onChange={e => onChange('announcement', e.target.value)}
            placeholder="e.g. Office closed on Friday · New tire brands now in stock · System maintenance tonight at 11 PM"
            rows={2}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 resize-none"
          />
        </Field>
      </div>
    </div>
  );
}

// ── Defaults Tab ───────────────────────────────────────────────────────────────
function DefaultsTab({
  settings, onChange,
}: { settings: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Numbering Prefixes</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field
            label="Invoice Prefix"
            help="Prepended to invoice numbers — e.g. 'INV' → INV-2025-001"
          >
            <Input
              value={settings.invoice_prefix ?? ''}
              onChange={v => onChange('invoice_prefix', v.toUpperCase())}
              placeholder="INV"
            />
          </Field>
          <Field
            label="Purchase Order Prefix"
            help="Prepended to PO numbers — e.g. 'PO' → PO-2025-001"
          >
            <Input
              value={settings.po_prefix ?? ''}
              onChange={v => onChange('po_prefix', v.toUpperCase())}
              placeholder="PO"
            />
          </Field>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Financial Defaults</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Field
            label="Default Tax Rate (%)"
            help="Applied automatically to new sales invoices"
          >
            <Input
              type="number"
              value={settings.default_tax_rate ?? ''}
              onChange={v => onChange('default_tax_rate', v)}
              placeholder="15"
            />
          </Field>
          <Field
            label="Payment Due (days)"
            help="Payment terms printed at the bottom of invoices"
          >
            <Input
              type="number"
              value={settings.payment_due_days ?? ''}
              onChange={v => onChange('payment_due_days', v)}
              placeholder="30"
            />
          </Field>
          <Field
            label="Currency Code"
            help="3-letter ISO code shown on all amounts"
          >
            <Input
              value={settings.currency ?? ''}
              onChange={v => onChange('currency', v.toUpperCase())}
              placeholder="PKR"
            />
          </Field>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Sale Defaults</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field
            label="Default Sale Status"
            help="Status pre-selected when creating a new invoice"
          >
            <select
              value={settings.default_sale_status ?? 'pending'}
              onChange={e => onChange('default_sale_status', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── Products Tab ───────────────────────────────────────────────────────────────
const EMPTY_PRODUCT = {
  code: '', name: '', description: '', category: '', unit: 'pcs',
  cost_price: '', sale_price: '', is_active: true,
};

function ProductsTab() {
  const [products, setProducts]     = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState<number | null>(null);
  const [form, setForm]             = useState({ ...EMPTY_PRODUCT });
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const load = () => {
    setLoadingList(true);
    api.products.list()
      .then(setProducts)
      .catch(() => {})
      .finally(() => setLoadingList(false));
  };

  useEffect(load, []);

  const setF = (k: string, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => {
    setForm({ ...EMPTY_PRODUCT });
    setEditId(null);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (p: any) => {
    setForm({
      code:        p.code        ?? '',
      name:        p.name        ?? '',
      description: p.description ?? '',
      category:    p.category    ?? '',
      unit:        p.unit        ?? 'pcs',
      cost_price:  p.cost_price  ?? '',
      sale_price:  p.sale_price  ?? '',
      is_active:   p.is_active   !== false,
    });
    setEditId(p.id);
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditId(null); };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        ...form,
        cost_price: Number(form.cost_price) || 0,
        sale_price: Number(form.sale_price) || 0,
      };
      if (editId) await api.products.update(editId, payload);
      else        await api.products.create(payload);
      closeForm();
      load();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setDeleteError('');
    try {
      await api.products.delete(id);
      load();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-700">Products / Goods Catalog</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Services, accessories, and other items available on invoices, sales, and purchase orders.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} /> Add Product
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-bold text-slate-700">{editId ? 'Edit Product' : 'New Product'}</p>
            <button onClick={closeForm} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
              <X size={15} />
            </button>
          </div>

          {formError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
              <AlertCircle size={13} /> {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Code</label>
              <input
                value={form.code} onChange={e => setF('code', e.target.value)}
                placeholder="e.g. SVC-BAL"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name} onChange={e => setF('name', e.target.value)}
                placeholder="e.g. Tyre Balancing Service"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
              <input
                value={form.category} onChange={e => setF('category', e.target.value)}
                placeholder="e.g. Service"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Unit</label>
              <input
                value={form.unit} onChange={e => setF('unit', e.target.value)}
                placeholder="pcs / hr / set"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setF('is_active', e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm font-medium text-slate-700">Active</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Cost Price</label>
              <input
                type="number" min={0} step="0.01"
                value={form.cost_price} onChange={e => setF('cost_price', e.target.value)}
                placeholder="0.00"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Sale Price</label>
              <input
                type="number" min={0} step="0.01"
                value={form.sale_price} onChange={e => setF('sale_price', e.target.value)}
                placeholder="0.00"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
            <input
              value={form.description} onChange={e => setF('description', e.target.value)}
              placeholder="Optional description..."
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={closeForm}
              className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors min-w-24 justify-center">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {saving ? 'Saving...' : editId ? 'Update' : 'Add Product'}
            </button>
          </div>
        </div>
      )}

      {deleteError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
          <AlertCircle size={14} /> {deleteError}
        </div>
      )}

      {/* Products list */}
      {loadingList ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
      ) : products.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          No products yet. Add your first product above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Code', 'Name', 'Category', 'Unit', 'Cost', 'Sale', 'Status', ''].map(h => (
                  <th key={h} className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2.5 text-left last:text-center">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/60 transition-colors group">
                  <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{p.code || '—'}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-900 max-w-[160px]">
                    <div className="truncate">{p.name}</div>
                    {p.description && <div className="text-xs text-slate-400 truncate">{p.description}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{p.category || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{p.unit}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap">{formatCurrency(Number(p.cost_price))}</td>
                  <td className="px-3 py-2.5 text-xs font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(Number(p.sale_price))}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(p)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                        {deletingId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Lookups Tab ────────────────────────────────────────────────────────────────
function LookupsTab() {
  const [types, setTypes]         = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [newName, setNewName]     = useState('');
  const [adding, setAdding]       = useState(false);
  const [addError, setAddError]   = useState('');
  const [editId, setEditId]       = useState<number | null>(null);
  const [editName, setEditName]   = useState('');
  const [saving, setSaving]       = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const load = () => {
    setLoadingList(true);
    api.lookups.tireTypes().then(setTypes).catch(() => {}).finally(() => setLoadingList(false));
  };

  useEffect(load, []);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setAddError('');
    try {
      await api.lookups.addTireType(name);
      setNewName('');
      load();
    } catch (err: any) {
      setAddError(err.message || 'Failed to add type');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (t: any) => {
    setEditId(t.id);
    setEditName(t.name);
    setDeleteError('');
  };

  const saveEdit = async (id: number) => {
    const name = editName.trim();
    if (!name) return;
    setSaving(id);
    try {
      await api.lookups.updateTireType(id, { name });
      setEditId(null);
      load();
    } catch (err: any) {
      setAddError(err.message || 'Failed to update');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setDeleteError('');
    try {
      await api.lookups.deleteTireType(id);
      load();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-bold text-slate-700 mb-1">Tire Types</p>
        <p className="text-xs text-slate-400 mb-4">
          These values appear in the "Tire Type" dropdown when adding or editing inventory items.
          You can add custom categories, rename existing ones, or delete those not in use.
        </p>

        {/* Add new */}
        <div className="flex gap-2 mb-4">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
            placeholder="New tire type name..."
            className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add
          </button>
        </div>

        {addError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-3 text-sm text-red-700">
            <AlertCircle size={14} />
            {addError}
          </div>
        )}
        {deleteError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-3 text-sm text-red-700">
            <AlertCircle size={14} />
            {deleteError}
          </div>
        )}

        {/* List */}
        {loadingList ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : types.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No tire types yet</div>
        ) : (
          <div className="space-y-2">
            {types.map(t => (
              <div
                key={t.id}
                className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2.5 group hover:border-slate-300 transition-colors"
              >
                <GripVertical size={14} className="text-slate-300 flex-shrink-0" />

                {editId === t.id ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit(t.id);
                        if (e.key === 'Escape') setEditId(null);
                      }}
                      className="flex-1 text-sm border border-blue-400 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => saveEdit(t.id)}
                      disabled={saving === t.id}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      {saving === t.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-slate-700">{t.name}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(t)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Rename"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        disabled={deletingId === t.id}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        {deletingId === t.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Trash2 size={13} />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Settings page ─────────────────────────────────────────────────────────
export default function Settings() {
  const [tab, setTab]           = useState<Tab>('company');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loaded, setLoaded]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    api.settings.get()
      .then(data => { setSettings(data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
    setSaveError('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      const updated = await api.settings.update(settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const isAutoSaveTab = tab === 'lookups' || tab === 'products';

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Configure company details, invoice defaults, products catalog, and lookup tables</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 mb-6 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-1 justify-center ${
                active
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5">
          {tab === 'company'  && <CompanyTab  settings={settings} onChange={handleChange} />}
          {tab === 'defaults' && <DefaultsTab settings={settings} onChange={handleChange} />}
          {tab === 'products' && <ProductsTab />}
          {tab === 'lookups'  && <LookupsTab />}
        </div>

        {/* Save bar — only for company/defaults tabs */}
        {!isAutoSaveTab && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
            {saveError ? (
              <span className="flex items-center gap-2 text-sm text-red-600 font-medium">
                <AlertCircle size={14} /> {saveError}
              </span>
            ) : saved ? (
              <span className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                <CheckCircle size={14} /> Settings saved successfully
              </span>
            ) : (
              <span className="text-xs text-slate-400">Changes are saved to the database and take effect immediately</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors min-w-28 justify-center flex-shrink-0"
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
                : <><Save size={14} /> Save Changes</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
