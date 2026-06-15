<script setup lang="ts">
import { useSession } from "./stores/session";
import LoginView from "./pages/LoginView.vue";
import ConsoleView from "./pages/ConsoleView.vue";

const session = useSession();
</script>

<template>
  <LoginView v-if="!session.authed" />
  <ConsoleView v-else />
</template>
