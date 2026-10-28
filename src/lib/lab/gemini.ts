/** Gemini client setup. The only module that talks to the API. */
import {
  ApiError,
  FunctionCallingConfigMode,
  GoogleGenAI,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
} from '@google/genai';
import type { ChatModel } from './agent.js';
import type { LogEvent } from './events.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { TOOLS } from './tools.js';

export const DEFAULT_MODEL = 'gemini-3.6-flash';

/** 429: per-minute quota (the free tier allows few requests); 5xx: temporary overload. */
const RETRYABLE = new Set([429, 500, 503, 504]);
const MAX_ATTEMPTS = 3;
const MAX_WAIT_S = 20;
const REQUEST_TIMEOUT_MS = 25_000;
/** Keeps retries inside the function's 60 s limit (vercel.json). */
const BUDGET_MS = 50_000;

const CONFIG: GenerateContentConfig = {
  systemInstruction: SYSTEM_PROMPT,
  tools: TOOLS,
  // Tools run in our own loop (validation + logging), not automatically inside the SDK.
  automaticFunctionCalling: { disable: true },
  toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
  httpOptions: { timeout: REQUEST_TIMEOUT_MS },
};

/** The free tier also caps requests per day; waiting a few seconds does not help with that one. */
export const isDailyQuota = (error: ApiError): boolean =>
  error.status === 429 && /PerDay/.test(error.message);

/** Reads the RetryInfo.retryDelay (e.g. "27s") that Google attaches to 429 errors. */
export function suggestedDelaySeconds(error: ApiError): number | undefined {
  const match =
    /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(error.message) ??
    /retry in (\d+(?:\.\d+)?)s/i.exec(error.message);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

export class GeminiModel implements ChatModel {
  private readonly ai: Pick<GoogleGenAI, 'models'>;

  constructor(
    apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
    private readonly log: LogEvent = () => {},
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
    ai?: Pick<GoogleGenAI, 'models'>,
  ) {
    this.ai = ai ?? new GoogleGenAI({ apiKey });
  }

  async generate(history: Content[]): Promise<GenerateContentResponse> {
    const deadline = Date.now() + BUDGET_MS;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.ai.models.generateContent({
          model: this.model,
          contents: history,
          config: CONFIG,
        });
      } catch (error) {
        if (!(error instanceof ApiError) || !RETRYABLE.has(error.status) || isDailyQuota(error)) {
          throw error;
        }
        const waitMs = Math.min(suggestedDelaySeconds(error) ?? 2 ** attempt, MAX_WAIT_S) * 1000;
        if (attempt >= MAX_ATTEMPTS || Date.now() + waitMs + REQUEST_TIMEOUT_MS > deadline) {
          throw error;
        }
        this.log({ type: 'retry', status: error.status, waitSeconds: Math.round(waitMs / 1000) });
        await this.sleep(waitMs);
      }
    }
  }
}
