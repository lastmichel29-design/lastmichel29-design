"use strict";

/* AXYOM Public Demo — browser-only, deterministic;
   no external API or model network requests.
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
    writeOut("evidenceOut", "KNOWLEDGE_SOURCE=UNAVAILABLE");
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
  writeOut("evidenceOut", lines.join("\n"));
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
  if (!el) return;
  el.textContent = text;
  /* Only populated outputs become tab stops, so focus order stays clean. */
  if (text) el.setAttribute("tabindex", "0");
  else el.removeAttribute("tabindex");
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

/* ------------------------------------------------------------------ */
/* Agent Judge v4 — deterministic claim/evidence classification         */
/* ------------------------------------------------------------------ */

const JUDGE_CONFIG = (knowledge && knowledge.agent_judge) || null;
const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

function judgeHashCheck(sourceType, expectedHash, observedHash) {
  if (sourceType !== "HASHED_ARTIFACT") {
    return { status: "NOT_APPLICABLE", match: false };
  }
  const expected = String(expectedHash || "").trim();
  const observed = String(observedHash || "").trim();
  if (!expected && !observed) return { status: "NOT_PROVIDED", match: false };
  if (!expected || !observed) return { status: "INCOMPLETE", match: false };
  if (!SHA256_HEX.test(expected) || !SHA256_HEX.test(observed)) {
    return { status: "INVALID_FORMAT", match: false };
  }
  if (expected === observed) return { status: "MATCH", match: true };
  return { status: "MISMATCH", match: false };
}

function classifyJudge(input) {
  const claim = String((input && input.claim) || "");
  const evidence = String((input && input.evidence) || "");
  const sourceType = String((input && input.sourceType) || "NONE").trim() || "NONE";
  const claimPresent = claim.trim().length > 0;
  const evidencePresent = evidence.trim().length > 0;
  const hash = judgeHashCheck(sourceType, input && input.expectedHash, input && input.observedHash);

  if (!JUDGE_CONFIG) {
    return {
      classification: "UNKNOWN",
      claimPresent: claimPresent,
      evidencePresent: evidencePresent,
      sourceType: sourceType,
      hashCheck: hash.status,
      strength: "NONE",
      reason: "Knowledge source unavailable; classification fails closed.",
      note: ""
    };
  }

  let classification;
  let reason;
  let note = "";

  if (!claimPresent) {
    classification = "UNKNOWN";
    reason = "Claim text is empty, so there is nothing to classify.";
  } else if (!evidencePresent) {
    classification = "CLAIM";
    reason = "A claim is present but no evidence text was provided.";
  } else {
    switch (sourceType) {
      case "NONE":
        classification = "INSUFFICIENT_EVIDENCE";
        reason = "Evidence text is present but no source type was selected.";
        break;
      case "USER_ASSERTION":
        classification = "INSUFFICIENT_EVIDENCE";
        reason = "A user assertion alone is not sufficient evidence.";
        break;
      case "DOCUMENT":
        classification = "EVIDENCE";
        reason = "A document source classifies the package as evidence.";
        break;
      case "HASHED_ARTIFACT":
        if (hash.match) {
          classification = "VERIFIED_ARTIFACT";
          reason = "Both hashes are valid 64-hex SHA-256 digests and match exactly.";
        } else {
          classification = "INSUFFICIENT_EVIDENCE";
          reason = "Hash check status is " + hash.status +
            "; a verified artifact requires two valid SHA-256 digests that match exactly.";
        }
        break;
      case "TEST_RESULT":
        classification = "EVIDENCE";
        reason = "A test result source classifies the package as evidence.";
        note = JUDGE_CONFIG.notes.TEST_RESULT;
        break;
      case "REPRODUCIBLE_EXECUTION":
        classification = "VERIFIED_ARTIFACT";
        reason = "A reproducible execution source classifies the package as a verified artifact.";
        note = JUDGE_CONFIG.notes.REPRODUCIBLE_EXECUTION;
        break;
      case "INDEPENDENT_REPRODUCTION":
        classification = "REPRODUCED";
        reason = "An independent reproduction source classifies the package as reproduced.";
        note = JUDGE_CONFIG.notes.INDEPENDENT_REPRODUCTION;
        break;
      default:
        classification = "UNKNOWN";
        reason = "Unrecognized source type; classification fails closed.";
    }
  }

  const allowed = JUDGE_CONFIG.allowed_classifications || [];
  const forbidden = JUDGE_CONFIG.forbidden_classifications || [];
  if (allowed.indexOf(classification) === -1 || forbidden.indexOf(classification) !== -1) {
    classification = "UNKNOWN";
    note = "";
    reason = "Classification outside the allowed vocabulary; fails closed.";
  }

  const strengthMap = JUDGE_CONFIG.strength_by_classification || {};

  return {
    classification: classification,
    claimPresent: claimPresent,
    evidencePresent: evidencePresent,
    sourceType: sourceType,
    hashCheck: hash.status,
    strength: strengthMap[classification] || "NONE",
    reason: reason,
    note: note
  };
}

