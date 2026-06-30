import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import { definePreset } from "@primevue/themes";
import Aura from "@primevue/themes/aura";
import App from "./App.vue";
import { router } from "./router";
import "./styles.css";

// Aura with our ember (#FF5A36) as the primary palette so PrimeVue controls
// (e.g. the DatePicker's selected dates / today / buttons) match the app theme.
const Ember = definePreset(Aura, {
  semantic: {
    primary: {
      50: "#fff1ed", 100: "#ffe0d6", 200: "#ffc2af", 300: "#ff9e82",
      400: "#ff7b55", 500: "#ff5a36", 600: "#ed4421", 700: "#c53316",
      800: "#9c2914", 900: "#7e2415", 950: "#440f06",
    },
  },
});

createApp(App)
  .use(createPinia())
  .use(router)
  .use(PrimeVue, { theme: { preset: Ember, options: { darkModeSelector: false } } })
  .mount("#app");
