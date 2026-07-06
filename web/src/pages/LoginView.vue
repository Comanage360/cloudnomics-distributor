<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useSession } from "../stores/session";

const session = useSession();
const router = useRouter();
const mode = ref<"login" | "register">("login");
const email = ref("");
const pw = ref("");
const pw2 = ref("");
const company = ref("");
const busy = ref(false);
const pending = ref(false); // shown after a signup that needs admin approval

const isRegister = computed(() => mode.value === "register");
const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()));
const pwMismatch = computed(() => isRegister.value && pw2.value.length > 0 && pw.value !== pw2.value);
const valid = computed(() => {
  if (!emailOk.value) return false;
  if (isRegister.value) return pw.value.length >= 8 && pw.value === pw2.value;
  return pw.value.length > 0;
});

async function submit() {
  if (!valid.value || busy.value) return;
  busy.value = true;
  if (isRegister.value) {
    const r = await session.register(email.value.trim(), pw.value, pw2.value, company.value.trim() || undefined);
    if (r === "pending") pending.value = true;
  } else {
    await session.login(email.value.trim(), pw.value);
  }
  busy.value = false;
}

function toggle() {
  mode.value = isRegister.value ? "login" : "register";
  session.error = "";
  pw2.value = "";
}
function backToLogin() {
  pending.value = false;
  mode.value = "login";
  session.error = "";
  pw.value = ""; pw2.value = "";
}
</script>

<template>
  <div class="screen">
    <div class="wrap">
      <div class="card">
        <img src="/cloudnomics-mark.svg" alt="Cloudnomics" class="brand-logo" />

        <template v-if="pending">
          <h1>Account created ✓</h1>
          <p class="sub">Thanks for registering. Your account is <strong>pending admin approval</strong> — we'll email <strong>{{ email }}</strong> as soon as it's approved, then you can sign in.</p>
          <button class="btn-primary full" @click="backToLogin">Back to sign in</button>
        </template>

        <template v-else>
        <h1>{{ isRegister ? "Create your account" : "Reseller sign in" }}</h1>
        <p class="sub">Build expert Palo Alto Networks quotes — no expertise required.</p>

        <label class="lbl">Work email</label>
        <input v-model="email" type="email" class="input" placeholder="you@yourcompany.com" @keyup.enter="submit" />

        <template v-if="isRegister">
          <label class="lbl">Company name <span class="opt">(optional)</span></label>
          <input v-model="company" class="input" placeholder="Your company" @keyup.enter="submit" />
        </template>

        <label class="lbl">Password</label>
        <input v-model="pw" type="password" class="input" :placeholder="isRegister ? 'At least 8 characters' : 'Your password'" @keyup.enter="submit" />

        <template v-if="isRegister">
          <label class="lbl">Confirm password</label>
          <input v-model="pw2" type="password" class="input" :class="{ invalid: pwMismatch }" placeholder="Re-enter your password" @keyup.enter="submit" />
          <p v-if="pwMismatch" class="err">Passwords don't match.</p>
        </template>

        <div v-if="!isRegister" class="forgot">
          <button class="link" type="button" @click="router.push('/forgot-password')">Forgot password?</button>
        </div>

        <p v-if="session.error" class="err">{{ session.error }}</p>

        <button class="btn-primary full" :disabled="busy || !valid" @click="submit">
          {{ busy ? "Please wait…" : isRegister ? "Create account" : "Sign in to console" }}
        </button>

        <div class="switch">
          {{ isRegister ? "Already have an account?" : "New reseller?" }}
          <button class="link" type="button" @click="toggle">
            {{ isRegister ? "Sign in" : "Create one" }}
          </button>
        </div>

        <div class="foot">Powered by Cloudnomics · Authorized Palo Alto distributor</div>
        </template>
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
.brand-logo { display: block; margin: 0 auto 22px; height: 46px; width: auto; max-width: 100%; }
.wordmark { font-family: var(--display); font-weight: 700; font-size: 20px; letter-spacing: -.01em; }
.eyebrow { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: rgba(255,255,255,.55); }
.card { background: var(--surface); border-radius: 18px; padding: 28px; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
h1 { font-family: var(--display); font-size: 22px; margin: 0 0 4px; letter-spacing: -.01em; }
.sub { margin: 0 0 22px; color: var(--muted); font-size: 14px; }
.lbl { display: block; font-size: 12.5px; color: var(--muted); margin: 0 0 6px; font-weight: 500; }
.input { margin-bottom: 14px; }
.err { color: var(--ember); font-size: 13px; margin: -4px 0 12px; }
.input.invalid { border-color: var(--ember); }
.forgot { text-align: right; margin: -6px 0 12px; }
.full { width: 100%; margin-top: 8px; }
.opt { color: var(--muted); font-weight: 400; text-transform: none; letter-spacing: 0; }
.switch { text-align: center; margin-top: 14px; font-size: 12.5px; color: var(--muted); }
.link { background: none; border: none; color: var(--ember); font-weight: 700; cursor: pointer; font-size: 12.5px; padding: 0 2px; }
.link:hover { text-decoration: underline; }
.foot { text-align: center; margin-top: 16px; font-size: 12.5px; color: var(--muted); }
</style>
