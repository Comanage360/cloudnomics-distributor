import { config } from "../config.js";
import type { UsageInfo } from "../types.js";

/**
 * Vendor-neutral LLM layer. The app talks to `llmComplete`, never to a specific
 * provider — so we can run on self-hosted vLLM, Anthropic, or any OpenAI-compatible
 * endpoint by changing env. This is what gives vendor independence.
 */

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmCompleteOpts {
  system: string;
  messages: LlmMessage[];
  maxTokens: number;
  /** When set, ask the backend to constrain output to this JSON schema (vLLM guided decoding). */
  jsonSchema?: Record<string, unknown>;
}

export interface LlmResult {
  text: string;
  usage: UsageInfo | null;
}

export interface LlmProvider {
  readonly name: string;
  complete(opts: LlmCompleteOpts): Promise<LlmResult>;
}

/** fetch with one retry on a transient rate-limit / overload (429/529). */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let res: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 529) break;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
  }
  return res!;
}

// ---- Anthropic (Messages API) ----
interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export const anthropicProvider: LlmProvider = {
  name: "anthropic",
  async complete({ system, messages, maxTokens }) {
    if (!config.anthropic.apiKey) throw new Error("anthropic: no API key");
    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.anthropic.apiKey,
        "anthropic-version": config.anthropic.version,
      },
      body: JSON.stringify({
        model: config.anthropic.model,
        max_tokens: maxTokens,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`anthropic API ${res.status}`);
    const data = (await res.json()) as AnthropicResponse;
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("");
    return {
      text,
      usage: {
        model: config.anthropic.model,
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
    };
  },
};

// ---- OpenAI-compatible (self-hosted vLLM, or any compatible endpoint) ----
interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Cache a GCP metadata ID token for the configured audience (Cloud Run auth). */
let cachedToken: { token: string; exp: number } | null = null;
async function gcpIdToken(audience: string): Promise<string | null> {
  if (!audience) return null;
  const now = Date.now();
  if (cachedToken && cachedToken.exp > now + 60_000) return cachedToken.token;
  try {
    const res = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}&format=full`,
      { headers: { "Metadata-Flavor": "Google" } }
    );
    if (!res.ok) return null;
    const token = (await res.text()).trim();
    cachedToken = { token, exp: now + 50 * 60_000 }; // GCE ID tokens last ~1h
    return token;
  } catch {
    return null;
  }
}

export const openAICompatibleProvider: LlmProvider = {
  name: "openai-compatible",
  async complete({ system, messages, maxTokens, jsonSchema }) {
    const base = config.llm.baseUrl;
    if (!base) throw new Error("openai-compatible: no LLM_BASE_URL");

    const headers: Record<string, string> = { "content-type": "application/json" };
    // Prefer an explicit API key; otherwise use a GCP ID token (Cloud Run private service).
    if (config.llm.apiKey) headers.authorization = `Bearer ${config.llm.apiKey}`;
    else {
      const idToken = await gcpIdToken(config.llm.idTokenAudience);
      if (idToken) headers.authorization = `Bearer ${idToken}`;
    }

    const body: Record<string, unknown> = {
      model: config.llm.model,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
    };
    // vLLM guided decoding: constrain output to our schema for reliable JSON.
    if (jsonSchema) {
      body.guided_json = jsonSchema;
      body.response_format = { type: "json_object" };
    }

    const res = await fetchWithRetry(`${base.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`openai-compatible API ${res.status}`);
    const data = (await res.json()) as OpenAIResponse;
    const text = data.choices?.[0]?.message?.content || "";
    return {
      text,
      usage: {
        model: config.llm.model || "self-hosted",
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  },
};

/**
 * Provider order: the configured primary first, then the other as a fallback
 * (only if it's configured). Lets us run self-hosted with Anthropic as a safety
 * net during cutover, or vice versa. Empty if nothing is configured.
 */
function providerChain(): LlmProvider[] {
  const self = config.llm.baseUrl ? openAICompatibleProvider : null;
  const anthropic = config.anthropic.apiKey ? anthropicProvider : null;
  const order = config.llm.provider === "self" ? [self, anthropic] : [anthropic, self];
  return order.filter((p): p is LlmProvider => p !== null);
}

/** Complete against the primary provider, falling back to the secondary on failure. */
export async function llmComplete(opts: LlmCompleteOpts): Promise<LlmResult> {
  const chain = providerChain();
  if (!chain.length) throw new Error("no LLM provider configured");
  let lastErr: unknown;
  for (const p of chain) {
    try {
      return await p.complete(opts);
    } catch (e) {
      lastErr = e;
      console.warn(`[llm] provider '${p.name}' failed: ${(e as Error).message}`);
    }
  }
  throw lastErr ?? new Error("all LLM providers failed");
}
