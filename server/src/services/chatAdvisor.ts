import { llmComplete } from "./llm.js";
import { fallbackRecommendation } from "./claude.js";
import type { Pricelist, Rates, UsageInfo } from "../types.js";

/** The selection + customer fields the advisor can set as it guides the session. */
export interface ChatState {
  sku?: string;
  users?: number;
  fwImpl?: boolean;
  xdr?: boolean;
  xdrImpl?: boolean;
  managed?: boolean;
  competitiveModel?: string;
  markup?: number;
  customerName?: string;
  customerEmail?: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export const STEPS = [
  "intake", "competitive", "selectFw", "fwImpl", "xdr", "xdrImpl",
  "managed", "markup", "whitelabel", "send", "done",
] as const;
export type Step = (typeof STEPS)[number];

export interface AdviseResult {
  reply: string;
  patch: ChatState;
  step: Step;
  done: boolean;
  usage: UsageInfo | null; // null on the local fallback (no API call billed)
}

/** Response schema — passed to the backend for guided JSON (vLLM constrained decoding). */
const ADVISOR_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    reply: { type: "string" },
    patch: {
      type: "object",
      properties: {
        sku: { type: "string" },
        users: { type: "integer" },
        fwImpl: { type: "boolean" },
        xdr: { type: "boolean" },
        xdrImpl: { type: "boolean" },
        managed: { type: "boolean" },
        competitiveModel: { type: "string" },
        markup: { type: "number" },
        customerName: { type: "string" },
        customerEmail: { type: "string" },
      },
    },
    step: { type: "string", enum: [...STEPS] },
    done: { type: "boolean" },
  },
  required: ["reply", "patch", "step", "done"],
};

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Build the system prompt: persona, the guided flow, the catalog, and the JSON contract. */
function buildSystem(pricelist: Pricelist, rates: Rates, state: ChatState): string {
  const list = pricelist.firewalls
    .map((f) => {
      const price = f.list == null ? "price on request" : `list ${fmt(f.list)}`;
      const unit = f.unit === "annual" ? "/yr" : f.unit === "on_request" ? "" : " one-time";
      return `${f.sku} [${f.series}] up to ${f.maxUsers} users, ${price}${f.list == null ? "" : unit}`;
    })
    .join("\n");

  return [
    "You are the Cloudnomics Palo Alto Networks AI advisor. You guide a reseller who is NOT a Palo Alto expert through building a firewall quote — one friendly, plain-language step at a time (no jargon).",
    "You handle the WHOLE conversation: greet, recommend, and walk them through each decision warmly.",
    "You NEVER compute prices, discounts, or totals — the pricing engine does ALL the math. You only choose products and capture the reseller's decisions as a state patch.",
    "",
    "FLOW — move through these in order, ONE question per turn, and set `step` to the step your reply belongs to:",
    "1 intake: understand the requirement, then recommend ONE firewall SKU from the catalog (set patch.sku and patch.users). step=intake until you have recommended; after recommending, step=competitive.",
    "2 competitive: ask if they're upgrading from a competitor firewall (e.g. FortiGate). If yes, set patch.competitiveModel to that model. If NOT upgrading, set patch.competitiveModel to an empty string \"\" (never the word 'none'). step=selectFw afterwards.",
    "3 selectFw: let them confirm the firewall or switch hardware (PA-Series) vs virtual (VM-Series). step=fwImpl afterwards.",
    "4 fwImpl: offer professional implementation (priced at a % of the hardware). Set patch.fwImpl. step=xdr afterwards.",
    "5 xdr: offer Cortex XDR Pro for their user count. Set patch.xdr. If yes step=xdrImpl, else step=managed.",
    "6 xdrImpl: only if XDR was added — offer XDR implementation. Set patch.xdrImpl. step=managed afterwards.",
    "7 managed: offer a Cloudnomics managed service. Set patch.managed. step=markup afterwards.",
    `8 markup: ask the customer markup % they want (allowed ${rates.markupMin}–${rates.markupMax}%, or 0 to sell at cost). Set patch.markup. step=whitelabel afterwards.`,
    "9 whitelabel: capture the end customer's name and email. Set patch.customerName and patch.customerEmail. step=send afterwards.",
    "10 send: confirm everything is ready and the branded quote can be sent. step=send and done=true.",
    "",
    "CATALOG — only ever pick a SKU from this exact list. Never pick an on-request CN-Series product for a priced quote:",
    list,
    "",
    `CURRENT STATE (already captured): ${JSON.stringify(state)}`,
    "",
    "Respond with MINIFIED JSON ONLY — no markdown, no backticks, no prose outside the JSON. Keys:",
    '"reply": your next message to the reseller (1–3 warm, plain sentences).',
    '"patch": an object with ONLY the fields you are setting THIS turn (any of: sku, users, fwImpl, xdr, xdrImpl, managed, competitiveModel, markup, customerName, customerEmail). Omit fields you are not changing. Use {} if none.',
    `"step": one of ${STEPS.join(", ")}.`,
    '"done": true ONLY when the quote is fully built and you are confirming it can be sent; otherwise false.',
  ].join("\n");
}

