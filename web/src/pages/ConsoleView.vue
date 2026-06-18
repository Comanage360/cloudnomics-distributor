<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from "vue";
import { useSession } from "../stores/session";
import { useQuote } from "../stores/quote";
import { useBranding } from "../stores/branding";
import { api } from "../api";
import ChatThread from "../components/ChatThread.vue";
import ChatComposer from "../components/ChatComposer.vue";
import StepTracker from "../components/StepTracker.vue";
import SummaryPanel from "../components/SummaryPanel.vue";
import SideNav from "../components/SideNav.vue";
import Icon from "../components/Icon.vue";
import MyQuotesPage from "../components/MyQuotesPage.vue";
import MyRenewalsPage from "../components/MyRenewalsPage.vue";
import ProductsPage from "../components/ProductsPage.vue";
import BrandingPage from "../components/BrandingPage.vue";
import QuotePreview from "../components/QuotePreview.vue";
import type { PortalView, QuoteSummary } from "../types";

const session = useSession();
const q = useQuote();
const branding = useBranding();
const view = ref<PortalView>("assistant");
const previewMode = ref<"partner" | "customer" | null>(null);
const navOpen = ref(false); // mobile sidebar drawer
const scroller = ref<HTMLElement | null>(null);
const recent = ref<QuoteSummary[]>([]);

// toast
const toastMsg = ref("");
let toastTimer: number | undefined;
function showToast(msg: string) {
  toastMsg.value = msg;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastMsg.value = ""), 3500);
}

async function refreshRecent() {
  try { recent.value = await api.listQuotes(); } catch { /* non-fatal */ }
}

onMounted(() => {
  q.init();
  refreshRecent();
  branding.load();
});

function navigate(v: PortalView) {
  view.value = v;
  navOpen.value = false; // close the mobile drawer
  if (v === "quotes") refreshRecent();
}
function newQuote() {
  navOpen.value = false;
  q.reset();
  view.value = "assistant";
}
async function openQuotePdf(n: number) {
  try {
    const url = await api.quotePdf(n);
    window.open(url, "_blank");
  } catch (e) {
    showToast(`Could not open PDF: ${(e as Error).message}`);
  }
}

// keep the conversation scrolled to the newest message
watch(
  () => [q.messages.length, q.thinking],
  async () => {
    await nextTick();
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
  }
);
// refresh recent + summary once a quote is persisted
watch(() => q.quoteNumber, (n) => { if (n) refreshRecent(); });
</script>

<template>
  <div class="app no-print">
    <header class="topbar">
      <div class="brand">
        <button class="hamburger" aria-label="Menu" @click="navOpen = !navOpen">☰</button>
        <img src="/cloudnomics-mark.svg" alt="Cloudnomics" class="logo" />
        <span class="sep">|</span>
        <span class="sub">Distributor Console</span>
      </div>
      <div class="account">
        <span class="badge"><Icon name="building" :size="12" /> {{ session.user?.company || branding.company || 'Reseller' }}</span>
        <span class="email">{{ session.user?.email }}</span>
        <button class="btn-ghost" @click="session.logout()">Sign out</button>
      </div>
    </header>

    <div class="body">
      <div v-if="navOpen" class="backdrop" @click="navOpen = false" />
      <SideNav :view="view" :open="navOpen" @navigate="navigate" @new-quote="newQuote" @toast="showToast" />

      <!-- Quote assistant -->
      <template v-if="view === 'assistant'">
        <main class="main">
          <StepTracker :step="q.step" />
          <section class="chat">
            <div ref="scroller" class="scroll">
              <ChatThread :messages="q.messages" :thinking="q.thinking" />
            </div>
            <ChatComposer />
          </section>
        </main>
        <SummaryPanel
          :totals="q.totals"
          :addons="{ impl: q.sel.fwImpl, xdr: q.sel.xdr, managed: q.sel.managed }"
          :recent="recent"
          :ready="q.step === 'send' || q.step === 'done'"
          @preview="previewMode = $event"
          @open="openQuotePdf"
        />
      </template>

      <!-- My quotes -->
      <main v-else-if="view === 'quotes'" class="main full">
        <MyQuotesPage @new-quote="newQuote" @toast="showToast" />
      </main>

      <!-- My renewals -->
      <main v-else-if="view === 'renewals'" class="main full">
        <MyRenewalsPage @new-quote="newQuote" />
      </main>

      <!-- Products -->
      <main v-else-if="view === 'products'" class="main full">
        <ProductsPage />
      </main>

      <!-- My branding -->
      <main v-else class="main full">
        <BrandingPage @toast="showToast" />
      </main>
    </div>

    <QuotePreview
      v-if="previewMode"
      :mode="previewMode"
      :totals="q.totals"
      :reseller-company="session.user?.company || branding.company || 'Reseller'"
      :reseller-logo="branding.logo"
      :customer-name="q.customer.name || 'Customer'"
      :customer-email="q.customer.email"
      :quote-number="q.quoteNumber"
      @close="previewMode = null"
    />

    <div class="toast" :class="{ show: toastMsg }">{{ toastMsg }}</div>
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; background: var(--canvas); }
.topbar { display: flex; align-items: center; justify-content: space-between; height: 66px; padding: 0 20px; background: var(--surface); border-bottom: 1px solid var(--line); flex-shrink: 0; }
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; flex-shrink: 0; }
.logo { height: 50px; width: auto; display: block; flex-shrink: 0; }
.account { flex-shrink: 1; min-width: 0; }
.account .email { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.word { font-family: var(--display); font-weight: 700; font-size: 16px; }
.sep { color: var(--line); }
.sub { font-size: 12px; color: var(--muted); }
.account { display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--muted); }
.badge { background: var(--canvas); border: 1px solid var(--line); border-radius: 20px; padding: 3px 11px; font-size: 11px; display: inline-flex; align-items: center; gap: 5px; color: var(--muted); }
.email { font-size: 12.5px; }
.hamburger { display: none; background: none; border: none; font-size: 20px; line-height: 1; cursor: pointer; color: var(--ink); padding: 2px 6px 2px 0; }
.backdrop { display: none; }

.body { display: flex; flex: 1; min-height: 0; position: relative; }
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.main.full { overflow: hidden; }
.chat { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.scroll { flex: 1; overflow-y: auto; padding: 22px 22px 8px; }

.toast { position: fixed; bottom: 20px; right: 20px; background: var(--ink); color: #fff; padding: 11px 16px; border-radius: 10px; font-size: 13px; font-weight: 500; box-shadow: 0 8px 24px rgba(0,0,0,.2); transform: translateY(16px); opacity: 0; transition: all .3s ease; z-index: 1000; max-width: 320px; pointer-events: none; }
.toast.show { transform: translateY(0); opacity: 1; }

/* Tablet — tighten the columns so all three still fit */
@media (max-width: 1024px) {
  .scroll { padding: 16px 14px 8px; }
}

/* Phone — sidebar becomes a drawer, panels stack, page scrolls */
@media (max-width: 760px) {
  .hamburger { display: block; }
  .topbar { height: 60px; padding: 0 14px; }
  .logo { height: 44px; }
  .sub, .email { display: none; }

  .body { flex-direction: column; overflow-y: auto; }
  .backdrop { display: block; position: fixed; inset: 0; top: 0; background: rgba(8,12,22,.45); z-index: 40; }

  /* let the page scroll instead of nesting scroll areas */
  .main { flex: none; }
  .chat { min-height: 60vh; }
  .scroll { overflow-y: visible; }
}
</style>
