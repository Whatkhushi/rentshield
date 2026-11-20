import { Languages, Moon, Sun } from 'lucide-react';
import { LANGS, useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { cx } from './ui';

/** Sun/moon button. `onDark` = placed on a dark background (home page, auth panel). */
export function ThemeToggle({ onDark }: { onDark?: boolean }) {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const label = theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode');
  return (
    <button
      onClick={toggle}
      className={cx('rounded-lg p-2 transition-colors', onDark ? 'text-snow/70 hover:bg-snow/10 hover:text-snow' : 'text-ink-400 hover:bg-ink-100 hover:text-ink-900')}
      title={label}
      aria-label={label}
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

/** EN / हि switch for the interface language. */
export function LanguageToggle({ onDark }: { onDark?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      className={cx('flex items-center gap-0.5 rounded-lg p-0.5 text-xs font-semibold', onDark ? 'bg-snow/10' : 'bg-ink-50')}
      role="group"
      aria-label={t('Language')}
      title={t('Language')}
    >
      <Languages className={cx('mx-1 size-3.5', onDark ? 'text-snow/60' : 'text-ink-400')} />
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={cx(
            'rounded-md px-2 py-1 transition-colors',
            lang === l.code ? (onDark ? 'bg-snow text-night' : 'bg-white text-ink-900 shadow-sm') : onDark ? 'text-snow/70 hover:text-snow' : 'text-ink-500 hover:text-ink-900',
          )}
          title={l.label}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
