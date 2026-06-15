<script setup lang="ts">
import { money } from "../theme";
import type { QuoteTotals, Step } from "../types";

const props = defineProps<{ totals: QuoteTotals; step: Step }>();
defineEmits<{ preview: [] }>();
const ready = () => props.step === "send" || props.step === "done";
</script>

<template>
  <div class="panel">
    <div class="head">
      <div class="title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        <h2>Quote builder</h2>
      </div>
      <p class="sub">{{ totals.items.length ? "Updates live as you build." : "Start the conversation to begin." }}</p>
    </div>

    <div class="items">
      <div v-if="!totals.items.length" class="empty">No line items yet.</div>
      <div v-for="it in totals.items" :key="it.key" class="item fade-up" :class="{ service: it.service }">
        <div class="item-top">
          <div class="meta-col">
            <div class="label">{{ it.label }}</div>
            <div class="meta">{{ it.meta }}</div>
          </div>
          <div class="price-col">
            <template v-if="it.key === 'fw' && it.reseller === 0">
              <div class="now">On request</div>
            </template>
            <template v-else>
              <div v-if="!it.service" class="strike">{{ money(it.listTotal) }}</div>
              <div class="now">{{ money(it.reseller) }}</div>
            </template>
          </div>
        </div>
        <span v-if="!it.service && !(it.key === 'fw' && it.reseller === 0)" class="badge">30% reseller discount</span>
      </div>
    </div>

    <div v-if="totals.items.length" class="totals">
      <div class="trow"><span>Your cost (Cloudnomics)</span><span class="mono">{{ money(totals.resellerTotal) }}</span></div>
      <div v-if="totals.markup > 0" class="trow muted"><span>Customer markup ({{ totals.markup }}%)</span><span class="mono">+ {{ money(totals.margin) }}</span></div>
      <div class="grand">
        <span>Customer price</span>
        <span class="grand-val">{{ money(totals.markup > 0 ? totals.customerTotal : totals.resellerTotal) }}</span>
      </div>
      <button v-if="ready()" class="btn-primary full" @click="$emit('preview')">Preview customer quote</button>
    </div>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; height: 100%; }
.head { padding: 18px 20px 12px; border-bottom: 1px solid var(--line); }
.title { display: flex; align-items: center; gap: 8px; }
h2 { font-family: var(--display); font-size: 15px; margin: 0; }
.sub { margin: 6px 0 0; font-size: 12.5px; color: var(--muted); }
.items { flex: 1; overflow-y: auto; padding: 8px 14px; }
.empty { text-align: center; color: var(--muted); font-size: 13px; padding: 40px 12px; }
.item { border: 1px solid var(--line); border-radius: 12px; padding: 11px 13px; margin-bottom: 8px; background: var(--surface); }
.item.service { background: #fbfcfe; }
.item-top { display: flex; justify-content: space-between; gap: 10px; }
.label { font-size: 13px; font-weight: 600; line-height: 1.25; }
.meta { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.price-col { text-align: right; flex-shrink: 0; }
.strike { font-family: var(--mono); font-size: 11px; color: var(--muted); text-decoration: line-through; }
.now { font-family: var(--mono); font-size: 14px; font-weight: 600; }
.badge { display: inline-block; margin-top: 7px; font-size: 10.5px; font-weight: 600; color: var(--success); background: var(--success-soft); padding: 1px 7px; border-radius: 20px; }
.totals { border-top: 1px solid var(--line); padding: 14px 18px; }
.trow { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
.trow.muted { color: var(--muted); }
.mono { font-family: var(--mono); }
.grand { display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; padding-top: 10px; border-top: 1px dashed var(--line); }
.grand span:first-child { font-family: var(--display); font-weight: 600; }
.grand-val { font-family: var(--mono); font-size: 20px; font-weight: 700; color: var(--ember); }
.full { width: 100%; margin-top: 14px; }
</style>
