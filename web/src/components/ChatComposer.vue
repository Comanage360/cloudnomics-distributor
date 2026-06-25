<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useQuote } from "../stores/quote";
import { money } from "../theme";
import CalendarBlock from "./CalendarBlock.vue";

const q = useQuote();
const draft = ref("");
const competitorDraft = ref("");
const markupSlider = ref(q.rates.markupDefault);
watch(() => q.rates.markupDefault, (d) => { markupSlider.value = d; });

// effective partner discount (base + competitive-upgrade bonus), from dynamic rates
const effDiscount = computed(() => q.rates.discount + (q.sel.competitiveModel ? q.rates.competitiveBonus : 0));

// selectFw step: hardware (PA) vs virtual (VM + on-request CN) firewall picker.
const fwType = computed<"hardware" | "virtual">(() =>
  q.sel.firewall?.series === "PA-Series" ? "hardware" : "virtual"
);
const modelOptions = computed(() => {
  const series = fwType.value === "hardware" ? ["PA-Series"] : ["VM-Series", "CN-Series"];
  return (q.pricelist?.firewalls ?? []).filter((f) => series.includes(f.series));
});
function modelLabel(f: { sku: string; maxUsers: number; list: number | null }) {
  const price = f.list == null ? "on request" : money(Math.round(f.list * (1 - effDiscount.value)));
  return `${f.sku} · up to ${f.maxUsers} users · ${price}`;
}

function applyComp() {
  if (competitorDraft.value.trim()) q.applyCompetitive(competitorDraft.value);
}

// white-label step: require a name and a valid customer email before continuing.
const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.customer.email.trim()));
const canContinue = computed(() => q.customer.name.trim().length > 0 && emailOk.value);

function intake() {
  const v = draft.value;
  draft.value = "";
  q.submitIntake(v);
}
</script>

<template>
  <div class="composer">
    <div class="inner">
      <!-- intake -->
      <div v-if="q.step === 'intake'" class="line">
        <input v-model="draft" class="input" placeholder="Describe the deal — e.g. 200-user office, or the model you're replacing" @keyup.enter="intake" />
        <button class="btn-primary" @click="intake">Send</button>
      </div>

      <!-- competitive upgrade: optional model being migrated from (+10% discount) -->
      <div v-else-if="q.step === 'competitive'">
        <input v-model="competitorDraft" class="input" placeholder="Current firewall model — e.g. FortiGate 100F" @keyup.enter="applyComp" />
        <div class="line top">
          <button class="btn-primary grow" :disabled="!competitorDraft.trim()" @click="applyComp">Apply 10% upgrade discount</button>
          <button class="btn-outline grow" @click="q.skipCompetitive()">Not upgrading</button>
        </div>
      </div>

      <!-- choose firewall: hardware vs virtual + model -->
      <div v-else-if="q.step === 'selectFw'">
        <div class="seg">
          <button class="seg-btn" :class="{ on: fwType === 'hardware' }" @click="q.setType('hardware')">Hardware</button>
          <button class="seg-btn" :class="{ on: fwType === 'virtual' }" @click="q.setType('virtual')">Virtual</button>
        </div>
        <select
          class="input top"
          :value="q.sel.firewall?.sku"
          @change="q.setFirewall(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="f in modelOptions" :key="f.sku" :value="f.sku">{{ modelLabel(f) }}</option>
        </select>
        <button class="btn-primary full top" :disabled="!q.sel.firewall" @click="q.confirmFirewall()">
          Use {{ q.sel.firewall?.sku || "this model" }}
        </button>
      </div>

      <!-- yes / no steps -->
      <div v-else-if="q.step === 'fwImpl'" class="line">
        <button class="btn-primary grow" @click="q.answerFwImpl(true)">Add implementation</button>
        <button class="btn-outline grow" @click="q.answerFwImpl(false)">Skip</button>
      </div>
      <div v-else-if="q.step === 'xdr'" class="line">
        <button class="btn-primary grow" @click="q.answerXdr(true)">Add XDR for {{ q.sel.users }} users</button>
        <button class="btn-outline grow" @click="q.answerXdr(false)">No XDR</button>
      </div>
      <div v-else-if="q.step === 'xdrImpl'" class="line">
        <button class="btn-primary grow" @click="q.answerXdrImpl(true)">Add XDR implementation</button>
        <button class="btn-outline grow" @click="q.answerXdrImpl(false)">Skip</button>
      </div>
      <div v-else-if="q.step === 'managed'" class="line">
        <button class="btn-primary grow" @click="q.answerManaged(true)">Add managed service</button>
        <button class="btn-outline grow" @click="q.answerManaged(false)">Skip</button>
      </div>

      <!-- markup -->
      <div v-else-if="q.step === 'markup'">
        <div class="markup-head">
          <span>Your margin</span>
          <span class="markup-val">{{ markupSlider }}%</span>
        </div>
        <input type="range" :min="q.rates.markupMin" :max="q.rates.markupMax" v-model.number="markupSlider" class="range" />
        <div class="line top">
          <button class="btn-primary full" @click="q.applyMarkup(markupSlider)">Apply {{ markupSlider }}% markup</button>
        </div>
      </div>

      <!-- white-label -->
      <div v-else-if="q.step === 'whitelabel'">
        <div class="line top">
          <input v-model="q.customer.name" class="input" placeholder="Customer name" />
          <input
            v-model="q.customer.email"
            type="email"
            class="input"
            :class="{ invalid: q.customer.email && !emailOk }"
            placeholder="Customer email"
            @keyup.enter="canContinue && q.continueWhitelabel()"
          />
        </div>
        <p v-if="q.customer.email && !emailOk" class="hint-err">Enter a valid email address.</p>
        <button class="btn-primary full top" :disabled="!canContinue" @click="q.continueWhitelabel()">Continue</button>
      </div>

      <!-- send + calendar -->
      <div v-else-if="q.step === 'send' || q.step === 'done'">
        <button v-if="!q.sent" class="btn-primary full" @click="q.send()">
          Send branded quote to {{ q.customer.name || "customer" }}
        </button>
        <div v-else class="sent">✓ Quote sent to {{ q.customer.email }}</div>
        <CalendarBlock class="top" />
        <button v-if="q.step === 'done'" class="btn-ghost top" @click="q.reset()">↺ Start a new quote</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.composer { padding: 12px 22px 18px; border-top: 1px solid var(--line); background: var(--surface); }
.inner { max-width: 640px; margin: 0 auto; }
.line { display: flex; gap: 8px; }
.line.wrap { flex-wrap: wrap; align-items: center; }
.line.top, .top { margin-top: 12px; }
.grow { flex: 1; }
.full { width: 100%; }
.markup-head { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
.markup-val { font-family: var(--mono); color: var(--ember); font-weight: 700; }
.range { width: 100%; accent-color: var(--ember); }
.seg { display: flex; gap: 6px; }
.seg-btn { flex: 1; padding: 9px 0; font-size: 13px; font-weight: 600; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--muted); cursor: pointer; }
.seg-btn.on { border-color: var(--ember); color: var(--ember); background: var(--ember-soft); }
select.input { width: 100%; }
.hint-err { margin: 8px 2px 0; font-size: 12px; color: var(--ember); }
.input.invalid { border-color: var(--ember); }
.file { cursor: pointer; }
.logo { height: 36px; max-width: 120px; object-fit: contain; border: 1px solid var(--line); border-radius: 8px; padding: 4px; }
.sent { display: flex; align-items: center; gap: 8px; color: var(--success); font-size: 13.5px; font-weight: 600; }
</style>
