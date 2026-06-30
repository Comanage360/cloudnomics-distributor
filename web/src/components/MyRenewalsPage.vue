<script setup lang="ts">
import EmptyState from "./EmptyState.vue";
const emit = defineEmits<{ newQuote: [] }>();
</script>

<template>
  <div class="page">
    <div class="head">
      <h1>My renewals</h1>
      <p>Upcoming subscription &amp; support renewals you've quoted.</p>
    </div>

    <div class="center">
      <EmptyState icon="renewals" title="No renewals yet"
        text="When you build a renewal quote, it'll show up here with its expiry date so you can follow up in time.">
        <button class="btn-primary" @click="emit('newQuote')">+ Build a quote</button>
      </EmptyState>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px; overflow-y: auto; height: 100%; display: flex; flex-direction: column; }
.center { flex: 1; min-height: 50vh; display: flex; align-items: center; justify-content: center; }
.head { margin-bottom: 18px; }
h1 { font-family: var(--display); font-size: 20px; margin: 0; }
.head p { font-size: 13px; color: var(--muted); margin: 4px 0 0; }
.btn-primary { width: auto; padding: 9px 16px; }
</style>
