<script setup lang="ts">
import { computed } from "vue";
import { money } from "../theme";
import type { QuoteTotals } from "../types";

const props = defineProps<{
  // partner = Cloudnomics → reseller (base cost); customer = reseller → end customer (with markup)
  mode: "partner" | "customer";
  totals: QuoteTotals;
  resellerCompany: string;
  resellerLogo: string | null;
  customerName: string;
  customerEmail?: string;
  quoteNumber: number | null;
}>();
defineEmits<{ close: [] }>();

const isPartner = computed(() => props.mode === "partner");

// Brand / parties / pricing all switch on the quote direction.
const brandLogo = computed(() => (isPartner.value ? null : props.resellerLogo));
const brandName = computed(() => (isPartner.value ? "Cloudnomics" : props.resellerCompany));
const billToName = computed(() => (isPartner.value ? props.resellerCompany : props.customerName));
const billToInfo = computed(() => (isPartner.value ? "" : props.customerEmail || ""));
const preparedBy = computed(() => (isPartner.value ? "Cloudnomics" : props.resellerCompany));
const directionLabel = computed(() =>
  isPartner.value ? "Distributor → Reseller" : "Reseller → Customer"
);

const today = new Date();
const fmtDate = (d: Date) => d.toLocaleDateString("en-US");
const validUntil = computed(() => {
  const d = new Date(today);
  d.setDate(d.getDate() + 30);
  return fmtDate(d);
});

// Partner quote = reseller cost (no markup); customer quote = cost × markup.
const markupMult = computed(() => (isPartner.value ? 1 : 1 + props.totals.markup / 100));

// Customer-facing rows: list price, effective discount off list, and amount.
const rows = computed(() =>
  props.totals.items.map((it) => {
    const onRequest = it.key === "fw" && it.reseller === 0;
    const amount = Math.round(it.reseller * markupMult.value);
    const showDisc = !onRequest && it.listTotal > 0 && it.listTotal >= amount;
    return {
      key: it.key,
      label: it.label,
      meta: it.meta,
      qty: it.qty ?? 1,
      onRequest,
      amount,
      listText: onRequest ? "—" : money(it.listTotal > 0 ? it.listTotal : amount),
      discText: showDisc ? `${Math.round((1 - amount / it.listTotal) * 100)}%` : "—",
      amountText: onRequest ? "On request" : money(amount),
    };
  })
);
const subtotal = computed(() => rows.value.reduce((s, r) => s + r.amount, 0));

const doPrint = () => window.print();
</script>

