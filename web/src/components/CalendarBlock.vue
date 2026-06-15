<script setup lang="ts">
import { ref } from "vue";
import { api } from "../api";
import { useQuote } from "../stores/quote";

const q = useQuote();
const set = ref(false);
const links = ref<{ google: string; outlook: string; ics: string } | null>(null);

async function load() {
  if (links.value) return;
  try {
    links.value = await api.reminder(q.customer.name, q.customer.email);
  } catch {
    links.value = null;
  }
}
load();

function downloadIcs() {
  if (!links.value) return;
  const url = URL.createObjectURL(new Blob([links.value.ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url; a.download = "follow-up.ics"; a.click();
  URL.revokeObjectURL(url);
  set.value = true;
}
</script>

<template>
  <div class="cal">
    <div class="head">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      Follow-up reminder in 3 days
      <span v-if="set" class="ok">✓</span>
    </div>
    <div v-if="links" class="links">
      <a :href="links.google" target="_blank" rel="noreferrer" class="btn-outline sm" @click="set = true">Google Calendar</a>
      <a :href="links.outlook" target="_blank" rel="noreferrer" class="btn-outline sm" @click="set = true">Outlook</a>
      <button class="btn-outline sm" @click="downloadIcs">Download .ics</button>
    </div>
  </div>
</template>

<style scoped>
.cal { margin-top: 4px; }
.head { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--muted); margin-bottom: 8px; }
.ok { color: var(--success); }
.links { display: flex; gap: 8px; flex-wrap: wrap; }
.sm { font-size: 12.5px; padding: 7px 12px; }
</style>
