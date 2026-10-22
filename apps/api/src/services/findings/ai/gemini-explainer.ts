import type { IFinancialExplainer } from './explainer.interface.js';
import type { AiExplanation, FinancialFinding } from '@moneylens/shared';
import { aiExplanationSchema } from '@moneylens/shared';
import { DeterministicExplainer } from './deterministic-explainer.js';
import { AppError } from '../../../middleware/error-handler.js';
import { ERROR_CODES } from '@moneylens/shared';

export interface GeminiExplainerConfig {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export class GeminiExplainerAdapter implements IFinancialExplainer {
  private readonly deterministicFallback = new DeterministicExplainer();
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config?: GeminiExplainerConfig) {
    this.apiKey = config?.apiKey || process.env.GEMINI_API_KEY;
    this.model = config?.model || 'gemini-1.5-flash';
    this.timeoutMs = config?.timeoutMs || 5000;
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  public async explain(finding: FinancialFinding): Promise<AiExplanation> {
    if (!this.isAvailable()) {
      // Prompt requirement: "If no provider is configured, return an explicit, documented unavailable response or use a clearly labelled deterministic explanation path."
      // We fall back to the clearly labelled deterministic explanation:
      return this.deterministicFallback.explain(finding);
    }

    // When an API key is available in future environment setup, execute with privacy bounds
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      // Build privacy-conscious payload with zero credentials or unrelated financial accounts
      const promptPayload = {
        findingType: finding.findingType,
        title: finding.title,
        currency: finding.currency,
        estimatedAmountDecimal: (finding.estimatedAmountMinor / 100).toFixed(2),
        reason: finding.evidence.reason,
        amountsMinor: finding.evidence.amountsMinor,
        normalizedDescriptions: finding.evidence.normalizedDescriptions,
        dateDifferenceDays: finding.evidence.dateDifferenceDays,
      };

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const systemInstruction = `You are an AI financial auditor assistant for MoneyLens.
Analyze the structured evidence for a financial anomaly.
Explain what occurred in clear business language without accusing any party of fraud or wrongdoing.
Respond strictly in JSON matching the schema:
{
  "summary": string,
  "whyItWasFlagged": string,
  "evidenceSummary": string,
  "recommendedChecks": string[],
  "limitations": string[]
}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: `${systemInstruction}\n\nEvidence JSON: ${JSON.stringify(promptPayload)}` },
              ],
            },
          ],
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new AppError(
          502,
          ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
          `AI provider returned HTTP ${response.status}`,
        );
      }

      const responseBody = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };
      const rawText = responseBody?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

      // Clean possible markdown code fences from JSON
      const jsonText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;

      const explanation: AiExplanation = {
        findingId: finding.id,
        organizationId: finding.organizationId,
        summary: typeof parsed.summary === 'string' ? parsed.summary : finding.summary,
        whyItWasFlagged:
          typeof parsed.whyItWasFlagged === 'string'
            ? parsed.whyItWasFlagged
            : finding.evidence.reason,
        evidenceSummary:
          typeof parsed.evidenceSummary === 'string'
            ? parsed.evidenceSummary
            : `Analyzed via ${this.model}`,
        recommendedChecks: Array.isArray(parsed.recommendedChecks)
          ? parsed.recommendedChecks.filter((c): c is string => typeof c === 'string')
          : ['Review counterparty invoice and contract terms.'],
        limitations: Array.isArray(parsed.limitations)
          ? parsed.limitations.filter((l): l is string => typeof l === 'string')
          : ['AI explanation based solely on structured transaction evidence.'],
        generatedAt: new Date().toISOString(),
        provider: 'google_gemini',
        model: this.model,
      };

      return aiExplanationSchema.parse(explanation);
    } catch {
      // In case of network timeout, rate limit, or invalid JSON, fall back safely to deterministic explanation
      return this.deterministicFallback.explain(finding);
    }
  }
}
