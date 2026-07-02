<script setup lang="ts">
import { useQuote } from "../stores/quote";
const q = useQuote();
</script>

<template>
  <div v-if="q.limited" class="limitbar">
    <span class="limit-msg">⚠ You've reached your monthly usage limit.</span>
    <button v-if="!q.limitRequested" class="btn-primary req" @click="q.openLimitRequest()">
      📈 Ask admin to raise it
    </button>
    <span v-else class="requested">✓ Request sent — waiting for admin approval</span>
  </div>
</template>

<style scoped>
.limitbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--ember-soft); border: 1px solid var(--ember-line, var(--line)); border-radius: 10px; padding: 10px 12px; }
.limit-msg { flex: 1; min-width: 140px; font-size: 12.5px; font-weight: 600; color: var(--ember); }
.req { width: auto; padding: 8px 14px; font-size: 12.5px; }
.requested { font-size: 12px; font-weight: 700; color: var(--success); }
</style>
