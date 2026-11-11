/**
 * Optional LLM narrative layer.
 *
 * The platform is fully functional without an API key: every explanation is
 * generated deterministically by the rule engine.  When a key is configured
 * this service can rewrite an existing, already-decided explanation into
 * business prose.  It never influences eligibility, suppression, scoring,
 * monetary values or any other business rule.
 */
import { env } from '../config/env';
import { logger } from './logger';

export const isLlmEnabled = () => Boolean(env.LLM_API_KEY && env.LLM_MODEL);

export async function enrichExplanation(input: {
  explanation: string;
  facts: Record<string, unknown>;
}): Promise<{ text: string; source: 'llm' | 'deterministic' }> {
  if (!isLlmEnabled()) {
    return { text: input.explanation, source: 'deterministic' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content:
              'You rewrite deterministic CRM explanations for business readers. Use only the supplied facts. Never invent numbers, never change a decision, never add a recommendation. Maximum 90 words.',
          },
          { role: 'user', content: JSON.stringify({ explanation: input.explanation, facts: input.facts }) },
        ],
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn('llm enrichment failed', { status: response.status });
      return { text: input.explanation, source: 'deterministic' };
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) return { text: input.explanation, source: 'deterministic' };
    return { text, source: 'llm' };
  } catch (error) {
    logger.warn('llm enrichment error', { message: error instanceof Error ? error.message : String(error) });
    return { text: input.explanation, source: 'deterministic' };
  }
}
