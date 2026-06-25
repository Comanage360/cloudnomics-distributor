<script setup lang="ts">
import { ref, onMounted } from "vue";
import { api } from "../api";
import { money } from "../theme";
import type { AdminReseller, AdminQuote, UsageReport, Rates } from "../types";

const emit = defineEmits<{ toast: [msg: string] }>();
type Tab = "resellers" | "usage" | "rates";
const tab = ref<Tab>("resellers");

const resellers = ref<AdminReseller[]>([]);
const quotes = ref<AdminQuote[]>([]);
const drill = ref<string | null>(null); // reseller email being viewed
const usage = ref<UsageReport | null>(null);
const rates = ref<Rates | null>(null);
const savingRates = ref(false);
const loading = ref(false);

const usd = (n: string | number) => money(Math.round(Number(n) || 0));
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US") : "—");

async function loadResellers() { loading.value = true; try { resellers.value = await api.adminResellers(); } catch (e) { emit("toast", (e as Error).message); } finally { loading.value = false; } }
async function loadUsage() { try { usage.value = await api.adminUsage(); } catch (e) { emit("toast", (e as Error).message); } }
async function loadRates() { try { rates.value = await api.adminRates(); } catch (e) { emit("toast", (e as Error).message); } }

async function openReseller(email: string) {
  drill.value = email;
  try { quotes.value = await api.adminQuotes(email); } catch (e) { emit("toast", (e as Error).message); }
}
async function openPdf(n: number) {
  try { window.open(await api.adminQuotePdf(n), "_blank"); } catch (e) { emit("toast", (e as Error).message); }
}
async function saveRates() {
  if (!rates.value) return;
  savingRates.value = true;
  try { rates.value = await api.adminSaveRates(rates.value); emit("toast", "✅ Rates saved"); }
  catch (e) { emit("toast", (e as Error).message); }
  finally { savingRates.value = false; }
}

function go(t: Tab) {
  tab.value = t; drill.value = null;
  if (t === "resellers" && !resellers.value.length) loadResellers();
  if (t === "usage" && !usage.value) loadUsage();
  if (t === "rates" && !rates.value) loadRates();
}
onMounted(loadResellers);

// rates form fields (percent-friendly labels)
const rateFields: { key: keyof Rates; label: string; pct?: boolean }[] = [
  { key: "discount", label: "Reseller discount", pct: true },
  { key: "competitiveBonus", label: "Competitive upgrade bonus", pct: true },
  { key: "implRate", label: "Implementation rate", pct: true },
  { key: "managedRate", label: "Managed service rate", pct: true },
  { key: "markupDefault", label: "Markup default (%)" },
  { key: "markupMin", label: "Markup min (%)" },
  { key: "markupMax", label: "Markup max (%)" },
];
</script>

