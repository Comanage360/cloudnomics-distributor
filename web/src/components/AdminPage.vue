<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { api } from "../api";
import { money } from "../theme";
import Skeleton from "./Skeleton.vue";
import Pagination from "./Pagination.vue";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";
import { useToast } from "../stores/toast";
import type { AdminReseller, AdminQuote, UsageReport, UsageRow, Rates } from "../types";

const toast = useToast();
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
const skuFilter = ref("all");
const dateFrom = ref("");
const dateTo = ref("");
const sortKey = ref("");
const sortDir = ref<"asc" | "desc">("asc");

// pagination (25 rows per page on every table)
const PER_PAGE = 25;
const resellersPage = ref(1);
const quotesPage = ref(1);
const usagePage = ref(1);

// quotes date-range presets
const activePreset = ref<"1d" | "7d" | "30d" | "custom">("7d");

const usd = (n: string | number) => money(Math.round(Number(n) || 0));
const cost4 = (n: string | number) => "$" + (Number(n) || 0).toFixed(4); // AI cost is sub-cent
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US") : "—");
const term = () => search.value.trim().toLowerCase();

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function setPreset(days: number, key: "1d" | "7d" | "30d") {
  const to = new Date();
  const from = new Date(); from.setDate(from.getDate() - (days - 1));
  dateFrom.value = isoDate(from); dateTo.value = isoDate(to); activePreset.value = key;
}
// single range control (vue-datepicker) bound to the from/to strings
const dateRange = computed<Date[] | null>({
  get: () => (dateFrom.value && dateTo.value ? [new Date(dateFrom.value + "T00:00:00"), new Date(dateTo.value + "T00:00:00")] : null),
  set: (v: Date[] | null) => {
    if (v && v[0] && v[1]) { dateFrom.value = isoDate(v[0]); dateTo.value = isoDate(v[1]); }
    else { dateFrom.value = ""; dateTo.value = ""; }
    activePreset.value = "custom";
  },
});

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
// distinct products in the current reseller's quotes (for the product filter)
const skuOptions = computed(() => [...new Set(quotes.value.map((q) => q.sku).filter((s): s is string => !!s))].sort());

const fQuotes = computed(() =>
  sortRows(quotes.value.filter((q) => {
    const t = term();
    const m = !t || (q.customer_name || "").toLowerCase().includes(t) || String(q.number).includes(t) || (q.sku || "").toLowerCase().includes(t);
    if (!m) return false;
    if (statusFilter.value !== "all" && q.status !== statusFilter.value) return false;
    if (skuFilter.value !== "all" && q.sku !== skuFilter.value) return false;
    const ts = Date.parse(q.created_at);
    if (dateFrom.value && ts < Date.parse(dateFrom.value + "T00:00:00")) return false;
    if (dateTo.value && ts > Date.parse(dateTo.value + "T23:59:59")) return false;
    return true;
  }))
);
const quoteFiltersActive = computed(() =>
  !!(search.value || statusFilter.value !== "all" || skuFilter.value !== "all" || activePreset.value !== "7d"));
// View Quotes defaults to the last 7 days; "Clear" returns to that default.
function defaultQuoteFilters() {
  search.value = ""; statusFilter.value = "all"; skuFilter.value = "all"; setPreset(7, "7d");
}
function clearQuoteFilters() { defaultQuoteFilters(); }
const fUsage = computed(() =>
  sortRows((usage.value?.byReseller || []).filter((u: UsageRow) =>
    !term() || u.reseller_email.toLowerCase().includes(term()) || (u.company || "").toLowerCase().includes(term())))
);
// Footer totals across the currently-filtered usage rows.
const usageTotals = computed(() => {
  const sum = (k: keyof UsageRow) => fUsage.value.reduce((s, r) => s + Number(r[k] || 0), 0);
  return { calls: sum("calls"), incomplete: sum("incomplete"), input: sum("input_tokens"), output: sum("output_tokens"), cost: sum("cost_usd") };
});
// Reseller footer totals (quotes, total value, AI spend) across the filtered set.
const resellerTotals = computed(() => {
  const sum = (f: (r: AdminReseller) => number) => fResellers.value.reduce((s, r) => s + f(r), 0);
  return { quotes: sum((r) => Number(r.quote_count) || 0), value: sum((r) => Number(r.total_value) || 0), ai: sum((r) => Number(r.ai_cost) || 0) };
});

