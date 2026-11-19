import { Link, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import NewTenancyPage from './pages/NewTenancyPage';
import TenancyPage from './pages/tenancy/TenancyPage';
import InvitePage from './pages/InvitePage';

export default function App() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route path="login" element={<AuthPage mode="login" />} />
      <Route path="register" element={<AuthPage mode="register" />} />
      <Route path="invite/:token" element={<InvitePage />} />
      <Route path="app" element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="new" element={<NewTenancyPage />} />
        <Route path="tenancy/:id/*" element={<TenancyPage />} />
      </Route>
      <Route
        path="*"
        element={
          <div className="grid min-h-screen place-items-center text-center">
            <div>
              <h1 className="text-2xl font-semibold">Page not found</h1>
              <Link to="/" className="mt-3 inline-block text-ink-600 underline">
                Go home
              </Link>
            </div>
          </div>
        }
      />
    </Routes>
  );
}
