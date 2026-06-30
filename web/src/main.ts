import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import Aura from "@primevue/themes/aura";
import App from "./App.vue";
import { router } from "./router";
import "./styles.css";

createApp(App)
  .use(createPinia())
  .use(router)
  // PrimeVue (styled mode, Aura preset). darkModeSelector:false keeps it light.
  .use(PrimeVue, { theme: { preset: Aura, options: { darkModeSelector: false } } })
  .mount("#app");
