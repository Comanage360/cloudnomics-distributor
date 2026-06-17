import { defineStore } from "pinia";
import { ref } from "vue";
import { api, setToken, getToken } from "../api";
import type { AuthUser } from "../types";

export const useSession = defineStore("session", () => {
  const user = ref<AuthUser | null>(null);
  const authed = ref(Boolean(getToken()));
  const error = ref("");

  async function login(email: string, password: string) {
    error.value = "";
    try {
      const { token, user: u } = await api.login(email, password);
      setToken(token);
      user.value = u;
      authed.value = true;
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  async function register(email: string, password: string, company?: string) {
    error.value = "";
    try {
      const { token, user: u } = await api.register(email, password, company);
      setToken(token);
      user.value = u;
      authed.value = true;
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  function logout() {
    setToken(null);
    user.value = null;
    authed.value = false;
  }

  return { user, authed, error, login, register, logout };
});
