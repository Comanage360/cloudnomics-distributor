<script setup lang="ts">
import { watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useSession } from "./stores/session";

const session = useSession();
const router = useRouter();
const route = useRoute();

// Redirect on auth changes: login success -> app, logout / token expiry -> login.
watch(() => session.authed, (a) => {
  if (!a && route.name !== "login") router.replace("/login");
  else if (a && route.name === "login") router.replace("/");
});
</script>

<template>
  <router-view />
</template>
