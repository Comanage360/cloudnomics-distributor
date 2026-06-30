<script setup lang="ts">
// Shimmer placeholder rows for loading states (tables/lists).
defineProps<{ rows?: number }>();
</script>

<template>
  <div class="sk" aria-busy="true" aria-label="Loading">
    <div v-for="i in (rows ?? 6)" :key="i" class="sk-row">
      <span class="sk-bar" :style="{ width: 45 + ((i * 23) % 45) + '%' }" />
    </div>
  </div>
</template>

<style scoped>
.sk { display: flex; flex-direction: column; gap: 14px; padding: 14px 2px; }
.sk-bar {
  height: 14px; border-radius: 7px; display: block;
  background: linear-gradient(90deg, var(--canvas) 25%, var(--line) 37%, var(--canvas) 63%);
  background-size: 400% 100%;
  animation: sk 1.3s ease-in-out infinite;
}
@keyframes sk { from { background-position: 100% 0; } to { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .sk-bar { animation: none; } }
</style>
