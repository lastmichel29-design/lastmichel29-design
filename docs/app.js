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

/* ------------------------------------------------------------------ */
/* Context Governor v3 — deterministic, local, no model execution      */
/* ------------------------------------------------------------------ */

const GOVERNOR_CONFIG =
  (knowledge && knowledge.context_governor_demo) || null;
const GOVERNOR_BUDGETS = (GOVERNOR_CONFIG && GOVERNOR_CONFIG.budget_classes) || null;
const GOVERNOR_BASIS = (GOVERNOR_CONFIG && GOVERNOR_CONFIG.estimate_basis) || "LOCAL_ESTIMATE_ONLY";
const GOVERNOR_FORMULA = (GOVERNOR_CONFIG && GOVERNOR_CONFIG.estimate_formula) || "ceil(character_count / 4)";
const GOVERNOR_CHAR_BASIS = (GOVERNOR_CONFIG && GOVERNOR_CONFIG.character_basis) || "UNICODE_CODE_POINTS";

function countCharacters(text) {
  return Array.from(text).length;
}

function estimateTokens(characters) {
  return Math.ceil(characters / 4);
}

function evaluateGovernor(text, budgetClass) {
  if (!GOVERNOR_BUDGETS) return { error: "KNOWLEDGE_UNAVAILABLE" };
  const budget = GOVERNOR_BUDGETS[budgetClass];
  if (typeof budget !== "number" || !Number.isFinite(budget) || budget <= 0) {
    return { error: "UNKNOWN_BUDGET_CLASS" };
  }
  const characters = countCharacters(text);
  const estimatedTokens = estimateTokens(characters);
  const within = estimatedTokens <= budget;
  return {
    characters: characters,
    estimatedTokens: estimatedTokens,
    budgetClass: budgetClass,
    budgetLimit: budget,
    utilizationPercent: Math.round((estimatedTokens / budget) * 10000) / 100,
    decision: within ? "WITHIN_BUDGET" : "OVER_BUDGET",
    remainingEstimatedTokens: within ? budget - estimatedTokens : 0,
    estimatedCharacterCapacity: budget * 4
  };
}

function formatGovernorResult(result) {
  if (result.error) return "ERROR=" + result.error;
  return [
    "ESTIMATE_BASIS=" + GOVERNOR_BASIS,
    "FORMULA=" + GOVERNOR_FORMULA,
    "CHARACTER_BASIS=" + GOVERNOR_CHAR_BASIS,
    "CHARACTERS=" + result.characters,
    "ESTIMATED_TOKENS=" + result.estimatedTokens,
    "BUDGET_CLASS=" + result.budgetClass,
    "BUDGET_LIMIT=" + result.budgetLimit,
    "UTILIZATION_PERCENT=" + result.utilizationPercent.toFixed(2),
    "DECISION=" + result.decision,
    "REMAINING_ESTIMATED_TOKENS=" + result.remainingEstimatedTokens,
    "ESTIMATED_CHARACTER_CAPACITY=" + result.estimatedCharacterCapacity
  ].join("\n");
}

