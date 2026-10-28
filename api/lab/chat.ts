/**
 * Vercel function: one turn of the logistics agent.
 *   POST { message, state? } → { reply, events, inventory, state }
 * Requires the lab session cookie (see ./session.ts).
 */
import {
  decodeState,
  MAX_MESSAGE_LENGTH,
  newConversation,
  runTurn,
} from '../../src/lib/lab/conversation.js';
import { GeminiModel } from '../../src/lib/lab/gemini.js';
import { json, readJson } from '../../src/lib/lab/http.js';
import { hasValidSession, readConfig, signingKey } from '../../src/lib/lab/session.js';

export async function POST(request: Request): Promise<Response> {
  const config = readConfig();
  if (!config) return json(503, { error: 'not_configured' });
  const key = signingKey(config);
  if (!hasValidSession(request, key)) return json(401, { error: 'unauthorized' });

  const body = await readJson(request);
  const message = typeof body?.['message'] === 'string' ? body['message'].trim() : '';
  if (message === '' || message.length > MAX_MESSAGE_LENGTH) {
    return json(400, { error: 'invalid_message' });
  }

  const token = body?.['state'];
  const state = typeof token === 'string' ? decodeState(token, key) : newConversation();
  if (!state) return json(400, { error: 'invalid_state' });

  const result = await runTurn(
    (log) => new GeminiModel(config.geminiApiKey, config.model, log),
    key,
    message,
    state,
  );
  return json(200, result);
}
