"use strict";

/* AXYOM Public Demo — browser-only, deterministic, offline.
   Knowledge content is read from the #public-knowledge data block,
   which is generated from docs/public_agent_knowledge.json
   (single maintained source of truth; see tools/knowledge_sync.py). */

const chat = document.getElementById("chat");
const form = document.getElementById("agentForm");
const input = document.getElementById("question");

function readKnowledge() {
  const el = document.getElementById("public-knowledge");
  if (!el) return null;
  try {
    const data = JSON.parse(el.textContent);
    if (!data || !data.agent || !Array.isArray(data.agent.entries) || !data.case_studies) return null;
    return data;
  } catch (e) {
    return null;
  }
}

const knowledge = readKnowledge();
const KNOWLEDGE_UNAVAILABLE =
  (knowledge && knowledge.agent && knowledge.agent.knowledge_unavailable_answer) ||
  "Knowledge source unavailable. This demo fails closed and will not invent an answer.";

/* ------------------------------------------------------------------ */
/* Public agent                                                        */
/* ------------------------------------------------------------------ */

function norm(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function answer(question) {
  if (!knowledge) return KNOWLEDGE_UNAVAILABLE;
  const n = norm(question);
  let best = null;
  let score = 0;
  for (const entry of knowledge.agent.entries) {
    let s = 0;
    for (const key of entry.keys) {
      if (n.includes(norm(key))) s += key.length;
    }
    if (s > score) {
      score = s;
      best = entry;
    }
  }
  if (!best) return knowledge.agent.fallback_answer || KNOWLEDGE_UNAVAILABLE;
  return best.answer;
}

function add(text, type) {
  const el = document.createElement("div");
  el.className = "msg " + type;
  el.textContent = text;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function ask(question) {
  const clean = question.trim();
  if (!clean) return;
  add(clean, "user");
  add(answer(clean), "agent");
  input.focus();
}

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = input.value;
    input.value = "";
    ask(question);
  });
}

document.querySelectorAll("[data-q]").forEach((button) => {
  button.addEventListener("click", () => ask(button.dataset.q));
});

/* ------------------------------------------------------------------ */
/* Public evidence panel (values come from the knowledge source)       */
/* ------------------------------------------------------------------ */

