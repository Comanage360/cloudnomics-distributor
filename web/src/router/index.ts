import { createRouter, createWebHistory } from "vue-router";
import { useSession } from "../stores/session";
import LoginView from "../pages/LoginView.vue";
import ConsoleView from "../pages/ConsoleView.vue";
import AssistantView from "../pages/AssistantView.vue";
import MyQuotesPage from "../components/MyQuotesPage.vue";
import ProductsPage from "../components/ProductsPage.vue";
import BrandingPage from "../components/BrandingPage.vue";
import AdminPage from "../components/AdminPage.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: LoginView, meta: { guest: true } },
    {
      path: "/",
      component: ConsoleView, // authed layout shell (topbar + sidebar + <router-view>)
      children: [
        { path: "", name: "assistant", component: AssistantView },
        { path: "quotes", name: "quotes", component: MyQuotesPage },
        { path: "products", name: "products", component: ProductsPage },
        { path: "branding", name: "branding", component: BrandingPage },
        { path: "admin", name: "admin", component: AdminPage, meta: { admin: true } },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach((to) => {
  const session = useSession();
  if (to.meta.guest) return session.authed ? { path: "/" } : true;
  if (!session.authed) return { path: "/login" };
  if (to.meta.admin && !session.isAdmin) return { path: "/" }; // admins only
  return true;
});
