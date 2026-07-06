<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSession } from "../stores/session";

const session = useSession();
const route = useRoute();
const router = useRouter();
const token = computed(() => String(route.query.token || ""));
const pw = ref("");
const pw2 = ref("");
const busy = ref(false);
const mismatch = computed(() => pw2.value.length > 0 && pw.value !== pw2.value);
const valid = computed(() => pw.value.length >= 8 && pw.value === pw2.value);

async function submit() {
  if (!valid.value || busy.value || !token.value) return;
  busy.value = true;
  const ok = await session.resetPassword(token.value, pw.value, pw2.value);
  busy.value = false;
  if (ok) router.push("/"); // reset auto-logs the user in
}
</script>

<template>
  <div class="screen"><div class="wrap"><div class="card">
    <img src="/cloudnomics-mark.svg" alt="Cloudnomics" class="brand-logo" />
    <template v-if="!token">
      <h1>Invalid link</h1>
      <p class="sub">This password-reset link is missing or malformed. Please request a new one.</p>
      <button class="btn-primary full" @click="router.push('/forgot-password')">Request a new link</button>
    </template>
    <template v-else>
      <h1>Choose a new password</h1>
      <p class="sub">Enter a new password for your account.</p>
      <label class="lbl">New password</label>
      <input v-model="pw" type="password" class="input" placeholder="At least 8 characters" @keyup.enter="submit" />
      <label class="lbl">Confirm password</label>
      <input v-model="pw2" type="password" class="input" :class="{ invalid: mismatch }" placeholder="Re-enter your password" @keyup.enter="submit" />
      <p v-if="mismatch" class="err">Passwords don't match.</p>
      <p v-if="session.error" class="err">{{ session.error }}</p>
      <button class="btn-primary full" :disabled="busy || !valid" @click="submit">
        {{ busy ? "Saving…" : "Reset password" }}
      </button>
    </template>
    <div class="switch"><button class="link" type="button" @click="router.push('/login')">← Back to sign in</button></div>
  </div></div></div>
</template>

<style scoped>
.screen { min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--ink);
  background-image: radial-gradient(circle at 82% 8%, rgba(255,90,54,.22), transparent 42%), radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px);
  background-size: auto, 22px 22px; }
.wrap { width: 100%; max-width: 420px; }
.brand-logo { display: block; margin: 0 auto 22px; height: 46px; width: auto; max-width: 100%; }
.card { background: var(--surface); border-radius: 18px; padding: 28px; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
h1 { font-family: var(--display); font-size: 22px; margin: 0 0 4px; letter-spacing: -.01em; }
.sub { margin: 0 0 22px; color: var(--muted); font-size: 14px; line-height: 1.5; }
.lbl { display: block; font-size: 12.5px; color: var(--muted); margin: 0 0 6px; font-weight: 500; }
.input { margin-bottom: 14px; }
.input.invalid { border-color: var(--ember); }
.err { color: var(--ember); font-size: 13px; margin: -4px 0 12px; }
.full { width: 100%; margin-top: 8px; }
.switch { text-align: center; margin-top: 16px; font-size: 12.5px; color: var(--muted); }
.link { background: none; border: none; color: var(--ember); font-weight: 700; cursor: pointer; font-size: 12.5px; padding: 0 2px; }
.link:hover { text-decoration: underline; }
</style>
