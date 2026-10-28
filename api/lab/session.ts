/**
 * Vercel function: login state of the private lab section.
 *   GET    → { authenticated, configured }
 *   POST   { username, password } → sets the session cookie
 *   DELETE → logs out
 */
import { isSecure, json, readJson } from '../../src/lib/lab/http.js';
import {
  clearedSessionCookie,
  credentialsMatch,
  hasValidSession,
  readConfig,
  sessionCookie,
  signingKey,
} from '../../src/lib/lab/session.js';

/** Slows down password guessing (there is no database to count failed attempts). */
const FAILED_LOGIN_DELAY_MS = 800;
const MAX_FIELD_LENGTH = 200;

export function GET(request: Request): Response {
  const config = readConfig();
  return json(200, {
    configured: config !== null,
    authenticated: config !== null && hasValidSession(request, signingKey(config)),
  });
}

export async function POST(request: Request): Promise<Response> {
  const config = readConfig();
  if (!config) return json(503, { error: 'not_configured' });

  const body = await readJson(request);
  const username = body?.['username'];
  const password = body?.['password'];
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username.length > MAX_FIELD_LENGTH ||
    password.length > MAX_FIELD_LENGTH
  ) {
    return json(400, { error: 'invalid_request' });
  }

  if (!credentialsMatch(config, username, password)) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    return json(401, { error: 'invalid_credentials' });
  }
  return json(
    200,
    { authenticated: true },
    { 'Set-Cookie': sessionCookie(signingKey(config), isSecure(request)) },
  );
}

export function DELETE(request: Request): Response {
  return json(
    200,
    { authenticated: false },
    { 'Set-Cookie': clearedSessionCookie(isSecure(request)) },
  );
}
