<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ page: number; total: number; perPage: number }>();
const emit = defineEmits<{ "update:page": [n: number] }>();

const pages = computed(() => Math.max(1, Math.ceil(props.total / props.perPage)));
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.perPage + 1));
const to = computed(() => Math.min(props.total, props.page * props.perPage));
function go(n: number) { if (n >= 1 && n <= pages.value) emit("update:page", n); }
</script>

<template>
  <div v-if="total > perPage" class="pager">
    <button :disabled="page <= 1" @click="go(page - 1)" aria-label="Previous page">←</button>
    <span class="cur">Page {{ page }} / {{ pages }}</span>
    <button :disabled="page >= pages" @click="go(page + 1)" aria-label="Next page">→</button>
    <span class="info">{{ from }}–{{ to }} of {{ total }}</span>
  </div>
</template>

<style scoped>
.pager { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 14px; font-size: 12.5px; color: var(--muted); flex-wrap: wrap; }
.cur { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--text); }
.info { color: var(--muted); }
.pager button { padding: 5px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 13px; cursor: pointer; }
.pager button:disabled { opacity: .45; cursor: default; }
.pager button:not(:disabled):hover { border-color: var(--ember); color: var(--ember); }
</style>
