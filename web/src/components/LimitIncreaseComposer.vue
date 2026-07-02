<script setup lang="ts">
import { ref } from "vue";
import { api } from "../api";
import { useToast } from "../stores/toast";

const props = defineProps<{ period: "monthly" | "yearly" | null; used: number; limit: number }>();
const emit = defineEmits<{ close: []; sent: [] }>();

const toast = useToast();
const reason = ref("");
const sending = ref(false);

const usd = (n: number) => "$" + (n || 0).toFixed(2);

async function send() {
  if (sending.value) return;
  sending.value = true;
  try {
    await api.requestLimitIncrease(reason.value.trim());
    toast.show("✓ Request sent to your administrator");
    emit("sent");
  } catch (e) {
    toast.show(`Could not send request: ${(e as Error).message}`);
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
          <h3>Request a limit increase</h3>
          <button class="x" @click="emit('close')" aria-label="Close">✕</button>
        </div>
        <div class="dbody">
          <p v-if="limit" class="ctx">
            You've used <strong>{{ usd(used) }}</strong> of your
            <strong>{{ usd(limit) }}</strong> {{ period }} limit.
          </p>
          <p class="note">Your administrator will be notified and can raise your AI token limit.</p>
          <label class="fld"><span>Add a note <em>(optional)</em></span>
            <textarea v-model="reason" rows="4" placeholder="e.g. Working through a batch of quotes this week — could use a higher cap."></textarea>
          </label>
        </div>
        <div class="dfoot">
          <button class="btn-outline" @click="emit('close')">Cancel</button>
          <button class="btn-primary" :disabled="sending" @click="send">{{ sending ? "Sending…" : "Send request" }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(8,12,22,.55); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 80; }
.dialog { width: 100%; max-width: 480px; background: var(--surface); border-radius: 14px; box-shadow: 0 20px 60px rgba(8,12,22,.35); display: flex; flex-direction: column; max-height: 90vh; }
.dhead { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.dhead h3 { margin: 0; font-family: var(--display); font-size: 16px; }
.x { background: none; border: none; font-size: 15px; cursor: pointer; color: var(--muted); }
.dbody { padding: 18px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.ctx { margin: 0; font-size: 13px; color: var(--text); }
.ctx strong { font-family: var(--mono); }
.note { font-size: 12.5px; color: var(--muted); margin: 0; }
.fld { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--text); }
.fld em { font-weight: 400; color: var(--muted); font-style: normal; }
.fld textarea { padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; font-size: 13.5px; font-family: var(--body); color: var(--text); resize: vertical; line-height: 1.5; }
.dfoot { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--line); }
.dfoot .btn-outline, .dfoot .btn-primary { width: auto; padding: 9px 18px; }
</style>
