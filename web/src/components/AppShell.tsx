import { useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Heart, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import Assistant from './Assistant';
import { Logo, ShieldMark } from './Logo';
import { LanguageToggle, ThemeToggle } from './Toggles';
import { Avatar, Spinner } from './ui';

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-20 border-t border-ink-100">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm sm:grid-cols-[1fr_auto] sm:px-6">
        <div>
          <div className="flex items-center gap-2 font-bold text-ink-900">
            <ShieldMark className="size-6 text-ink-900" />
            RentShield
          </div>
          <p className="mt-2 max-w-sm text-ink-500">{t('Fair deposits, on record. Document the handover together, settle it with evidence.')}</p>
        </div>
        <nav className="flex gap-10 text-ink-500">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t('Product')}</p>
            <Link to="/app" className="hover:text-ink-900">
              {t('Your tenancies')}
            </Link>
            <Link to="/app/new" className="hover:text-ink-900">
              {t('New tenancy')}
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t('Support')}</p>
            <span>{t('Help assistant')}</span>
            <span>{t('Available in Hindi')}</span>
          </div>
        </nav>
      </div>
      <div className="border-t border-ink-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-ink-400 sm:px-6">
          <span>© {new Date().getFullYear()} RentShield</span>
          <span className="flex items-center gap-1">
            {t('Made with')} <Heart className="size-3 fill-red-500 text-red-500" /> {t('in India')}
          </span>
        </div>
      </div>
    </footer>
  );
}

/** Layout for signed-in pages. Redirects to login if there's no session. */
export default function AppShell() {
  const { user, loading, logout } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  // When the user logs out on purpose, send them home, not to the login page.
  const [leaving, setLeaving] = useState(false);

  if (loading) return <Spinner />;
  if (!user) return <Navigate to={leaving ? '/' : '/login'} replace state={leaving ? undefined : { from: location.pathname }} />;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Logo to="/app" />
          <div className="flex items-center gap-1.5 sm:gap-3">
            <LanguageToggle />
            <ThemeToggle />
            <div className="ml-1 hidden text-right md:block">
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
              title={t('Log out')}
              aria-label={t('Log out')}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
      <Footer />
      <Assistant />
    </div>
  );
}
