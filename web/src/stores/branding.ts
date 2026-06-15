import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../api";

/** Reseller-level white-label branding (default logo used on every quote). */
export const useBranding = defineStore("branding", () => {
  const logo = ref<string | null>(null);
  const company = ref("");
  const loaded = ref(false);

  async function load() {
    try {
      const b = await api.getBranding();
      logo.value = b.logo;
      company.value = b.company;
    } catch { /* non-fatal — falls back to Cloudnomics branding */ }
    loaded.value = true;
  }

  async function save(next: string | null) {
    logo.value = next; // optimistic
    await api.saveBranding(next);
  }

  return { logo, company, loaded, load, save };
});
