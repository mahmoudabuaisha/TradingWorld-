import Anthropic from "@anthropic-ai/sdk";
import { buildGrounding, buildUserMessage, answerDeterministic, EXPLAINER_SYSTEM_PROMPT, type AnalysisResult } from "@tradingworld/analysis-engine";
import type { Config } from "../config.js";

export interface AiAnswer { answer: string; provider: "anthropic" | "deterministic"; model?: string; grounded: true }

/**
 * Explanation / chat layer. Detection never depends on this service.
 * - anthropic: Claude answers strictly from the structured grounding payload.
 * - deterministic: rule-based answerer (offline, zero cost, always grounded).
 */
export class AiService {
  private client?: Anthropic;
  constructor(private cfg: Config) {
    if (cfg.AI_PROVIDER === "anthropic" && cfg.ANTHROPIC_API_KEY) this.client = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });
  }

  get enabled(): boolean { return !!this.client; }

  async ask(result: AnalysisResult, question: string, locale: "ar" | "en", zoneId?: string): Promise<AiAnswer> {
    if (!this.client) return { answer: answerDeterministic(result, question, locale, zoneId), provider: "deterministic", grounded: true };
    const grounding = buildGrounding(result, locale);
    const focus = zoneId ? (locale === "ar" ? `\n\nالمنطقة محل السؤال: ${zoneId}` : `\n\nZone in question: ${zoneId}`) : "";
    try {
      const res = await this.client.messages.create({
        model: this.cfg.ANTHROPIC_MODEL,
        max_tokens: this.cfg.AI_MAX_TOKENS,
        system: [{ type: "text", text: EXPLAINER_SYSTEM_PROMPT[locale], cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildUserMessage(grounding, question + focus, locale) }],
      });
      if (res.stop_reason === "refusal") {
        return { answer: answerDeterministic(result, question, locale, zoneId), provider: "deterministic", grounded: true };
      }
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { answer: text || answerDeterministic(result, question, locale, zoneId), provider: "anthropic", model: res.model, grounded: true };
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        // graceful degradation: the product keeps answering from structured data
        return { answer: answerDeterministic(result, question, locale, zoneId), provider: "deterministic", grounded: true };
      }
      throw err;
    }
  }
}
