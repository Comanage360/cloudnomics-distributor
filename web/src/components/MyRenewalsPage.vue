<script setup lang="ts">
defineEmits<{ newQuote: [] }>();
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <h1>My renewals</h1>
        <p>Upcoming subscription &amp; support renewals you've quoted.</p>
      </div>
    </div>

    <div class="center">
      <div class="state">
        <div class="ic">🔄</div>
        <p class="t">No renewals yet</p>
        <p class="s">When you build a renewal quote, it'll show up here with its expiry date so you can follow up in time.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px; overflow-y: auto; height: 100%; display: flex; flex-direction: column; }
.center { flex: 1; min-height: 55vh; display: flex; align-items: center; justify-content: center; }
.head { margin-bottom: 18px; }
h1 { font-family: var(--display); font-size: 20px; margin: 0; }
.head p { font-size: 13px; color: var(--muted); margin: 4px 0 0; }
.state { text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 12px; padding: 48px 24px; max-width: 520px; }
.ic { font-size: 34px; }
.t { font-size: 15px; font-weight: 700; color: var(--text); margin: 10px 0 4px; }
.s { font-size: 13px; }
</style>
