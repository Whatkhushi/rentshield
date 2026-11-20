import { useEffect, useRef, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bot, Loader2, MessageCircleQuestion, Mic, MicOff, Send, Square, Volume2, VolumeX, X } from 'lucide-react';
import { api, apiStream, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { cx } from './ui';

// ---------- Browser speech APIs (not in TypeScript's DOM types) ----------

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type SpeechCtor = new () => SpeechRecognitionLike;
const SpeechRecognition: SpeechCtor | undefined =
  (window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition;

/** Languages offered for voice input (speech recognition needs to be told which one). */
const VOICE_LANGS = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'bn-IN', label: 'বাংলা' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'te-IN', label: 'తెలుగు' },
  { code: 'mr-IN', label: 'मराठी' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
  { code: 'gu-IN', label: 'ગુજરાતી' },
  { code: 'ml-IN', label: 'മലയാളം' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ' },
];

/** Pick a text-to-speech language from the script the answer is written in. */
function speechLangFor(text: string, fallback: string) {
  const scripts: [RegExp, string][] = [
    [/[ऀ-ॿ]/, fallback.startsWith('mr') ? 'mr-IN' : 'hi-IN'],
    [/[ঀ-৿]/, 'bn-IN'],
    [/[஀-௿]/, 'ta-IN'],
    [/[ఀ-౿]/, 'te-IN'],
    [/[ಀ-೿]/, 'kn-IN'],
    [/[઀-૿]/, 'gu-IN'],
    [/[ഀ-ൿ]/, 'ml-IN'],
    [/[਀-੿]/, 'pa-IN'],
  ];
  return scripts.find(([re]) => re.test(text))?.[1] ?? 'en-IN';
}

function speak(text: string, fallback: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = speechLangFor(text, fallback);
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

// ---------- Widget ----------

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

export default function Assistant() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState(lang === 'hi' ? 'hi-IN' : 'en-IN');
  const [readAloud, setReadAloud] = useState(false);
  const recognizer = useRef<SpeechRecognitionLike | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // If the user is inside a tenancy, the assistant gets that tenancy's status as context.
  const match = useMatch('/app/tenancy/:id/*');
  const leaseId = match ? Number(match.params.id) : undefined;

  const status = useQuery({ queryKey: ['assistant-status'], queryFn: () => api<{ enabled: boolean }>('/assistant/status'), enabled: open });

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history = [...messages.filter((m) => !m.error), { role: 'user' as const, content: question }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    abort.current = new AbortController();
    let answer = '';
    try {
      await apiStream(
        '/assistant/chat',
        { messages: history.slice(-20).map(({ role, content }) => ({ role, content })), leaseId, uiLanguage: lang },
        (e) => {
          if (typeof e.text === 'string') {
            answer += e.text;
            setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: answer }]);
          } else if (typeof e.error === 'string') {
            setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: e.error as string, error: true }]);
          }
        },
        abort.current.signal,
      );
      if (readAloud && answer) speak(answer, voiceLang);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = err instanceof ApiError ? err.message : t('The assistant couldn’t answer just now. Please try again.');
      setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: msg, error: true }]);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  function toggleMic() {
    if (!SpeechRecognition) return;
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    const r = new SpeechRecognition();
    r.lang = voiceLang;
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((res) => res[0].transcript)
        .join('');
      setInput(transcript);
      const last = e.results[e.results.length - 1];
      if (last?.isFinal) ask(transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognizer.current = r;
    setListening(true);
    r.start();
  }

  const suggestions = leaseId
    ? [t('What should I do next in this tenancy?'), t('Explain my deposit status simply'), t('What does “Record disagreement” mean?')]
    : [t('How do I start a move-in inspection?'), t('How do I invite my landlord?'), t('मेरा डिपॉज़िट कैसे सुरक्षित रहेगा?')];

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ink-900 py-3 pr-5 pl-4 text-sm font-semibold text-white shadow-xl shadow-ink-900/20 transition-transform hover:scale-105"
          aria-label={t('Open help assistant')}
        >
          <MessageCircleQuestion className="size-5" />
          {t('Help')}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="animate-rise fixed inset-0 z-50 flex flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-ink-100 sm:inset-auto sm:right-5 sm:bottom-5 sm:h-[600px] sm:max-h-[85vh] sm:w-[400px] sm:rounded-3xl">
          <div className="keep-light flex items-center gap-3 bg-night px-4 py-3.5 text-snow">
            <div className="grid size-9 place-items-center rounded-xl bg-ok-500/20 text-ok-500">
              <Bot className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{t('Help assistant')}</p>
              <p className="truncate text-xs text-ink-300">{t('Ask in any language, by typing or speaking')}</p>
            </div>
            <button
              onClick={() => {
                setReadAloud(!readAloud);
                window.speechSynthesis?.cancel();
              }}
              className={cx('rounded-lg p-2 hover:bg-snow/10', readAloud ? 'text-ok-500' : 'text-ink-300')}
              title={readAloud ? t('Reading answers aloud') : t('Read answers aloud')}
              aria-label={t('Read answers aloud')}
            >
              {readAloud ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-ink-300 hover:bg-snow/10 hover:text-snow" aria-label={t('Close')}>
              <X className="size-4" />
            </button>
          </div>

          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-paper p-4">
            {status.data && !status.data.enabled && (
              <div className="rounded-xl bg-warn-50 p-3 text-sm text-warn-700 ring-1 ring-warn-100">
                {t('The assistant isn’t switched on yet. The site owner needs to add an ANTHROPIC_API_KEY to the server.')}
              </div>
            )}
            {messages.length === 0 && (
              <div className="py-4 text-center">
                <p className="text-sm text-ink-600">
                  {leaseId ? t('I can see this tenancy’s status. Ask me anything about it or about using RentShield.') : t('Ask me how anything in RentShield works.')}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => ask(s)} className="rounded-xl bg-white px-3 py-2 text-left text-sm text-ink-700 ring-1 ring-ink-100 hover:ring-ink-300">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cx(
                    'group relative max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    m.role === 'user' ? 'rounded-br-md bg-ink-900 text-white' : 'rounded-bl-md bg-white text-ink-800 ring-1 ring-ink-100',
                    m.error && 'bg-red-50 text-red-700 ring-red-100',
                  )}
                >
                  {m.content || <Loader2 className="size-4 animate-spin text-ink-400" />}
                  {m.role === 'assistant' && m.content && !m.error && !(busy && i === messages.length - 1) && (
                    <button
                      onClick={() => speak(m.content, voiceLang)}
                      className="absolute -right-8 bottom-1 rounded-lg p-1 text-ink-300 opacity-0 transition-opacity hover:text-ink-700 group-hover:opacity-100"
                      title={t('Read aloud')}
                      aria-label={t('Read aloud')}
                    >
                      <Volume2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-ink-100 bg-white p-3">
            {listening && <p className="mb-2 animate-pulse text-center text-xs font-medium text-red-600">{t('Listening… speak now')}</p>}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
            >
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                placeholder={t('Type your question…')}
                className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border-0 bg-ink-50 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:ring-2 focus:ring-ink-700 focus:outline-none"
              />
              {SpeechRecognition && (
                <button
                  type="button"
                  onClick={toggleMic}
                  className={cx('grid size-10 shrink-0 place-items-center rounded-xl', listening ? 'bg-red-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100')}
                  title={listening ? t('Stop listening') : t('Speak your question')}
                  aria-label={listening ? t('Stop listening') : t('Speak your question')}
                >
                  {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </button>
              )}
              {busy ? (
                <button
                  type="button"
                  onClick={() => abort.current?.abort()}
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-900 text-white"
                  aria-label={t('Stop')}
                >
                  <Square className="size-3.5" />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()} className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-900 text-white disabled:opacity-40" aria-label={t('Send')}>
                  <Send className="size-4" />
                </button>
              )}
            </form>
            {SpeechRecognition && (
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-400">
                <label className="flex items-center gap-1.5">
                  {t('Voice language')}
                  <select value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)} className="rounded-md border-0 bg-ink-50 py-0.5 pr-6 pl-1.5 text-[11px] text-ink-700 focus:ring-1 focus:ring-ink-300">
                    {VOICE_LANGS.map((v) => (
                      <option key={v.code} value={v.code}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span>{t('AI can make mistakes')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
