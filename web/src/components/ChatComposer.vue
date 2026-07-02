<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useQuote } from "../stores/quote";
import { money } from "../theme";
import CalendarBlock from "./CalendarBlock.vue";
import EmailComposer from "./EmailComposer.vue";
import LimitIncreaseComposer from "./LimitIncreaseComposer.vue";

const q = useQuote();
const composerOpen = ref(false);
function onEmailSent(to: string) { composerOpen.value = false; q.noteSent(to); }
const limitOpen = ref(false);
function onLimitSent() { limitOpen.value = false; }
const draft = ref("");
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

// white-label step: require a name and a valid customer email before continuing.
const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.customer.email.trim()));
const canContinue = computed(() => q.customer.name.trim().length > 0 && emailOk.value);

// Step-specific quick replies — each sends natural-language text the AI interprets.
const quickOpts = computed<{ label: string; send: string }[]>(() => {
  switch (q.step) {
    case "competitive":
      return [{ label: "Not upgrading", send: "This is a new deal, not a competitive upgrade." }];
    case "fwImpl":
      return [
        { label: "Add implementation", send: "Yes, add professional implementation." },
        { label: "Skip", send: "No implementation, thanks." },
      ];
    case "xdr":
      return [
        { label: `Add XDR for ${q.sel.users} users`, send: `Yes, add Cortex XDR Pro for ${q.sel.users} users.` },
        { label: "No XDR", send: "No Cortex XDR for now." },
      ];
    case "xdrImpl":
      return [
        { label: "Add XDR implementation", send: "Yes, add XDR implementation." },
        { label: "Skip", send: "No XDR implementation." },
      ];
    case "managed":
      return [
        { label: "Add managed service", send: "Yes, add the Cloudnomics managed service." },
        { label: "Skip", send: "No managed service." },
      ];
    default:
      return [];
  }
});

const placeholder = computed(() =>
  q.step === "intake"
    ? "Describe the deal — e.g. 200-user office, or the model you're replacing"
    : q.step === "competitive"
    ? "Enter the firewall you're replacing — e.g. FortiGate 100F"
    : "Type a reply…"
);

function sendDraft() {
  const v = draft.value;
  if (!v.trim()) return;
  draft.value = "";
  q.sendMessage(v);
}
function confirmFw() {
  if (q.sel.firewall) q.sendMessage(`Use the ${q.sel.firewall.sku}.`);
}
function applyMarkup() {
  q.sendMessage(markupSlider.value > 0 ? `Apply a ${markupSlider.value}% markup.` : "Sell at cost — no markup.");
}
function submitCustomer() {
  if (canContinue.value) q.sendMessage(`The customer is ${q.customer.name} (${q.customer.email}).`);
}
</script>

