import { config } from "../config.js";
import type { Pricelist, Recommendation } from "../types.js";

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Heuristic: does the requirement describe a virtual/cloud deployment? */
function wantsVirtual(requirement: string): boolean {
  return /\b(virtual|vm|cloud|aws|azure|gcp|google cloud|data ?cent(er|re)|hypervisor|vmware|kvm|esxi)\b/i.test(
    requirement
  );
}

/** Local fallback: size by detected user count + inferred type, no API needed. */
export function fallbackRecommendation(
  requirement: string,
  pricelist: Pricelist
): Recommendation {
  const m = requirement.replace(/,/g, "").match(/(\d{2,6})/);
  const users = m ? parseInt(m[1], 10) : 200;
  const series = wantsVirtual(requirement) ? "VM-Series" : "PA-Series";
  // Only price-able rows in the inferred series; fall back to any priceable row.
  const inSeries = pricelist.firewalls.filter((f) => f.list != null && f.series === series);
  const pool = inSeries.length
    ? inSeries
    : pricelist.firewalls.filter((f) => f.list != null);
  const fw = pool.find((f) => users <= f.maxUsers) || pool[pool.length - 1];
  const kind = fw.series === "VM-Series" ? "virtual firewall" : "firewall";
  return {
    sku: fw.sku,
    users,
    series: fw.series,
    unit: fw.unit,
    message: `For around ${users} users, the ${fw.sku} is the right fit — it's a ${kind} sized for up to ${fw.maxUsers} seats with room to grow.`,
    source: "fallback",
  };
}

interface AnthropicTextBlock { type: string; text?: string }
interface AnthropicResponse { content?: AnthropicTextBlock[] }

/**
 * Ask Claude to recommend the best firewall SKU. Falls back locally on any
 * failure or when no API key is configured. Claude never does the pricing math.
 */
export async function recommendFirewall(
  requirement: string,
  pricelist: Pricelist
): Promise<Recommendation> {
  if (!config.anthropic.apiKey) return fallbackRecommendation(requirement, pricelist);

  const system =
    "You are the Cloudnomics Palo Alto Networks advisor helping a reseller who is NOT a Palo Alto expert. " +
    "Given their requirement and the firewall pricelist, pick the single best firewall SKU. " +
    "Choose hardware (PA-Series) for physical offices/branches/on-prem, and virtual (VM-Series) when the " +
    "requirement mentions cloud, virtual, a data center, or a hypervisor (AWS/Azure/GCP/VMware). " +
    "Do NOT pick on-request products (CN-Series) — they have no price. " +
    "Respond with MINIFIED JSON ONLY — no markdown, no backticks, no prose. " +
    'Keys: "sku" (exactly one listed SKU), "users" (integer detected or sensibly estimated), ' +
    '"message" (one or two warm, plain-language sentences to the reseller — no jargon).';

  const listText = pricelist.firewalls
    .map((f) => {
      const price = f.list == null ? "price on request" : `list ${fmt(f.list)}`;
      const unit = f.unit === "annual" ? "/yr" : f.unit === "on_request" ? "" : " one-time";
      return `${f.sku} [${f.series}]: up to ${f.maxUsers} users, ${price}${f.list == null ? "" : unit}`;
    })
    .join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.anthropic.apiKey,
        "anthropic-version": config.anthropic.version,
      },
      body: JSON.stringify({
        model: config.anthropic.model,
        max_tokens: 1000,
        system,
        messages: [
          {
            role: "user",
            content: `Reseller requirement: "${requirement}"\n\nFirewall pricelist:\n${listText}`,
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = (await res.json()) as AnthropicResponse;
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    const parsed = JSON.parse(text) as Partial<Recommendation>;
    const picked = pricelist.firewalls.find((f) => f.sku === parsed.sku);
    // Reject an unknown SKU or an on-request product (CN-Series has no price).
    if (!parsed.sku || !picked || picked.unit === "on_request" || picked.list == null) {
      throw new Error("invalid or unpriceable SKU");
    }
    const users =
      parsed.users && !Number.isNaN(Number(parsed.users))
        ? Number(parsed.users)
        : fallbackRecommendation(requirement, pricelist).users;

    return {
      sku: picked.sku,
      users,
      series: picked.series,
      unit: picked.unit,
      message: parsed.message || `Recommended ${picked.sku} for your requirement.`,
      source: "claude",
    };
  } catch (err) {
    console.warn("[claude] recommendation failed, using fallback:", (err as Error).message);
    return fallbackRecommendation(requirement, pricelist);
  }
}
