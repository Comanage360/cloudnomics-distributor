<script setup lang="ts">
import { computed } from "vue";
import { money } from "../theme";
import BrandMark from "./BrandMark.vue";
import { useQuote } from "../stores/quote";
import type { ChatMessage } from "../types";

defineProps<{ messages: ChatMessage[]; thinking: boolean }>();

// Mirror the pricing engine's effective discount so the card never contradicts
// the quote totals — a competitive upgrade adds the bonus on top of the base rate.
const q = useQuote();
const effDiscount = computed(() =>
  Math.min(0.95, q.rates.discount + (q.sel.competitiveModel ? q.rates.competitiveBonus : 0))
);
const discountPct = computed(() => Math.round(effDiscount.value * 100));
const discounted = (list: number | null) => Math.round((list ?? 0) * (1 - effDiscount.value));
</script>

<template>
  <div class="thread">
    <div v-for="m in messages" :key="m.id" class="row fade-up" :class="{ user: m.role === 'user' }">
      <BrandMark v-if="m.role === 'claude'" :size="26" />
      <div class="col">
        <div class="bubble" :class="m.role">{{ m.text }}</div>

        <div v-if="m.card" class="rec">
          <div class="rec-head">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span class="sku">{{ m.card.firewall.sku }}</span>
            <span class="cap">up to {{ m.card.firewall.maxUsers }} users</span>
          </div>
          <div class="rec-body">
            <div class="name">{{ m.card.firewall.name }}</div>
            <div v-if="m.card.firewall.list == null" class="price">
              <div class="now">On request</div>
              <div class="tag">contact for pricing</div>
            </div>
            <div v-else class="price">
              <div class="strike">{{ money(m.card.firewall.list || 0) }}</div>
              <div class="now">{{ money(discounted(m.card.firewall.list)) }}</div>
              <div class="tag">your price · {{ discountPct }}% off{{ m.card.firewall.unit === 'annual' ? ' · /yr' : '' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="thinking" class="row">
      <BrandMark :size="26" />
      <div class="typing"><span class="dot" /><span class="dot" style="animation-delay:.15s" /><span class="dot" style="animation-delay:.3s" /></div>
    </div>
  </div>
</template>

<style scoped>
.thread { max-width: 640px; margin: 0 auto; }
.row { display: flex; gap: 10px; margin-bottom: 14px; }
.row.user { justify-content: flex-end; }
.col { max-width: 78%; }
.bubble { border-radius: 14px; padding: 11px 14px; font-size: 14px; line-height: 1.5; border: 1px solid var(--line); background: var(--surface); }
.bubble.user { background: var(--ember-soft); border-color: var(--ember-line); }
.typing { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 16px; display: flex; gap: 5px; align-items: center; }

.rec { margin-top: 8px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--surface); }
.rec-head { background: var(--ink); color: #fff; padding: 9px 14px; display: flex; align-items: center; gap: 8px; }
.sku { font-family: var(--display); font-weight: 600; font-size: 13.5px; }
.cap { font-size: 11px; color: rgba(255,255,255,.6); margin-left: auto; }
.rec-body { padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; }
.name { font-size: 12.5px; color: var(--muted); }
.price { text-align: right; }
.strike { font-family: var(--mono); font-size: 11px; color: var(--muted); text-decoration: line-through; }
.now { font-family: var(--mono); font-size: 16px; font-weight: 700; }
.tag { font-size: 10.5px; color: var(--success); font-weight: 600; }
</style>
