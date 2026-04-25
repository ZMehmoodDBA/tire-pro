import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Eye, Download, Printer, RefreshCw, AlertCircle, Trash2, ChevronDown, Loader2, FileSpreadsheet, CreditCard } from 'lucide-react';
import { api } from '../api/client';
import { formatCurrency, formatDate } from '../lib/utils';
import NewSaleModal from '../components/NewSaleModal';
import ExcelImportModal from '../components/ExcelImportModal';
import InvoiceViewModal from '../components/InvoiceViewModal';
import ConfirmDialog from '../components/ConfirmDialog';
import PaymentModal from '../components/PaymentModal';
import { printInvoice, downloadInvoice } from '../lib/invoicePdf';

const statusColor: Record<string, string> = {
  paid:    'bg-emerald-50 text-emerald-700 border border-emerald-100',
  partial: 'bg-blue-50   text-blue-700   border border-blue-100',
  pending: 'bg-amber-50  text-amber-700  border border-amber-100',
  overdue: 'bg-red-50    text-red-700    border border-red-100',
};

const STATUS_OPTIONS = [
  { value: 'paid',    label: 'Mark as Paid',    color: 'text-emerald-700' },
  { value: 'partial', label: 'Mark as Partial', color: 'text-blue-700' },
  { value: 'pending', label: 'Mark as Pending', color: 'text-amber-700' },
  { value: 'overdue', label: 'Mark as Overdue', color: 'text-red-700' },
];

