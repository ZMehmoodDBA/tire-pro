import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Loader2, CheckCircle } from 'lucide-react';
import { api } from '../api/client';
import { formatCurrency } from '../lib/utils';

interface NewPurchaseModalProps {
  onClose: () => void;
  onCreated: () => void;
}

interface LineItem {
  item_key: string;   // 'p:id' for product, 't:id' for tire
  item_name: string;
  qty: number;
  unit_price: number;
}

const EMPTY_ITEM: LineItem = { item_key: '', item_name: '', qty: 1, unit_price: 0 };

export default function NewPurchaseModal({ onClose, onCreated }: NewPurchaseModalProps) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products,  setProducts]  = useState<any[]>([]);
  const [tires,     setTires]     = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [date,   setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState('pending');
  const [notes,  setNotes]  = useState('');
  const [items,  setItems]  = useState<LineItem[]>([{ ...EMPTY_ITEM }]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.suppliers.list().then(setSuppliers).catch(() => {});
    api.products.list().then(d => setProducts(d.filter((p: any) => p.is_active))).catch(() => {});
    api.inventory.list().then(setTires).catch(() => {});
  }, []);

  const addItem    = () => setItems(p => [...p, { ...EMPTY_ITEM }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: keyof LineItem, value: string | number) => {
    setItems(prev => {
      const next = [...prev];
      if (field === 'item_key') {
        const v = value as string;
        if (v.startsWith('p:')) {
          const prod = products.find(p => String(p.id) === v.slice(2));
          next[i] = { item_key: v, item_name: prod?.name ?? '', qty: next[i].qty, unit_price: Number(prod?.cost_price ?? 0) };
        } else if (v.startsWith('t:')) {
          const tire = tires.find(t => String(t.id) === v.slice(2));
          next[i] = { item_key: v, item_name: tire ? `${tire.brand} ${tire.model} ${tire.size}` : '', qty: next[i].qty, unit_price: Number(tire?.cost_price ?? 0) };
        } else {
          next[i] = { ...EMPTY_ITEM };
        }
      } else {
        next[i] = { ...next[i], [field]: field === 'qty' || field === 'unit_price' ? Number(value) : value };
      }
      return next;
    });
  };

  const subtotal = items.reduce((s, it) => s + it.qty * it.unit_price, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) return setError('Please select a supplier.');
    if (items.some(it => !it.item_key || it.qty < 1)) return setError('Fill in all line items correctly.');
    setError('');
    setLoading(true);
    try {
      await api.purchases.create({
        supplier_id: Number(supplierId),
        date,
        status,
        notes,
        items: items.map(it => {
          const isProd = it.item_key.startsWith('p:');
          return {
            ...(isProd
              ? { product_id: Number(it.item_key.slice(2)) }
              : { tire_id:    Number(it.item_key.slice(2)) }),
            tire_name:  it.item_name,
            qty:        it.qty,
            unit_price: it.unit_price,
          };
        }),
      });
      setSuccess(true);
      setTimeout(() => { onCreated(); onClose(); }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to create purchase order');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-900">New Purchase Order</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Supplier <span className="text-red-500">*</span>
                </label>
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-slate-50"
                  required>
                  <option value="">Select supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-slate-50" />
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700">
                  Line Items <span className="text-red-500">*</span>
                </label>
                <button type="button" onClick={addItem}
                  className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 font-semibold">
                  <Plus size={13} /> Add Item
                </button>
              </div>

              <div className="hidden sm:grid grid-cols-12 gap-2 mb-1 px-1">
                <span className="col-span-6 text-xs text-slate-400 font-medium">Product / Tire</span>
                <span className="col-span-2 text-xs text-slate-400 font-medium text-center">Qty</span>
                <span className="col-span-3 text-xs text-slate-400 font-medium text-right">Cost Price</span>
                <span className="col-span-1"></span>
              </div>

              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-12 sm:col-span-6">
                      <select
                        value={item.item_key}
                        onChange={e => updateItem(i, 'item_key', e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-slate-50"
                        required
                      >
                        <option value="">Select item...</option>
                        {products.length > 0 && (
                          <optgroup label="── Products & Services ──">
                            {products.map(p => (
                              <option key={`p:${p.id}`} value={`p:${p.id}`}>
                                {p.name}{p.category ? ` (${p.category})` : ''}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {tires.length > 0 && (
                          <optgroup label="── Tires (Inventory) ──">
                            {tires.map(t => (
                              <option key={`t:${t.id}`} value={`t:${t.id}`}>
                                {t.brand} {t.model} {t.size}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input type="number" min={1}
                        value={item.qty}
                        onChange={e => updateItem(i, 'qty', e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 text-center bg-slate-50"
                        placeholder="Qty" />
                    </div>
                    <div className="col-span-7 sm:col-span-3">
                      <input type="number" min={0} step="0.01"
                        value={item.unit_price}
                        onChange={e => updateItem(i, 'unit_price', e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 text-right bg-slate-50"
                        placeholder="Cost" />
                    </div>
                    <div className="col-span-1 text-right">
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(i)}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-slate-50">
                  <option value="pending">Pending Delivery</option>
                  <option value="received">Received</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Notes</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-slate-50" />
              </div>
            </div>

            <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
              <div className="flex justify-between text-base font-bold text-slate-900">
                <span>Total Amount</span>
                <span className="text-violet-600">{formatCurrency(subtotal)}</span>
              </div>
              {status === 'received' && (
                <p className="text-xs text-emerald-600 font-medium mt-1.5">
                  ✓ Tire stock will be updated upon saving
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 flex-shrink-0">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || success}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-60 min-w-36 justify-center">
              {loading  ? <><Loader2 size={15} className="animate-spin" /> Saving...</>
               : success ? <><CheckCircle size={15} /> Saved!</>
               : 'Create PO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
