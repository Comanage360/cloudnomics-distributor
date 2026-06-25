<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { api } from "../api";
import { money } from "../theme";
import type { AdminReseller, AdminQuote, UsageReport, UsageRow, Rates } from "../types";

const emit = defineEmits<{ toast: [msg: string] }>();
type Tab = "resellers" | "usage" | "rates";
const tab = ref<Tab>("resellers");

const resellers = ref<AdminReseller[]>([]);
const quotes = ref<AdminQuote[]>([]);
const drill = ref<string | null>(null);
const usage = ref<UsageReport | null>(null);
const rates = ref<Rates | null>(null);
const savingRates = ref(false);
const loading = ref(false);

// search / filter / sort
const search = ref("");
const roleFilter = ref<"all" | "admin" | "reseller">("all");
const statusFilter = ref<"all" | "draft" | "sent">("all");
const sortKey = ref("");
const sortDir = ref<"asc" | "desc">("asc");

const usd = (n: string | number) => money(Math.round(Number(n) || 0));
const cost4 = (n: string | number) => "$" + (Number(n) || 0).toFixed(4); // AI cost is sub-cent
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US") : "—");
const term = () => search.value.trim().toLowerCase();

function sort(key: string) {
  if (sortKey.value === key) sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  else { sortKey.value = key; sortDir.value = "asc"; }
}
const arrow = (key: string) => (sortKey.value === key ? (sortDir.value === "asc" ? " ▲" : " ▼") : "");

function sortRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  if (!sortKey.value) return rows;
  const k = sortKey.value, dir = sortDir.value === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let av: number | string = a[k] as never, bv: number | string = b[k] as never;
    const an = Number(av), bn = Number(bv);
    if (av !== "" && bv !== "" && av != null && bv != null && !Number.isNaN(an) && !Number.isNaN(bn)) { av = an; bv = bn; }
    else if (k.endsWith("_at")) { av = av ? Date.parse(String(av)) : 0; bv = bv ? Date.parse(String(bv)) : 0; }
    else { av = String(av ?? "").toLowerCase(); bv = String(bv ?? "").toLowerCase(); }
    return av < bv ? -dir : av > bv ? dir : 0;
  });
}

const fResellers = computed(() =>
  sortRows(resellers.value.filter((r) => {
    const t = term();
    const m = !t || (r.company || "").toLowerCase().includes(t) || r.email.toLowerCase().includes(t);
    return m && (roleFilter.value === "all" || r.role === roleFilter.value);
  }))
);
const fQuotes = computed(() =>
  sortRows(quotes.value.filter((q) => {
    const t = term();
    const m = !t || (q.customer_name || "").toLowerCase().includes(t) || String(q.number).includes(t) || (q.sku || "").toLowerCase().includes(t);
    return m && (statusFilter.value === "all" || q.status === statusFilter.value);
  }))
);
const fUsage = computed(() =>
  sortRows((usage.value?.byReseller || []).filter((u: UsageRow) => !term() || u.reseller_email.toLowerCase().includes(term())))
);

function resetControls() { search.value = ""; sortKey.value = ""; roleFilter.value = "all"; statusFilter.value = "all"; }

async function loadResellers() { loading.value = true; try { resellers.value = await api.adminResellers(); } catch (e) { emit("toast", (e as Error).message); } finally { loading.value = false; } }
async function loadUsage() { try { usage.value = await api.adminUsage(); } catch (e) { emit("toast", (e as Error).message); } }
async function loadRates() { try { rates.value = await api.adminRates(); } catch (e) { emit("toast", (e as Error).message); } }

async function openReseller(email: string) {
  resetControls();
  drill.value = email;
  try { quotes.value = await api.adminQuotes(email); } catch (e) { emit("toast", (e as Error).message); }
}
async function openPdf(n: number) { try { window.open(await api.adminQuotePdf(n), "_blank"); } catch (e) { emit("toast", (e as Error).message); } }
async function saveRates() {
  if (!rates.value) return;
  savingRates.value = true;
  try { rates.value = await api.adminSaveRates(rates.value); emit("toast", "✅ Rates saved"); }
  catch (e) { emit("toast", (e as Error).message); }
  finally { savingRates.value = false; }
}

function go(t: Tab) {
  tab.value = t; drill.value = null; resetControls();
  if (t === "resellers" && !resellers.value.length) loadResellers();
  if (t === "usage" && !usage.value) loadUsage();
  if (t === "rates" && !rates.value) loadRates();
}
onMounted(loadResellers);

