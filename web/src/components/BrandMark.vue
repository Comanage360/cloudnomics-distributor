<script setup lang="ts">
defineProps<{ size?: number }>();
</script>

<template>
  <div class="mark" :style="{ width: (size || 28) + 'px', height: (size || 28) + 'px', borderRadius: (size || 28) * 0.28 + 'px' }">
    <svg :width="(size || 28) * 0.56" :height="(size || 28) * 0.56" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  </div>
</template>

<style scoped>
.mark {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  background: linear-gradient(135deg, var(--ember), #ff8a6b);
}
</style>
