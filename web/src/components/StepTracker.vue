<script setup lang="ts">
import { computed } from "vue";
import type { Step } from "../types";

const props = defineProps<{ step: Step }>();

const STAGES = ["Requirements", "Firewall", "XDR", "Services", "Quote", "Deliver"];

// Map the store's fine-grained step to the 6 visible stages.
const stageOf: Record<Step, number> = {
  intake: 1,
  selectFw: 2,
  fwImpl: 3,
  xdr: 3,
  xdrImpl: 3,
  managed: 4,
  markup: 5,
  whitelabel: 5,
  send: 6,
  done: 6,
};
const current = computed(() => stageOf[props.step] ?? 1);
</script>

<template>
  <div class="track">
    <template v-for="(name, i) in STAGES" :key="name">
      <div
        class="item"
        :class="{ done: i + 1 < current, active: i + 1 === current }"
      >
        <span class="dot">{{ i + 1 < current ? "✓" : i + 1 }}</span>
        {{ name }}
      </div>
      <span v-if="i < STAGES.length - 1" class="arr">›</span>
    </template>
  </div>
</template>

<style scoped>
.track { background: var(--surface); border-bottom: 1px solid var(--line); padding: 10px 20px; display: flex; align-items: center; gap: 5px; flex-shrink: 0; overflow-x: auto; }
.item { display: flex; align-items: center; gap: 5px; white-space: nowrap; font-size: 11px; font-weight: 500; color: var(--muted); }
.item.done { color: var(--success); }
.item.active { color: var(--ember); font-weight: 700; }
.dot { width: 18px; height: 18px; border-radius: 50%; background: var(--line); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: var(--muted); flex-shrink: 0; }
.item.done .dot { background: var(--success); color: #fff; }
.item.active .dot { background: var(--ember); color: #fff; }
.arr { color: var(--line); font-size: 11px; }
</style>