function runGovernorTests() {
  const results = [];
  const add = (id, pass, detail) => results.push({ id: id, pass: Boolean(pass), detail: detail || "" });

  if (!GOVERNOR_BUDGETS) {
    add("GOVERNOR_BUDGETS_AVAILABLE", false, "knowledge source unavailable");
    return { results: results, allPass: false };
  }

  const cases = [
    { id: "EMPTY_TEXT_MICRO", chars: 0, budgetClass: "MICRO", characters: 0, tokens: 0, decision: "WITHIN_BUDGET" },
    { id: "8000_ASCII_CHARS_MICRO", chars: 8000, budgetClass: "MICRO", characters: 8000, tokens: 2000, decision: "WITHIN_BUDGET" },
    { id: "8001_ASCII_CHARS_MICRO", chars: 8001, budgetClass: "MICRO", characters: 8001, tokens: 2001, decision: "OVER_BUDGET" },
    { id: "24000_ASCII_CHARS_SMALL", chars: 24000, budgetClass: "SMALL", characters: 24000, tokens: 6000, decision: "WITHIN_BUDGET" },
    { id: "24001_ASCII_CHARS_SMALL", chars: 24001, budgetClass: "SMALL", characters: 24001, tokens: 6001, decision: "OVER_BUDGET" },
    { id: "48000_ASCII_CHARS_NORMAL", chars: 48000, budgetClass: "NORMAL", characters: 48000, tokens: 12000, decision: "WITHIN_BUDGET" },
    { id: "120000_ASCII_CHARS_DEEP", chars: 120000, budgetClass: "DEEP", characters: 120000, tokens: 30000, decision: "WITHIN_BUDGET" },
    { id: "120001_ASCII_CHARS_DEEP", chars: 120001, budgetClass: "DEEP", characters: 120001, tokens: 30001, decision: "OVER_BUDGET" },
    { id: "240000_ASCII_CHARS_RESEARCH", chars: 240000, budgetClass: "RESEARCH", characters: 240000, tokens: 60000, decision: "WITHIN_BUDGET" },
    { id: "240001_ASCII_CHARS_RESEARCH", chars: 240001, budgetClass: "RESEARCH", characters: 240001, tokens: 60001, decision: "OVER_BUDGET" }
  ];

  for (const testCase of cases) {
    let pass = false;
    let detail = "";
    try {
      const r = evaluateGovernor("a".repeat(testCase.chars), testCase.budgetClass);
      const budgetLimit = GOVERNOR_BUDGETS[testCase.budgetClass];
      const expectedRemaining = testCase.decision === "OVER_BUDGET"
        ? 0
        : budgetLimit - testCase.tokens;
      pass = !r.error &&
        r.characters === testCase.characters &&
        r.estimatedTokens === testCase.tokens &&
        r.decision === testCase.decision &&
        r.remainingEstimatedTokens === expectedRemaining &&
        r.estimatedCharacterCapacity === budgetLimit * 4;
      detail = "characters=" + r.characters + " tokens=" + r.estimatedTokens +
        " decision=" + r.decision + " remaining=" + r.remainingEstimatedTokens;
    } catch (e) {
      detail = String(e);
    }
    add(testCase.id, pass, detail);
  }

  try {
    const r = evaluateGovernor("\u00f1\u00e9\u4e2d\ud83c\udf89", "MICRO");
    add("UNICODE_INPUT",
      !r.error && r.characters === 4 && r.estimatedTokens === 1 && r.decision === "WITHIN_BUDGET",
      "characters=" + r.characters + " tokens=" + r.estimatedTokens + " decision=" + r.decision);
  } catch (e) {
    add("UNICODE_INPUT", false, String(e));
  }

  try {
    const cs = knowledge.case_studies.context_governor_r1;
    add("BUDGET_MICRO_MATCHES_CASE_STUDY", GOVERNOR_BUDGETS.MICRO === cs.micro_budget,
      "demo=" + GOVERNOR_BUDGETS.MICRO + " case_study=" + cs.micro_budget);
    add("BUDGET_NORMAL_MATCHES_CASE_STUDY", GOVERNOR_BUDGETS.NORMAL === cs.normal_budget,
      "demo=" + GOVERNOR_BUDGETS.NORMAL + " case_study=" + cs.normal_budget);
  } catch (e) {
    add("BUDGET_CASE_STUDY_CONSISTENCY", false, String(e));
  }

  const order = ["MICRO", "SMALL", "NORMAL", "DEEP", "RESEARCH"];
  add("ALL_BUDGET_CLASSES_PRESENT",
    order.every((k) => typeof GOVERNOR_BUDGETS[k] === "number"),
    order.map((k) => k + "=" + GOVERNOR_BUDGETS[k]).join(" "));
  add("BUDGET_CLASSES_INCREASING",
    order.every((k, i) => i === 0 || GOVERNOR_BUDGETS[k] > GOVERNOR_BUDGETS[order[i - 1]]));

  const allPass = results.length > 0 && results.every((r) => r.pass);
  return { results: results, allPass: allPass };
}

function renderGovernorTests() {
  const run = runGovernorTests();
  const lines = run.results.map((r) => {
    return r.id + "=" + (r.pass ? "PASS" : "FAIL") + (r.detail ? "\n  " + r.detail : "");
  });
  lines.push("GOVERNOR_TESTS_GLOBAL_PASS=" + (run.allPass ? "TRUE" : "FALSE"));
  writeOut("govTestsOut", lines.join("\n"));
}

function selectedGovernorClass() {
  const selected = document.querySelector('input[name="govclass"]:checked');
  return selected ? selected.value : null;
}

function onGovernEvaluate() {
  const textArea = document.getElementById("govText");
  if (!textArea) return;
  const result = evaluateGovernor(textArea.value, selectedGovernorClass());
  writeOut("govOut", formatGovernorResult(result));
}

function onGovernClear() {
  const textArea = document.getElementById("govText");
  if (!textArea) return;
  textArea.value = "";
  writeOut("govOut", "");
  textArea.focus();
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

const govBtn = document.getElementById("govBtn");
const govClearBtn = document.getElementById("govClearBtn");
const govTestsBtn = document.getElementById("govTestsBtn");
const govText = document.getElementById("govText");
if (govBtn) govBtn.addEventListener("click", onGovernEvaluate);
if (govClearBtn) govClearBtn.addEventListener("click", onGovernClear);
if (govTestsBtn) govTestsBtn.addEventListener("click", renderGovernorTests);
if (govText) govText.addEventListener("input", onGovernEvaluate);
document.querySelectorAll('input[name="govclass"]').forEach((radio) => {
  radio.addEventListener("change", onGovernEvaluate);
});

renderEvidence();
onVectors();
renderGovernorTests();

/* Test seam: lets local validation drive the same functions the UI uses. */
window.AXYOM_LAB = {
  ready: webCryptoReady(),
  knowledgeReady: Boolean(knowledge),
  sha256Hex: sha256Hex,
  hashTwice: hashTwice,
  compareTexts: compareTexts,
  runKnownVectors: runKnownVectors,
  governor: {
    budgets: GOVERNOR_BUDGETS,
    estimateBasis: GOVERNOR_BASIS,
    countCharacters: countCharacters,
    estimateTokens: estimateTokens,
    evaluate: evaluateGovernor,
    format: formatGovernorResult,
    runTests: runGovernorTests
  },
  ui: {
    onHash: onHash,
    onCompare: onCompare,
    onVectors: onVectors,
    onGovernEvaluate: onGovernEvaluate,
    renderGovernorTests: renderGovernorTests
  }
};
