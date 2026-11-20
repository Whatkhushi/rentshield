import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
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
    // Deep navy band (a slightly raised dark surface in dark mode) so it clearly ends the page.
    <footer className="mt-20 bg-night text-snow dark:border-t dark:border-ink-100 dark:bg-white">
      {/* Extra space at the bottom/right so the floating Help button never covers footer text. */}
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-6 pb-20 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-6 xl:pr-6 sm:pr-36">
        <div className="flex items-center gap-2 font-bold text-snow">
          <ShieldMark className="size-5 text-snow" />
          RentShield
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-snow/60">
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
      {/* White bar on the grey-blue page (a raised dark surface in dark mode). */}
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/90 shadow-[0_1px_2px_rgb(20_27_48/0.04)] backdrop-blur-md">
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
