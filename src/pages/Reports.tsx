import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import { formatCurrency } from '../lib/utils';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function Reports() {
  const [sales, setSales]         = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [tires, setTires]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [s, p, t] = await Promise.all([
        api.sales.list(),
        api.purchases.list(),
        api.inventory.list(),
      ]);
      setSales(s); setPurchases(p); setTires(t);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Monthly aggregates from real data
  const currentYear = new Date().getFullYear();
  const monthlyData = MONTHS.map(month => {
    const rev = sales
      .filter(s => {
        const d = new Date(s.date);
        return d.getFullYear() === currentYear &&
               d.toLocaleString('en', { month: 'short' }) === month;
      })
      .reduce((sum, s) => sum + Number(s.total), 0);
    const pur = purchases
      .filter(p => {
        const d = new Date(p.date);
        return d.getFullYear() === currentYear &&
               d.toLocaleString('en', { month: 'short' }) === month;
      })
      .reduce((sum, p) => sum + Number(p.total), 0);
    return { month, revenue: rev, purchases: pur, profit: Math.round((rev - pur)) };
  });

  // P&L totals
  const totalRevenue = sales.reduce((s, i) => s + Number(i.total), 0);
  const totalCOGS    = purchases.filter(p => p.status === 'received').reduce((s, p) => s + Number(p.total), 0);
  const grossProfit  = totalRevenue - totalCOGS;
  const margin       = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  // Brand performance from inventory
  const brandMap: Record<string, { units: number; value: number; costValue: number }> = {};
  tires.forEach((t: any) => {
    const b = t.brand || 'Unknown';
    if (!brandMap[b]) brandMap[b] = { units: 0, value: 0, costValue: 0 };
    brandMap[b].units     += Number(t.stock);
    brandMap[b].value     += Number(t.stock) * Number(t.sale_price);
    brandMap[b].costValue += Number(t.stock) * Number(t.cost_price);
  });
  const brandData = Object.entries(brandMap)
    .map(([brand, d]) => ({ brand, units: d.units, revenue: d.value }))
    .sort((a, b) => b.revenue - a.revenue);
  const totalBrandRev = brandData.reduce((s, b) => s + b.revenue, 0);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <div className="flex justify-end">
        <button onClick={fetchAll}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="flex-shrink-0" /><span>Error: {error}</span>
        </div>
      )}

      {/* P&L Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total Revenue',  value: formatCurrency(totalRevenue), sub: 'All invoices',    color: 'border-t-blue-500' },
          { label: 'Cost of Goods',  value: formatCurrency(totalCOGS),    sub: 'Received POs',   color: 'border-t-violet-500' },
          { label: 'Gross Profit',   value: formatCurrency(grossProfit),  sub: 'Before expenses', color: 'border-t-emerald-500' },
          { label: 'Margin',         value: `${margin}%`,                 sub: 'Gross margin %',  color: 'border-t-amber-500' },
        ].map(s => (
          <div key={s.label} className={`bg-white rounded-xl p-3 sm:p-4 border border-slate-100 border-t-2 shadow-sm ${s.color}`}>
            <p className="text-xs text-slate-500 font-medium truncate">{s.label}</p>
            <p className={`text-sm sm:text-xl font-bold text-slate-900 mt-1 truncate ${loading ? 'opacity-40' : ''}`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Monthly Trend */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-100">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-1">Monthly Revenue Trend</h3>
          <p className="text-xs text-slate-500 mb-4">Revenue vs Purchases (PKR) — {currentYear}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '10px', fontSize: '11px' }} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="revenue"   name="Revenue"   fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="purchases" name="Purchases" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-100">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-1">Profit Trend</h3>
          <p className="text-xs text-slate-500 mb-4">Monthly gross profit (Revenue − Purchases)</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '10px', fontSize: '11px' }} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Brand Performance */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-100">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-1">Inventory by Brand</h3>
        <p className="text-xs text-slate-500 mb-4">Current stock units and value per brand</p>

        {loading ? (
          <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : brandData.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No inventory data</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Brand', 'Units in Stock', 'Inventory Value', 'Avg. Sale Price', 'Value Share'].map(h => (
                      <th key={h} className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {brandData.map(b => {
                    const share = totalBrandRev > 0 ? ((b.revenue / totalBrandRev) * 100).toFixed(1) : '0.0';
                    const avgPrice = b.units > 0 ? b.revenue / b.units : 0;
                    return (
                      <tr key={b.brand} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3.5 text-sm font-semibold text-slate-900">{b.brand}</td>
                        <td className="px-4 py-3.5 text-sm text-slate-700">{b.units} pcs</td>
                        <td className="px-4 py-3.5 text-sm font-bold text-slate-900">{formatCurrency(b.revenue)}</td>
                        <td className="px-4 py-3.5 text-sm text-slate-600">{formatCurrency(avgPrice)}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full max-w-24">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-sm font-medium text-slate-700">{share}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile brand cards */}
            <div className="sm:hidden space-y-3">
              {brandData.map(b => {
                const share = totalBrandRev > 0 ? ((b.revenue / totalBrandRev) * 100).toFixed(1) : '0.0';
                return (
                  <div key={b.brand} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{b.brand}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{b.units} units · {formatCurrency(b.revenue)}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${share}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-600">{share}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
