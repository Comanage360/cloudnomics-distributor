<script setup lang="ts">
import { useQuote } from "../stores/quote";
import type { PortalView } from "../types";

const q = useQuote();
defineProps<{ view: PortalView; open?: boolean }>();
const emit = defineEmits<{
  navigate: [view: PortalView];
  newQuote: [];
  toast: [msg: string];
}>();
</script>

<template>
  <nav class="sidebar" :class="{ open }">
    <button class="new-quote" @click="emit('newQuote')">+ New quote</button>

    <div class="section">
      <div class="label">Workspace</div>
      <button class="item" :class="{ active: view === 'assistant' }" @click="emit('navigate', 'assistant')">
        <span class="icon">💬</span> Quote assistant
      </button>
      <button class="item" :class="{ active: view === 'quotes' }" @click="emit('navigate', 'quotes')">
        <span class="icon">📄</span> My quotes
      </button>
      <button class="item" :class="{ active: view === 'renewals' }" @click="emit('navigate', 'renewals')">
        <span class="icon">🔄</span> My renewals
      </button>
      <button class="item" :class="{ active: view === 'products' }" @click="emit('navigate', 'products')">
        <span class="icon">📦</span> Products
      </button>
    </div>

    <div class="section">
      <div class="label">Promotions</div>
      <div class="promo" :class="{ active: q.sel.competitiveModel }">
        <div class="promo-title">🏷️ Competitive Upgrade</div>
        <div class="promo-sub">
          {{ q.sel.competitiveModel
            ? `Applied — ${q.sel.competitiveModel} · +10% off (40% total)`
            : "Migrating from another vendor? +10% partner discount" }}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="label">Account</div>
      <button class="item" :class="{ active: view === 'branding' }" @click="emit('navigate', 'branding')">
        <span class="icon">🖼️</span> My branding
      </button>
      <button class="item" @click="emit('toast', '🔗 Calendar reminders are offered after a quote is sent')">
        <span class="icon">🔗</span> Calendar setup
      </button>
      <button class="item" @click="emit('toast', '⚙️ Settings coming soon')">
        <span class="icon">⚙️</span> Settings
      </button>
    </div>
  </nav>
</template>

<style scoped>
.sidebar { width: 220px; flex-shrink: 0; background: var(--surface); border-right: 1px solid var(--line); display: flex; flex-direction: column; padding: 16px 0; overflow-y: auto; }
.new-quote { margin: 0 12px 16px; padding: 9px; background: var(--ink); color: #fff; border: none; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; }
.new-quote:hover { opacity: .9; }
.section { padding: 0 12px; margin-bottom: 18px; }
.label { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; padding: 0 6px; margin-bottom: 5px; }
.item { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: none; border-radius: 8px; background: none; cursor: pointer; color: var(--muted); font-size: 13px; font-weight: 500; text-align: left; margin-bottom: 1px; }
.item:hover { background: var(--canvas); color: var(--text); }
.item.active { background: var(--ember-soft); color: var(--ember); font-weight: 600; }
.icon { font-size: 15px; width: 18px; text-align: center; }
.promo { padding: 9px 10px; border: 1px dashed var(--line); border-radius: 8px; background: var(--canvas); }
.promo.active { border-style: solid; border-color: var(--success); background: var(--success-soft); }
.promo-title { font-size: 12px; font-weight: 700; }
.promo-sub { font-size: 10.5px; color: var(--muted); margin-top: 2px; line-height: 1.35; }
.promo.active .promo-sub { color: var(--success); }

/* Mobile: off-canvas drawer */
@media (max-width: 760px) {
  .sidebar {
    position: fixed; top: 0; bottom: 0; left: 0; z-index: 50;
    transform: translateX(-100%); transition: transform .25s ease;
    box-shadow: 2px 0 16px rgba(8,12,22,.18);
  }
  .sidebar.open { transform: translateX(0); }
}
</style>
