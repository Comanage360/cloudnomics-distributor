import { defineStore } from "pinia";
import { ref, computed, reactive } from "vue";
import { api } from "../api";
import { computeTotals, type Selection } from "../pricing";
import type { ChatMessage, Firewall, Pricelist, Step } from "../types";

let mid = 0;
const nextId = () => ++mid;

export const useQuote = defineStore("quote", () => {
  const pricelist = ref<Pricelist | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const step = ref<Step>("intake");
  const thinking = ref(false);

  const sel = reactive<Selection>({
    firewall: null, users: 200, fwImpl: false,
    xdr: false, xdrImpl: false, managed: false, markup: 0,
  });
  const customer = reactive({ name: "", email: "" });
  const logo = ref<string | null>(null);
  const quoteNumber = ref<number | null>(null);
  const sent = ref(false);

  const totals = computed(() => computeTotals(sel, pricelist.value));

  // ---- helpers ----
  function addUser(text: string) {
    messages.value.push({ id: nextId(), role: "user", text });
  }
  function addClaude(text: string, card?: ChatMessage["card"], delay = 550): Promise<void> {
    return new Promise((resolve) => {
      thinking.value = true;
      window.setTimeout(() => {
        thinking.value = false;
        messages.value.push({ id: nextId(), role: "claude", text, card });
        resolve();
      }, delay);
    });
  }

  async function init() {
    try { pricelist.value = await api.pricelist(); } catch { /* offline preview still works for firewall list */ }
    reset();
  }

  function reset() {
    messages.value = [];
    step.value = "intake";
    sel.firewall = null; sel.users = 200; sel.fwImpl = false;
    sel.xdr = false; sel.xdrImpl = false; sel.managed = false; sel.markup = 0;
    customer.name = ""; customer.email = "";
    logo.value = null; quoteNumber.value = null; sent.value = false;
    messages.value.push({
      id: nextId(), role: "claude",
      text: 'Welcome to the Cloudnomics console. Tell me about the deal — e.g. "best firewall for a 200-user office" — and I\'ll recommend the right kit and build the quote with you.',
    });
  }

  // ---- flow actions ----
  async function submitIntake(requirement: string) {
    if (!requirement.trim() || step.value !== "intake") return;
    addUser(requirement);
    thinking.value = true;
    let rec;
    try {
      rec = await api.recommend(requirement);
    } catch {
      rec = null;
    }
    thinking.value = false;
    // On API success pick the recommended SKU; otherwise default to a priceable
    // PA-Series hardware firewall sized to the user count (never on-request CN).
    const priceablePa = (f: Firewall) => f.series === "PA-Series" && f.list != null;
    const fw: Firewall | undefined = rec
      ? pricelist.value?.firewalls.find((f) => f.sku === rec!.sku)
      : pricelist.value?.firewalls.find((f) => priceablePa(f) && sel.users <= f.maxUsers);
    const picked =
      fw ||
      pricelist.value?.firewalls.find(priceablePa) ||
      pricelist.value?.firewalls.find((f) => f.list != null) ||
      null;
    if (picked) sel.firewall = picked;
    if (rec) sel.users = rec.users;

    messages.value.push({
      id: nextId(), role: "claude",
      text: rec?.message || `Recommended ${picked?.sku} for your requirement.`,
      card: picked ? { firewall: picked, users: sel.users } : undefined,
    });
    await addClaude("Confirm this model, or switch between hardware and virtual and pick a different one.", undefined, 650);
    step.value = "selectFw";
  }

  /** Re-pick the smallest priceable firewall of a series for the current users. */
  function setType(type: "hardware" | "virtual") {
    const series = type === "virtual" ? "VM-Series" : "PA-Series";
    const pool = (pricelist.value?.firewalls ?? []).filter((f) => f.series === series && f.list != null);
    if (!pool.length) return;
    sel.firewall = pool.find((f) => sel.users <= f.maxUsers) || pool[pool.length - 1];
  }

  function setFirewall(sku: string) {
    const fw = pricelist.value?.firewalls.find((f) => f.sku === sku);
    if (fw) sel.firewall = fw;
  }

  async function confirmFirewall() {
    if (!sel.firewall) return;
    addUser(`Use ${sel.firewall.sku}`);
    if (sel.firewall.unit === "on_request") {
      // CN-Series has no price — implementation (15% of hardware) doesn't apply.
      sel.fwImpl = false;
      await addClaude(`The ${sel.firewall.sku} is quoted on request, so I'll mark it "contact for pricing". Most ${sel.users}-user sites add Cortex XDR for endpoint protection. Add Cortex XDR Pro for ${sel.users} users?`);
      step.value = "xdr";
      return;
    }
    await addClaude(`Want me to add professional implementation for the ${sel.firewall.sku}? Our team handles setup and configuration — priced at 15% of the hardware.`, undefined, 650);
    step.value = "fwImpl";
  }

  async function answerFwImpl(yes: boolean) {
    addUser(yes ? "Yes, add implementation" : "No, skip implementation");
    sel.fwImpl = yes;
    await addClaude(`Most ${sel.users}-user offices pair the firewall with Cortex XDR for endpoint protection. Add Cortex XDR Pro for ${sel.users} users?`);
    step.value = "xdr";
  }

  async function answerXdr(yes: boolean) {
    addUser(yes ? `Yes, add XDR for ${sel.users} users` : "No XDR for now");
    sel.xdr = yes;
    if (yes) {
      await addClaude("Add implementation for the XDR rollout too? (15% of the XDR subscription.)");
      step.value = "xdrImpl";
    } else {
      await addClaude("Would you like a Cloudnomics Managed Service? We monitor and maintain it for you — adds 15% of the subtotal.");
      step.value = "managed";
    }
  }

  async function answerXdrImpl(yes: boolean) {
    addUser(yes ? "Yes, add XDR implementation" : "No XDR implementation");
    sel.xdrImpl = yes;
    await addClaude("Would you like a Cloudnomics Managed Service? We monitor and maintain it for you — adds 15% of the subtotal.");
    step.value = "managed";
  }

  async function answerManaged(yes: boolean) {
    addUser(yes ? "Yes, add managed service" : "No managed service");
    sel.managed = yes;
    await addClaude("Your quote is ready on the right. Would you like to add a markup for your customer? Set your margin and I'll show both your cost and the customer price.", undefined, 650);
    step.value = "markup";
  }

  async function applyMarkup(pct: number) {
    sel.markup = pct;
    addUser(pct > 0 ? `Apply a ${pct}% markup` : "Sell at cost — no markup");
    await addClaude("Let's white-label it. Upload your logo and tell me who this quote is going to.");
    step.value = "whitelabel";
  }

  async function continueWhitelabel() {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim());
    if (!customer.name.trim() || !emailOk) return;
    addUser(`Customer: ${customer.name} (${customer.email})`);
    // finalize on the server (authoritative recompute + persistence)
    try {
      const result = await api.createQuote({
        sku: sel.firewall?.sku, users: sel.users,
        fwImpl: sel.fwImpl, xdr: sel.xdr, xdrImpl: sel.xdrImpl,
        managed: sel.managed, markup: sel.markup,
        customerName: customer.name, customerEmail: customer.email,
        logo: logo.value, // white-label logo (base64 data URL) persisted for the PDF
      });
      quoteNumber.value = result.number;
    } catch { /* keep going with local preview if save fails */ }
    await addClaude(`All set${quoteNumber.value ? ` — quote #${quoteNumber.value}` : ""}. I'll send the branded quote to ${customer.name}. Want a follow-up reminder in your calendar in 3 days?`);
    step.value = "send";
  }

  async function send() {
    addUser("Send the quote");
    let dry = true;
    try {
      if (quoteNumber.value) {
        const r = await api.sendQuote(quoteNumber.value);
        dry = r.dryRun;
      }
    } catch { /* show optimistic confirmation */ }
    sent.value = true;
    messages.value.push({
      id: nextId(), role: "claude",
      text: `Quote sent to ${customer.email} ✓${dry ? "  (dev dry-run — configure SMTP to deliver for real)" : ""}`,
    });
    step.value = "done";
  }

  return {
    pricelist, messages, step, thinking, sel, customer, logo, quoteNumber, sent, totals,
    init, reset, submitIntake, setType, setFirewall, confirmFirewall,
    answerFwImpl, answerXdr, answerXdrImpl,
    answerManaged, applyMarkup, continueWhitelabel, send,
  };
});