<template>
  <Teleport to="body">
    <div class="overlay">
      <div class="sheet-wrap">
        <div class="bar no-print">
          <button class="btn-primary" @click="doPrint">Print / Save as PDF</button>
          <button class="btn-outline" @click="$emit('close')">Close</button>
        </div>

        <div id="quote-print" class="sheet">
          <!-- Header -->
          <div class="head">
            <div class="head-left">
              <template v-if="isPartner">
                <img src="/cloudnomics-logo.svg" alt="Cloudnomics" class="logo cn-logo" />
              </template>
              <template v-else>
                <img v-if="brandLogo" :src="brandLogo" alt="brand" class="logo" />
                <div v-else class="company">{{ brandName }}</div>
              </template>
            </div>
            <div class="head-right">
              <div class="qtitle">SALES QUOTE</div>
              <div class="direction">{{ directionLabel }}</div>
              <table class="meta">
                <tbody>
                  <tr><td>Quotation No.</td><td>{{ quoteNumber ?? 643555 }}</td></tr>
                  <tr><td>Quotation Date</td><td>{{ fmtDate(today) }}</td></tr>
                  <tr><td>Valid Until</td><td>{{ validUntil }}</td></tr>
                  <tr><td>Type of Sale</td><td>New Quote</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Parties + total band -->
          <div class="band">
            <div class="cell">
              <div class="chead">BILL TO</div>
              <div class="cname">{{ billToName }}</div>
              <div class="cinfo" v-if="billToInfo">{{ billToInfo }}</div>
            </div>
            <div class="cell">
              <div class="chead">PREPARED BY</div>
              <div class="cname">{{ preparedBy }}</div>
              <div class="cinfo">via Cloudnomics Distributor Console</div>
            </div>
            <div class="cell total">
              <div class="chead">TOTAL</div>
              <div class="tval">{{ money(subtotal) }}</div>
              <div class="cinfo">Taxes / shipping added if applicable</div>
            </div>
          </div>

          <!-- Line items -->
          <table class="lines">
            <thead>
              <tr>
                <th class="c">Qty</th>
                <th>Item &amp; Description</th>
                <th class="r">List Price</th>
                <th class="r">Disc.</th>
                <th class="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.key">
                <td class="c mono">{{ r.qty }}</td>
                <td>
                  <div class="il">{{ r.label }}</div>
                  <div class="im">{{ r.meta }}</div>
                </td>
                <td class="r mono muted">{{ r.listText }}</td>
                <td class="r mono muted">{{ r.discText }}</td>
                <td class="r mono">{{ r.amountText }}</td>
              </tr>
            </tbody>
          </table>

          <!-- Totals -->
          <div class="totals">
            <div class="trow"><span>Subtotal</span><span class="mono">{{ money(subtotal) }}</span></div>
            <div class="trow muted"><span>Tax</span><span class="mono">—</span></div>
            <div class="grand">
              <span>Total Order Value</span>
              <span class="mono ember">{{ money(subtotal) }}</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="foot">
            <div>
              <div class="fstrong">{{ preparedBy }}</div>
              <div>Prepared via the Cloudnomics Distributor Console</div>
            </div>
            <div class="fnote">
              Pricing valid 30 days from the quotation date. Palo Alto Networks products
              supplied through Cloudnomics, authorized distributor.
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(8,12,22,.6); display: flex; justify-content: center; padding: 24px; overflow-y: auto; z-index: 50; }
.sheet-wrap { width: 100%; max-width: 820px; }
.bar { display: flex; justify-content: space-between; margin-bottom: 12px; }
.sheet { background: #fff; border-radius: 12px; padding: 44px; font-family: var(--body); color: var(--text); }

/* Header */
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.logo { height: 48px; max-width: 220px; object-fit: contain; }
.cn-logo { height: 60px; max-width: 260px; }
.company { font-family: var(--display); font-size: 24px; font-weight: 700; letter-spacing: -.01em; }
.tagline { font-size: 11px; color: var(--muted); margin-top: 8px; max-width: 260px; }
.head-right { text-align: right; flex-shrink: 0; }
.qtitle { font-family: var(--display); font-size: 22px; font-weight: 700; letter-spacing: .04em; color: var(--ember); margin-bottom: 2px; }
.direction { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
.meta { font-size: 11.5px; border-collapse: collapse; margin-left: auto; }
.meta td { padding: 1.5px 0; }
.meta td:first-child { color: var(--muted); text-align: right; padding-right: 12px; }
.meta td:last-child { font-family: var(--mono); font-weight: 600; text-align: right; }

/* Parties band */
.band { display: flex; gap: 1px; margin-top: 26px; background: var(--line); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.cell { flex: 1; background: #fff; padding: 12px 14px; }
.cell.total { background: var(--ember-soft); }
.chead { font-size: 10px; letter-spacing: .12em; color: var(--muted); font-weight: 700; }
.cname { font-size: 13.5px; font-weight: 600; margin-top: 5px; }
.cinfo { font-size: 11.5px; color: var(--muted); margin-top: 3px; }
.tval { font-family: var(--mono); font-size: 19px; font-weight: 700; color: var(--ember); margin-top: 4px; }

/* Line items */
.lines { width: 100%; border-collapse: collapse; margin-top: 26px; font-size: 12.5px; }
.lines thead th { text-align: left; color: var(--muted); font-weight: 600; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; border-bottom: 1.5px solid var(--ink); padding: 0 0 8px; }
.lines tbody td { border-bottom: 1px solid var(--line); padding: 10px 0; vertical-align: top; }
.lines .c { text-align: center; width: 44px; }
.lines .r { text-align: right; white-space: nowrap; }
.lines th.r { text-align: right; }
.il { font-weight: 600; }
.im { font-size: 11px; color: var(--muted); margin-top: 2px; }
.mono { font-family: var(--mono); }
.muted { color: var(--muted); }

/* Totals */
.totals { margin: 18px 0 0; margin-left: auto; width: 280px; }
.trow { display: flex; justify-content: space-between; font-size: 12.5px; padding: 4px 0; }
.grand { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; padding-top: 10px; border-top: 2px solid var(--ink); }
.grand span:first-child { font-family: var(--display); font-weight: 700; font-size: 13.5px; }
.ember { color: var(--ember); font-size: 17px; font-weight: 700; }

/* Footer */
.foot { display: flex; justify-content: space-between; gap: 24px; margin-top: 34px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 10.5px; color: var(--muted); }
.fstrong { font-weight: 700; color: var(--text); font-size: 11.5px; }
.fnote { max-width: 320px; text-align: right; }

@media (max-width: 760px) {
  .overlay { padding: 8px; }
  .sheet { padding: 22px 18px; }
  .head { flex-direction: column; gap: 14px; }
  .head-right { text-align: left; }
  .meta { margin-left: 0; }
  .meta td:first-child { text-align: left; padding-right: 16px; }
  .cn-logo { height: 48px; }
  .band { flex-direction: column; gap: 0; }
  .band .cell + .cell { border-top: 1px solid var(--line); }
  .totals { width: 100%; }
  .foot { flex-direction: column; gap: 8px; }
  .fnote { max-width: none; text-align: left; }
  /* drop List Price + Disc columns to fit Qty · Item · Amount */
  .lines th:nth-child(3), .lines td:nth-child(3),
  .lines th:nth-child(4), .lines td:nth-child(4) { display: none; }
}
</style>
