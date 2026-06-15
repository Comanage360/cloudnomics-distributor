import { defineStore } from "pinia";
import { ref } from "vue";
import { api, setToken, getToken } from "../api";
import type { AuthUser } from "../types";

export const useSession = defineStore("session", () => {
  const user = ref<AuthUser | null>(null);
  const authed = ref(Boolean(getToken()));
  const error = ref("");

  async function login(email: string) {
    error.value = "";
    try {
      const { token, user: u } = await api.login(email);
      setToken(token);
      user.value = u;
      authed.value = true;
    } catch (e) {
      error.value = (e as Error).message;
    }
  }

  function logout() {
    setToken(null);
    user.value = null;
    authed.value = false;
  }

  return { user, authed, error, login, logout };
});
