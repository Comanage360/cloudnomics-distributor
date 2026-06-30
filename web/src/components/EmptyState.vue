<script setup lang="ts">
import Icon from "./Icon.vue";
// Reusable empty state: icon badge + title + text + optional action slot.
defineProps<{ icon?: string; title: string; text?: string }>();
</script>

<template>
  <div class="empty">
    <div class="ic"><Icon :name="icon || 'quotes'" :size="26" /></div>
    <p class="t">{{ title }}</p>
    <p v-if="text" class="s">{{ text }}</p>
    <div class="cta"><slot /></div>
  </div>
</template>

<style scoped>
.empty { text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 14px; padding: 44px 24px; max-width: 520px; margin: 28px auto; }
.ic { color: var(--ember); display: inline-flex; padding: 15px; background: var(--ember-soft); border-radius: 50%; }
.t { font-size: 16px; font-weight: 700; color: var(--text); margin: 14px 0 4px; }
.s { font-size: 13px; line-height: 1.5; }
.cta { margin-top: 16px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.cta:empty { display: none; }
</style>
