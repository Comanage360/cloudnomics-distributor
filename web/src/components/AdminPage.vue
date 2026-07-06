<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { api } from "../api";
import { money } from "../theme";
import Skeleton from "./Skeleton.vue";
import Pagination from "./Pagination.vue";
import DatePicker from "primevue/datepicker";
import { useToast } from "../stores/toast";
import type { AdminReseller, AdminQuote, UsageReport, UsageRow, Rates, LimitRequest, AuthEventRow } from "../types";

const toast = useToast();
type Tab = "resellers" | "usage" | "rates" | "limits" | "activity";
const tab = ref<Tab>("resellers");
const authEvents = ref<AuthEventRow[]>([]);

const resellers = ref<AdminReseller[]>([]);
const quotes = ref<AdminQuote[]>([]);
const drill = ref<string | null>(null);
const usage = ref<UsageReport | null>(null);
const rates = ref<Rates | null>(null);
const savingRates = ref(false);
const loading = ref(false);

// token-limits tab: per-reseller edit buffer + pending requests
const limitRequests = ref<LimitRequest[]>([]);
const limitEdits = ref<Record<string, { monthly: string }>>({});
const savingLimit = ref<string | null>(null);

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

// token-usage reseller multi-select (empty = all resellers)
const selectorOpen = ref(false);
const selectedResellers = ref<string[]>([]);

