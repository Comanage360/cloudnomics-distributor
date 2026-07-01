<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { api } from "../api";
import { money } from "../theme";
import type { QuoteSummary } from "../types";
import Skeleton from "./Skeleton.vue";
import EmptyState from "./EmptyState.vue";
import { useRouter } from "vue-router";
import { useQuote } from "../stores/quote";
import { useToast } from "../stores/toast";
import DatePicker from "primevue/datepicker";

const router = useRouter();
const quoteStore = useQuote();
const toast = useToast();

const quotes = ref<QuoteSummary[]>([]);
const loading = ref(true);
const error = ref("");

function newQuote() { quoteStore.reset(); router.push("/"); }

// filters
const search = ref("");
const statusFilter = ref<"all" | "draft" | "sent">("all");
const skuFilter = ref("all");
const dateFrom = ref("");
const dateTo = ref("");
// preset (1D/7D/30D) + PrimeVue range picker, mirroring the admin usage filter.
// Default is "all" (no highlight) so every quote shows on load.
const activePreset = ref<"1d" | "7d" | "30d" | "custom">("custom");
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

onMounted(async () => {
  try {
    quotes.value = await api.listQuotes();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});

const fmtDate = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US");
};

const skuOptions = computed(() => [...new Set(quotes.value.map((q) => q.sku).filter((s): s is string => !!s))].sort());
const term = () => search.value.trim().toLowerCase();

const fQuotes = computed(() =>
  quotes.value.filter((q) => {
    const t = term();
    const m = !t || (q.customer_name || "").toLowerCase().includes(t) || String(q.number).includes(t) || (q.sku || "").toLowerCase().includes(t);
    if (!m) return false;
    if (statusFilter.value !== "all" && q.status !== statusFilter.value) return false;
    if (skuFilter.value !== "all" && q.sku !== skuFilter.value) return false;
    const ts = Date.parse(q.created_at);
    if (dateFrom.value && ts < Date.parse(dateFrom.value + "T00:00:00")) return false;
    if (dateTo.value && ts > Date.parse(dateTo.value + "T23:59:59")) return false;
    return true;
  })
);
const filtersActive = computed(() =>
  !!(search.value || statusFilter.value !== "all" || skuFilter.value !== "all" || dateFrom.value || dateTo.value));
function clearFilters() {
  search.value = ""; statusFilter.value = "all"; skuFilter.value = "all";
  dateFrom.value = ""; dateTo.value = ""; activePreset.value = "custom";
}

async function openPdf(n: number, variant: "partner" | "customer" = "customer") {
  try {
    const url = await api.quotePdf(n, variant);
    window.open(url, "_blank");
  } catch (e) {
    toast.show(`Could not open PDF: ${(e as Error).message}`);
  }
}
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <h1>My quotes</h1>
        <p>Every quote you've generated, newest first.</p>
      </div>
      <button class="btn-primary" @click="newQuote">+ New quote</button>
    </div>

    <Skeleton v-if="loading" :rows="6" />
    <div v-else-if="error" class="state err">{{ error }}</div>

    <EmptyState v-else-if="!quotes.length" icon="quotes" title="No quotes yet"
      text="Build your first Palo Alto quote with the AI assistant — it'll show up here.">
      <button class="btn-primary" @click="newQuote">+ Start your first quote</button>
    </EmptyState>

    <template v-else>
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
        <button v-if="filtersActive" class="link clearf" @click="clearFilters">Clear filters</button>
        <div class="rightgroup">
          <div class="seg presets">
            <button :class="{ on: activePreset === '1d' }" @click="setPreset(1, '1d')">1D</button>
            <button :class="{ on: activePreset === '7d' }" @click="setPreset(7, '7d')">7D</button>
            <button :class="{ on: activePreset === '30d' }" @click="setPreset(30, '30d')">30D</button>
          </div>
          <DatePicker v-model="dateRange" selectionMode="range" :manualInput="false"
            dateFormat="dd M yy" placeholder="Date range" showButtonBar :numberOfMonths="2" class="dp" />
          <span class="count">{{ fQuotes.length }} of {{ quotes.length }}</span>
        </div>
      </div>

      <div class="tablewrap">
        <table class="grid">
          <thead>
            <tr>
              <th>Quote #</th>
              <th>Customer</th>
              <th>Product</th>
              <th class="r">Your cost</th>
              <th class="r">Markup</th>
              <th class="r">Customer total</th>
              <th>Status</th>
              <th>Date</th>
              <th class="r">Customer PDF</th>
              <th class="r">Partner PDF</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="q in fQuotes" :key="q.number">
              <td class="mono">#{{ q.number }}</td>
              <td>
                <div class="cname">{{ q.customer_name || "Customer" }}</div>
                <div class="cmail">{{ q.customer_email }}</div>
              </td>
              <td>{{ q.sku || "—" }}</td>
              <td class="r mono">{{ money(Math.round(Number(q.reseller_total))) }}</td>
              <td class="r mono">{{ Math.round(Number(q.markup)) }}%</td>
              <td class="r mono strong">{{ money(Math.round(Number(q.customer_total))) }}</td>
              <td><span class="badge" :class="q.status">{{ q.status }}</span></td>
              <td class="muted">{{ fmtDate(q.created_at) }}</td>
              <td class="r"><button class="link" @click="openPdf(q.number, 'customer')">Open ↗</button></td>
              <td class="r"><button class="link" @click="openPdf(q.number, 'partner')">Open ↗</button></td>
            </tr>
            <tr v-if="!fQuotes.length"><td colspan="10" class="muted empty-row">No quotes match your filters.</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { padding: 24px; overflow-y: auto; height: 100%; }
