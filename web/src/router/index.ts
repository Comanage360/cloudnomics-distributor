import { createRouter, createWebHistory } from "vue-router";
import { useSession } from "../stores/session";
import LoginView from "../pages/LoginView.vue";
import ForgotPasswordView from "../pages/ForgotPasswordView.vue";
import ResetPasswordView from "../pages/ResetPasswordView.vue";
import VerifyEmailView from "../pages/VerifyEmailView.vue";
import ConsoleView from "../pages/ConsoleView.vue";
import AssistantView from "../pages/AssistantView.vue";
import MyQuotesPage from "../components/MyQuotesPage.vue";
import ProductsPage from "../components/ProductsPage.vue";
import CatalogPage from "../components/CatalogPage.vue";
import BrandingPage from "../components/BrandingPage.vue";
import AdminPage from "../components/AdminPage.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: LoginView, meta: { guest: true } },
    // Public auth-utility pages — reachable whether or not the user is signed in
    // (a logged-in user can still click a verify link; reset works either way).
    { path: "/forgot-password", name: "forgotPassword", component: ForgotPasswordView, meta: { public: true } },
    { path: "/reset-password", name: "resetPassword", component: ResetPasswordView, meta: { public: true } },
    { path: "/verify-email", name: "verifyEmail", component: VerifyEmailView, meta: { public: true } },
    {
      path: "/",
      component: ConsoleView, // authed layout shell (topbar + sidebar + <router-view>)
      children: [
        { path: "", name: "assistant", component: AssistantView },
        { path: "quotes", name: "quotes", component: MyQuotesPage },
        { path: "products", name: "products", component: ProductsPage },
        { path: "catalog", name: "catalog", component: CatalogPage },
        { path: "branding", name: "branding", component: BrandingPage },
        { path: "admin", name: "admin", component: AdminPage, meta: { admin: true } },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach((to) => {
  const session = useSession();
  if (to.meta.public) return true; // verify / reset / forgot — always reachable
  if (to.meta.guest) return session.authed ? { path: "/" } : true;
  if (!session.authed) return { path: "/login" };
  if (to.meta.admin && !session.isAdmin) return { path: "/" }; // admins only
  return true;
});
