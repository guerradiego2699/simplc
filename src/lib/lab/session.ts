/**
 * Access control of the private lab section. Server-only (Vercel functions in `api/lab/`).
 *
 * Credentials live in environment variables, never in the repository or the browser bundle. The
 * session is a signed, HttpOnly cookie; the conversation state the browser keeps between turns is
 * signed with the same key, so it cannot be tampered with (e.g. injecting fake tool results).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface LabConfig {
  username: string;
  password: string;
  geminiApiKey: string;
  model: string | undefined;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): LabConfig | null {
  const username = env['LAB_USERNAME'];
  const password = env['LAB_PASSWORD'];
  const geminiApiKey = env['GEMINI_API_KEY'];
  if (!username || !password || !geminiApiKey) return null;
  return { username, password, geminiApiKey, model: env['GEMINI_MODEL'] || undefined };
}

/** Changing the password (or the API key) invalidates every session and saved conversation. */
export function signingKey(config: LabConfig): Buffer {
  return createHmac('sha256', config.geminiApiKey)
    .update(`plcampus-lab:${config.username}:${config.password}`)
    .digest();
}

const mac = (data: string, key: Buffer) => createHmac('sha256', key).update(data).digest();

export function sign(payload: unknown, key: Buffer): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${mac(data, key).toString('base64url')}`;
}

export function verify(token: string, key: Buffer): unknown {
  const [data, signature, ...rest] = token.split('.');
  if (!data || !signature || rest.length > 0) return null;
  const expected = mac(data, key);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

const digest = (text: string) => createHash('sha256').update(text).digest();

/** Constant-time comparison of both fields (no early exit that would leak which one failed). */
export function credentialsMatch(config: LabConfig, username: string, password: string): boolean {
  const userOk = timingSafeEqual(digest(username), digest(config.username));
  const passOk = timingSafeEqual(digest(password), digest(config.password));
  return userOk && passOk;
}

export const SESSION_COOKIE = 'lab_session';
export const SESSION_TTL_S = 8 * 60 * 60;

function cookie(value: string, maxAge: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    'Path=/api/lab',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function sessionCookie(key: Buffer, secure: boolean, now = Date.now()): string {
  const token = sign({ exp: Math.floor(now / 1000) + SESSION_TTL_S }, key);
  return cookie(token, SESSION_TTL_S, secure);
}

export const clearedSessionCookie = (secure: boolean): string => cookie('', 0, secure);

function readCookie(request: Request, name: string): string | undefined {
  for (const pair of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = pair.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

export function hasValidSession(request: Request, key: Buffer, now = Date.now()): boolean {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return false;
  const payload = verify(token, key);
  if (typeof payload !== 'object' || payload === null) return false;
  const exp = (payload as { exp?: unknown }).exp;
  return typeof exp === 'number' && exp * 1000 > now;
}
