import { defineStore } from "pinia";
import { ref, computed, reactive, watch } from "vue";
import { api } from "../api";
import { computeTotals, DEFAULT_RATES, type Selection } from "../pricing";
import type { ChatMessage, ChatStatePatch, Firewall, Pricelist, Rates, Step } from "../types";

// Persist the in-progress assistant session so a refresh or a browser tab
// discard (e.g. switching to the email app on mobile) doesn't lose it.
const STORAGE_KEY = "cn_quote_session_v1";
export function clearQuoteSession() { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } }

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
  // Set when the reseller is blocked by their AI spend limit; drives the
  // "request a limit increase" flow (composer + right panel). Cleared on reset().
  const limited = ref(false);
  const limitInfo = ref<{ period: "monthly" | null; used: number; limit: number } | null>(null);
  // The advisor answered from the local fallback instead of the model (API key
  // missing or the provider errored). The flow still moves but can't capture
  // free-text answers or reach every step, so we tell the reseller rather than
  // letting it look like it's working.
  const aiDegraded = ref(false);
  const limitRequested = ref(false);   // they already submitted a request (awaiting admin)
  const limitModalOpen = ref(false);   // the request modal is open
  function openLimitRequest() { limitModalOpen.value = true; }
  function closeLimitRequest() { limitModalOpen.value = false; }
  function markLimitRequested() { limitRequested.value = true; limitModalOpen.value = false; }

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

  /** Write the current session to localStorage (best-effort). */
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages: messages.value, step: step.value, sel: { ...sel },
        customer: { ...customer }, quoteNumber: quoteNumber.value,
        sent: sent.value, sessionId: sessionId.value,
        limited: limited.value, limitInfo: limitInfo.value, limitRequested: limitRequested.value,
      }));
    } catch { /* quota/serialization — ignore */ }
  }

  /** Restore a saved session; returns false if there's nothing usable to restore. */
  function hydrate(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!Array.isArray(s.messages) || !s.messages.length) return false;
      messages.value = s.messages;
      step.value = s.step ?? "intake";
      Object.assign(sel, s.sel ?? {});
      Object.assign(customer, s.customer ?? {});
      quoteNumber.value = s.quoteNumber ?? null;
      sent.value = !!s.sent;
      limited.value = !!s.limited; limitInfo.value = s.limitInfo ?? null; limitRequested.value = !!s.limitRequested;
      sessionId.value = s.sessionId || newSessionId();
      mid = messages.value.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
      return true;
    } catch { return false; }
  }

  async function init() {
    try { pricelist.value = await api.pricelist(); } catch { /* offline preview still works for firewall list */ }
    try { rates.value = await api.rates(); } catch { /* fall back to default rates */ }
    // Restore an in-progress session across refresh / tab discard; else start fresh.
    if (!hydrate()) reset();
  }

  // Save on any change so the session survives the next reload (registers once).
  watch([messages, step, sel, customer, quoteNumber, sent, sessionId], persist, { deep: true });

  function reset() {
    messages.value = [];
    step.value = "intake";
    sel.firewall = null; sel.users = 200; sel.fwImpl = false;
    sel.xdr = false; sel.xdrImpl = false; sel.managed = false; sel.markup = 0;
    sel.competitiveModel = "";
    customer.name = ""; customer.email = "";
    quoteNumber.value = null; sent.value = false;
    limited.value = false; limitInfo.value = null; limitRequested.value = false; limitModalOpen.value = false;
    aiDegraded.value = false; // live status, re-established by the next turn
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
      // Reseller is over their admin-set AI token limit: show the notice, flag
      // the blocked state (composer offers a request-increase flow), and leave
      // the flow untouched (no state/step change, no quote created).
      if (res.limited) {
        limited.value = true;
        limitInfo.value = { period: res.period ?? null, used: res.used ?? 0, limit: res.limit ?? 0 };
        addClaude(res.reply);
        // Reflect whether they've already got a pending request (survives refresh).
        try { limitRequested.value = (await api.myLimitRequest()).pending; } catch { /* keep current */ }
        return;
      }
      limited.value = false; // a normal turn means they're no longer blocked
      aiDegraded.value = !!res.aiDegraded;
      const pickedFw = applyPatch(res.patch || {});
      if (res.step) step.value = res.step;
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

  /** Mark the quote as sent after a custom-email send (composer handles the API). */
  function noteSent(email?: string) {
    sent.value = true;
    step.value = "done";
    addClaude(`Quote sent to ${email || customer.email} ✓`);
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
    limited, limitInfo, limitRequested, limitModalOpen, aiDegraded,
    openLimitRequest, closeLimitRequest, markLimitRequested,
    init, reset, sendMessage, setType, setFirewall, send, noteSent,
  };
});