function formatJudgeResult(result) {
  const lines = [
    "CLASSIFICATION=" + result.classification,
    "CLAIM_PRESENT=" + (result.claimPresent ? "TRUE" : "FALSE"),
    "EVIDENCE_PRESENT=" + (result.evidencePresent ? "TRUE" : "FALSE"),
    "SOURCE_TYPE=" + result.sourceType,
    "HASH_CHECK=" + result.hashCheck,
    "EVIDENCE_STRENGTH=" + result.strength,
    "REASON=" + result.reason
  ];
  if (result.note) lines.push("NOTE=" + result.note);
  return lines.join("\n");
}

function renderJudgeRules() {
  const list = document.getElementById("judgeRules");
  if (!list) return;
  list.replaceChildren();
  if (!JUDGE_CONFIG || !Array.isArray(JUDGE_CONFIG.rules)) {
    const li = document.createElement("li");
    li.textContent = "Knowledge source unavailable; no rules can be rendered.";
    list.appendChild(li);
    return;
  }
  JUDGE_CONFIG.rules.forEach((rule) => {
    const li = document.createElement("li");
    let text = rule.when + " Classify as " + rule.then + ".";
    if (rule.else) text += " Otherwise classify as " + rule.else + ".";
    if (rule.note && JUDGE_CONFIG.notes && JUDGE_CONFIG.notes[rule.note]) {
      text += " Note: " + JUDGE_CONFIG.notes[rule.note];
    }
    li.textContent = text;
    list.appendChild(li);
  });
}

function renderJudgeExamples() {
  const host = document.getElementById("judgeExamples");
  if (!host) return;
  host.replaceChildren();
  if (!JUDGE_CONFIG || !Array.isArray(JUDGE_CONFIG.examples)) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Knowledge source unavailable; examples cannot be rendered.";
    host.appendChild(p);
    return;
  }
  JUDGE_CONFIG.examples.forEach((ex) => {
    const card = document.createElement("article");
    card.className = "example-card";

    const title = document.createElement("h4");
    title.textContent = "Example " + ex.id;
    card.appendChild(title);

    const list = document.createElement("dl");
    const rows = [
      ["CLAIM", ex.claim],
      ["EVIDENCE", ex.evidence],
      ["SOURCE_TYPE", ex.source_type],
      ["EXPECTED_HASH", ex.expected_hash || "(none)"],
      ["OBSERVED_HASH", ex.observed_hash || "(none)"],
      ["EXPECTED CLASSIFICATION", ex.expected_classification]
    ];
    rows.forEach((row) => {
      const key = document.createElement("dt");
      key.textContent = row[0];
      const value = document.createElement("dd");
      value.textContent = row[1];
      list.appendChild(key);
      list.appendChild(value);
    });
    card.appendChild(list);

    if (ex.disclaimer) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = ex.disclaimer;
      card.appendChild(p);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    button.textContent = "Load example " + ex.id;
    button.addEventListener("click", () => loadJudgeExample(ex));
    card.appendChild(button);

    host.appendChild(card);
  });
}

