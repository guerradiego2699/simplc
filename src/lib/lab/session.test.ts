import { GenerateContentResponse } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { decodeState, newConversation, runTurn } from './conversation';
import {
  credentialsMatch,
  hasValidSession,
  readConfig,
  SESSION_TTL_S,
  sessionCookie,
  sign,
  signingKey,
  verify,
} from './session';

const config = { username: 'demo', password: 'secret-pass', geminiApiKey: 'k', model: undefined };
const key = signingKey(config);

const withCookie = (setCookie: string) =>
  new Request('https://x.test/api/lab/chat', {
    headers: { cookie: `other=1; ${setCookie.split(';')[0]}` },
  });

describe('readConfig', () => {
  it('needs username, password and API key', () => {
    expect(readConfig({ LAB_USERNAME: 'a', LAB_PASSWORD: 'b' })).toBeNull();
    expect(readConfig({ LAB_USERNAME: 'a', LAB_PASSWORD: 'b', GEMINI_API_KEY: 'c' })).toEqual({
      username: 'a',
      password: 'b',
      geminiApiKey: 'c',
      model: undefined,
    });
  });
});

describe('credentials', () => {
  it('accepts only the exact username and password', () => {
    expect(credentialsMatch(config, 'demo', 'secret-pass')).toBe(true);
    expect(credentialsMatch(config, 'Demo', 'secret-pass')).toBe(false);
    expect(credentialsMatch(config, 'demo', 'secret-pas')).toBe(false);
    expect(credentialsMatch(config, '', '')).toBe(false);
  });
});

describe('signed tokens', () => {
  it('round-trips and rejects tampering or another key', () => {
    const token = sign({ a: 1 }, key);
    expect(verify(token, key)).toEqual({ a: 1 });

    const [data, mac] = token.split('.');
    const forged = `${Buffer.from('{"a":2}').toString('base64url')}.${mac}`;
    expect(verify(forged, key)).toBeNull();
    expect(verify(`${data}.`, key)).toBeNull();
    expect(verify('garbage', key)).toBeNull();
    expect(verify(token, signingKey({ ...config, password: 'other' }))).toBeNull();
  });
});

describe('session cookie', () => {
  it('is HttpOnly, SameSite=Strict, scoped to the API and Secure over https', () => {
    const cookie = sessionCookie(key, true);
    expect(cookie).toMatch(
      /^lab_session=[^;]+; Path=\/api\/lab; Max-Age=\d+; HttpOnly; SameSite=Strict; Secure$/,
    );
    expect(sessionCookie(key, false)).not.toMatch(/Secure/);
  });

  it('is valid until it expires', () => {
    const now = 1_000_000_000_000;
    const request = withCookie(sessionCookie(key, true, now));
    expect(hasValidSession(request, key, now)).toBe(true);
    expect(hasValidSession(request, key, now + SESSION_TTL_S * 1000 + 1)).toBe(false);
    expect(hasValidSession(request, signingKey({ ...config, password: 'changed' }), now)).toBe(
      false,
    );
    expect(hasValidSession(new Request('https://x.test'), key, now)).toBe(false);
  });
});

describe('conversation state', () => {
  it('survives between turns as a signed token', async () => {
    const reply = Object.assign(new GenerateContentResponse(), {
      candidates: [{ content: { role: 'model', parts: [{ text: 'Hola' }] } }],
    });
    const model = { generate: async () => reply };
    const first = await runTurn(() => model, key, 'hola', newConversation());
    expect(first.reply).toBe('Hola');

    const state = decodeState(first.state, key);
    expect(state?.history).toHaveLength(2);

    const second = await runTurn(() => model, key, 'otra vez', state!);
    expect(decodeState(second.state, key)?.history).toHaveLength(4);
  });

  it('rejects a state that was not signed by the server', () => {
    expect(
      decodeState(
        sign(
          { v: 1, history: [], inventory: { stock: {}, orders: [] } },
          signingKey({ ...config, username: 'x' }),
        ),
        key,
      ),
    ).toBeNull();
    expect(decodeState(sign({ v: 2 }, key), key)).toBeNull();
  });
});
