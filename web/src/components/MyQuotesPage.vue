<script setup lang="ts">
import { ref, onMounted } from "vue";
import { api } from "../api";
import { money } from "../theme";
import type { QuoteSummary } from "../types";

const quotes = ref<QuoteSummary[]>([]);
const loading = ref(true);
const error = ref("");

const emit = defineEmits<{ newQuote: []; toast: [msg: string] }>();

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

async function openPdf(n: number, variant: "partner" | "customer" = "customer") {
  try {
    const url = await api.quotePdf(n, variant);
    window.open(url, "_blank");
  } catch (e) {
    emit("toast", `Could not open PDF: ${(e as Error).message}`);
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
      <button class="btn-primary" @click="emit('newQuote')">+ New quote</button>
    </div>

    <div v-if="loading" class="state">Loading your quotes…</div>
    <div v-else-if="error" class="state err">{{ error }}</div>
    <div v-else-if="!quotes.length" class="state">
      No quotes yet. Start one from the Quote assistant.
    </div>

    <div v-else class="tablewrap">
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
        <tr v-for="q in quotes" :key="q.number">
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
      </tbody>
    </table>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px; overflow-y: auto; height: 100%; }
.tablewrap { overflow-x: auto; }
@media (max-width: 760px) { .page { padding: 16px; } }
.head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
h1 { font-family: var(--display); font-size: 20px; margin: 0; }
.head p { font-size: 13px; color: var(--muted); margin: 4px 0 0; }
.btn-primary { width: auto; padding: 9px 16px; }
.state { padding: 40px; text-align: center; color: var(--muted); font-size: 14px; border: 1px dashed var(--line); border-radius: 12px; }
.state.err { color: var(--ember); border-color: var(--ember-line); }
.grid { width: 100%; min-width: 620px; border-collapse: collapse; font-size: 13px; }
.grid th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; padding: 8px 10px; border-bottom: 1.5px solid var(--ink); }
.grid td { padding: 11px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
.grid th.r, .grid td.r { text-align: right; }
.r { text-align: right; }
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