function loadJudgeExample(ex) {
  const claim = document.getElementById("judgeClaim");
  const evidence = document.getElementById("judgeEvidence");
  const expected = document.getElementById("judgeExpectedHash");
  const observed = document.getElementById("judgeObservedHash");
  if (!ex || !claim || !evidence || !expected || !observed) return;
  claim.value = ex.claim || "";
  evidence.value = ex.evidence || "";
  expected.value = ex.expected_hash || "";
  observed.value = ex.observed_hash || "";
  document.querySelectorAll('input[name="judgesource"]').forEach((radio) => {
    radio.checked = radio.value === ex.source_type;
  });
  onJudgeClassify();
}

function judgeInputState() {
  const claim = document.getElementById("judgeClaim");
  const evidence = document.getElementById("judgeEvidence");
  const expected = document.getElementById("judgeExpectedHash");
  const observed = document.getElementById("judgeObservedHash");
  const selected = document.querySelector('input[name="judgesource"]:checked');
  return {
    claim: claim ? claim.value : "",
    evidence: evidence ? evidence.value : "",
    sourceType: selected ? selected.value : "NONE",
    expectedHash: expected ? expected.value : "",
    observedHash: observed ? observed.value : ""
  };
}

function onJudgeClassify() {
  const result = classifyJudge(judgeInputState());
  writeOut("judgeOut", formatJudgeResult(result));
}

function onJudgeClear() {
  const claim = document.getElementById("judgeClaim");
  const evidence = document.getElementById("judgeEvidence");
  const expected = document.getElementById("judgeExpectedHash");
  const observed = document.getElementById("judgeObservedHash");
  if (claim) claim.value = "";
  if (evidence) evidence.value = "";
  if (expected) expected.value = "";
  if (observed) observed.value = "";
  document.querySelectorAll('input[name="judgesource"]').forEach((radio) => {
    radio.checked = radio.value === "NONE";
  });
  writeOut("judgeOut", "");
  if (claim) claim.focus();
}

