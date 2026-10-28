/** Orchestration: conversation history and the function-calling loop. */
import { ApiError } from '@google/genai';
import type { Content, GenerateContentResponse, Part } from '@google/genai';
import type { LogEvent } from './events.js';
import { isDailyQuota } from './gemini.js';
import type { ToolExecutor } from './tools.js';

export interface ChatModel {
  generate(history: Content[]): Promise<GenerateContentResponse>;
}

export const EMPTY_REPLY =
  'No obtuve una respuesta válida del modelo. ¿Puedes reformular tu solicitud de inventario?';
export const TOO_MANY_STEPS =
  'La solicitud requirió demasiados pasos y la detuve. ¿Puedes dividirla en partes?';

export interface AgentOptions {
  maxToolRounds?: number;
  maxHistoryTurns?: number;
}

export class LogisticsAgent {
  readonly history: Content[];
  private readonly maxToolRounds: number;
  private readonly maxHistoryTurns: number;

  constructor(
    private readonly model: ChatModel,
    private readonly tools: ToolExecutor,
    history: readonly Content[] = [],
    private readonly log: LogEvent = () => {},
    { maxToolRounds = 5, maxHistoryTurns = 20 }: AgentOptions = {},
  ) {
    this.history = [...history];
    this.maxToolRounds = maxToolRounds;
    this.maxHistoryTurns = maxHistoryTurns;
  }

  /**
   * Handles one user message and returns the final text reply. A turn can take several rounds:
   * the model asks for tools, we run them, send the results back and repeat until it answers.
   */
  async send(message: string): Promise<string> {
    const turnStart = this.history.length;
    this.history.push({ role: 'user', parts: [{ text: message }] });
    let sideEffects = false; // true once a tool ran in this turn

    try {
      for (let round = 0; round < this.maxToolRounds; round++) {
        this.trimHistory();
        const response = await this.model.generate(this.history);
        const content = response.candidates?.[0]?.content;
        if (!content?.parts?.length) return this.failTurn(turnStart, sideEffects, EMPTY_REPLY);

        // Keep the model content untouched: it carries Gemini's thought signatures, which the
        // model needs to continue its reasoning in the next round.
        this.history.push({ ...content, role: 'model' });

        const calls = response.functionCalls;
        if (!calls?.length) return response.text ?? EMPTY_REPLY;

        const parts: Part[] = calls.map((call) => {
          const name = call.name ?? '';
          const result = this.tools.execute(name, call.args);
          sideEffects = true;
          return {
            functionResponse: { ...(call.id ? { id: call.id } : {}), name, response: result },
          };
        });
        this.history.push({ role: 'user', parts });
      }
      return this.failTurn(turnStart, sideEffects, TOO_MANY_STEPS);
    } catch (error) {
      const notice = describeError(error);
      this.log({ type: 'error', message: notice });
      return this.failTurn(turnStart, sideEffects, notice);
    }
  }

  private failTurn(turnStart: number, sideEffects: boolean, notice: string): string {
    if (!sideEffects) {
      // Nothing happened in the world: drop the turn so the user can retry with a clean context.
      this.history.splice(turnStart);
      return notice;
    }
    // A tool already ran (e.g. an order was issued): keep the record so the model does not repeat
    // it, and close the turn with a model message so user/model turns keep alternating.
    const last = this.history.at(-1);
    if (last?.role !== 'model' || last.parts?.some((part) => part.functionCall)) {
      this.history.push({ role: 'model', parts: [{ text: notice }] });
    }
    return notice;
  }

  /**
   * Sliding window over the last N user turns. It only cuts right before a user text message,
   * never between a function call and its response, so no call is left orphaned.
   */
  private trimHistory(): void {
    const starts = this.history.flatMap((content, index) =>
      content.role === 'user' && content.parts?.some((part) => part.text) ? [index] : [],
    );
    const cut = starts.at(-this.maxHistoryTurns);
    if (starts.length > this.maxHistoryTurns && cut !== undefined) this.history.splice(0, cut);
  }
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    console.error(`Gemini API error ${error.status}`);
    if (isDailyQuota(error)) {
      return 'Se agotó la cuota diaria gratuita de Gemini para este modelo; se renueva mañana. Puedes cambiar GEMINI_MODEL o activar facturación en Google AI Studio.';
    }
    if (error.status === 429) {
      return 'Se alcanzó el límite gratuito de solicitudes de Gemini. Espera un minuto y vuelve a intentarlo.';
    }
    return `No pude contactar al modelo (${error.status}). Intenta de nuevo.`;
  }
  console.error('Unexpected failure during the turn', error);
  return 'Ocurrió un error inesperado. Intenta de nuevo.';
}
