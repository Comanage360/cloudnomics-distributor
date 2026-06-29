import { defineStore } from "pinia";
import { ref, computed, reactive } from "vue";
import { api } from "../api";
import { computeTotals, DEFAULT_RATES, type Selection } from "../pricing";
import type { ChatMessage, ChatStatePatch, Firewall, Pricelist, Rates, Step } from "../types";

let mid = 0;
const nextId = () => ++mid;
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const newSessionId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2)}`);

export const useQuote = defineStore("quote", () => {
  const pricelist = ref<Pricelist | null>(null);
  const rates = ref<Rates>(DEFAULT_RATES);
  const messages = ref<ChatMessage[]>([]);
  const step = ref<Step>("intake");
  const thinking = ref(false);

  const sel = reactive<Selection>({
    firewall: null, users: 200, fwImpl: false,
    xdr: false, xdrImpl: false, managed: false, markup: 0, competitiveModel: "",
  });
  const customer = reactive({ name: "", email: "" });
  const quoteNumber = ref<number | null>(null);
  const sent = ref(false);
  // Groups all AI turns of one quoting session (for "Sessions" usage reporting).
  const sessionId = ref(newSessionId());

  const totals = computed(() => computeTotals(sel, pricelist.value, rates.value));

  // ---- helpers ----
  function addUser(text: string) {
    messages.value.push({ id: nextId(), role: "user", text });
  }
  function addClaude(text: string, card?: ChatMessage["card"]) {
    messages.value.push({ id: nextId(), role: "claude", text, card });
  }

  async function init() {
    try { pricelist.value = await api.pricelist(); } catch { /* offline preview still works for firewall list */ }
    try { rates.value = await api.rates(); } catch { /* fall back to default rates */ }
    reset();
  }

  function reset() {
    messages.value = [];
    step.value = "intake";
    sel.firewall = null; sel.users = 200; sel.fwImpl = false;
    sel.xdr = false; sel.xdrImpl = false; sel.managed = false; sel.markup = 0;
    sel.competitiveModel = "";
    customer.name = ""; customer.email = "";
    quoteNumber.value = null; sent.value = false;
    sessionId.value = newSessionId(); // a fresh session each new quote
    addClaude('Welcome to Cloudnomics Palo Alto Networks AI Advisor. Tell me about the requirement — e.g. "best firewall for a 200-user office" — and I\'ll recommend the right kit and build the quote with you.');
  }

  /** Current selection as the flat state the advisor reads/patches. */
  function snapshot(): ChatStatePatch {
    return {
      sku: sel.firewall?.sku,
      users: sel.users,
      fwImpl: sel.fwImpl, xdr: sel.xdr, xdrImpl: sel.xdrImpl, managed: sel.managed,
      competitiveModel: sel.competitiveModel || undefined,
      markup: sel.markup,
      customerName: customer.name || undefined,
      customerEmail: customer.email || undefined,
    };
  }

  /** Apply a validated patch from the advisor onto local state. */
  function applyPatch(patch: ChatStatePatch): boolean {
    let pickedFw = false;
    if (patch.sku) {
      const fw = pricelist.value?.firewalls.find((f) => f.sku === patch.sku);
      if (fw) { sel.firewall = fw; pickedFw = true; }
    }
    if (typeof patch.users === "number") sel.users = patch.users;
    if (typeof patch.fwImpl === "boolean") sel.fwImpl = patch.fwImpl;
    if (typeof patch.xdr === "boolean") sel.xdr = patch.xdr;
    if (typeof patch.xdrImpl === "boolean") sel.xdrImpl = patch.xdrImpl;
    if (typeof patch.managed === "boolean") sel.managed = patch.managed;
    if (typeof patch.competitiveModel === "string") sel.competitiveModel = patch.competitiveModel;
    if (typeof patch.markup === "number") sel.markup = patch.markup;
    if (typeof patch.customerName === "string") customer.name = patch.customerName;
    if (typeof patch.customerEmail === "string") customer.email = patch.customerEmail;
    return pickedFw;
  }

  /** Persist the quote on the server (authoritative recompute) once built. */
  async function finalize() {
    if (quoteNumber.value || !sel.firewall || !customer.name.trim() || !emailOk(customer.email)) return;
    try {
      const result = await api.createQuote({
        sku: sel.firewall.sku, users: sel.users,
        fwImpl: sel.fwImpl, xdr: sel.xdr, xdrImpl: sel.xdrImpl,
        managed: sel.managed, markup: sel.markup,
        competitiveModel: sel.competitiveModel,
        customerName: customer.name, customerEmail: customer.email,
        sessionId: sessionId.value, // links this session's AI usage to the quote
      });
      quoteNumber.value = result.number;
    } catch { /* keep the local preview if save fails */ }
  }

  /** The single conversation entry point: every user action flows through here. */
  async function sendMessage(text: string) {
    const t = text.trim();
    // One quote per session: once a quote is created the session is locked.
    if (!t || thinking.value || step.value === "done" || quoteNumber.value) return;
    addUser(t);
    thinking.value = true;
    try {
      const history = messages.value.map((m) => ({
        role: (m.role === "claude" ? "assistant" : "user") as "assistant" | "user",
        text: m.text,
      }));
      const res = await api.chat({ messages: history, state: snapshot(), sessionId: sessionId.value });
      const pickedFw = applyPatch(res.patch || {});
      step.value = res.step;
      addClaude(res.reply, pickedFw && sel.firewall ? { firewall: sel.firewall, users: sel.users } : undefined);
      if (res.done || res.step === "send") await finalize();
    } catch {
      addClaude("Sorry — I had trouble there. Could you say that again?");
    } finally {
      thinking.value = false;
    }
  }

  // ---- local-only preview helpers for the firewall picker (selectFw step) ----
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

  /** Email the finalized quote to the customer. */
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
    addClaude(`Quote sent to ${customer.email} ✓${dry ? "  (dev dry-run — configure SMTP to deliver for real)" : ""}`);
    step.value = "done";
  }

  return {
    pricelist, rates, messages, step, thinking, sel, customer, quoteNumber, sent, totals,
    init, reset, sendMessage, setType, setFirewall, send,
  };
});
