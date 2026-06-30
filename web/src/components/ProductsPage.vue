<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { api } from "../api";
import { money } from "../theme";
import type { Pricelist, Firewall } from "../types";
import Skeleton from "./Skeleton.vue";

const pricelist = ref<Pricelist | null>(null);
const loading = ref(true);
const error = ref("");

onMounted(async () => {
  try {
    pricelist.value = await api.pricelist();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});

const SERIES_ORDER = ["PA-Series", "VM-Series", "CN-Series"];
const SERIES_LABEL: Record<string, string> = {
  "PA-Series": "PA-Series · Hardware",
  "VM-Series": "VM-Series · Virtual",
  "CN-Series": "CN-Series · Containerized",
};

const groups = computed(() => {
  const fws = pricelist.value?.firewalls ?? [];
  return SERIES_ORDER
    .map((s) => ({ series: s, label: SERIES_LABEL[s] || s, items: fws.filter((f) => f.series === s) }))
    .filter((g) => g.items.length);
});

const unitLabel = (u: Firewall["unit"]) =>
  u === "annual" ? "/ yr" : u === "on_request" ? "" : "one-time";
const priceText = (f: Firewall) => (f.list == null ? "On request" : `${money(f.list)} ${unitLabel(f.unit)}`);
</script>

<template>
  <div class="page">
    <div class="head">
      <h1>Products</h1>
      <p>Live Palo Alto Networks catalogue from the Cloudnomics pricelist.</p>
    </div>

    <Skeleton v-if="loading" :rows="8" />
    <div v-else-if="error" class="state err">{{ error }}</div>

    <template v-else>
      <div v-for="g in groups" :key="g.series" class="group">
        <h2>{{ g.label }}</h2>
        <div class="tablewrap">
        <table class="grid">
          <thead>
            <tr><th>Model</th><th class="r">Up to users</th><th class="r">List price</th></tr>
          </thead>
          <tbody>
            <tr v-for="f in g.items" :key="f.sku">
              <td><span class="sku">{{ f.sku }}</span> <span class="nm">{{ f.name }}</span></td>
              <td class="r mono">{{ f.maxUsers >= 9999999 ? "Unlimited" : f.maxUsers.toLocaleString() }}</td>
              <td class="r mono" :class="{ req: f.list == null }">{{ priceText(f) }}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      <div v-if="pricelist?.xdr" class="group">
        <h2>Endpoint security</h2>
        <div class="xdr">
          <div>
            <div class="sku">{{ pricelist.xdr.sku }}</div>
            <div class="nm">{{ pricelist.xdr.name }} — annual subscription, per user</div>
          </div>
          <div class="xdr-price mono">{{ money(pricelist.xdr.listPerUser) }} <span>/ user / yr</span></div>
        </div>
      </div>

      <p class="note">Reseller pricing is 30% off list. Prices in {{ pricelist?.currency || "USD" }}.</p>
    </template>
  </div>
</template>

<style scoped>
.page { padding: 24px; overflow-y: auto; height: 100%; }
.head { margin-bottom: 18px; }
h1 { font-family: var(--display); font-size: 20px; margin: 0; }
.head p { font-size: 13px; color: var(--muted); margin: 4px 0 0; }
.state { padding: 40px; text-align: center; color: var(--muted); font-size: 14px; border: 1px dashed var(--line); border-radius: 12px; }
.state.err { color: var(--ember); }
.group { margin-bottom: 26px; }
h2 { font-family: var(--display); font-size: 14px; margin: 0 0 8px; color: var(--ember); }
.grid { width: 100%; min-width: 420px; border-collapse: collapse; font-size: 13px; }
.tablewrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
.grid tbody tr:nth-child(even) td { background: var(--canvas); }
.grid tbody tr:hover td { background: var(--ember-soft); }
@media (max-width: 760px) { .page { padding: 16px; } .xdr { flex-direction: column; align-items: flex-start; gap: 8px; } }
.grid th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; padding: 8px 10px; border-bottom: 1.5px solid var(--ink); }
.grid td { padding: 10px; border-bottom: 1px solid var(--line); }
.grid th.r, .grid td.r { text-align: right; }
.r { text-align: right; }
.mono { font-family: var(--mono); }
.sku { font-weight: 700; }
.nm { color: var(--muted); font-size: 12px; }
.req { color: var(--muted); }
.xdr { display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.xdr-price { font-size: 18px; font-weight: 800; color: var(--ink); }
.xdr-price span { font-size: 11px; color: var(--muted); font-weight: 500; }
.note { font-size: 12px; color: var(--muted); margin-top: 8px; }
</style>
