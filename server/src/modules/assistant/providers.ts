import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

/**
 * The help assistant can run on different AI providers. Routes only talk to
 * this interface, so switching provider is a configuration change:
 *   GEMINI_API_KEY    -> Google Gemini (has a free tier)
 *   ANTHROPIC_API_KEY -> Claude
 *   neither           -> built-in FAQ answers (see faq.ts), no AI
 * ASSISTANT_PROVIDER=gemini|claude forces one when both keys are set.
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamResult {
  refused?: boolean;
  truncated?: boolean;
}

export interface AiProvider {
  name: 'gemini' | 'claude';
  stream(opts: { system: string; context: string; messages: ChatTurn[]; signal: AbortSignal; onText: (t: string) => void }): Promise<StreamResult>;
}

/** Thrown when the provider says "too many requests" (e.g. Gemini's free daily limit). */
export class QuotaError extends Error {}

// ---------- Gemini ----------

function gemini(apiKey: string): AiProvider {
  const ai = new GoogleGenAI({ apiKey });
  // "gemini-flash-latest" always points at Google's current Flash model, so the
  // app doesn't break when a specific version is retired. Override if needed.
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  return {
    name: 'gemini',
    async stream({ system, context, messages, signal, onText }) {
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          config: {
            systemInstruction: `${system}\n\n${context}`,
            maxOutputTokens: 2048,
            abortSignal: signal,
          },
        });
        let truncated = false;
        for await (const chunk of stream) {
          if (chunk.text) onText(chunk.text);
          if (chunk.candidates?.[0]?.finishReason === 'MAX_TOKENS') truncated = true;
        }
        return { truncated };
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 429) throw new QuotaError('Gemini free limit reached');
        throw err;
      }
    },
  };
}

// ---------- Claude ----------

function claude(): AiProvider {
  const client = new Anthropic();
  return {
    name: 'claude',
    async stream({ system, context, messages, signal, onText }) {
      const stream = client.beta.messages.stream(
        {
          model: 'claude-opus-5-5',
          max_tokens: 4000, // help answers are short by design; also a per-reply cost cap
          output_config: { effort: 'low' }, // chat doesn't need deep reasoning
          // If a safety classifier declines, retry on a suitable fallback model instead of failing.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [
            { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: context },
          ],
          messages,
        },
        { signal },
      );
      stream.on('text', onText);
      try {
        const final = await stream.finalMessage();
        return { refused: final.stop_reason === 'refusal', truncated: final.stop_reason === 'max_tokens' };
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) throw new QuotaError('Claude rate limit');
        throw err;
      }
    },
  };
}

let cached: AiProvider | null | undefined;

/** The configured provider, or null when no key is set (FAQ mode). */
export function getProvider(): AiProvider | null {
  if (cached !== undefined) return cached;
  const forced = process.env.ASSISTANT_PROVIDER;
  const gKey = process.env.GEMINI_API_KEY;
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (forced === 'claude' && hasClaude) cached = claude();
  else if (gKey && forced !== 'claude') cached = gemini(gKey);
  else if (hasClaude) cached = claude();
  else cached = null;
  return cached;
}

/** For tests: re-read the environment. */
export function resetProvider() {
  cached = undefined;
}