const rateFields: { key: keyof Rates; label: string }[] = [
  { key: "discount", label: "Reseller discount" },
  { key: "competitiveBonus", label: "Competitive upgrade bonus" },
  { key: "implRate", label: "Implementation rate" },
  { key: "managedRate", label: "Managed service rate" },
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
        <div class="toolbar">
          <input v-model="search" class="search" placeholder="Search company or email…" />
          <select v-model="roleFilter" class="select">
            <option value="all">All roles</option>
            <option value="admin">Admins</option>
            <option value="reseller">Resellers</option>
          </select>
          <span class="count">{{ fResellers.length }} of {{ resellers.length }}</span>
        </div>
        <div v-if="loading" class="state">Loading…</div>
        <table v-else class="grid">
          <thead><tr>
            <th class="sortable" @click="sort('company')">Company{{ arrow('company') }}</th>
            <th class="sortable" @click="sort('email')">Email{{ arrow('email') }}</th>
            <th class="sortable" @click="sort('role')">Role{{ arrow('role') }}</th>
            <th class="r sortable" @click="sort('quote_count')">Quotes{{ arrow('quote_count') }}</th>
            <th class="r sortable" @click="sort('total_value')">Total value{{ arrow('total_value') }}</th>
            <th class="sortable" @click="sort('last_quote_at')">Last quote{{ arrow('last_quote_at') }}</th>
            <th></th>
          </tr></thead>
          <tbody>
            <tr v-for="r in fResellers" :key="r.email">
              <td class="strong">{{ r.company || "—" }}</td>
              <td class="muted">{{ r.email }}</td>
              <td><span class="badge" :class="r.role">{{ r.role }}</span></td>
              <td class="r mono">{{ r.quote_count }}</td>
              <td class="r mono">{{ usd(r.total_value) }}</td>
              <td class="muted">{{ fmtDate(r.last_quote_at) }}</td>
              <td class="r"><button class="link" :disabled="!r.quote_count" @click="openReseller(r.email)">View quotes →</button></td>
            </tr>
            <tr v-if="!fResellers.length"><td colspan="7" class="muted">No resellers match.</td></tr>
          </tbody>
        </table>
      </template>

      <template v-else>
        <button class="link back" @click="drill = null; resetControls()">← All resellers</button>
        <h2>{{ drill }}</h2>
        <div class="toolbar">
          <input v-model="search" class="search" placeholder="Search customer, quote #, or product…" />
          <select v-model="statusFilter" class="select">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
          </select>
          <span class="count">{{ fQuotes.length }} of {{ quotes.length }}</span>
        </div>
        <table class="grid">
          <thead><tr>
            <th class="sortable" @click="sort('number')">Quote #{{ arrow('number') }}</th>
            <th class="sortable" @click="sort('customer_name')">Customer{{ arrow('customer_name') }}</th>
            <th class="sortable" @click="sort('sku')">Product{{ arrow('sku') }}</th>
            <th class="r sortable" @click="sort('customer_total')">Customer total{{ arrow('customer_total') }}</th>
            <th class="sortable" @click="sort('status')">Status{{ arrow('status') }}</th>
            <th class="sortable" @click="sort('created_at')">Date{{ arrow('created_at') }}</th>
            <th class="r">PDF</th>
          </tr></thead>
          <tbody>
            <tr v-for="q in fQuotes" :key="q.number">
              <td class="mono">#{{ q.number }}</td>
              <td>{{ q.customer_name || "Customer" }}</td>
              <td>{{ q.sku || "—" }}</td>
              <td class="r mono strong">{{ usd(q.customer_total) }}</td>
              <td><span class="badge" :class="q.status">{{ q.status }}</span></td>
              <td class="muted">{{ fmtDate(q.created_at) }}</td>
              <td class="r"><button class="link" @click="openPdf(q.number)">Open ↗</button></td>
            </tr>
            <tr v-if="!fQuotes.length"><td colspan="7" class="muted">No quotes match.</td></tr>
          </tbody>
        </table>
      </template>
    </section>

    <!-- Token usage -->
    <section v-else-if="tab === 'usage'">
      <div v-if="!usage" class="state">Loading…</div>
      <template v-else>
        <div class="cards">
          <div class="card"><div class="cl">Total cost</div><div class="cv">{{ cost4(usage.overall.cost_usd) }}</div></div>
          <div class="card"><div class="cl">Recommendations</div><div class="cv">{{ usage.overall.calls }}</div></div>
          <div class="card"><div class="cl">Input tokens</div><div class="cv">{{ Number(usage.overall.input_tokens).toLocaleString() }}</div></div>
          <div class="card"><div class="cl">Output tokens</div><div class="cv">{{ Number(usage.overall.output_tokens).toLocaleString() }}</div></div>
        </div>
        <div class="toolbar">
          <input v-model="search" class="search" placeholder="Search reseller…" />
          <span class="count">{{ fUsage.length }} of {{ usage.byReseller.length }}</span>
        </div>
        <table class="grid">
          <thead><tr>
            <th class="sortable" @click="sort('reseller_email')">Reseller{{ arrow('reseller_email') }}</th>
            <th class="r sortable" @click="sort('calls')">Calls{{ arrow('calls') }}</th>
            <th class="r sortable" @click="sort('input_tokens')">Input{{ arrow('input_tokens') }}</th>
            <th class="r sortable" @click="sort('output_tokens')">Output{{ arrow('output_tokens') }}</th>
            <th class="r sortable" @click="sort('cost_usd')">Cost{{ arrow('cost_usd') }}</th>
          </tr></thead>
          <tbody>
            <tr v-for="u in fUsage" :key="u.reseller_email">
              <td>{{ u.reseller_email }}</td>
              <td class="r mono">{{ u.calls }}</td>
              <td class="r mono">{{ Number(u.input_tokens).toLocaleString() }}</td>
              <td class="r mono">{{ Number(u.output_tokens).toLocaleString() }}</td>
              <td class="r mono strong">{{ cost4(u.cost_usd) }}</td>
            </tr>
            <tr v-if="!fUsage.length"><td colspan="5" class="muted">No usage recorded yet.</td></tr>
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
.toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.search { flex: 1; min-width: 200px; max-width: 360px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
.select { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; background: var(--surface); }
.count { font-size: 12px; color: var(--muted); margin-left: auto; }
.state { padding: 30px; text-align: center; color: var(--muted); }
.grid { width: 100%; border-collapse: collapse; font-size: 13px; }
.grid th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; padding: 8px 10px; border-bottom: 1.5px solid var(--ink); white-space: nowrap; }
.grid th.r, .grid td.r { text-align: right; }
.grid th.sortable { cursor: pointer; user-select: none; }
.grid th.sortable:hover { color: var(--ember); }
.grid td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
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
