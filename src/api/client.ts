import { cacheSettingsMap } from '../lib/appSettings';

function orgHeaders(): Record<string, string> {
  const orgId    = localStorage.getItem('orgId')    || '1';
  const branchId = localStorage.getItem('branchId') || '1';
  return { 'X-Org-ID': orgId, 'X-Branch-ID': branchId };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...orgHeaders() },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  auth: {
    login:    (data: { email: string; password: string }) =>
      request<any>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    register: (data: any) =>
      request<{ success: boolean; organization_id: number; branch_id: number }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  },
  organizations: {
    list:   ()                      => request<any[]>('/organizations'),
    get:    (id: number)            => request<any>(`/organizations/${id}`),
    create: (data: any)             => request<any>('/organizations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/organizations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  branches: {
    list:   ()                      => request<any[]>('/branches'),
    get:    (id: number)            => request<any>(`/branches/${id}`),
    create: (data: any)             => request<any>('/branches', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/branches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number)            => request<any>(`/branches/${id}`, { method: 'DELETE' }),
  },
  customers: {
    list:   ()                  => request<any[]>('/customers'),
    get:    (id: number)        => request<any>(`/customers/${id}`),
    create: (data: any)         => request<any>('/customers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number)        => request<any>(`/customers/${id}`, { method: 'DELETE' }),
    bulk:   (data: any)         => request<any>('/customers/bulk', { method: 'POST', body: JSON.stringify(data) }),
  },
  suppliers: {
    list:   ()                  => request<any[]>('/suppliers'),
    get:    (id: number)        => request<any>(`/suppliers/${id}`),
    create: (data: any)         => request<any>('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number)        => request<any>(`/suppliers/${id}`, { method: 'DELETE' }),
    bulk:   (data: any)         => request<any>('/suppliers/bulk', { method: 'POST', body: JSON.stringify(data) }),
  },
  inventory: {
    list:   ()                  => request<any[]>('/inventory'),
    get:    (id: number)        => request<any>(`/inventory/${id}`),
    create: (data: any)         => request<any>('/inventory', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number)        => request<any>(`/inventory/${id}`, { method: 'DELETE' }),
    bulk:   (data: any)         => request<any>('/inventory/bulk', { method: 'POST', body: JSON.stringify(data) }),
  },
  sales: {
    list:         ()             => request<any[]>('/sales'),
    get:          (id: number)   => request<any>(`/sales/${id}`),
    create:       (data: any)    => request<any>('/sales', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: number, status: string) =>
      request<any>(`/sales/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    delete:       (id: number)   => request<any>(`/sales/${id}`, { method: 'DELETE' }),
    bulk:         (data: any)    => request<any>('/sales/bulk', { method: 'POST', body: JSON.stringify(data) }),
    byTireType:   ()             => request<{ tire_type: string; item_count: number; revenue: number }[]>('/sales/by-tire-type'),
  },
  purchases: {
    list:         ()             => request<any[]>('/purchases'),
    get:          (id: number)   => request<any>(`/purchases/${id}`),
    create:       (data: any)    => request<any>('/purchases', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: number, status: string) =>
      request<any>(`/purchases/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    delete:       (id: number)   => request<any>(`/purchases/${id}`, { method: 'DELETE' }),
    bulk:         (data: any)    => request<any>('/purchases/bulk', { method: 'POST', body: JSON.stringify(data) }),
  },
  settings: {
    get: async (): Promise<Record<string, string>> => {
      const data = await request<Record<string, string>>('/settings');
      cacheSettingsMap(data);
      return data;
    },
    update: async (data: Record<string, string>): Promise<Record<string, string>> => {
      const result = await request<Record<string, string>>('/settings', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      cacheSettingsMap(result);
      return result;
    },
  },
  products: {
    list:   ()                      => request<any[]>('/products'),
    create: (data: any)             => request<any>('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number)            => request<any>(`/products/${id}`, { method: 'DELETE' }),
  },
  lookups: {
    tireTypes:       ()                        => request<any[]>('/lookups/tire-types'),
    addTireType:     (name: string)            => request<any>('/lookups/tire-types', { method: 'POST', body: JSON.stringify({ name }) }),
    updateTireType:  (id: number, data: any)   => request<any>(`/lookups/tire-types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteTireType:  (id: number)              => request<any>(`/lookups/tire-types/${id}`, { method: 'DELETE' }),
  },
  payments: {
    recordSalePayment:     (data: any)         => request<any>('/payments/sale', { method: 'POST', body: JSON.stringify(data) }),
    getSalePayments:       (saleId: number)    => request<any[]>(`/payments/sale/${saleId}`),
    deleteSalePayment:     (id: number)        => request<any>(`/payments/sale/${id}`, { method: 'DELETE' }),
    recordPurchasePayment: (data: any)         => request<any>('/payments/purchase', { method: 'POST', body: JSON.stringify(data) }),
    getPurchasePayments:   (purchaseId: number) => request<any[]>(`/payments/purchase/${purchaseId}`),
    deletePurchasePayment: (id: number)        => request<any>(`/payments/purchase/${id}`, { method: 'DELETE' }),
  },
  ledger: {
    summary:           ()           => request<any>('/ledger/summary'),
    customers:         ()           => request<any[]>('/ledger/customers'),
    suppliers:         ()           => request<any[]>('/ledger/suppliers'),
    customerStatement: (id: number) => request<any>(`/ledger/customer/${id}/statement`),
    supplierStatement: (id: number) => request<any>(`/ledger/supplier/${id}/statement`),
    unpaidInvoices:    (id: number) => request<any[]>(`/ledger/customer/${id}/unpaid-invoices`),
    unpaidPOs:         (id: number) => request<any[]>(`/ledger/supplier/${id}/unpaid-pos`),
  },
};
