import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, can } from './auth';
import { Login } from './pages/Login';
import { Search } from './pages/Search';
import { DealerManagement } from './pages/DealerManagement';
import { ImportExport } from './pages/ImportExport';
import { EmbedSearch } from './pages/EmbedSearch';

export function App() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const embed = location.pathname.startsWith('/embed');

  if (loading) return <div className="container">Loading…</div>;

  // Embedded mode (Salesforce iframe) — bare search, still authenticated.
  if (embed) {
    return (
      <div className="embed">
        <Routes>
          <Route path="/embed" element={user ? <EmbedSearch /> : <Login embedded />} />
        </Routes>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <>
      <nav className="topnav">
        <span className="brand">Dealer Locator 2025</span>
        <NavLink to="/search" className={({ isActive }) => (isActive ? 'active' : '')}>
          Search
        </NavLink>
        {['admin', 'ams_power_user', 'oem_office', 'dealer'].includes(user.role) && (
          <NavLink to="/manage" className={({ isActive }) => (isActive ? 'active' : '')}>
            {user.role === 'dealer' ? 'My Location' : 'Dealer Management'}
          </NavLink>
        )}
        {can(user.role, 'import_export') && (
          <NavLink to="/import-export" className={({ isActive }) => (isActive ? 'active' : '')}>
            Import / Export
          </NavLink>
        )}
        <span className="spacer" />
        <span className="who">
          {user.email} · {user.role}
        </span>
        <button className="secondary" onClick={logout}>
          Logout
        </button>
      </nav>
      <div className="container">
        <Routes>
          <Route path="/search" element={<Search />} />
          <Route path="/manage" element={<DealerManagement />} />
          <Route path="/import-export" element={<ImportExport />} />
          <Route path="*" element={<Navigate to="/search" replace />} />
        </Routes>
      </div>
    </>
  );
}
