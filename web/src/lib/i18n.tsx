import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { HI } from './hi';

/**
 * Interface translations. Strings are written in English in the code and
 * looked up in a dictionary for other languages, so a missing translation
 * falls back to English instead of showing a broken key.
 *   t('Hello {name}', { name: 'Riya' })
 */
export type Lang = 'en' | 'hi';
export const LANGS: { code: Lang; label: string; short: string; speech: string }[] = [
  { code: 'en', label: 'English', short: 'EN', speech: 'en-IN' },
  { code: 'hi', label: 'हिन्दी', short: 'हि', speech: 'hi-IN' },
];

const DICTS: Record<Lang, Record<string, string>> = { en: {}, hi: HI };
const KEY = 'rentshield-lang';

type T = (s: string, vars?: Record<string, string | number>) => string;
const I18nContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: T } | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'hi') return saved;
  } catch {
    // storage unavailable
  }
  return navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // not persisted
    }
  }, [lang]);

  const t = useCallback<T>(
    (s, vars) => {
      let out = DICTS[lang][s] ?? s;
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
      return out;
    },
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export const useT = () => useI18n().t;