function runJudgeTests() {
  const results = [];
  const add = (id, pass, detail) => results.push({ id: id, pass: Boolean(pass), detail: detail || "" });

  if (!JUDGE_CONFIG) {
    add("JUDGE_CONFIG_AVAILABLE", false, "knowledge source unavailable");
    return { results: results, allPass: false };
  }

  const digestOfAbc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  const zeroDigest = "0000000000000000000000000000000000000000000000000000000000000000";

  const cases = [
    { id: "EMPTY_CLAIM", in: { claim: "", evidence: "Evidence text.", sourceType: "DOCUMENT" }, expect: "UNKNOWN" },
    { id: "CLAIM_ONLY", in: { claim: "Statement under review.", evidence: "", sourceType: "NONE" }, expect: "CLAIM" },
    {
      id: "USER_ASSERTION_WITH_EVIDENCE",
      in: { claim: "The system works as intended.", evidence: "A user reports success.", sourceType: "USER_ASSERTION" },
      expect: "INSUFFICIENT_EVIDENCE"
    },
    {
      id: "DOCUMENT_WITH_EVIDENCE",
      in: { claim: "The interface is specified.", evidence: "Public specification document.", sourceType: "DOCUMENT" },
      expect: "EVIDENCE"
    },
    {
      id: "HASH_MATCH_VALID_SHA256",
      in: {
        claim: "The file matches the manifest.",
        evidence: "SHA-256 manifest entry for artifact.txt.",
        sourceType: "HASHED_ARTIFACT",
        expectedHash: digestOfAbc,
        observedHash: digestOfAbc
      },
      expect: "VERIFIED_ARTIFACT",
      hashCheck: "MATCH"
    },
    {
      id: "HASH_MISMATCH",
      in: {
        claim: "The file matches the manifest.",
        evidence: "SHA-256 manifest entry for artifact.txt.",
        sourceType: "HASHED_ARTIFACT",
        expectedHash: digestOfAbc,
        observedHash: zeroDigest
      },
      expect: "INSUFFICIENT_EVIDENCE",
      hashCheck: "MISMATCH"
    },
    {
      id: "HASH_INVALID_FORMAT",
      in: {
        claim: "The file matches the manifest.",
        evidence: "SHA-256 manifest entry for artifact.txt.",
        sourceType: "HASHED_ARTIFACT",
        expectedHash: "abc123",
        observedHash: "abc123"
      },
      expect: "INSUFFICIENT_EVIDENCE",
      hashCheck: "INVALID_FORMAT"
    },
    {
      id: "TEST_RESULT",
      in: { claim: "The suite passes.", evidence: "23 tests passed locally.", sourceType: "TEST_RESULT" },
      expect: "EVIDENCE"
    },
    {
      id: "REPRODUCIBLE_EXECUTION",
      in: { claim: "The run reproduces.", evidence: "The same script produced the same output.", sourceType: "REPRODUCIBLE_EXECUTION" },
      expect: "VERIFIED_ARTIFACT"
    },
    {
      id: "INDEPENDENT_REPRODUCTION",
      in: { claim: "The result was reproduced.", evidence: "A second machine matched the output.", sourceType: "INDEPENDENT_REPRODUCTION" },
      expect: "REPRODUCED"
    },
    {
      id: "CONSCIOUSNESS_ASSERTION",
      in: { claim: "AXYOM is conscious.", evidence: "It seems conscious.", sourceType: "USER_ASSERTION" },
      expect: "INSUFFICIENT_EVIDENCE"
    },
    {
      id: "NO_SOURCE_TYPE_WITH_EVIDENCE",
      in: { claim: "Statement under review.", evidence: "Evidence text.", sourceType: "NONE" },
      expect: "INSUFFICIENT_EVIDENCE"
    },
    {
      id: "UNRECOGNIZED_SOURCE_TYPE",
      in: { claim: "Statement under review.", evidence: "Evidence text.", sourceType: "ORACLE" },
      expect: "UNKNOWN"
    },
    {
      id: "SINGLE_HASH_PROVIDED",
      in: {
        claim: "The file matches the manifest.",
        evidence: "SHA-256 manifest entry for artifact.txt.",
        sourceType: "HASHED_ARTIFACT",
        expectedHash: digestOfAbc,
        observedHash: ""
      },
      expect: "INSUFFICIENT_EVIDENCE",
      hashCheck: "INCOMPLETE"
    },
    {
      id: "HASH_NOT_PROVIDED",
      in: {
        claim: "The file matches the manifest.",
        evidence: "SHA-256 manifest entry for artifact.txt.",
        sourceType: "HASHED_ARTIFACT",
        expectedHash: "",
        observedHash: ""
      },
      expect: "INSUFFICIENT_EVIDENCE",
      hashCheck: "NOT_PROVIDED"
    },
    {
      id: "HASH_COMPARISON_EXACT_CASE",
      in: {
        claim: "The file matches the manifest.",
        evidence: "SHA-256 manifest entry for artifact.txt.",
        sourceType: "HASHED_ARTIFACT",
        expectedHash: digestOfAbc.toUpperCase(),
        observedHash: digestOfAbc
      },
      expect: "INSUFFICIENT_EVIDENCE",
      hashCheck: "MISMATCH"
    }
  ];

  const classified = [];
  for (const testCase of cases) {
    let pass = false;
    let detail = "";
    try {
      const r = classifyJudge(testCase.in);
      classified.push(r);
      let hashOk = true;
      if (testCase.hashCheck) hashOk = r.hashCheck === testCase.hashCheck;
      pass = !r.error && r.classification === testCase.expect && hashOk;
      detail = "got=" + r.classification + " expected=" + testCase.expect +
        " hashCheck=" + r.hashCheck + " strength=" + r.strength;
    } catch (e) {
      detail = String(e);
    }
    add(testCase.id, pass, detail);
  }

  try {
    const allowed = JUDGE_CONFIG.allowed_classifications;
    const forbidden = JUDGE_CONFIG.forbidden_classifications;
    const vocabularyOk = classified.every((r) =>
      allowed.indexOf(r.classification) !== -1 && forbidden.indexOf(r.classification) === -1);
    add("CLASSIFICATION_VOCABULARY", vocabularyOk,
      allowed.join(",") + " | forbidden=" + forbidden.join(","));

    const scale = JUDGE_CONFIG.strength_scale;
    const strengthOk = classified.every((r) => scale.indexOf(r.strength) !== -1);
    add("EVIDENCE_STRENGTH_VOCABULARY", strengthOk, scale.join(","));

    const noteById = {
      TEST_RESULT: JUDGE_CONFIG.notes.TEST_RESULT,
      REPRODUCIBLE_EXECUTION: JUDGE_CONFIG.notes.REPRODUCIBLE_EXECUTION,
      INDEPENDENT_REPRODUCTION: JUDGE_CONFIG.notes.INDEPENDENT_REPRODUCTION
    };
    const notesOk = Object.keys(noteById).every((key) => {
      const r = classifyJudge({
        claim: "Statement under review.",
        evidence: "Evidence text.",
        sourceType: key
      });
      return r.note === noteById[key];
    });
    add("NOTES_FOR_RULES_6_7_8", notesOk, "rule notes read from agent_judge.notes");
  } catch (e) {
    add("CLASSIFICATION_GUARDS", false, String(e));
  }

  if (Array.isArray(JUDGE_CONFIG.examples)) {
    JUDGE_CONFIG.examples.forEach((ex) => {
      let pass = false;
      let detail = "";
      try {
        const r = classifyJudge({
          claim: ex.claim,
          evidence: ex.evidence,
          sourceType: ex.source_type,
          expectedHash: ex.expected_hash,
          observedHash: ex.observed_hash
        });
        classified.push(r);
        pass = r.classification === ex.expected_classification;
        detail = "got=" + r.classification + " expected=" + ex.expected_classification;
      } catch (e) {
        detail = String(e);
      }
      add("EXAMPLE_" + ex.id, pass, detail);
    });
  } else {
    add("EXAMPLES_AVAILABLE", false, "agent_judge.examples missing");
  }

  const allPass = results.length > 0 && results.every((r) => r.pass);
  return { results: results, allPass: allPass };
}

