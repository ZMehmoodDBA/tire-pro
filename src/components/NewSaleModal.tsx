import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Loader2, CheckCircle } from 'lucide-react';
import { api } from '../api/client';
import { formatCurrency } from '../lib/utils';
import { getCachedSettings } from '../lib/appSettings';

interface NewSaleModalProps {
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

export default function NewSaleModal({ onClose, onCreated }: NewSaleModalProps) {
  const appSettings = getCachedSettings();
  const TAX_RATE    = appSettings.default_tax_rate;
  const [customers, setCustomers] = useState<any[]>([]);
  const [products,  setProducts]  = useState<any[]>([]);
  const [tires,     setTires]     = useState<any[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [date,   setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState(appSettings.default_sale_status || 'pending');
  const [notes,  setNotes]  = useState('');
  const [items,  setItems]  = useState<LineItem[]>([{ ...EMPTY_ITEM }]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.customers.list().then(setCustomers).catch(() => {});
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
          next[i] = { item_key: v, item_name: prod?.name ?? '', qty: next[i].qty, unit_price: Number(prod?.sale_price ?? 0) };
        } else if (v.startsWith('t:')) {
          const tire = tires.find(t => String(t.id) === v.slice(2));
          next[i] = { item_key: v, item_name: tire ? `${tire.brand} ${tire.model} ${tire.size}` : '', qty: next[i].qty, unit_price: Number(tire?.sale_price ?? 0) };
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
  const tax      = subtotal * (TAX_RATE / 100);
  const total    = subtotal + tax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) return setError('Please select a customer.');
    if (items.some(it => !it.item_key || it.qty < 1)) return setError('Fill in all line items correctly.');
    setError('');
    setLoading(true);
    try {
      await api.sales.create({
        customer_id: Number(customerId),
        date,
        status,
        notes,
        tax_rate: TAX_RATE,
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
      setError(err.message || 'Failed to create sale');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-900">New Sale Invoice</h2>
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
                  Customer <span className="text-red-500">*</span>
                </label>
                <select
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                  required
                >
                  <option value="">Select customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700">
                  Line Items <span className="text-red-500">*</span>
                </label>
                <button type="button" onClick={addItem}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold">
                  <Plus size={13} /> Add Item
                </button>
              </div>

              <div className="hidden sm:grid grid-cols-12 gap-2 mb-1 px-1">
                <span className="col-span-6 text-xs text-slate-400 font-medium">Product / Tire</span>
                <span className="col-span-2 text-xs text-slate-400 font-medium text-center">Qty</span>
                <span className="col-span-3 text-xs text-slate-400 font-medium text-right">Unit Price</span>
                <span className="col-span-1"></span>
              </div>

              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-12 sm:col-span-6">
                      <select
                        value={item.item_key}
                        onChange={e => updateItem(i, 'item_key', e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
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
                                {t.brand} {t.model} {t.size} — Stock: {t.stock}
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
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center bg-slate-50"
                        placeholder="Qty" />
                    </div>
                    <div className="col-span-7 sm:col-span-3">
                      <input type="number" min={0} step="0.01"
                        value={item.unit_price}
                        onChange={e => updateItem(i, 'unit_price', e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right bg-slate-50"
                        placeholder="Price" />
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
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Payment Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50">
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Notes</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" />
              </div>
            </div>

            {/* Totals */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 border border-slate-100">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span><span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>Tax ({TAX_RATE}%)</span><span className="font-medium">{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total</span><span className="text-blue-600">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 flex-shrink-0">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || success}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed min-w-36 justify-center">
              {loading  ? <><Loader2 size={15} className="animate-spin" /> Saving...</>
               : success ? <><CheckCircle size={15} /> Saved!</>
               : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
