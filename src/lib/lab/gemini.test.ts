import { ApiError, GenerateContentResponse, type GoogleGenAI } from '@google/genai';
import { describe, expect, it } from 'vitest';
import type { LabEvent } from './events';
import { GeminiModel, isDailyQuota, suggestedDelaySeconds } from './gemini';

const QUOTA_ERROR = new ApiError({
  status: 429,
  message:
    '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"12s"}]}}',
});
const overloaded = () => new ApiError({ status: 503, message: '{"error":{"code":503}}' });

function setup(results: (GenerateContentResponse | Error)[]) {
  const waits: number[] = [];
  const events: LabEvent[] = [];
  let calls = 0;
  const ai = {
    models: {
      generateContent: async () => {
        calls++;
        const result = results.shift();
        if (result === undefined || result instanceof Error) throw result;
        return result;
      },
    },
  } as unknown as Pick<GoogleGenAI, 'models'>;
  const model = new GeminiModel(
    'key',
    'm',
    (e) => events.push(e),
    async (ms) => {
      waits.push(ms);
    },
    ai,
  );
  return { model, waits, events, calls: () => calls };
}

describe('GeminiModel', () => {
  it('reads the retry delay Google suggests', () => {
    expect(suggestedDelaySeconds(QUOTA_ERROR)).toBe(12);
    expect(suggestedDelaySeconds(overloaded())).toBeUndefined();
  });

  it('retries a 429 after the suggested delay and logs it', async () => {
    const ok = new GenerateContentResponse();
    const { model, waits, events } = setup([QUOTA_ERROR, ok]);
    expect(await model.generate([])).toBe(ok);
    expect(waits).toEqual([12_000]);
    expect(events).toEqual([{ type: 'retry', status: 429, waitSeconds: 12 }]);
  });

  it('uses exponential backoff without a suggested delay and gives up after 3 attempts', async () => {
    const { model, waits, calls } = setup([overloaded(), overloaded(), overloaded()]);
    await expect(model.generate([])).rejects.toBeInstanceOf(ApiError);
    expect(waits).toEqual([2000, 4000]);
    expect(calls()).toBe(3);
  });

  it('does not retry when the daily quota is exhausted', async () => {
    const daily = new ApiError({
      status: 429,
      message:
        '{"error":{"details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}',
    });
    expect(isDailyQuota(daily)).toBe(true);
    expect(isDailyQuota(QUOTA_ERROR)).toBe(false);
    const { model, calls } = setup([daily]);
    await expect(model.generate([])).rejects.toBe(daily);
    expect(calls()).toBe(1);
  });

  it('does not retry client errors', async () => {
    const { model, calls } = setup([new ApiError({ status: 400, message: 'bad' })]);
    await expect(model.generate([])).rejects.toBeInstanceOf(ApiError);
    expect(calls()).toBe(1);
  });
});