/** Keep only valid, in-range fields from the model's proposed patch. */
function sanitizePatch(p: ChatState | undefined, pricelist: Pricelist, rates: Rates): ChatState {
  const out: ChatState = {};
  if (!p || typeof p !== "object") return out;
  if (typeof p.sku === "string") {
    const fw = pricelist.firewalls.find((f) => f.sku === p.sku);
    if (fw) out.sku = fw.sku; // must be a real catalog SKU
  }
  if (p.users != null && Number.isFinite(Number(p.users))) {
    out.users = Math.max(1, Math.min(1_000_000, Math.round(Number(p.users))));
  }
  for (const k of ["fwImpl", "xdr", "xdrImpl", "managed"] as const) {
    if (typeof p[k] === "boolean") out[k] = p[k];
  }
  if (typeof p.competitiveModel === "string") {
    // The model sometimes says "none"/"new deal" to mean "no upgrade" — treat
    // those as cleared so we don't wrongly apply the competitive discount.
    const v = p.competitiveModel.trim();
    out.competitiveModel = /^(none|n\/?a|no|new|new deal|not upgrading|skip)$/i.test(v) ? "" : v.slice(0, 80);
  }
  if (p.markup != null && Number.isFinite(Number(p.markup))) {
    out.markup = Math.max(0, Math.min(rates.markupMax, Math.round(Number(p.markup))));
  }
  if (typeof p.customerName === "string") out.customerName = p.customerName.trim().slice(0, 120);
  if (typeof p.customerEmail === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.customerEmail.trim())) {
    out.customerEmail = p.customerEmail.trim();
  }
  return out;
}

/** Best-effort step if the model returns an unknown one. */
function deriveStep(state: ChatState, patch: ChatState): Step {
  const s = { ...state, ...patch };
  if (!s.sku) return "intake";
  if (s.customerName && s.customerEmail) return "send";
  if (s.markup != null) return "whitelabel";
  return "selectFw";
}

/**
 * Advisor turn: given the conversation + current state, produce the next reply,
 * a validated state patch, and the step. Routed through the vendor-neutral LLM
 * layer (self-hosted or Anthropic, with fallback). Falls back to a local
 * heuristic on any failure / when no provider is configured. No pricing here.
 */
export async function advise(
  messages: ChatTurn[],
  state: ChatState,
  pricelist: Pricelist,
  rates: Rates
): Promise<AdviseResult> {
  try {
    const { text, usage } = await llmComplete({
      system: buildSystem(pricelist, rates, state),
      messages: messages.slice(-24).map((m) => ({ role: m.role, content: m.text })),
      maxTokens: 700,
      jsonSchema: ADVISOR_SCHEMA,
    });
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { reply?: string; patch?: ChatState; step?: string; done?: boolean };
    const patch = sanitizePatch(parsed.patch, pricelist, rates);
    const step = (STEPS as readonly string[]).includes(parsed.step || "")
      ? (parsed.step as Step)
      : deriveStep(state, patch);
    return {
      reply: (parsed.reply || "Let's keep building your quote.").trim(),
      patch,
      step,
      done: !!parsed.done || step === "done",
      usage,
    };
  } catch (err) {
    console.warn("[chat] advise failed, using fallback:", (err as Error).message);
    return fallbackAdvise(messages, state, pricelist);
  }
}

/**
 * No-API fallback: keeps the session moving deterministically. Recommends a
 * firewall on intake; otherwise nudges to the next step. Not as fluent as the
 * model, but never blocks the flow (used in dev or on API failure).
 */
function fallbackAdvise(messages: ChatTurn[], state: ChatState, pricelist: Pricelist): AdviseResult {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.text || "";
  if (!state.sku) {
    const rec = fallbackRecommendation(lastUser, pricelist);
    return {
      reply: rec.message + " Are you upgrading from a competitor firewall? Tell me the model for an extra discount, or say it's a new deal.",
      patch: { sku: rec.sku, users: rec.users },
      step: "competitive",
      done: false,
      usage: null,
    };
  }
  return {
    reply: "Noted. Let me know how you'd like to proceed, or pick an option below.",
    patch: {},
    step: deriveStep(state, {}),
    done: false,
    usage: null,
  };
}