export default function Sales() {
  const [sales, setSales]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [viewSale, setViewSale]   = useState<any>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [deleteSale, setDeleteSale]       = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [statusMenu, setStatusMenu]       = useState<number | null>(null);
  const [statusLoading, setStatusLoading] = useState<number | null>(null);
  const [paymentSale,  setPaymentSale]    = useState<any>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true); setError('');
    try { setSales(await api.sales.list()); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  // Close status menu on outside click
  useEffect(() => {
    if (statusMenu === null) return;
    const close = () => setStatusMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [statusMenu]);

  const handleView = async (id: number) => {
    setLoadingId(id);
    try { setViewSale(await api.sales.get(id)); }
    catch (e: any) { setError(e.message); }
    finally { setLoadingId(null); }
  };

  const handlePrint = async (id: number) => {
    setLoadingId(id);
    try { printInvoice(await api.sales.get(id)); }
    catch (e: any) { setError(e.message); }
    finally { setLoadingId(null); }
  };

  const handleDownload = async (id: number) => {
    setLoadingId(id);
    try { downloadInvoice(await api.sales.get(id)); }
    catch (e: any) { setError(e.message); }
    finally { setLoadingId(null); }
  };

  const handleStatusChange = async (id: number, status: string) => {
    setStatusLoading(id);
    setStatusMenu(null);
    try {
      await api.sales.updateStatus(id, status);
      setSales(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStatusLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteSale) return;
    setDeleteLoading(true);
    try {
      await api.sales.delete(deleteSale.id);
      setDeleteSale(null);
      fetchSales();
    } catch (e: any) {
      setDeleteSale(null);
      setError(e.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handlePaymentRecorded = (result: any) => {
    setSales(prev => prev.map(s =>
      s.id === result.payment?.sale_id
        ? { ...s, status: result.new_status, amount_paid: result.new_amount_paid }
        : s
    ));
  };

  const filtered = sales.filter(s => {
    const matchSearch = (s.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.invoice_no || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || s.status === filter;
    return matchSearch && matchFilter;
  });

  const total     = filtered.reduce((sum, s) => sum + Number(s.total), 0);
  const collected = filtered.reduce((sum, s) => sum + Number(s.amount_paid || 0), 0);
  const paid      = filtered.filter(s => s.status === 'paid').reduce((sum, s) => sum + Number(s.total), 0);
  const pending   = filtered.reduce((sum, s) => sum + Math.max(0, Number(s.total) - Number(s.amount_paid || 0)), 0);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Total Sales',  value: formatCurrency(total),     color: 'text-slate-900',   help: `${filtered.length} invoices` },
          { label: 'Collected',    value: formatCurrency(collected),  color: 'text-emerald-600', help: 'Total amount received' },
          { label: 'Outstanding',  value: formatCurrency(pending),    color: 'text-amber-600',   help: 'Balance due across all invoices' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-3 sm:p-4 border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-500 font-medium truncate">{s.label}</p>
            <p className={`text-sm sm:text-xl font-bold mt-1 ${s.color} truncate`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">{s.help}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 p-4 sm:p-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-bold text-slate-900">Sales Invoices</h3>
            <div className="flex items-center gap-2">
              <button onClick={fetchSales} title="Refresh" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setShowImport(true)}
                title="Import sales from Excel"
                className="flex items-center gap-1.5 bg-slate-100 text-slate-700 text-xs sm:text-sm font-medium px-2.5 sm:px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <FileSpreadsheet size={14} />
                <span className="hidden sm:inline">Import Excel</span>
              </button>
              <button
                onClick={() => setShowModal(true)}
                title="Create a new sales invoice"
                className="flex items-center gap-1.5 bg-blue-600 text-white text-xs sm:text-sm font-medium px-2.5 sm:px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">New Sale</span>
                <span className="sm:hidden">New</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search customer or invoice number..."
                className="pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
              />
            </div>
            <select
              value={filter} onChange={e => setFilter(e.target.value)}
              title="Filter by payment status"
              className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 sm:px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mx-4 sm:mx-5 mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={15} className="flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        {loading && !error && (
          <div className="p-6 space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        )}

        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Invoice #', 'Date', 'Customer', 'Subtotal', 'Tax', 'Total', 'Paid', 'Balance', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 sm:px-4 py-3 text-left last:text-center">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(sale => (
                  <tr key={sale.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5">
                      <span className="text-xs sm:text-sm font-semibold text-blue-600">{sale.invoice_no}</span>
                    </td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-xs sm:text-sm text-slate-600 whitespace-nowrap">{formatDate(sale.date)}</td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-xs sm:text-sm font-medium text-slate-900 max-w-[130px] truncate">{sale.customer_name}</td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-xs sm:text-sm text-slate-600 hidden md:table-cell">{formatCurrency(sale.subtotal)}</td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-xs sm:text-sm text-slate-500 hidden md:table-cell">{formatCurrency(sale.tax)}</td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-xs sm:text-sm font-bold text-slate-900 whitespace-nowrap">{formatCurrency(sale.total)}</td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-xs font-semibold text-emerald-600 whitespace-nowrap hidden lg:table-cell">
                      {formatCurrency(Number(sale.amount_paid || 0))}
                    </td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-xs font-semibold whitespace-nowrap hidden lg:table-cell">
                      {(() => {
                        const bal = Number(sale.total) - Number(sale.amount_paid || 0);
                        return <span className={bal > 0 ? 'text-amber-600' : 'text-slate-400'}>{formatCurrency(Math.max(0, bal))}</span>;
                      })()}
                    </td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5">
                      {/* Clickable status badge with dropdown */}
                      <div className="relative">
                        <button
                          onClick={e => { e.stopPropagation(); setStatusMenu(statusMenu === sale.id ? null : sale.id); }}
                          title="Click to change payment status"
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full capitalize cursor-pointer hover:opacity-80 transition-opacity ${statusColor[sale.status] || ''}`}
                        >
                          {statusLoading === sale.id ? <Loader2 size={10} className="animate-spin" /> : null}
                          {sale.status}
                          <ChevronDown size={10} />
                        </button>
                        {statusMenu === sale.id && (
                          <div
                            className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-20 min-w-36"
                            onClick={e => e.stopPropagation()}
                          >
                            <p className="text-xs font-semibold text-slate-400 px-3 py-1.5 border-b border-slate-100">Change Status</p>
                            {STATUS_OPTIONS.filter(o => o.value !== sale.status).map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => handleStatusChange(sale.id, opt.value)}
                                className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors ${opt.color}`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5">
                      <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                        <button
                          onClick={() => handleView(sale.id)}
                          disabled={loadingId === sale.id}
                          title="View invoice"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => handlePrint(sale.id)}
                          disabled={loadingId === sale.id}
                          title="Print invoice"
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors hidden sm:block disabled:opacity-40"
                        >
                          <Printer size={14} />
                        </button>
                        <button
                          onClick={() => handleDownload(sale.id)}
                          disabled={loadingId === sale.id}
                          title="Download PDF"
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors hidden sm:block disabled:opacity-40"
                        >
                          <Download size={14} />
                        </button>
                        {sale.status !== 'paid' && (
                          <button
                            onClick={() => setPaymentSale(sale)}
                            title="Record payment"
                            className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          >
                            <CreditCard size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteSale(sale)}
                          title="Delete invoice (restores stock)"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-sm">
                {sales.length === 0 ? 'No sales yet. Create your first invoice.' : 'No records match your search.'}
              </div>
            )}
          </div>
        )}

        <div className="px-4 sm:px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
          Showing {filtered.length} of {sales.length} records
        </div>
      </div>

      {showImport && (
        <ExcelImportModal
          entity="sales"
          onClose={() => setShowImport(false)}
          onImported={fetchSales}
        />
      )}
      {showModal && <NewSaleModal onClose={() => setShowModal(false)} onCreated={fetchSales} />}
      {viewSale  && <InvoiceViewModal sale={viewSale} onClose={() => setViewSale(null)} />}

      {deleteSale && (
        <ConfirmDialog
          title="Delete Invoice"
          message={`Delete invoice ${deleteSale.invoice_no} for ${deleteSale.customer_name}? Stock will be restored. This cannot be undone.`}
          confirmLabel="Delete Invoice"
          variant="danger"
          loading={deleteLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleteSale(null)}
        />
      )}
      {paymentSale && (
        <PaymentModal
          sale={paymentSale}
          onClose={() => setPaymentSale(null)}
          onPaymentRecorded={(result) => { handlePaymentRecorded(result); }}
        />
      )}
    </div>
  );
}