function renderJudgeTests() {
  const run = runJudgeTests();
  const lines = run.results.map((r) => {
    return r.id + "=" + (r.pass ? "PASS" : "FAIL") + (r.detail ? "\n  " + r.detail : "");
  });
  lines.push("JUDGE_TESTS_GLOBAL_PASS=" + (run.allPass ? "TRUE" : "FALSE"));
  writeOut("judgeTestsOut", lines.join("\n"));
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

const judgeBtn = document.getElementById("judgeBtn");
const judgeClearBtn = document.getElementById("judgeClearBtn");
const judgeTestsBtn = document.getElementById("judgeTestsBtn");
const judgeClaim = document.getElementById("judgeClaim");
const judgeEvidence = document.getElementById("judgeEvidence");
const judgeExpectedHash = document.getElementById("judgeExpectedHash");
const judgeObservedHash = document.getElementById("judgeObservedHash");
if (judgeBtn) judgeBtn.addEventListener("click", onJudgeClassify);
if (judgeClearBtn) judgeClearBtn.addEventListener("click", onJudgeClear);
if (judgeTestsBtn) judgeTestsBtn.addEventListener("click", renderJudgeTests);
[judgeClaim, judgeEvidence, judgeExpectedHash, judgeObservedHash].forEach((field) => {
  if (field) field.addEventListener("input", onJudgeClassify);
});
document.querySelectorAll('input[name="judgesource"]').forEach((radio) => {
  radio.addEventListener("change", onJudgeClassify);
});

renderEvidence();
onVectors();
renderGovernorTests();
renderJudgeRules();
renderJudgeExamples();
renderJudgeTests();
onJudgeClassify();

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
  judge: {
    config: JUDGE_CONFIG,
    hashCheck: judgeHashCheck,
    classify: classifyJudge,
    format: formatJudgeResult,
    runTests: runJudgeTests
  },
  ui: {
    onHash: onHash,
    onCompare: onCompare,
    onVectors: onVectors,
    onGovernEvaluate: onGovernEvaluate,
    renderGovernorTests: renderGovernorTests,
    onJudgeClassify: onJudgeClassify,
    renderJudgeTests: renderJudgeTests,
    loadJudgeExample: loadJudgeExample
  }
};
