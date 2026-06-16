<script setup lang="ts">
// Cloudnomics wordmark logo — cloud + "cloud"(blue) "nomics"(orange) + tagline.
defineProps<{ height?: number }>();
</script>

<template>
  <div class="cn" :style="{ '--h': (height || 46) + 'px' }">
    <svg class="cloud" viewBox="0 0 60 42" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Cloudnomics">
      <defs>
        <linearGradient id="cnCloud" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#2E8CFF" />
          <stop offset="1" stop-color="#1E6BE6" />
        </linearGradient>
      </defs>
      <path
        d="M17 35 C9 35 4 29 6 22 C7.5 16 13 14 17.5 15.2 C20 8.5 29 6.5 34 11 C37.5 8 44 9.5 45 15 C51 15 54 21 50.5 27 C53 29.5 51.5 35 45 35 Z"
        stroke="url(#cnCloud)" stroke-width="3" stroke-linejoin="round"
      />
      <path d="M14 23 C18 19 23 19 27 23" stroke="url(#cnCloud)" stroke-width="2.6" stroke-linecap="round" />
    </svg>
    <div class="text">
      <div class="word">
        <span class="blue">cloud</span><span class="dot"></span><span class="orange">nomics</span>
      </div>
      <div class="tag">Leading Cloud Security Distributor</div>
    </div>
  </div>
</template>

<style scoped>
.cn { display: flex; align-items: center; gap: 10px; }
.cloud { height: var(--h); width: calc(var(--h) * 1.35); flex-shrink: 0; }
.word { font-family: var(--display, system-ui), sans-serif; font-weight: 800; font-size: calc(var(--h) * 0.62); line-height: 1; letter-spacing: -0.02em; }
.blue { color: #1E6BE6; }
.orange { color: #F7941E; }
.dot { display: inline-block; width: calc(var(--h) * 0.11); height: calc(var(--h) * 0.11); background: #F7941E; border-radius: 2px; margin: 0 calc(var(--h) * 0.03); vertical-align: baseline; }
.tag { font-weight: 700; font-size: calc(var(--h) * 0.20); color: #0A1628; margin-top: calc(var(--h) * 0.07); letter-spacing: 0; }
</style>
