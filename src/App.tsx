import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header, { type AppNotification } from './components/Header';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Purchases from './pages/Purchases';
import Invoices from './pages/Invoices';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Auth from './pages/Auth';
import Ledger from './pages/Ledger';
import Organizations from './pages/Organizations';
import BottomNav from './components/BottomNav';
import NewsBanner from './components/NewsBanner';
import { api } from './api/client';
import { getCachedSettings } from './lib/appSettings';

export interface AuthUser {
  name: string;
  email: string;
  role: string;
  organization_id: number;
  branch_id: number | null;
  organization?: { name: string; code: string; currency: string };
  branches?: { id: number; name: string; code: string }[];
}

const pages: Record<string, { title: string; subtitle: string; component: React.ComponentType }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Welcome back', component: Dashboard },
  sales: { title: 'Sales', subtitle: 'Manage customer sales and invoices', component: Sales },
  purchases: { title: 'Purchases', subtitle: 'Track supplier orders and deliveries', component: Purchases },
  invoices: { title: 'Invoices', subtitle: 'View and print professional invoices', component: Invoices },
  inventory: { title: 'Inventory', subtitle: 'Monitor tire stock levels', component: Inventory },
  customers: { title: 'Customers', subtitle: 'Manage customer relationships', component: Customers },
  suppliers: { title: 'Suppliers', subtitle: 'Manage supplier accounts', component: Suppliers },
  ledger:        { title: 'Financial Ledger',     subtitle: 'Banking-style accounts receivable & payable', component: Ledger },
  organizations: { title: 'Organizations',         subtitle: 'Manage organizations and branches',          component: Organizations },
  reports:       { title: 'Reports & Analytics',   subtitle: 'Business performance insights',              component: Reports },
  settings:      { title: 'Settings',              subtitle: 'Application configuration',                  component: Settings },
};

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activePage, setActivePage] = useState('dashboard');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Warm the settings cache so PDF generation and form defaults work immediately
  useEffect(() => { api.settings.get().catch(() => {}); }, []);

  // Fetch today's activity counts and build notification alerts
  useEffect(() => {
    if (!user) { setCounts({}); setNotifications([]); return; }
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([api.sales.list(), api.purchases.list()])
      .then(([salesData, purchasesData]) => {
        const todaySales      = (salesData      as any[]).filter(s => s.date?.slice(0, 10) === today).length;
        const todayPurchases  = (purchasesData  as any[]).filter(p => p.date?.slice(0, 10) === today).length;
        setCounts({ sales: todaySales, purchases: todayPurchases, invoices: todaySales });

        const notifs: AppNotification[] = [];
        const overdueCount = (salesData as any[]).filter(s => s.status === 'overdue').length;
        if (overdueCount > 0) notifs.push({
          id: 'overdue-sales',
          title: `${overdueCount} Overdue Invoice${overdueCount !== 1 ? 's' : ''}`,
          subtitle: 'Payment overdue — action required',
          page: 'sales',
          severity: 'error',
        });
        const pendingCount = (purchasesData as any[]).filter(p => p.status === 'pending').length;
        if (pendingCount > 0) notifs.push({
          id: 'pending-purchases',
          title: `${pendingCount} Pending Order${pendingCount !== 1 ? 's' : ''}`,
          subtitle: 'Awaiting delivery confirmation',
          page: 'purchases',
          severity: 'warning',
        });
        setNotifications(notifs);
      })
      .catch(() => {});
  }, [user]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setMobileSidebarOpen(false);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Auto-collapse sidebar on tablet
  useEffect(() => {
    if (window.innerWidth < 1280 && window.innerWidth >= 1024) {
      setSidebarCollapsed(true);
    }
  }, []);

  const handleAuth = (u: AuthUser) => {
    // Pick the branch: use user's assigned branch_id, or first branch, or default 1
    const branchId = u.branch_id ?? u.branches?.[0]?.id ?? 1;
    localStorage.setItem('orgId',    String(u.organization_id || 1));
    localStorage.setItem('branchId', String(branchId));
    setUser(u);
  };

  const handleLogout = () => {
    setUser(null);
    // Keep org/branch in localStorage so next login defaults to same context
  };

  if (!user) return <Auth onAuth={handleAuth} />;

  const page = pages[activePage] ?? pages.dashboard;
  const PageComponent = page.component;
  const title = activePage === 'dashboard' ? `Welcome back, ${user.name.split(' ')[0]}` : page.title;

  const sidebarWidth = isMobile ? 0 : sidebarCollapsed ? 72 : 256;

  const handleNavigate = (p: string) => {
    setActivePage(p);
    setMobileSidebarOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f0f4f7]">
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        user={user}
        onLogout={handleLogout}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
        counts={counts}
      />

      <div
        className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
        style={{ marginLeft: sidebarWidth }}
      >
        <NewsBanner message={getCachedSettings().announcement} />
        <Header
          title={title}
          subtitle={page.subtitle}
          user={user}
          onLogout={handleLogout}
          onMenuToggle={() => setMobileSidebarOpen(v => !v)}
          notifications={notifications}
          onNavigate={handleNavigate}
        />
        <main className="flex-1 overflow-y-auto pb-14 lg:pb-0">
          <PageComponent />
        </main>
      </div>

      <BottomNav activePage={activePage} onNavigate={handleNavigate} onLogout={handleLogout} counts={counts} />
    </div>
  );
}
