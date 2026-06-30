import { defineStore } from "pinia";
import { ref } from "vue";

/** App-wide toast: any component can call show(); the layout renders it. */
export const useToast = defineStore("toast", () => {
  const msg = ref("");
  let timer: number | undefined;
  function show(m: string) {
    msg.value = m;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => (msg.value = ""), 3500);
  }
  return { msg, show };
});
