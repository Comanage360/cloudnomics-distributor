<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSession } from "../stores/session";

const session = useSession();
const route = useRoute();
const router = useRouter();
const token = computed(() => String(route.query.token || ""));
const state = ref<"working" | "ok" | "fail">("working");

onMounted(async () => {
  if (!token.value) { state.value = "fail"; return; }
  const ok = await session.verifyEmail(token.value);
  state.value = ok ? "ok" : "fail";
});

function go() { router.push(session.authed ? "/" : "/login"); }
</script>

<template>
  <div class="screen"><div class="wrap"><div class="card">
    <img src="/cloudnomics-mark.svg" alt="Cloudnomics" class="brand-logo" />
    <template v-if="state === 'working'">
      <h1>Verifying…</h1>
      <p class="sub">One moment while we confirm your email address.</p>
    </template>
    <template v-else-if="state === 'ok'">
      <h1>Email verified ✓</h1>
      <p class="sub">Thanks — your email address is confirmed and your account is all set.</p>
      <button class="btn-primary full" @click="go">{{ session.authed ? "Continue to console" : "Continue to sign in" }}</button>
    </template>
    <template v-else>
      <h1>Link expired</h1>
      <p class="sub">This verification link is invalid or has expired. Sign in and use “Resend” from the banner to get a fresh one.</p>
      <button class="btn-primary full" @click="router.push('/login')">Go to sign in</button>
    </template>
  </div></div></div>
</template>

<style scoped>
.screen { min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--ink);
  background-image: radial-gradient(circle at 82% 8%, rgba(255,90,54,.22), transparent 42%), radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px);
  background-size: auto, 22px 22px; }
.wrap { width: 100%; max-width: 420px; }
.brand-logo { display: block; margin: 0 auto 22px; height: 46px; width: auto; max-width: 100%; }
.card { background: var(--surface); border-radius: 18px; padding: 28px; box-shadow: 0 24px 60px rgba(0,0,0,.35); text-align: center; }
h1 { font-family: var(--display); font-size: 22px; margin: 0 0 4px; letter-spacing: -.01em; }
.sub { margin: 0 0 22px; color: var(--muted); font-size: 14px; line-height: 1.5; }
.full { width: 100%; margin-top: 8px; }
</style>