<template>
  <div class="composer">
    <div class="inner">
      <!-- AI token limit reached: offer a request-increase flow (blocks new turns) -->
      <div v-if="q.limited" class="limitbar">
        <span class="limit-msg">⚠ You've hit your {{ q.limitInfo?.period || '' }} AI usage limit.</span>
        <button class="btn-primary" @click="limitOpen = true">📈 Request a limit increase</button>
      </div>
      <LimitIncreaseComposer
        v-if="limitOpen"
        :period="q.limitInfo?.period ?? null"
        :used="q.limitInfo?.used ?? 0"
        :limit="q.limitInfo?.limit ?? 0"
        @close="limitOpen = false"
        @sent="onLimitSent"
      />

      <!-- one quote per session: after creation, send this quote then start a new session -->
      <div v-if="q.step === 'send' || q.step === 'done'">
        <div v-if="q.quoteNumber" class="lock-note">
          This session created <strong>quote #{{ q.quoteNumber }}</strong>. It's one quote per session —
          start a new session to build another.
        </div>
        <div v-if="!q.sent && q.quoteNumber" class="line">
          <button class="btn-primary grow" @click="q.send()">Send default email</button>
          <button class="btn-outline grow" @click="composerOpen = true">✉ Customize email</button>
        </div>
        <div v-else-if="q.sent" class="sent">✓ Sent to {{ q.customer.email }}</div>
        <button class="btn-outline full top" @click="q.reset()">↺ Start a new session</button>
        <CalendarBlock class="top" />

        <EmailComposer
          v-if="composerOpen && q.quoteNumber"
          :quote-number="q.quoteNumber"
          :to="q.customer.email"
          :customer-name="q.customer.name"
          @close="composerOpen = false"
          @sent="onEmailSent"
        />
      </div>

      <template v-else>
        <!-- firewall picker -->
        <div v-if="q.step === 'selectFw'" class="quick">
          <div class="seg">
            <button class="seg-btn" :class="{ on: fwType === 'hardware' }" @click="q.setType('hardware')">Hardware</button>
            <button class="seg-btn" :class="{ on: fwType === 'virtual' }" @click="q.setType('virtual')">Virtual</button>
          </div>
          <select class="input top" :value="q.sel.firewall?.sku" @change="q.setFirewall(($event.target as HTMLSelectElement).value)">
            <option v-for="f in modelOptions" :key="f.sku" :value="f.sku">{{ modelLabel(f) }}</option>
          </select>
          <button class="btn-primary full top" :disabled="!q.sel.firewall || q.thinking" @click="confirmFw">
            Use {{ q.sel.firewall?.sku || "this model" }}
          </button>
        </div>

        <!-- markup slider -->
        <div v-else-if="q.step === 'markup'" class="quick">
          <div class="markup-head"><span>Your margin</span><span class="markup-val">{{ markupSlider }}%</span></div>
          <input type="range" :min="q.rates.markupMin" :max="q.rates.markupMax" v-model.number="markupSlider" class="range" />
          <button class="btn-primary full top" :disabled="q.thinking" @click="applyMarkup">Apply {{ markupSlider }}% markup</button>
        </div>

        <!-- customer details -->
        <div v-else-if="q.step === 'whitelabel'" class="quick">
          <div class="line">
            <input v-model="q.customer.name" class="input" placeholder="Customer name" />
            <input v-model="q.customer.email" type="email" class="input" :class="{ invalid: q.customer.email && !emailOk }" placeholder="Customer email" @keyup.enter="submitCustomer" />
          </div>
          <p v-if="q.customer.email && !emailOk" class="hint-err">Enter a valid email address.</p>
          <button class="btn-primary full top" :disabled="!canContinue || q.thinking" @click="submitCustomer">Continue</button>
        </div>

        <!-- yes/no quick replies -->
        <div v-else-if="quickOpts.length" class="quick line">
          <button v-for="opt in quickOpts" :key="opt.label" class="btn-outline grow" :disabled="q.thinking" @click="q.sendMessage(opt.send)">
            {{ opt.label }}
          </button>
        </div>

        <!-- always-available free text (AI-interpreted) -->
        <div class="line top">
          <input v-model="draft" class="input" :placeholder="placeholder" :disabled="q.thinking" @keyup.enter="sendDraft" />
          <button class="btn-primary" :disabled="q.thinking || !draft.trim()" @click="sendDraft">Send</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.composer { padding: 12px 22px 18px; border-top: 1px solid var(--line); background: var(--surface); }
.inner { max-width: 640px; margin: 0 auto; }
.line { display: flex; gap: 8px; }
.line.top, .top { margin-top: 12px; }
.quick + .line.top { margin-top: 12px; }
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
.sent { display: flex; align-items: center; gap: 8px; color: var(--success); font-size: 13.5px; font-weight: 600; }
.lock-note { font-size: 12.5px; color: var(--muted); background: var(--canvas); border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; margin-bottom: 12px; line-height: 1.4; }
.lock-note strong { color: var(--text); }
.limitbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--ember-soft); border: 1px solid var(--ember-line, var(--line)); border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; }
.limitbar .limit-msg { flex: 1; min-width: 160px; font-size: 12.5px; font-weight: 600; color: var(--ember); text-transform: capitalize; }
.limitbar .btn-primary { width: auto; padding: 8px 14px; }
</style>