@media (max-width: 760px) { .page { padding: 16px; } }
.head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
h1 { font-family: var(--display); font-size: 20px; margin: 0; }
.head p { font-size: 13px; color: var(--muted); margin: 4px 0 0; }
.btn-primary { width: auto; padding: 9px 16px; }
.state.err { padding: 40px; text-align: center; color: var(--ember); font-size: 14px; border: 1px dashed var(--ember-line); border-radius: 12px; }

.toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.search { flex: 1; min-width: 200px; max-width: 360px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
.select { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; background: var(--surface); color: var(--text); }
.clearf { font-size: 12.5px; }
.count { font-size: 12px; color: var(--muted); }

.rightgroup { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.seg.presets { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg.presets button { padding: 6px 12px; border: none; border-right: 1px solid var(--line); background: var(--surface); color: var(--muted); font-size: 12.5px; font-weight: 700; cursor: pointer; }
.seg.presets button:last-child { border-right: none; }
.seg.presets button.on { background: var(--ember-soft); color: var(--ember); }
.dp { width: 230px; }
.dp :deep(.p-datepicker-input), .dp :deep(.p-inputtext) { width: 100%; font-size: 13px; padding: 7px 10px; }

.tablewrap { overflow: auto; max-height: calc(100vh - 240px); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
.grid { width: 100%; min-width: 620px; border-collapse: collapse; font-size: 13px; }
.grid thead th { position: sticky; top: 0; z-index: 1; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; padding: 9px 10px; background: var(--surface); border-bottom: 1.5px solid var(--ink); }
.grid td { padding: 11px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
.grid tbody tr:nth-child(even) td { background: var(--canvas); }
.grid tbody tr:hover td { background: var(--ember-soft); }
.grid th.r, .grid td.r { text-align: right; }
.empty-row { text-align: center; padding: 28px; }
.mono { font-family: var(--mono); }
.strong { font-weight: 700; }
.muted { color: var(--muted); }
.cname { font-weight: 600; }
.cmail { font-size: 11px; color: var(--muted); margin-top: 2px; }
.badge { font-size: 10.5px; font-weight: 700; padding: 2px 9px; border-radius: 20px; text-transform: capitalize; background: var(--canvas); color: var(--muted); }
.badge.sent { background: var(--success-soft); color: var(--success); }
.badge.draft { background: var(--ember-soft); color: var(--ember); }
.link { background: none; border: none; color: var(--ember); font-weight: 600; font-size: 12.5px; cursor: pointer; }
.link:hover { text-decoration: underline; }
</style>
