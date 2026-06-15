<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from "vue";
import { useSession } from "../stores/session";
import { useQuote } from "../stores/quote";
import BrandMark from "../components/BrandMark.vue";
import ChatThread from "../components/ChatThread.vue";
import ChatComposer from "../components/ChatComposer.vue";
import QuotePanel from "../components/QuotePanel.vue";
import QuotePreview from "../components/QuotePreview.vue";

const session = useSession();
const q = useQuote();
const preview = ref(false);
const scroller = ref<HTMLElement | null>(null);

onMounted(() => q.init());

// keep the conversation scrolled to the newest message
watch(
  () => [q.messages.length, q.thinking],
  async () => {
    await nextTick();
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
  }
);
</script>

<template>
  <div class="app no-print">
    <header class="topbar">
      <div class="brand">
        <BrandMark :size="26" />
        <span class="word">Cloudnomics</span>
        <span class="pill">Distributor</span>
      </div>
      <div class="account">
        <span class="email">{{ session.user?.email }}</span>
        <button class="btn-ghost" @click="session.logout()">Sign out</button>
      </div>
    </header>

    <div class="body">
      <section class="chat">
        <div ref="scroller" class="scroll">
          <ChatThread :messages="q.messages" :thinking="q.thinking" />
        </div>
        <ChatComposer />
      </section>

      <aside class="side">
        <QuotePanel :totals="q.totals" :step="q.step" @preview="preview = true" />
      </aside>
    </div>

    <QuotePreview
      v-if="preview"
      :totals="q.totals"
      :customer-name="q.customer.name || 'Customer'"
      :company="session.user?.company || 'Reseller'"
      :logo="q.logo"
      :quote-number="q.quoteNumber"
      @close="preview = false"
    />
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; background: var(--canvas); }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: var(--surface); border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 10px; }
.word { font-family: var(--display); font-weight: 700; font-size: 16px; }
.pill { font-size: 11px; color: var(--muted); border: 1px solid var(--line); border-radius: 20px; padding: 2px 9px; letter-spacing: .1em; text-transform: uppercase; }
.account { display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--muted); }
.body { display: flex; flex: 1; min-height: 0; }
.chat { flex: 1 1 58%; display: flex; flex-direction: column; min-width: 0; }
.scroll { flex: 1; overflow-y: auto; padding: 22px 22px 8px; }
.side { flex: 0 0 380px; border-left: 1px solid var(--line); background: var(--surface); min-width: 0; }

@media (max-width: 760px) {
  .body { flex-direction: column; }
  .side { flex: 0 0 auto; border-left: none; border-top: 1px solid var(--line); max-height: 45vh; }
}
</style>