const usd = (n: string | number) => money(Math.round(Number(n) || 0));
const cost4 = (n: string | number) => "$" + (Number(n) || 0).toFixed(4); // AI cost is sub-cent
const usd2 = (n: string | number) => "$" + (Number(n) || 0).toFixed(2);  // spend limits / usage
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US") : "—");
const term = () => search.value.trim().toLowerCase();

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function setPreset(days: number, key: "1d" | "7d" | "30d") {
  const to = new Date();
  const from = new Date(); from.setDate(from.getDate() - (days - 1));
  dateFrom.value = isoDate(from); dateTo.value = isoDate(to); activePreset.value = key;
}
// PrimeVue DatePicker range model ([start, end]) bound to the from/to strings.
const dateRange = computed<(Date | null)[] | null>({
  get: () => (dateFrom.value && dateTo.value ? [new Date(dateFrom.value + "T00:00:00"), new Date(dateTo.value + "T00:00:00")] : null),
  set: (v) => {
    if (v && v[0] && v[1]) { dateFrom.value = isoDate(v[0]); dateTo.value = isoDate(v[1]); activePreset.value = "custom"; }
    else if (!v) { dateFrom.value = ""; dateTo.value = ""; activePreset.value = "custom"; }
    // partial selection ([start, null]) — wait for the end date before filtering
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
  sortRows((usage.value?.byReseller || []).filter((u: UsageRow) => {
    if (selectedResellers.value.length && !selectedResellers.value.includes(u.reseller_email)) return false;
    const t = term();
    return !t || u.reseller_email.toLowerCase().includes(t) || (u.company || "").toLowerCase().includes(t);
  }))
);
const resellerOptions = computed(() =>
  (usage.value?.byReseller || []).map((u) => ({ email: u.reseller_email, label: u.company || u.reseller_email })));
function toggleReseller(email: string) {
  const i = selectedResellers.value.indexOf(email);
  if (i >= 0) selectedResellers.value.splice(i, 1);
  else selectedResellers.value.push(email);
}
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
watch(selectedResellers, () => { usagePage.value = 1; }, { deep: true });

function resetControls() {
  search.value = ""; sortKey.value = ""; roleFilter.value = "all"; statusFilter.value = "all";
  skuFilter.value = "all"; dateFrom.value = ""; dateTo.value = "";
  selectedResellers.value = []; selectorOpen.value = false;
}

async function loadResellers() { loading.value = true; try { resellers.value = await api.adminResellers(); } catch (e) { toast.show((e as Error).message); } finally { loading.value = false; } }
const pendingCount = computed(() => resellers.value.filter((r) => !r.approved).length);
async function approveReseller(email: string) {
  try { await api.adminApproveReseller(email); const r = resellers.value.find((x) => x.email === email); if (r) r.approved = true; toast.show("✅ Reseller approved"); }
  catch (e) { toast.show((e as Error).message); }
}
async function rejectReseller(email: string) {
  try { await api.adminRejectReseller(email); resellers.value = resellers.value.filter((x) => x.email !== email); toast.show("Reseller rejected"); }
  catch (e) { toast.show((e as Error).message); }
}
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

/** Token-limits tab: needs the reseller list, the global defaults (rates), and
 *  the pending request queue. Seeds the per-reseller edit buffer from overrides. */
async function loadLimits() {
  if (!resellers.value.length) await loadResellers();
  if (!rates.value) await loadRates();
  seedLimitEdits();
  await reloadRequests();
}
function seedLimitEdits() {
  const m: Record<string, { monthly: string }> = {};
  for (const r of resellers.value) m[r.email] = { monthly: r.monthly_cost_limit ?? "" };
  limitEdits.value = m;
}
async function saveResellerLimit(email: string) {
  const e = limitEdits.value[email]; if (!e) return;
  savingLimit.value = email;
  try {
    await api.adminSaveResellerLimit(email, { monthly: e.monthly === "" ? null : Number(e.monthly) });
    const row = resellers.value.find((r) => r.email === email);
    if (row) row.monthly_cost_limit = e.monthly === "" ? null : e.monthly;
    toast.show("✅ Limit saved");
  } catch (err) { toast.show((err as Error).message); }
  finally { savingLimit.value = null; }
}
async function reloadRequests() {
  try { limitRequests.value = await api.adminLimitRequests(); } catch (e) { toast.show((e as Error).message); }
}
// email -> that reseller's pending request (if any), for the per-row button
const pendingByEmail = computed<Record<string, LimitRequest>>(() => {
  const m: Record<string, LimitRequest> = {};
  for (const r of limitRequests.value) if (r.status === "pending" && !m[r.reseller_email]) m[r.reseller_email] = r;
  return m;
});

// request-review modal (opened from a reseller's "Pending request" button)
const reqModal = ref<LimitRequest | null>(null);
const reqAmount = ref("");          // editable new monthly limit ($)
const resolvingReq = ref(false);
function openRequest(email: string) {
  const rq = pendingByEmail.value[email]; if (!rq) return;
  const row = resellers.value.find((r) => r.email === email);
  reqAmount.value = row?.monthly_cost_limit ?? rq.limit_value ?? "";
  reqModal.value = rq;
}
async function approveRequest() {
  const rq = reqModal.value; if (!rq || resolvingReq.value) return;
  resolvingReq.value = true;
  const amount = reqAmount.value === "" ? null : Number(reqAmount.value);
  try {
    await api.adminSaveResellerLimit(rq.reseller_email, { monthly: amount });
    await api.adminResolveLimitRequest(rq.id, "approved");
    const row = resellers.value.find((r) => r.email === rq.reseller_email);
    if (row) row.monthly_cost_limit = amount === null ? null : String(amount);
    if (limitEdits.value[rq.reseller_email]) limitEdits.value[rq.reseller_email].monthly = amount === null ? "" : String(amount);
    await reloadRequests();
    toast.show("✅ Approved — new limit set");
    reqModal.value = null;
  } catch (e) { toast.show((e as Error).message); }
  finally { resolvingReq.value = false; }
}
async function dismissRequest() {
  const rq = reqModal.value; if (!rq || resolvingReq.value) return;
  resolvingReq.value = true;
  try {
    await api.adminResolveLimitRequest(rq.id, "dismissed");
    await reloadRequests();
    toast.show("Request dismissed");
    reqModal.value = null;
  } catch (e) { toast.show((e as Error).message); }
  finally { resolvingReq.value = false; }
}

async function loadActivity() {
  try { authEvents.value = await api.adminAuthEvents(200); } catch (e) { toast.show((e as Error).message); }
}
const EV_LABEL: Record<string, string> = {
  signup: "Signed up", login: "Logged in", login_failed: "Login failed",
  verify_sent: "Verification sent", verify_ok: "Email verified",
  reset_requested: "Reset requested", reset_ok: "Password reset", rate_limited: "Rate limited",
};
const evLabel = (e: string) => EV_LABEL[e] || e;
const evClass = (e: string) =>
  e === "login_failed" || e === "rate_limited" ? "ev-bad"
  : e === "verify_ok" || e === "reset_ok" || e === "login" || e === "signup" ? "ev-ok"
  : "ev-neutral";
function go(t: Tab) {
  tab.value = t; drill.value = null; resetControls();
  if (t === "resellers" && !resellers.value.length) loadResellers();
  if (t === "usage" && !usage.value) loadUsage();
  if (t === "rates" && !rates.value) loadRates();
  if (t === "limits") loadLimits();
  if (t === "activity") loadActivity();
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
      <button :class="{ on: tab === 'limits' }" @click="go('limits')">Usage limits</button>
      <button :class="{ on: tab === 'rates' }" @click="go('rates')">Discounts &amp; markup</button>
      <button :class="{ on: tab === 'activity' }" @click="go('activity')">Activity</button>
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
        </div>
        <div v-if="pendingCount" class="pendbar">
          ⏳ <strong>{{ pendingCount }}</strong> {{ pendingCount === 1 ? "account is" : "accounts are" }} awaiting approval — review them at the top of the list.
        </div>
        <Skeleton v-if="loading" :rows="6" />
        <table v-else class="grid">
          <thead><tr>
            <th class="sortable" @click="sort('company')">Reseller{{ arrow('company') }}</th>
            <th class="sortable" @click="sort('role')">Role{{ arrow('role') }}</th>
            <th class="r sortable" @click="sort('quote_count')">Quotes{{ arrow('quote_count') }}</th>
            <th class="r sortable" @click="sort('total_value')">Total quotes value{{ arrow('total_value') }}</th>
            <th class="r sortable" @click="sort('ai_cost')">AI cost{{ arrow('ai_cost') }}</th>
            <th class="sortable" @click="sort('last_quote_at')">Last quote on{{ arrow('last_quote_at') }}</th>
            <th></th>
          </tr></thead>
          <tbody>
            <tr v-for="r in pagedResellers" :key="r.email">
              <td>
                <div class="cname">{{ r.company || "—" }}</div>
                <div class="cmail">{{ r.email }}</div>
              </td>
              <td>
                <span class="badge" :class="r.role">{{ r.role }}</span>
                <span v-if="!r.approved" class="badge pending">pending</span>
              </td>
              <td class="r">
                <button v-if="r.quote_count" class="link mono" @click="openReseller(r.email)">{{ r.quote_count }}</button>
                <span v-else class="mono muted">0</span>
              </td>
              <td class="r mono">{{ usd(r.total_value) }}</td>
              <td class="r mono">{{ cost4(r.ai_cost) }}</td>
              <td class="muted">{{ fmtDate(r.last_quote_at) }}</td>
              <td class="r nowrap">
                <template v-if="!r.approved">
                  <button class="btn-approve" @click="approveReseller(r.email)">Approve</button>
                  <button class="link reject" @click="rejectReseller(r.email)">Reject</button>
                </template>
                <button v-else class="link" :disabled="!r.quote_count" @click="openReseller(r.email)">View quotes →</button>
              </td>
            </tr>
            <tr v-if="!fResellers.length"><td colspan="7" class="muted">No resellers match.</td></tr>
          </tbody>
          <tfoot v-if="fResellers.length">
            <tr class="totrow">
              <td>Total</td><td></td>
              <td class="r mono">{{ resellerTotals.quotes }}</td>
              <td class="r mono">{{ usd(resellerTotals.value) }}</td>
              <td class="r mono">{{ cost4(resellerTotals.ai) }}</td>
              <td></td><td></td>
            </tr>
          </tfoot>
        </table>
        <div class="tablecount">{{ fResellers.length }} of {{ resellers.length }} resellers</div>
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
            <div class="seg presets">
              <button :class="{ on: activePreset === '1d' }" @click="setPreset(1, '1d')">1D</button>
              <button :class="{ on: activePreset === '7d' }" @click="setPreset(7, '7d')">7D</button>
              <button :class="{ on: activePreset === '30d' }" @click="setPreset(30, '30d')">30D</button>
            </div>
            <DatePicker v-model="dateRange" selectionMode="range" :manualInput="false"
              dateFormat="dd M yy" placeholder="Date range" showButtonBar :numberOfMonths="2" class="dp" />
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
              <td>
                <div class="cname">{{ q.customer_name || "Customer" }}</div>
                <div class="cmail">{{ q.customer_email }}</div>
              </td>
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
        <div class="tablecount">{{ fQuotes.length }} of {{ quotes.length }} quotes</div>
        <Pagination v-model:page="quotesPage" :total="fQuotes.length" :per-page="PER_PAGE" />
      </template>
    </section>

    <!-- Token usage -->
    <section v-else-if="tab === 'usage'">
      <Skeleton v-if="!usage" :rows="5" />
      <template v-else>
        <div class="usagebar">
          <div class="reseller-select">
            <button class="rs-btn" :class="{ on: selectorOpen }" @click="selectorOpen = !selectorOpen">
              {{ selectedResellers.length ? selectedResellers.length + ' reseller' + (selectedResellers.length > 1 ? 's' : '') + ' selected' : 'All resellers' }}
              <span class="caret">▾</span>
            </button>
            <div v-if="selectorOpen" class="rs-panel">
              <div class="rs-head">
                <span>{{ selectedResellers.length || 'All' }} selected</span>
                <button class="link" :disabled="!selectedResellers.length" @click="selectedResellers = []">All resellers</button>
              </div>
              <label v-for="o in resellerOptions" :key="o.email" class="rs-item">
                <input type="checkbox" :checked="selectedResellers.includes(o.email)" @change="toggleReseller(o.email)" />
                <span class="rs-text"><span class="rs-name">{{ o.label }}</span><span class="rs-mail">{{ o.email }}</span></span>
              </label>
              <div v-if="!resellerOptions.length" class="rs-empty">No resellers yet</div>
            </div>
            <div v-if="selectorOpen" class="rs-backdrop" @click="selectorOpen = false" />
          </div>
        </div>
        <div class="cards">
          <div class="card"><div class="cl">Total cost</div><div class="cv">{{ cost4(usageTotals.cost) }}</div></div>
          <div class="card"><div class="cl">Quotes</div><div class="cv">{{ usageTotals.calls }}</div></div>
          <div class="card"><div class="cl">In progress</div><div class="cv">{{ usageTotals.incomplete }}</div></div>
          <div class="card"><div class="cl">Input tokens</div><div class="cv">{{ usageTotals.input.toLocaleString() }}</div></div>
          <div class="card"><div class="cl">Output tokens</div><div class="cv">{{ usageTotals.output.toLocaleString() }}</div></div>
        </div>
        <div class="toolbar">
          <input v-model="search" class="search" placeholder="Search reseller…" />
        </div>
        <table class="grid">
          <thead><tr>
            <th class="sortable" @click="sort('company')">Reseller{{ arrow('company') }}</th>
            <th class="r sortable" @click="sort('calls')">Quotes{{ arrow('calls') }}</th>
            <th class="r sortable" @click="sort('incomplete')">In progress{{ arrow('incomplete') }}</th>
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
        <div class="tablecount">{{ fUsage.length }} of {{ usage.byReseller.length }} resellers</div>
        <Pagination v-model:page="usagePage" :total="fUsage.length" :per-page="PER_PAGE" />
      </template>
    </section>

    <!-- Usage (spend) limits -->
    <section v-else-if="tab === 'limits'">
      <Skeleton v-if="loading && !resellers.length" :rows="6" />
      <template v-else>
        <!-- per-reseller spend limits -->
        <div class="toolbar"><input v-model="search" class="search" placeholder="Search company or email…" /></div>
        <table class="grid">
          <thead><tr>
            <th class="sortable" @click="sort('company')">Reseller{{ arrow('company') }}</th>
            <th class="r sortable" @click="sort('cost_30d')">Spent (30d){{ arrow('cost_30d') }}</th>
            <th class="r">Monthly limit ($)</th>
            <th></th>
          </tr></thead>
          <tbody>
            <tr v-for="r in pagedResellers" :key="r.email">
              <td>
                <div class="cname">{{ r.company || "—" }}</div>
                <div class="cmail">{{ r.email }}</div>
              </td>
              <td class="r mono">{{ usd2(r.cost_30d) }}</td>
              <td class="r"><input v-if="limitEdits[r.email]" class="lim" type="number" min="0" step="1"
                v-model="limitEdits[r.email].monthly" :placeholder="rates?.costLimitMonthly ? '$' + rates.costLimitMonthly : 'unlimited'" /></td>
              <td class="r rowacts">
                <button class="link" :disabled="savingLimit === r.email" @click="saveResellerLimit(r.email)">{{ savingLimit === r.email ? "Saving…" : "Save" }}</button>
                <button v-if="pendingByEmail[r.email]" class="btn-pending" @click="openRequest(r.email)">● Pending request</button>
              </td>
            </tr>
            <tr v-if="!fResellers.length"><td colspan="4" class="muted">No resellers match.</td></tr>
          </tbody>
        </table>
        <div class="tablecount">{{ fResellers.length }} of {{ resellers.length }} resellers</div>
        <Pagination v-model:page="resellersPage" :total="fResellers.length" :per-page="PER_PAGE" />
        <p class="hint">Amounts are US dollars. New resellers start at $10. 0 = unlimited; blank = inherit the default. Rolling window (last 30 days).</p>

        <!-- request-review modal -->
        <Teleport to="body">
          <div v-if="reqModal" class="overlay" @click.self="reqModal = null">
            <div class="dialog">
              <div class="dhead">
                <h3>Limit increase request</h3>
                <button class="x" @click="reqModal = null" aria-label="Close">✕</button>
              </div>
              <div class="dbody">
                <div class="rrow"><span>Reseller</span><strong>{{ reqModal.reseller_email }}</strong></div>
                <div class="rrow"><span>Requested on</span><strong>{{ fmtDate(reqModal.created_at) }}</strong></div>
                <div v-if="reqModal.limit_value != null" class="rrow"><span>Spend vs cap (30d)</span><strong>{{ usd2(reqModal.used || 0) }} / {{ usd2(reqModal.limit_value || 0) }}</strong></div>
                <div v-if="reqModal.reason" class="rreason">“{{ reqModal.reason }}”</div>
                <label class="fld"><span>New monthly limit ($) <em>— 0 = unlimited, blank = inherit default</em></span>
                  <input v-model="reqAmount" type="number" min="0" step="1" placeholder="e.g. 25" />
                </label>
              </div>
              <div class="dfoot">
                <button class="btn-outline" :disabled="resolvingReq" @click="dismissRequest">Dismiss</button>
                <button class="btn-primary" :disabled="resolvingReq" @click="approveRequest">{{ resolvingReq ? "Saving…" : "Approve" }}</button>
              </div>
            </div>
          </div>
        </Teleport>
      </template>
    </section>

    <!-- Activity (auth audit log) -->
    <section v-else-if="tab === 'activity'">
      <p class="hint">Recent authentication &amp; account events, newest first.</p>
      <table class="grid">
        <thead><tr>
          <th>When</th><th>Email</th><th>Event</th><th>IP</th>
        </tr></thead>
        <tbody>
          <tr v-for="e in authEvents" :key="e.id">
            <td class="muted nowrap">{{ new Date(e.created_at).toLocaleString() }}</td>
            <td>{{ e.email || "—" }}</td>
            <td><span class="badge" :class="evClass(e.event)">{{ evLabel(e.event) }}</span></td>
            <td class="mono muted">{{ e.ip || "—" }}</td>
          </tr>
          <tr v-if="!authEvents.length"><td colspan="4" class="muted empty-row">No activity recorded yet.</td></tr>
        </tbody>
      </table>
      <div class="tablecount">{{ authEvents.length }} events</div>
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
/* token-limits tab */
.lim { width: 120px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; font-size: 12.5px; font-family: var(--mono); text-align: right; }
.rowacts { display: flex; align-items: center; justify-content: flex-end; gap: 12px; white-space: nowrap; }
.btn-pending { background: var(--ember-soft); color: var(--ember); border: 1px solid var(--ember); border-radius: 8px; padding: 5px 11px; font-size: 12px; font-weight: 700; cursor: pointer; }
.btn-pending:hover { background: var(--ember); color: #fff; }
/* request-review modal */
.overlay { position: fixed; inset: 0; background: rgba(8,12,22,.55); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 90; }
.dialog { width: 100%; max-width: 460px; background: var(--surface); border-radius: 14px; box-shadow: 0 20px 60px rgba(8,12,22,.35); display: flex; flex-direction: column; }
.dhead { display: flex; align-items: center; justify-content: space-between; padding: 15px 18px; border-bottom: 1px solid var(--line); }
.dhead h3 { margin: 0; font-family: var(--display); font-size: 15px; }
.x { background: none; border: none; font-size: 15px; cursor: pointer; color: var(--muted); }
.dbody { padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
.rrow { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; color: var(--muted); }
.rrow strong { color: var(--text); font-weight: 600; text-align: right; }
.rreason { font-size: 12.5px; font-style: italic; color: var(--text); background: var(--canvas); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.fld { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 700; color: var(--text); margin-top: 4px; }
.fld em { font-weight: 400; color: var(--muted); font-style: normal; }
.fld input { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; font-family: var(--mono); }
.dfoot { display: flex; justify-content: flex-end; gap: 10px; padding: 13px 18px; border-top: 1px solid var(--line); }
.dfoot .btn-outline, .dfoot .btn-primary { width: auto; padding: 8px 16px; }
.rightgroup { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.seg.presets { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg.presets button { padding: 6px 12px; border: none; border-right: 1px solid var(--line); background: var(--surface); color: var(--muted); font-size: 12.5px; font-weight: 700; cursor: pointer; }
.seg.presets button:last-child { border-right: none; }
.seg.presets button.on { background: var(--ember-soft); color: var(--ember); }
.dp { width: 230px; }
.dp :deep(.p-datepicker-input), .dp :deep(.p-inputtext) { width: 100%; font-size: 13px; padding: 7px 10px; }
.tablecount { text-align: center; font-size: 12px; color: var(--muted); margin-top: 12px; }
.nowrap { white-space: nowrap; }
.badge.ev-ok { background: var(--success-soft); color: var(--success); }
.badge.ev-bad { background: var(--ember-soft); color: var(--ember); }
.badge.ev-neutral { background: var(--canvas); color: var(--muted); }
.badge.pending { background: var(--ember-soft); color: var(--ember); margin-left: 5px; }
.pendbar { background: var(--ember-soft); border: 1px solid var(--ember-line, var(--line)); color: var(--ember); border-radius: 10px; padding: 9px 12px; margin-bottom: 12px; font-size: 12.5px; }
.btn-approve { background: var(--success); color: #fff; border: none; border-radius: 8px; padding: 5px 12px; font-size: 12px; font-weight: 700; cursor: pointer; margin-right: 8px; }
.btn-approve:hover { opacity: .9; }
.reject { color: var(--muted); }
.reject:hover { color: var(--ember); }

/* Token-usage reseller multi-select */
.usagebar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
.reseller-select { position: relative; }
.rs-btn { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 13px; font-weight: 600; cursor: pointer; }
.rs-btn.on, .rs-btn:hover { border-color: var(--ember); color: var(--ember); }
.rs-btn .caret { color: var(--muted); font-size: 11px; }
.rs-panel { position: absolute; top: calc(100% + 6px); right: 0; width: 280px; max-height: 320px; overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 12px 32px rgba(8,12,22,.16); padding: 6px; z-index: 60; }
.rs-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 8px; border-bottom: 1px solid var(--line); margin-bottom: 4px; font-size: 12px; color: var(--muted); }
.rs-item { display: flex; align-items: center; gap: 9px; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
.rs-item:hover { background: var(--canvas); }
.rs-item input { accent-color: var(--ember); width: 15px; height: 15px; flex-shrink: 0; }
.rs-text { display: flex; flex-direction: column; min-width: 0; }
.rs-name { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-mail { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-empty { padding: 14px; text-align: center; color: var(--muted); font-size: 12.5px; }
.rs-backdrop { position: fixed; inset: 0; z-index: 55; }
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
