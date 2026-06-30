<script setup lang="ts">
import { ref } from "vue";
import { useBranding } from "../stores/branding";
import { useSession } from "../stores/session";
import { useToast } from "../stores/toast";

const branding = useBranding();
const session = useSession();
const toast = useToast();
const saving = ref(false);

function onLogo(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  if (!/^image\/(png|jpeg|jpg)$/.test(f.type)) {
    toast.show("Please upload a PNG or JPEG logo.");
    return;
  }
  const r = new FileReader();
  r.onload = () => (branding.logo = String(r.result));
  r.readAsDataURL(f);
}

async function save() {
  saving.value = true;
  try {
    await branding.save(branding.logo, branding.company.trim() || undefined);
    // reflect the new company in the top-bar badge immediately
    if (session.user && branding.company.trim()) session.user.company = branding.company.trim();
    toast.show("✅ Branding saved — it'll appear on every new quote");
  } catch (e) {
    toast.show(`Could not save branding: ${(e as Error).message}`);
  } finally {
    saving.value = false;
  }
}

async function remove() {
  branding.logo = null;
  await save();
}
</script>

<template>
  <div class="page">
    <div class="head">
      <h1>My branding</h1>
      <p>Upload your company logo once — it's applied to every quote automatically. With no logo, quotes are branded “Cloudnomics”.</p>
    </div>

    <div class="card">
      <div class="preview">
        <img v-if="branding.logo" :src="branding.logo" alt="logo" class="logo" />
        <div v-else class="placeholder">Cloudnomics</div>
      </div>

      <div class="controls">
        <label class="lbl">Company name</label>
        <input v-model="branding.company" class="input" placeholder="Your company" />
        <p class="hint">Shown as “Prepared by” on quotes and in the top bar. Logo: PNG or JPEG, ideally wide and transparent.</p>
        <div class="btns">
          <label class="btn-outline file">
            <span>{{ branding.logo ? "Replace logo" : "Upload logo" }}</span>
            <input type="file" accept="image/png,image/jpeg" hidden @change="onLogo" />
          </label>
          <button v-if="branding.logo" class="btn-ghost" @click="remove">Remove</button>
        </div>
        <button class="btn-primary save" :disabled="saving" @click="save">
          {{ saving ? "Saving…" : "Save branding" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px; overflow-y: auto; height: 100%; }
.head { margin-bottom: 18px; }
h1 { font-family: var(--display); font-size: 20px; margin: 0; }
.head p { font-size: 13px; color: var(--muted); margin: 4px 0 0; max-width: 560px; }
.card { display: flex; gap: 24px; align-items: center; border: 1px solid var(--line); border-radius: 14px; padding: 22px; max-width: 620px; background: var(--surface); }
@media (max-width: 760px) {
  .page { padding: 16px; }
  .card { flex-direction: column; align-items: stretch; }
  .preview { width: 100%; }
}
.preview { width: 220px; height: 120px; border: 1px dashed var(--line); border-radius: 12px; display: flex; align-items: center; justify-content: center; background: #fff; flex-shrink: 0; }
.logo { max-width: 180px; max-height: 90px; object-fit: contain; }
.placeholder { font-family: var(--display); font-weight: 800; font-size: 22px; color: var(--ink); }
.controls { flex: 1; min-width: 0; }
.lbl { display: block; font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 5px; }
.controls .input { width: 100%; margin-bottom: 0; }
.hint { font-size: 12px; color: var(--muted); margin: 8px 0 12px; }
.btns { display: flex; gap: 8px; align-items: center; }
.file { cursor: pointer; }
.save { width: 100%; margin-top: 14px; }
</style>