// current page slices (25/page)
const pagedResellers = computed(() => fResellers.value.slice((resellersPage.value - 1) * PER_PAGE, resellersPage.value * PER_PAGE));
const pagedQuotes = computed(() => fQuotes.value.slice((quotesPage.value - 1) * PER_PAGE, quotesPage.value * PER_PAGE));
const pagedUsage = computed(() => fUsage.value.slice((usagePage.value - 1) * PER_PAGE, usagePage.value * PER_PAGE));
// back to page 1 whenever filters/sort/drill change
watch([search, roleFilter, statusFilter, skuFilter, dateFrom, dateTo, drill, sortKey, sortDir], () => {
  resellersPage.value = 1; quotesPage.value = 1; usagePage.value = 1;
});

function resetControls() {
  search.value = ""; sortKey.value = ""; roleFilter.value = "all"; statusFilter.value = "all";
  skuFilter.value = "all"; dateFrom.value = ""; dateTo.value = "";
}

async function loadResellers() { loading.value = true; try { resellers.value = await api.adminResellers(); } catch (e) { toast.show((e as Error).message); } finally { loading.value = false; } }
async function loadUsage() { try { usage.value = await api.adminUsage(); } catch (e) { toast.show((e as Error).message); } }
async function loadRates() { try { rates.value = await api.adminRates(); } catch (e) { toast.show((e as Error).message); } }

async function openReseller(email: string) {
  resetControls();
  defaultQuoteFilters(); // default the View Quotes view to the last 7 days
  drill.value = email;
  try { quotes.value = await api.adminQuotes(email); } catch (e) { toast.show((e as Error).message); }
}
async function openPdf(n: number, variant: "partner" | "customer" = "customer") { try { window.open(await api.adminQuotePdf(n, variant), "_blank"); } catch (e) { toast.show((e as Error).message); } }
async function saveRates() {
  if (!rates.value) return;
  savingRates.value = true;
  try { rates.value = await api.adminSaveRates(rates.value); toast.show("✅ Rates saved"); }
  catch (e) { toast.show((e as Error).message); }
  finally { savingRates.value = false; }
}

function go(t: Tab) {
  tab.value = t; drill.value = null; resetControls();
  if (t === "resellers" && !resellers.value.length) loadResellers();
  if (t === "usage" && !usage.value) loadUsage();
  if (t === "rates" && !rates.value) loadRates();
}
onMounted(loadResellers);

const rateFields: { key: keyof Rates; label: string; desc: string; max: number; step: number }[] = [
  { key: "discount", label: "Reseller discount", max: 1, step: 0.01,
    desc: "Base discount off Palo Alto product list prices. Decimal — 0.30 = 30% off." },
  { key: "competitiveBonus", label: "Competitive upgrade bonus", max: 1, step: 0.01,
    desc: "Extra discount when the deal is a competitive upgrade (migrating from another vendor), on top of the reseller discount. Decimal — 0.10 = +10%." },
  { key: "implRate", label: "Implementation rate", max: 1, step: 0.01,
    desc: "Professional-implementation fee as a fraction of its product's reseller price. Decimal — 0.15 = 15%." },
  { key: "managedRate", label: "Managed service rate", max: 1, step: 0.01,
    desc: "Managed-service fee as a fraction of the quote subtotal. Decimal — 0.15 = 15%." },
  { key: "markupDefault", label: "Markup default (%)", max: 100, step: 1,
    desc: "Customer markup pre-selected on the slider when a new quote starts. Percentage — 15 = +15%." },
  { key: "markupMin", label: "Markup min (%)", max: 100, step: 1,
    desc: "Lowest markup a reseller can set on the slider. Percentage." },
  { key: "markupMax", label: "Markup max (%)", max: 100, step: 1,
    desc: "Highest markup a reseller can set on the slider. Percentage." },
];

