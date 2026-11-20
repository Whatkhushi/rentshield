/**
 * Quick check that GEMINI_API_KEY works: lists a few available models and
 * asks one short question. Run: npx tsx --env-file=.env scripts/check-gemini.ts
 * Never prints the key.
 */
import { GoogleGenAI } from '@google/genai';

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.log('GEMINI_API_KEY is not set in server/.env');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: key });
const timeout = (ms: number) => new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s`)), ms));

try {
  const pager = (await Promise.race([ai.models.list(), timeout(15000)])) as Awaited<ReturnType<typeof ai.models.list>>;
  const names: string[] = [];
  for await (const m of pager) {
    if (m.name?.includes('flash')) names.push(m.name);
    if (names.length >= 8) break;
  }
  console.log('Key accepted. Some Flash models:', names.join(', ') || '(none listed)');
} catch (e) {
  console.log('Listing models failed:', (e as Error).message.slice(0, 300));
}

try {
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const r = (await Promise.race([
    ai.models.generateContent({ model, contents: 'Reply with just the word OK.' }),
    timeout(20000),
  ])) as Awaited<ReturnType<typeof ai.models.generateContent>>;
  console.log(`Test question on ${model}:`, JSON.stringify(r.text?.trim()));
} catch (e) {
  console.log('Test question failed:', (e as Error).message.slice(0, 400));
}
