<script setup lang="ts">
import type { PortalView } from "../types";

defineProps<{ view: PortalView }>();
const emit = defineEmits<{
  navigate: [view: PortalView];
  newQuote: [];
  toast: [msg: string];
}>();
</script>

<template>
  <nav class="sidebar">
    <button class="new-quote" @click="emit('newQuote')">+ New quote</button>

    <div class="section">
      <div class="label">Workspace</div>
      <button class="item" :class="{ active: view === 'assistant' }" @click="emit('navigate', 'assistant')">
        <span class="icon">💬</span> Quote assistant
      </button>
      <button class="item" :class="{ active: view === 'quotes' }" @click="emit('navigate', 'quotes')">
        <span class="icon">📄</span> My quotes
      </button>
      <button class="item" :class="{ active: view === 'products' }" @click="emit('navigate', 'products')">
        <span class="icon">📦</span> Products
      </button>
    </div>

    <div class="section">
      <div class="label">Account</div>
      <button class="item" @click="emit('toast', '🖼️ Logo upload happens in the white-label step of a quote')">
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
</style>
