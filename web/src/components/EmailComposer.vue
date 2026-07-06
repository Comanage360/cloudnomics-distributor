<script setup lang="ts">
import { ref, computed } from "vue";
import { api } from "../api";
import { useSession } from "../stores/session";
import { useBranding } from "../stores/branding";
import { useToast } from "../stores/toast";

const props = defineProps<{ quoteNumber: number; to: string; customerName: string }>();
const emit = defineEmits<{ close: []; sent: [to: string] }>();

const session = useSession();
const branding = useBranding();
const toast = useToast();
const company = session.user?.company || branding.company || "Cloudnomics";

// Prefilled defaults — the user can edit any of them before sending.
const toAddr = ref(props.to || "");
const cc = ref("");
const subject = ref(`Your quote #${props.quoteNumber} from ${company}`);
const body = ref(
  `Hi ${props.customerName || "there"},\n\nPlease find your quote (#${props.quoteNumber}) attached.\n\n` +
  `Feel free to reach out with any questions.\n\nThank you,\n${company}`
);
const sending = ref(false);

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const canSend = computed(() => emailOk(toAddr.value) && !!subject.value.trim() && !sending.value);

async function send() {
  if (!canSend.value) return;
  sending.value = true;
  try {
    const r = await api.sendQuote(props.quoteNumber, {
      to: toAddr.value.trim(), cc: cc.value.trim(), subject: subject.value, body: body.value,
    });
    toast.show(r.dryRun ? "Email queued (dev dry-run — configure SMTP/SendGrid to deliver)" : "✓ Email sent");
    emit("sent", toAddr.value.trim());
  } catch (e) {
    toast.show(`Could not send: ${(e as Error).message}`);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @click.self="emit('close')">
      <div class="dialog">
        <div class="dhead">
          <h3>Email quote #{{ quoteNumber }}</h3>
          <button class="x" @click="emit('close')" aria-label="Close">✕</button>
        </div>
        <div class="dbody">
          <label class="fld"><span>To</span>
            <input v-model="toAddr" type="email" :class="{ invalid: toAddr && !emailOk(toAddr) }" placeholder="customer@example.com" />
          </label>
          <label class="fld"><span>CC <em>(comma-separated, optional — up to 5)</em></span>
            <input v-model="cc" type="text" placeholder="manager@yourco.com, ops@yourco.com" />
          </label>
          <label class="fld"><span>Subject</span>
            <input v-model="subject" type="text" />
          </label>
          <label class="fld"><span>Message</span>
            <textarea v-model="body" rows="7"></textarea>
          </label>
          <p class="note">📎 The branded quote PDF is attached automatically.</p>
        </div>
        <div class="dfoot">
          <button class="btn-outline" @click="emit('close')">Cancel</button>
          <button class="btn-primary" :disabled="!canSend" @click="send">{{ sending ? "Sending…" : "Send email" }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(8,12,22,.55); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 80; }
.dialog { width: 100%; max-width: 560px; background: var(--surface); border-radius: 14px; box-shadow: 0 20px 60px rgba(8,12,22,.35); display: flex; flex-direction: column; max-height: 90vh; }
.dhead { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.dhead h3 { margin: 0; font-family: var(--display); font-size: 16px; }
.x { background: none; border: none; font-size: 15px; cursor: pointer; color: var(--muted); }
.dbody { padding: 18px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.fld { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--text); }
.fld em { font-weight: 400; color: var(--muted); font-style: normal; }
.fld input, .fld textarea { padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; font-size: 13.5px; font-family: var(--body); color: var(--text); }
.fld textarea { resize: vertical; line-height: 1.5; }
.fld input.invalid { border-color: var(--ember); }
.note { font-size: 12px; color: var(--muted); margin: 0; }
.dfoot { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--line); }
.dfoot .btn-outline, .dfoot .btn-primary { width: auto; padding: 9px 18px; }
</style>
