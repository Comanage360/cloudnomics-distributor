<script setup lang="ts">
import { ref } from "vue";
import { useSession } from "../stores/session";
import BrandMark from "../components/BrandMark.vue";

const session = useSession();
const email = ref("john@networksolutions.co.za");
const pw = ref("demo-access");
const busy = ref(false);

async function submit() {
  busy.value = true;
  await session.login(email.value);
  busy.value = false;
}
</script>

<template>
  <div class="screen">
    <div class="wrap">
      <div class="brand">
        <BrandMark :size="34" />
        <div>
          <div class="wordmark">Cloudnomics</div>
          <div class="eyebrow">Distributor Console</div>
        </div>
      </div>

      <div class="card">
        <h1>Reseller sign in</h1>
        <p class="sub">Build expert Palo Alto Networks quotes — no expertise required.</p>

        <label class="lbl">Work email</label>
        <input v-model="email" class="input" @keyup.enter="submit" />

        <label class="lbl">Password</label>
        <input v-model="pw" type="password" class="input" @keyup.enter="submit" />

        <p v-if="session.error" class="err">{{ session.error }}</p>

        <button class="btn-primary full" :disabled="busy" @click="submit">
          {{ busy ? "Signing in…" : "Sign in to console" }}
        </button>
        <div class="foot">Powered by Cloudnomics · Authorized Palo Alto distributor</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen {
  min-height: 100%; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: var(--ink);
  background-image:
    radial-gradient(circle at 82% 8%, rgba(255,90,54,.22), transparent 42%),
    radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px);
  background-size: auto, 22px 22px;
}
.wrap { width: 100%; max-width: 420px; }
.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; color: #fff; }
.wordmark { font-family: var(--display); font-weight: 700; font-size: 20px; letter-spacing: -.01em; }
.eyebrow { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: rgba(255,255,255,.55); }
.card { background: var(--surface); border-radius: 18px; padding: 28px; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
h1 { font-family: var(--display); font-size: 22px; margin: 0 0 4px; letter-spacing: -.01em; }
.sub { margin: 0 0 22px; color: var(--muted); font-size: 14px; }
.lbl { display: block; font-size: 12.5px; color: var(--muted); margin: 0 0 6px; font-weight: 500; }
.input { margin-bottom: 14px; }
.err { color: var(--ember); font-size: 13px; margin: -4px 0 12px; }
.full { width: 100%; margin-top: 8px; }
.foot { text-align: center; margin-top: 16px; font-size: 12.5px; color: var(--muted); }
</style>
