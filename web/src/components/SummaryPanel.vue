<script setup lang="ts">
import { money } from "../theme";
import Icon from "./Icon.vue";
import LimitBanner from "./LimitBanner.vue";
import type { QuoteSummary, QuoteTotals } from "../types";

defineProps<{
  totals: QuoteTotals;
  addons: { impl: boolean; xdr: boolean; managed: boolean };
  recent: QuoteSummary[];
  ready: boolean;
}>();
const emit = defineEmits<{ preview: [mode: "partner" | "customer"]; open: [number: number] }>();
</script>

<template>
  <aside class="rp">
    <LimitBanner class="rp-banner" />

    <section class="sec">
      <h4>Quote summary</h4>
      <template v-if="totals.items.length">
        <div v-for="it in totals.items" :key="it.key" class="sline">
          <span class="sl">{{ it.label.split(" · ")[0] }}</span>
          <span class="sv">{{ it.reseller === 0 && it.key === 'fw' ? 'On request' : money(it.reseller) }}</span>
        </div>
        <div class="sum-total">
          <div class="tl">Total (your cost)</div>
          <div class="tv">{{ money(totals.resellerTotal) }}</div>
          <div class="tl cp-label">Customer price ({{ totals.markup }}% Markup)</div>
          <div class="tv">{{ money(totals.customerTotal) }}</div>
        </div>
        <div v-if="ready" class="previews">
          <button class="btn-outline preview" @click="emit('preview', 'partner')">View Partner Quote</button>
          <button class="btn-primary preview" @click="emit('preview', 'customer')">View Customer Quote</button>
        </div>
      </template>
      <p v-else class="empty">Build your quote in the chat →</p>
    </section>

    <section class="sec">
      <h4>Add-ons</h4>
      <span class="tag" :class="addons.impl ? 'on' : 'off'">{{ addons.impl ? '✓' : '·' }} Implementation</span>
      <span class="tag" :class="addons.xdr ? 'on' : 'off'">{{ addons.xdr ? '✓' : '·' }} Cortex XDR</span>
      <span class="tag" :class="addons.managed ? 'on' : 'off'">{{ addons.managed ? '✓' : '·' }} Managed</span>
    </section>

    <section class="sec">
      <h4>Recent quotes</h4>
      <p v-if="!recent.length" class="empty">No quotes yet.</p>
      <button v-for="q in recent.slice(0, 5)" :key="q.number" class="hist" @click="emit('open', q.number)">
        <span class="hist-ic"><Icon name="quotes" :size="14" /></span>
        <span class="hist-tx">
          <span class="hist-name">{{ q.customer_name || 'Customer' }}</span>
          <span class="hist-sub">{{ q.sku || '—' }} · #{{ q.number }}</span>
        </span>
        <span class="hist-amt">{{ money(Math.round(Number(q.customer_total))) }}</span>
      </button>
    </section>
  </aside>
</template>

<style scoped>
.rp { width: 260px; flex-shrink: 0; border-left: 1px solid var(--line); background: var(--surface); overflow-y: auto; }

@media (max-width: 760px) {
  .rp { width: 100%; border-left: none; border-top: 1px solid var(--line); overflow-y: visible; }
}
.rp-banner { margin: 12px 12px 0; }
.sec { padding: 14px; border-bottom: 1px solid var(--line); }
h4 { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .07em; margin: 0 0 10px; }
.empty { font-size: 12px; color: var(--muted); }
.sline { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; gap: 8px; }
.sl { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sv { font-weight: 600; font-family: var(--mono); flex-shrink: 0; }
.sum-total { background: var(--canvas); border-radius: 8px; padding: 9px 11px; margin-top: 8px; }
.tl { font-size: 10px; color: var(--muted); }
.tv { font-size: 17px; font-weight: 800; color: var(--ink); font-family: var(--mono); margin-top: 1px; }
.cp-label { margin-top: 8px; }
.ts { font-size: 11px; color: var(--ember); font-weight: 600; margin-top: 2px; }
.previews { display: flex; flex-direction: column; gap: 7px; margin-top: 10px; }
.preview { width: 100%; font-size: 12px; }
.tag { display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; margin: 0 4px 5px 0; border: 1px solid; }
.tag.on { background: var(--success-soft); color: var(--success); border-color: var(--success); }
.tag.off { background: var(--canvas); color: var(--muted); border-color: var(--line); }
.hist { width: 100%; display: flex; align-items: center; gap: 8px; padding: 7px; border: none; border-radius: 8px; background: none; cursor: pointer; margin-bottom: 2px; text-align: left; }
.hist:hover { background: var(--canvas); }
.hist-ic { width: 26px; height: 26px; background: var(--canvas); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; }
.hist-tx { display: flex; flex-direction: column; min-width: 0; }
.hist-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hist-sub { font-size: 10px; color: var(--muted); }
.hist-amt { font-size: 12px; font-weight: 700; font-family: var(--mono); margin-left: auto; flex-shrink: 0; }
</style>