function renderEvidence() {
  const out = document.getElementById("evidenceOut");
  if (!out) return;
  if (!knowledge) {
    out.textContent = "KNOWLEDGE_SOURCE=UNAVAILABLE";
    return;
  }
  const rl = knowledge.case_studies.research_lab || {};
  const cg = knowledge.case_studies.context_governor_r1 || {};
  const lines = [
    "Research Lab",
    "repositories audited: " + rl.repositories_audited,
    "material role corrections: " + rl.material_role_corrections,
    "taxonomy refinements: " + rl.taxonomy_refinements,
    "confirmed classifications: " + rl.confirmed_classifications,
    "",
    "Context Governor R1",
    "MICRO: estimated " + cg.micro_estimated_tokens + " / " + cg.micro_budget,
    "NORMAL: estimated " + cg.normal_estimated_tokens + " / " + cg.normal_budget,
    "provider billing measurement: " + String(cg.provider_billing_measurement).toUpperCase()
  ];
  out.textContent = lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Verification Lab v2                                                 */
/* ------------------------------------------------------------------ */

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function webCryptoReady() {
  return Boolean(window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === "function");
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

async function hashTwice(text) {
  const first = await sha256Hex(text);
  const second = await sha256Hex(text);
  return {
    first: first,
    second: second,
    repeatMatch: first === second && first.length === 64
  };
}

async function compareTexts(textA, textB) {
  const a = await sha256Hex(textA);
  const b = await sha256Hex(textB);
  const byteEquivalent = a === b && a.length === 64 && b.length === 64;
  return {
    a: a,
    b: b,
    decision: byteEquivalent ? "BYTE_EQUIVALENT_UTF8" : "DIFFERENT"
  };
}

const KNOWN_VECTORS = [
  {
    id: "VECTOR_EMPTY_STRING",
    label: "empty UTF-8 string",
    input: "",
    expected: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  {
    id: "VECTOR_ABC",
    label: "abc",
    input: "abc",
    expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  }
];

async function runKnownVectors() {
  const results = [];
  for (const vector of KNOWN_VECTORS) {
    let computed = "";
    let pass = false;
    try {
      computed = await sha256Hex(vector.input);
      pass = computed === vector.expected && computed.length === 64;
    } catch (e) {
      pass = false;
    }
    results.push({
      id: vector.id,
      label: vector.label,
      expected: vector.expected,
      computed: computed,
      pass: pass
    });
  }
  const allPass = results.length > 0 && results.every((r) => r.pass);
  return { results: results, allPass: allPass };
}

function writeOut(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function cryptoUnavailable(outId) {
  writeOut(outId, "ERROR=WEB_CRYPTO_UNAVAILABLE\nA secure context with the Web Crypto API is required.");
}

async function onHash() {
  if (!webCryptoReady()) return cryptoUnavailable("hashOut");
  const text = document.getElementById("labText").value;
  writeOut("hashOut", "CALCULATING...");
  try {
    const result = await hashTwice(text);
    writeOut(
      "hashOut",
      "SHA256=" + result.first + "\n" +
      "HASH_REPEAT_MATCH=" + (result.repeatMatch ? "TRUE" : "FALSE")
    );
  } catch (e) {
    writeOut("hashOut", "ERROR=HASH_FAILED");
  }
}

async function onCompare() {
  if (!webCryptoReady()) return cryptoUnavailable("compareOut");
  const a = document.getElementById("textA").value;
  const b = document.getElementById("textB").value;
  writeOut("compareOut", "CALCULATING...");
  try {
    const result = await compareTexts(a, b);
    writeOut(
      "compareOut",
      "TEXT_A_SHA256=" + result.a + "\n" +
      "TEXT_B_SHA256=" + result.b + "\n" +
      "DECISION=" + result.decision
    );
  } catch (e) {
    writeOut("compareOut", "ERROR=COMPARE_FAILED");
  }
}

async function onVectors() {
  if (!webCryptoReady()) return cryptoUnavailable("vectorsOut");
  writeOut("vectorsOut", "RUNNING...");
  try {
    const run = await runKnownVectors();
    const lines = run.results.map((r) => {
      return r.id + "=" + (r.pass ? "PASS" : "FAIL") +
        "\n  expected=" + r.expected +
        "\n  computed=" + (r.computed || "(none)");
    });
    lines.push("KNOWN_VECTORS_GLOBAL_PASS=" + (run.allPass ? "TRUE" : "FALSE"));
    writeOut("vectorsOut", lines.join("\n"));
  } catch (e) {
    writeOut("vectorsOut", "KNOWN_VECTORS_GLOBAL_PASS=FALSE\nERROR=VECTOR_RUN_FAILED");
  }
}

const hashBtn = document.getElementById("hashBtn");
const compareBtn = document.getElementById("compareBtn");
const vectorsBtn = document.getElementById("vectorsBtn");
const compareClearBtn = document.getElementById("compareClearBtn");
if (hashBtn) hashBtn.addEventListener("click", onHash);
if (compareBtn) compareBtn.addEventListener("click", onCompare);
if (vectorsBtn) vectorsBtn.addEventListener("click", onVectors);
if (compareClearBtn) {
  compareClearBtn.addEventListener("click", () => {
    document.getElementById("textA").value = "";
    document.getElementById("textB").value = "";
    writeOut("compareOut", "");
    document.getElementById("textA").focus();
  });
}

renderEvidence();
onVectors();

/* Test seam: lets local validation drive the same functions the UI uses. */
window.AXYOM_LAB = {
  ready: webCryptoReady(),
  knowledgeReady: Boolean(knowledge),
  sha256Hex: sha256Hex,
  hashTwice: hashTwice,
  compareTexts: compareTexts,
  runKnownVectors: runKnownVectors,
  ui: { onHash: onHash, onCompare: onCompare, onVectors: onVectors }
};