/** Keep a rate within [0, its max] (decimals capped at 1, markup % at 100). */
function clampRate(f: { key: keyof Rates; max: number }) {
  if (!rates.value) return;
  const v = Number(rates.value[f.key]);
  rates.value[f.key] = Math.max(0, Math.min(f.max, Number.isFinite(v) ? v : 0));
}
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
      <button :class="{ on: tab === 'rates' }" @click="go('rates')">Discounts &amp; markup</button>
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
        <Skeleton v-if="loading" :rows="6" />
        <table v-else class="grid">
          <thead><tr>
            <th class="sortable" @click="sort('company')">Company{{ arrow('company') }}</th>
            <th class="sortable" @click="sort('email')">Email{{ arrow('email') }}</th>
            <th class="sortable" @click="sort('role')">Role{{ arrow('role') }}</th>
            <th class="r sortable" @click="sort('quote_count')">Quotes{{ arrow('quote_count') }}</th>
            <th class="r sortable" @click="sort('total_value')">Total quotes value{{ arrow('total_value') }}</th>
            <th class="r sortable" @click="sort('ai_cost')">AI cost{{ arrow('ai_cost') }}</th>
            <th class="sortable" @click="sort('last_quote_at')">Last quote on{{ arrow('last_quote_at') }}</th>
            <th></th>
          </tr></thead>
          <tbody>
            <tr v-for="r in pagedResellers" :key="r.email">
              <td class="strong">{{ r.company || "—" }}</td>
              <td class="muted">{{ r.email }}</td>
              <td><span class="badge" :class="r.role">{{ r.role }}</span></td>
              <td class="r mono">{{ r.quote_count }}</td>
              <td class="r mono">{{ usd(r.total_value) }}</td>
              <td class="r mono">{{ cost4(r.ai_cost) }}</td>
              <td class="muted">{{ fmtDate(r.last_quote_at) }}</td>
              <td class="r"><button class="link" :disabled="!r.quote_count" @click="openReseller(r.email)">View quotes →</button></td>
            </tr>
            <tr v-if="!fResellers.length"><td colspan="8" class="muted">No resellers match.</td></tr>
          </tbody>
          <tfoot v-if="fResellers.length">
            <tr class="totrow">
              <td>Total</td><td></td><td></td>
              <td class="r mono">{{ resellerTotals.quotes }}</td>
              <td class="r mono">{{ usd(resellerTotals.value) }}</td>
              <td class="r mono">{{ cost4(resellerTotals.ai) }}</td>
              <td></td><td></td>
            </tr>
          </tfoot>
        </table>
        <Pagination v-model:page="resellersPage" :total="fResellers.length" :per-page="PER_PAGE" />
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
          <select v-model="skuFilter" class="select">
            <option value="all">All products</option>
            <option v-for="s in skuOptions" :key="s" :value="s">{{ s }}</option>
          </select>
          <button v-if="quoteFiltersActive" class="link clearf" @click="clearQuoteFilters">Clear filters</button>
          <div class="rightgroup">
            <span class="count2">{{ fQuotes.length }} of {{ quotes.length }}</span>
            <div class="seg presets">
              <button :class="{ on: activePreset === '1d' }" @click="setPreset(1, '1d')">1D</button>
              <button :class="{ on: activePreset === '7d' }" @click="setPreset(7, '7d')">7D</button>
              <button :class="{ on: activePreset === '30d' }" @click="setPreset(30, '30d')">30D</button>
            </div>
            <VueDatePicker v-model="dateRange" range :enable-time-picker="false" :clearable="true"
              format="dd MMM yyyy" placeholder="Date range" :teleport="true" class="dp" />
          </div>
        </div>
        <table class="grid">
          <thead><tr>
            <th class="sortable" @click="sort('number')">Quote #{{ arrow('number') }}</th>
            <th class="sortable" @click="sort('customer_name')">Customer{{ arrow('customer_name') }}</th>
            <th class="sortable" @click="sort('sku')">Product{{ arrow('sku') }}</th>
            <th class="r sortable" @click="sort('reseller_total')">Reseller cost{{ arrow('reseller_total') }}</th>
            <th class="r sortable" @click="sort('customer_total')">Customer total{{ arrow('customer_total') }}</th>
            <th class="sortable" @click="sort('status')">Status{{ arrow('status') }}</th>
            <th class="sortable" @click="sort('created_at')">Date{{ arrow('created_at') }}</th>
            <th class="r sortable" @click="sort('ai_input_tokens')">AI tokens (in/out){{ arrow('ai_input_tokens') }}</th>
            <th class="r sortable" @click="sort('ai_cost')">AI cost{{ arrow('ai_cost') }}</th>
            <th class="r">Customer PDF</th>
            <th class="r">Partner PDF</th>
          </tr></thead>
          <tbody>
            <tr v-for="q in pagedQuotes" :key="q.number">
              <td class="mono">#{{ q.number }}</td>
              <td>{{ q.customer_name || "Customer" }}</td>
              <td>{{ q.sku || "—" }}</td>
              <td class="r mono">{{ usd(q.reseller_total) }}</td>
              <td class="r mono strong">{{ usd(q.customer_total) }}</td>
              <td><span class="badge" :class="q.status">{{ q.status }}</span></td>
              <td class="muted">{{ fmtDate(q.created_at) }}</td>
              <td class="r mono nowrap">
                <span class="tok-in" title="Input tokens">↑ {{ Number(q.ai_input_tokens).toLocaleString() }}</span>
                <span class="tok-out" title="Output tokens">↓ {{ Number(q.ai_output_tokens).toLocaleString() }}</span>
              </td>
              <td class="r mono">{{ cost4(q.ai_cost) }}</td>
              <td class="r"><button class="link" @click="openPdf(q.number, 'customer')">Open ↗</button></td>
              <td class="r"><button class="link" @click="openPdf(q.number, 'partner')">Open ↗</button></td>
            </tr>
            <tr v-if="!fQuotes.length"><td colspan="11" class="muted">No quotes match.</td></tr>
          </tbody>
        </table>
        <Pagination v-model:page="quotesPage" :total="fQuotes.length" :per-page="PER_PAGE" />
      </template>
    </section>

    <!-- Token usage -->
    <section v-else-if="tab === 'usage'">
      <Skeleton v-if="!usage" :rows="5" />
      <template v-else>
        <div class="cards">
          <div class="card"><div class="cl">Total cost</div><div class="cv">{{ cost4(usage.overall.cost_usd) }}</div></div>
          <div class="card"><div class="cl">Quotes</div><div class="cv">{{ usage.overall.calls }}</div></div>
          <div class="card"><div class="cl">Incomplete</div><div class="cv">{{ usage.overall.incomplete }}</div></div>
          <div class="card"><div class="cl">Input tokens</div><div class="cv">{{ Number(usage.overall.input_tokens).toLocaleString() }}</div></div>
          <div class="card"><div class="cl">Output tokens</div><div class="cv">{{ Number(usage.overall.output_tokens).toLocaleString() }}</div></div>
        </div>
        <div class="toolbar">
          <input v-model="search" class="search" placeholder="Search reseller…" />
          <span class="count">{{ fUsage.length }} of {{ usage.byReseller.length }}</span>
        </div>
        <table class="grid">
          <thead><tr>
            <th class="sortable" @click="sort('company')">Reseller{{ arrow('company') }}</th>
            <th class="r sortable" @click="sort('calls')">Quotes{{ arrow('calls') }}</th>
            <th class="r sortable" @click="sort('incomplete')">Incomplete{{ arrow('incomplete') }}</th>
            <th class="r sortable" @click="sort('input_tokens')">Input{{ arrow('input_tokens') }}</th>
            <th class="r sortable" @click="sort('output_tokens')">Output{{ arrow('output_tokens') }}</th>
            <th class="r sortable" @click="sort('cost_usd')">Cost{{ arrow('cost_usd') }}</th>
          </tr></thead>
          <tbody>
            <tr v-for="u in pagedUsage" :key="u.reseller_email">
              <td>
                <div class="cname">{{ u.company || "—" }}</div>
                <div class="cmail">{{ u.reseller_email }}</div>
              </td>
              <td class="r mono">{{ u.calls }}</td>
              <td class="r mono">{{ u.incomplete }}</td>
              <td class="r mono">{{ Number(u.input_tokens).toLocaleString() }}</td>
              <td class="r mono">{{ Number(u.output_tokens).toLocaleString() }}</td>
              <td class="r mono strong">{{ cost4(u.cost_usd) }}</td>
            </tr>
            <tr v-if="!fUsage.length"><td colspan="6" class="muted">No usage recorded yet.</td></tr>
          </tbody>
          <tfoot v-if="fUsage.length">
            <tr class="totrow">
              <td>Total</td>
              <td class="r mono">{{ usageTotals.calls }}</td>
              <td class="r mono">{{ usageTotals.incomplete }}</td>
              <td class="r mono">{{ usageTotals.input.toLocaleString() }}</td>
              <td class="r mono">{{ usageTotals.output.toLocaleString() }}</td>
              <td class="r mono strong">{{ cost4(usageTotals.cost) }}</td>
            </tr>
          </tfoot>
        </table>
        <Pagination v-model:page="usagePage" :total="fUsage.length" :per-page="PER_PAGE" />
      </template>
    </section>

    <!-- Pricing rates -->
    <section v-else>
      <Skeleton v-if="!rates" :rows="4" />
      <template v-else>
        <p class="hint">Changes apply to every new quote.</p>
        <div class="rateform">
          <label v-for="f in rateFields" :key="f.key" class="rate">
            <span class="rate-label">{{ f.label }}</span>
            <small class="rate-desc">{{ f.desc }}</small>
            <input type="number" min="0" :max="f.max" :step="f.step" v-model.number="rates[f.key]" @change="clampRate(f)" />
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
.datef { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
.date { padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; background: var(--surface); color: var(--text); }
.clearf { font-size: 12.5px; }
.rightgroup { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.count2 { font-size: 12px; color: var(--muted); }
.seg.presets { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg.presets button { padding: 6px 12px; border: none; border-right: 1px solid var(--line); background: var(--surface); color: var(--muted); font-size: 12.5px; font-weight: 700; cursor: pointer; }
.seg.presets button:last-child { border-right: none; }
.seg.presets button.on { background: var(--ember-soft); color: var(--ember); }
.dp { width: 230px; --dp-primary-color: var(--ember); }
.dp :deep(.dp__input) { border-radius: 8px; border-color: var(--line); font-size: 13px; padding-top: 7px; padding-bottom: 7px; }
.state { padding: 30px; text-align: center; color: var(--muted); }
.grid { width: 100%; border-collapse: collapse; font-size: 13px; }
.grid th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; padding: 8px 10px; border-bottom: 1.5px solid var(--ink); white-space: nowrap; }
.grid th.r, .grid td.r { text-align: right; }
.grid th.sortable { cursor: pointer; user-select: none; }
.grid th.sortable:hover { color: var(--ember); }
.grid td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.grid thead th { position: sticky; top: 0; z-index: 1; background: var(--surface); }
.grid tbody td { background: var(--surface); }
.grid tbody tr:nth-child(even) td { background: var(--canvas); }
.grid tbody tr:hover td { background: var(--ember-soft); }
.totrow td { border-top: 2px solid var(--ink); border-bottom: none; font-weight: 700; background: var(--surface); }
.r { text-align: right; white-space: nowrap; }
.mono { font-family: var(--mono); }
.strong { font-weight: 700; }
.muted { color: var(--muted); }
.nowrap { white-space: nowrap; }
.cname { font-weight: 600; }
.cmail { font-size: 11px; color: var(--muted); margin-top: 2px; }
/* AI token direction: green ↑ for input sent, ember ↓ for output received */
.tok-in { color: var(--success); }
.tok-out { color: var(--ember); margin-left: 8px; }
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
.rate-desc { font-size: 11px; font-weight: 400; color: var(--muted); line-height: 1.4; }
.save { width: auto; padding: 10px 22px; margin-top: 16px; }
@media (max-width: 760px) { .page { padding: 16px; } }
</style>
