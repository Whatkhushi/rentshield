import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Logo } from './Logo';
import { Avatar, Spinner } from './ui';

/** Layout for signed-in pages. Redirects to login if there's no session. */
export default function AppShell() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  // When the user logs out on purpose, send them home, not to the login page.
  const [leaving, setLeaving] = useState(false);

  if (loading) return <Spinner />;
  if (!user) return <Navigate to={leaving ? '/' : '/login'} replace state={leaving ? undefined : { from: location.pathname }} />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo to="/app" />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-ink-900">{user.name}</p>
              <p className="text-xs text-ink-400">{user.email}</p>
            </div>
            <Avatar name={user.name} />
            <button
              onClick={() => {
                setLeaving(true);
                logout();
              }}
              className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-900"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
