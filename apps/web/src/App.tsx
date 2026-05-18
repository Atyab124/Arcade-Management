import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { useAuth } from './auth';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { BookingsPage } from './pages/BookingsPage';
import { POSPage } from './pages/POSPage';
import { MachinesPage } from './pages/MachinesPage';
import { ReportsPage } from './pages/ReportsPage';
import { WhatsAppPage } from './pages/WhatsAppPage';

export function App() {
  const { user } = useAuth();
  if (!user) return <LoginPage />;
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/pos" element={<POSPage />} />
          <Route path="/machines" element={<MachinesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/whatsapp" element={<WhatsAppPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function TopNav() {
  const { user, logout } = useAuth();
  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-6">
        <div className="font-bold text-lg">🎮 iFun City</div>
        <nav className="flex gap-1 text-sm flex-1">
          {[
            { to: '/', label: 'Dashboard' },
            { to: '/customers', label: 'Customers' },
            { to: '/bookings', label: 'Bookings' },
            { to: '/pos', label: 'POS' },
            { to: '/machines', label: 'Machines' },
            { to: '/reports', label: 'Reports' },
            { to: '/whatsapp', label: 'WhatsApp' },
          ].map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">{user?.name} <span className="text-slate-400">({user?.role})</span></span>
          <button onClick={logout} className="text-slate-500 hover:text-slate-900">Logout</button>
        </div>
      </div>
    </header>
  );
}
