<script setup lang="ts">
import { money } from "../theme";
import type { QuoteTotals } from "../types";

const props = defineProps<{
  totals: QuoteTotals;
  customerName: string;
  company: string;
  logo: string | null;
  quoteNumber: number | null;
}>();
defineEmits<{ close: [] }>();

const today = new Date().toLocaleDateString();
const custPrice = (reseller: number) => Math.round(reseller * (1 + props.totals.markup / 100));
const total = () => (props.totals.markup > 0 ? props.totals.customerTotal : props.totals.resellerTotal);
const doPrint = () => window.print();
</script>

<template>
  <div class="overlay">
    <div class="sheet-wrap">
      <div class="bar no-print">
        <button class="btn-primary" @click="doPrint">Print / Save as PDF</button>
        <button class="btn-outline" @click="$emit('close')">Close</button>
      </div>

      <div id="quote-print" class="sheet">
        <div class="top">
          <div>
            <img v-if="logo" :src="logo" alt="brand" class="logo" />
            <div v-else class="company">{{ company }}</div>
            <div class="for">Prepared for {{ customerName }}</div>
          </div>
          <div class="meta">
            <div class="qword">QUOTE</div>
            <div>#{{ quoteNumber ?? 643555 }}</div>
            <div>{{ today }}</div>
          </div>
        </div>

        <table>
          <thead><tr><th>Item</th><th class="r">Amount</th></tr></thead>
          <tbody>
            <tr v-for="it in totals.items" :key="it.key">
              <td>
                <div class="il">{{ it.label }}</div>
                <div class="im">{{ it.meta }}</div>
              </td>
              <td class="r mono">{{ money(custPrice(it.reseller)) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="total-row">
          <div class="total-box">
            <span>Total</span>
            <span class="mono ember">{{ money(total()) }}</span>
          </div>
        </div>

        <p class="fine">
          Prepared via the Cloudnomics Distributor Console. Pricing valid 30 days.
          Palo Alto Networks products supplied through Cloudnomics, authorized distributor.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(8,12,22,.6); display: flex; justify-content: center; padding: 24px; overflow-y: auto; z-index: 50; }
.sheet-wrap { width: 100%; max-width: 760px; }
.bar { display: flex; justify-content: space-between; margin-bottom: 12px; }
.sheet { background: #fff; border-radius: 12px; padding: 44px; font-family: var(--body); }
.top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--ember); padding-bottom: 18px; }
.logo { height: 46px; max-width: 200px; object-fit: contain; }
.company { font-family: var(--display); font-size: 22px; font-weight: 700; }
.for { font-size: 12px; color: var(--muted); margin-top: 6px; }
.meta { text-align: right; font-size: 12px; color: var(--muted); }
.qword { font-family: var(--display); font-size: 18px; font-weight: 700; color: var(--text); }
table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
th { text-align: left; color: var(--muted); border-bottom: 1px solid var(--line); padding: 8px 0; font-weight: 600; }
td { border-bottom: 1px solid var(--line); padding: 10px 0; }
.r { text-align: right; }
.mono { font-family: var(--mono); }
.il { font-weight: 600; }
.im { font-size: 11.5px; color: var(--muted); }
.total-row { display: flex; justify-content: flex-end; margin-top: 20px; }
.total-box { min-width: 220px; display: flex; justify-content: space-between; padding: 10px 0; border-top: 2px solid var(--text); font-weight: 700; font-family: var(--display); }
.ember { color: var(--ember); }
.fine { font-size: 11px; color: var(--muted); margin-top: 28px; }
</style>
