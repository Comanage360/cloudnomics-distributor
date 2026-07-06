<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useSession } from "../stores/session";

const session = useSession();
const router = useRouter();
const email = ref("");
const busy = ref(false);
const sent = ref(false);
const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()));

async function submit() {
  if (!emailOk.value || busy.value) return;
  busy.value = true;
  await session.requestReset(email.value.trim());
  busy.value = false;
  sent.value = true; // always generic — never reveal whether the account exists
}
</script>

<template>
  <div class="screen"><div class="wrap"><div class="card">
    <img src="/cloudnomics-mark.svg" alt="Cloudnomics" class="brand-logo" />
    <template v-if="!sent">
      <h1>Reset your password</h1>
      <p class="sub">Enter your work email and we'll send you a link to set a new password.</p>
      <label class="lbl">Work email</label>
      <input v-model="email" type="email" class="input" placeholder="you@yourcompany.com" @keyup.enter="submit" />
      <p v-if="session.error" class="err">{{ session.error }}</p>
      <button class="btn-primary full" :disabled="busy || !emailOk" @click="submit">
        {{ busy ? "Sending…" : "Send reset link" }}
      </button>
    </template>
    <template v-else>
      <h1>Check your email</h1>
      <p class="sub">If an account exists for <strong>{{ email }}</strong>, we've sent a link to reset your password. It expires in 1 hour.</p>
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
.sub strong { color: var(--text); }
.lbl { display: block; font-size: 12.5px; color: var(--muted); margin: 0 0 6px; font-weight: 500; }
.input { margin-bottom: 14px; }
.err { color: var(--ember); font-size: 13px; margin: -4px 0 12px; }
.full { width: 100%; margin-top: 8px; }
.switch { text-align: center; margin-top: 16px; font-size: 12.5px; color: var(--muted); }
.link { background: none; border: none; color: var(--ember); font-weight: 700; cursor: pointer; font-size: 12.5px; padding: 0 2px; }
.link:hover { text-decoration: underline; }
</style>
