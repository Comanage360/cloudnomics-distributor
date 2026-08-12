<script setup lang="ts">
import { useQuote } from "../stores/quote";
const q = useQuote();
</script>

<template>
  <div v-if="q.aiDegraded" class="aibar" role="alert">
    <span class="ai-msg">
      ⚠ The AI advisor is temporarily unavailable — you're on a basic guided flow.
      Competitive discounts, the Cortex XDR option and the markup slider may not appear.
      Please contact your administrator.
    </span>
  </div>
</template>

<style scoped>
.aibar { background: var(--ember-soft); border: 1px solid var(--ember-line, var(--line)); border-radius: 10px; padding: 10px 12px; }
.ai-msg { display: block; font-size: 12.5px; font-weight: 600; line-height: 1.5; color: var(--ember); }
</style>
