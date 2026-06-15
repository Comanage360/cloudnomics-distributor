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

  async function save(nextLogo: string | null, nextCompany?: string) {
    logo.value = nextLogo; // optimistic
    if (nextCompany !== undefined) company.value = nextCompany;
    const r = await api.saveBranding({ logo: nextLogo, company: nextCompany });
    logo.value = r.logo;
    if (r.company) company.value = r.company;
  }

  return { logo, company, loaded, load, save };
});
