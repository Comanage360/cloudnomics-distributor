<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from "vue";
import { useSession } from "../stores/session";
import { useQuote } from "../stores/quote";
import { useBranding } from "../stores/branding";
import { useToast } from "../stores/toast";
import { api } from "../api";
import ChatThread from "../components/ChatThread.vue";
import ChatComposer from "../components/ChatComposer.vue";
import StepTracker from "../components/StepTracker.vue";
import SummaryPanel from "../components/SummaryPanel.vue";
import QuotePreview from "../components/QuotePreview.vue";
import LimitIncreaseComposer from "../components/LimitIncreaseComposer.vue";
import type { QuoteSummary } from "../types";

const session = useSession();
const q = useQuote();
const branding = useBranding();
const toast = useToast();

const previewMode = ref<"partner" | "customer" | null>(null);
const scroller = ref<HTMLElement | null>(null);
const recent = ref<QuoteSummary[]>([]);

async function refreshRecent() {
  try { recent.value = await api.listQuotes(); } catch { /* non-fatal */ }
}
async function openQuotePdf(n: number) {
  try { window.open(await api.quotePdf(n), "_blank"); }
  catch (e) { toast.show(`Could not open PDF: ${(e as Error).message}`); }
}

onMounted(refreshRecent);
// keep the conversation scrolled to the newest message
watch(() => [q.messages.length, q.thinking], async () => {
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
});
// refresh the recent list once a quote is persisted
watch(() => q.quoteNumber, (n) => { if (n) refreshRecent(); });
</script>

<template>
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

  <LimitIncreaseComposer
    v-if="q.limitModalOpen"
    :period="q.limitInfo?.period ?? null"
    :used="q.limitInfo?.used ?? 0"
    :limit="q.limitInfo?.limit ?? 0"
    @close="q.closeLimitRequest()"
    @sent="q.markLimitRequested()"
  />

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
</template>

<style scoped>
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.chat { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.scroll { flex: 1; overflow-y: auto; padding: 22px 22px 8px; }
@media (max-width: 1024px) { .scroll { padding: 16px 14px 8px; } }
@media (max-width: 760px) { .main { flex: none; } .chat { min-height: 60vh; } .scroll { overflow-y: visible; } }
</style>