<template>
  <div class="page">
    <div class="head">
      <h1>Admin dashboard</h1>
      <p>Resellers, token spend, and pricing controls.</p>
    </div>

    <div class="tabs">
      <button :class="{ on: tab === 'resellers' }" @click="go('resellers')">Resellers</button>
      <button :class="{ on: tab === 'usage' }" @click="go('usage')">Token usage</button>
      <button :class="{ on: tab === 'rates' }" @click="go('rates')">Pricing rates</button>
    </div>

    <!-- Resellers -->
    <section v-if="tab === 'resellers'">
      <template v-if="!drill">
        <div v-if="loading" class="state">Loading…</div>
        <table v-else class="grid">
          <thead><tr><th>Company</th><th>Email</th><th>Role</th><th class="r">Quotes</th><th class="r">Total value</th><th>Last quote</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in resellers" :key="r.email">
              <td class="strong">{{ r.company || "—" }}</td>
              <td class="muted">{{ r.email }}</td>
              <td><span class="badge" :class="r.role">{{ r.role }}</span></td>
              <td class="r mono">{{ r.quote_count }}</td>
              <td class="r mono">{{ usd(r.total_value) }}</td>
              <td class="muted">{{ fmtDate(r.last_quote_at) }}</td>
              <td class="r"><button class="link" :disabled="!r.quote_count" @click="openReseller(r.email)">View quotes →</button></td>
            </tr>
          </tbody>
        </table>
      </template>

      <template v-else>
        <button class="link back" @click="drill = null">← All resellers</button>
        <h2>{{ drill }}</h2>
        <table class="grid">
          <thead><tr><th>Quote #</th><th>Customer</th><th>Product</th><th class="r">Customer total</th><th>Status</th><th>Date</th><th class="r">PDF</th></tr></thead>
          <tbody>
            <tr v-for="q in quotes" :key="q.number">
              <td class="mono">#{{ q.number }}</td>
              <td>{{ q.customer_name || "Customer" }}</td>
              <td>{{ q.sku || "—" }}</td>
              <td class="r mono strong">{{ usd(q.customer_total) }}</td>
              <td><span class="badge" :class="q.status">{{ q.status }}</span></td>
              <td class="muted">{{ fmtDate(q.created_at) }}</td>
              <td class="r"><button class="link" @click="openPdf(q.number)">Open ↗</button></td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>

    <!-- Token usage -->
    <section v-else-if="tab === 'usage'">
      <div v-if="!usage" class="state">Loading…</div>
      <template v-else>
        <div class="cards">
          <div class="card"><div class="cl">Total cost</div><div class="cv">{{ usd(usage.overall.cost_usd) }}</div></div>
          <div class="card"><div class="cl">Recommendations</div><div class="cv">{{ usage.overall.calls }}</div></div>
          <div class="card"><div class="cl">Input tokens</div><div class="cv">{{ Number(usage.overall.input_tokens).toLocaleString() }}</div></div>
          <div class="card"><div class="cl">Output tokens</div><div class="cv">{{ Number(usage.overall.output_tokens).toLocaleString() }}</div></div>
        </div>
        <table class="grid">
          <thead><tr><th>Reseller</th><th class="r">Calls</th><th class="r">Input</th><th class="r">Output</th><th class="r">Cost</th></tr></thead>
          <tbody>
            <tr v-for="u in usage.byReseller" :key="u.reseller_email">
              <td>{{ u.reseller_email }}</td>
              <td class="r mono">{{ u.calls }}</td>
              <td class="r mono">{{ Number(u.input_tokens).toLocaleString() }}</td>
              <td class="r mono">{{ Number(u.output_tokens).toLocaleString() }}</td>
              <td class="r mono strong">{{ usd(u.cost_usd) }}</td>
            </tr>
            <tr v-if="!usage.byReseller.length"><td colspan="5" class="muted">No usage recorded yet.</td></tr>
          </tbody>
        </table>
      </template>
    </section>

    <!-- Pricing rates -->
    <section v-else>
      <div v-if="!rates" class="state">Loading…</div>
      <template v-else>
        <p class="hint">Rates apply to every new quote. Enter discounts/rates as decimals (0.30 = 30%); markup fields are percentages.</p>
        <div class="rateform">
          <label v-for="f in rateFields" :key="f.key" class="rate">
            <span>{{ f.label }}</span>
            <input type="number" step="0.01" v-model.number="rates[f.key]" />
          </label>
        </div>
        <button class="btn-primary save" :disabled="savingRates" @click="saveRates">{{ savingRates ? "Saving…" : "Save rates" }}</button>
      </template>
    </section>
  </div>
</template>

<style scoped>
.page { padding: 24px; overflow-y: auto; height: 100%; }
.head { margin-bottom: 14px; }
h1 { font-family: var(--display); font-size: 20px; margin: 0; }
.head p { font-size: 13px; color: var(--muted); margin: 4px 0 0; }
h2 { font-size: 14px; margin: 6px 0 12px; color: var(--ink); }
.tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--line); margin-bottom: 16px; }
.tabs button { background: none; border: none; padding: 8px 4px; margin-right: 10px; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; }
.tabs button.on { color: var(--ember); border-bottom-color: var(--ember); }
.state { padding: 30px; text-align: center; color: var(--muted); }
.grid { width: 100%; border-collapse: collapse; font-size: 13px; }
.grid th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; padding: 8px 10px; border-bottom: 1.5px solid var(--ink); white-space: nowrap; }
.grid td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.grid th.r, .grid td.r { text-align: right; }
.r { text-align: right; white-space: nowrap; }
.mono { font-family: var(--mono); }
.strong { font-weight: 700; }
.muted { color: var(--muted); }
.badge { font-size: 10.5px; font-weight: 700; padding: 2px 9px; border-radius: 20px; text-transform: capitalize; background: var(--canvas); color: var(--muted); }
.badge.admin { background: var(--ember-soft); color: var(--ember); }
.badge.sent { background: var(--success-soft); color: var(--success); }
.link { background: none; border: none; color: var(--ember); font-weight: 600; font-size: 12.5px; cursor: pointer; }
.link:disabled { color: var(--muted); cursor: default; }
.link:hover:not(:disabled) { text-decoration: underline; }
.back { margin-bottom: 6px; }
.cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
.card { flex: 1; min-width: 150px; border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.cl { font-size: 11px; color: var(--muted); }
.cv { font-size: 22px; font-weight: 800; font-family: var(--mono); color: var(--ink); margin-top: 4px; }
.hint { font-size: 12.5px; color: var(--muted); margin-bottom: 14px; }
.rateform { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; max-width: 720px; }
.rate { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--text); }
.rate input { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-family: var(--mono); }
.save { width: auto; padding: 10px 22px; margin-top: 16px; }
@media (max-width: 760px) { .page { padding: 16px; } }
</style>
