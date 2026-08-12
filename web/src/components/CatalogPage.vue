<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useQuote } from "../stores/quote";
import { useToast } from "../stores/toast";
import { money } from "../theme";
import { catalogDiscountFor } from "../pricing";
import type { CatalogItem } from "../types";
import Skeleton from "./Skeleton.vue";

const q = useQuote();
const toast = useToast();
const router = useRouter();

const loading = ref(true);
const search = ref("");

onMounted(async () => {
  // The store owns the pricelist (and therefore the catalog); init() is a no-op
  // when the console shell has already loaded it.
  if (!q.pricelist) await q.init();
  loading.value = false;
});

const items = computed<CatalogItem[]>(() => q.pricelist?.catalog ?? []);

/** Search across part number, model and description. */
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return items.value;
  return items.value.filter((i) =>
    `${i.partNumber} ${i.model} ${i.description}`.toLowerCase().includes(term)
  );
});

/** Group by model (XSIAM / XSOAR / Cortex-XDR / Xpanse / Software NGFW). */
const groups = computed(() => {
  const by = new Map<string, CatalogItem[]>();
  for (const i of filtered.value) {
    const key = i.model || "Other";
    if (!by.has(key)) by.set(key, []);
    by.get(key)!.push(i);
  }
  return [...by.entries()].map(([model, list]) => ({ model, items: list }));
});

const unitLabel = (u: CatalogItem["unit"]) =>
  u === "annual" ? "/ yr" : u === "on_request" ? "" : "one-time";

const priceText = (i: CatalogItem) =>
  i.list == null ? "Per PANW quote" : `${money(i.list)} ${unitLabel(i.unit)}`;

/** Reseller price for one unit, at the discount configured for its category. */
function resellerText(i: CatalogItem): string {
  if (i.list == null) return "—";
  const d = catalogDiscountFor(i.discountCategory, q.rates);
  return `${money(Math.round(i.list * (1 - d)))} (${Math.round(d * 100)}% off)`;
}

function add(i: CatalogItem) {
  q.addCatalogItem(i.partNumber, 1);
  toast.show(`✅ Added ${i.partNumber}`);
}

const selectedCount = computed(() => q.sel.catalogItems?.length ?? 0);
</script>

<template>
  <div class="page">
    <div class="head">
      <h1>MSSP catalog</h1>
      <p>
        Palo Alto MSSP subscription SKUs from the global price list. Add them to the
        current quote — the quote panel and totals update as you go.
      </p>
    </div>

    <div class="bar">
      <input v-model="search" class="search" placeholder="Search part number, model or description…" />
      <button v-if="selectedCount" class="btn-primary go" @click="router.push('/')">
        {{ selectedCount }} on this quote — open quote →
      </button>
    </div>

    <Skeleton v-if="loading" :rows="6" />
    <p v-else-if="!items.length" class="empty">
      No catalog SKUs have been imported yet.
    </p>
    <p v-else-if="!filtered.length" class="empty">No SKUs match “{{ search }}”.</p>

    <section v-for="g in groups" :key="g.model" class="group">
      <h2 class="gtitle">{{ g.model }}</h2>
      <div class="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Part number</th>
              <th>Description</th>
              <th class="num">List</th>
              <th class="num">Your price</th>
              <th class="num">On quote</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in g.items" :key="i.partNumber">
              <td class="mono">{{ i.partNumber }}</td>
              <td class="desc">{{ i.description }}</td>
              <td class="num">{{ priceText(i) }}</td>
              <td class="num">{{ resellerText(i) }}</td>
              <td class="num">
                <input
                  v-if="q.catalogQty(i.partNumber)"
                  class="qty" type="number" min="1" max="10000"
                  :value="q.catalogQty(i.partNumber)"
                  @input="q.setCatalogQty(i.partNumber, Number(($event.target as HTMLInputElement).value))"
                />
                <span v-else class="muted">—</span>
              </td>
              <td class="actions">
                <button class="btn-ghost" @click="add(i)">Add</button>
                <button v-if="q.catalogQty(i.partNumber)" class="btn-ghost rm" @click="q.removeCatalogItem(i.partNumber)">Remove</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page { padding: 24px; overflow-y: auto; height: 100%; }
.head { margin-bottom: 14px; }
.head p { font-size: 12.5px; color: var(--muted); max-width: 640px; }
.bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
.search { flex: 1; min-width: 220px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 9px; font-size: 13px; }
.go { width: auto; padding: 9px 16px; font-size: 12.5px; }
.empty { font-size: 13px; color: var(--muted); padding: 18px 0; }
.group { margin-bottom: 26px; }
.gtitle { font-size: 14px; font-weight: 800; margin-bottom: 8px; }
.tablewrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 760px; }
th, td { padding: 9px 12px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
tr:last-child td { border-bottom: none; }
.num { text-align: right; white-space: nowrap; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; white-space: nowrap; }
.desc { color: var(--muted); max-width: 420px; }
.muted { color: var(--muted); }
.qty { width: 72px; padding: 5px 7px; border: 1px solid var(--line); border-radius: 7px; text-align: right; font-size: 12.5px; }
.actions { white-space: nowrap; text-align: right; }
.btn-ghost { background: none; border: 1px solid var(--line); border-radius: 8px; padding: 5px 11px; font-size: 12px; cursor: pointer; margin-left: 6px; }
.btn-ghost:hover { border-color: var(--ember); color: var(--ember); }
.rm { color: var(--muted); }
</style>
