<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useSession } from "../stores/session";
import { useQuote } from "../stores/quote";
import { useBranding } from "../stores/branding";
import { useToast } from "../stores/toast";
import SideNav from "../components/SideNav.vue";
import Icon from "../components/Icon.vue";
import type { PortalView } from "../types";

const session = useSession();
const q = useQuote();
const branding = useBranding();
const toast = useToast();
const router = useRouter();
const route = useRoute();

const navOpen = ref(false);  // mobile sidebar drawer
const resending = ref(false);
async function resendVerify() {
  if (resending.value) return;
  resending.value = true;
  await session.resendVerification();
  resending.value = false;
  toast.show("Verification email sent — check your inbox.");
}
const menuOpen = ref(false); // account avatar dropdown

const PATHS: Record<PortalView, string> = {
  assistant: "/", quotes: "/quotes",
  products: "/products", catalog: "/catalog", branding: "/branding", admin: "/admin",
};
const currentView = computed<PortalView>(() => (route.name as PortalView) || "assistant");

const initials = computed(() => {
  const company = session.user?.company || branding.company || "";
  if (company.trim()) {
    const parts = company.trim().split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
  }
  return (session.user?.email?.[0] || "?").toUpperCase();
});

function navigate(v: PortalView) {
  navOpen.value = false;
  router.push(PATHS[v]);
}
function newQuote() {
  navOpen.value = false;
  q.reset();
  router.push("/");
}

onMounted(() => {
  q.init();
  branding.load();
});
</script>

<template>
  <div class="app no-print">
    <header class="topbar">
      <div class="brand">
        <button class="hamburger" aria-label="Menu" @click="navOpen = !navOpen">☰</button>
        <img src="/cloudnomics-mark.svg" alt="Cloudnomics" class="logo" />
        <span class="sep">|</span>
        <span class="sub">Distributor Console</span>
      </div>
      <div class="account">
        <span class="badge"><Icon name="building" :size="12" /> {{ session.user?.company || branding.company || 'Reseller' }}</span>
        <div class="avatar-wrap">
          <button class="avatar" :class="{ on: menuOpen }" aria-label="Account menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">{{ initials }}</button>
          <div v-if="menuOpen" class="menu">
            <div class="menu-head">
              <div class="menu-name">{{ session.user?.company || branding.company || 'Reseller' }}</div>
              <div class="menu-email">{{ session.user?.email }}</div>
            </div>
            <button class="menu-item" @click="menuOpen = false; navigate('branding')"><Icon name="branding" :size="14" /> My branding</button>
            <button class="menu-item danger" @click="menuOpen = false; session.logout()">Sign out</button>
          </div>
        </div>
      </div>
      <div v-if="menuOpen" class="menu-backdrop" @click="menuOpen = false" />
    </header>

    <div v-if="session.authed && !session.emailVerified" class="verify-bar">
      <span>✉ Please verify your email to secure your account.</span>
      <button class="verify-btn" :disabled="resending" @click="resendVerify">
        {{ resending ? "Sending…" : "Resend email" }}
      </button>
    </div>

    <div class="body">
      <div v-if="navOpen" class="backdrop" @click="navOpen = false" />
      <SideNav :view="currentView" :open="navOpen" :is-admin="session.isAdmin"
        @navigate="navigate" @new-quote="newQuote" />
      <router-view />
    </div>

    <div class="toast" :class="{ show: toast.msg }">{{ toast.msg }}</div>
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; background: var(--canvas); }
.topbar { display: flex; align-items: center; justify-content: space-between; height: 55px; padding: 0 20px; background: var(--surface); border-bottom: 1px solid var(--line); flex-shrink: 0; }
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; flex-shrink: 0; }
.logo { height: 50px; width: auto; display: block; flex-shrink: 0; }
.sep { color: var(--line); }
.sub { font-size: 12px; color: var(--muted); }
.account { display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--muted); flex-shrink: 1; min-width: 0; }
.badge { background: var(--canvas); border: 1px solid var(--line); border-radius: 20px; padding: 3px 11px; font-size: 11px; display: inline-flex; align-items: center; gap: 5px; color: var(--muted); }
.hamburger { display: none; background: none; border: none; font-size: 20px; line-height: 1; cursor: pointer; color: var(--ink); padding: 2px 6px 2px 0; }
.backdrop { display: none; }

/* Account avatar + dropdown */
.avatar-wrap { position: relative; flex-shrink: 0; }
.avatar { width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer; background: var(--ember); color: #fff; font-size: 12.5px; font-weight: 700; letter-spacing: .02em; display: inline-flex; align-items: center; justify-content: center; transition: box-shadow .15s ease; }
.avatar:hover, .avatar.on { box-shadow: 0 0 0 3px var(--ember-soft); }
.menu { position: absolute; top: calc(100% + 8px); right: 0; min-width: 210px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 12px 32px rgba(8,12,22,.16); padding: 6px; z-index: 60; }
.menu-head { padding: 8px 10px 10px; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
.menu-name { font-size: 13px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.menu-email { font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.menu-item { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: none; background: none; border-radius: 8px; cursor: pointer; color: var(--text); font-size: 13px; font-weight: 500; text-align: left; }
.menu-item:hover { background: var(--canvas); }
.menu-item.danger { color: var(--ember); }
.menu-item.danger:hover { background: var(--ember-soft); }
.menu-backdrop { position: fixed; inset: 0; z-index: 55; }

.verify-bar { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; padding: 8px 16px; background: var(--ember-soft); border-bottom: 1px solid var(--ember-line, var(--line)); color: var(--ember); font-size: 12.5px; font-weight: 600; flex-shrink: 0; }
.verify-btn { background: var(--ember); color: #fff; border: none; border-radius: 8px; padding: 5px 12px; font-size: 12px; font-weight: 700; cursor: pointer; }
.verify-btn:disabled { opacity: .6; cursor: default; }
.body { display: flex; flex: 1; min-height: 0; position: relative; }
/* non-assistant routed pages fill the content area */
.body :deep(.page) { flex: 1; min-width: 0; }

.toast { position: fixed; bottom: 20px; right: 20px; background: var(--ink); color: #fff; padding: 11px 16px; border-radius: 10px; font-size: 13px; font-weight: 500; box-shadow: 0 8px 24px rgba(0,0,0,.2); transform: translateY(16px); opacity: 0; transition: all .3s ease; z-index: 1000; max-width: 320px; pointer-events: none; }
.toast.show { transform: translateY(0); opacity: 1; }

@media (max-width: 760px) {
  .hamburger { display: block; }
  .topbar { height: 60px; padding: 0 14px; }
  .logo { height: 44px; }
  .sub { display: none; }
  .body { flex-direction: column; overflow-y: auto; }
  .backdrop { display: block; position: fixed; inset: 0; top: 0; background: rgba(8,12,22,.45); z-index: 40; }
}
</style>
