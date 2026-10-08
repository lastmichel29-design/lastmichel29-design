#!/usr/bin/env python3
"""Static validation gate for the AXYOM public showcase.

Standard library only, no network access. Used by
.github/workflows/public-demo-check.yml and runnable locally:

    python tools/public_demo_check.py

Exit code 0 = all checks pass, 1 = at least one check failed.
"""

import json
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

REQUIRED_FILES = [
    "README.md",
    "NOTICE.md",
    "docs/index.html",
    "docs/styles.css",
    "docs/app.js",
    "docs/public_agent_knowledge.json",
    "docs/robots.txt",
    "docs/sitemap.xml",
    "tools/knowledge_sync.py",
    ".github/workflows/public-demo-check.yml",
]

# Public site files scanned for placeholders and copy-precision issues.
CONTENT_GLOBS = ["docs/*.html", "docs/*.js", "docs/*.css", "README.md", "NOTICE.md"]

# Files whose *runtime* network surface must stay empty.
RUNTIME_JS = ["docs/app.js"]

PLACEHOLDERS = ["[ADD ", "TODO", "FIXME", "TBD"]

# Assembled at runtime so this file does not match its own scan.
SECRET_PATTERNS = [
    "OPENAI" + "_API_KEY",
    "ANTHROPIC" + "_API_KEY",
    "TWILIO" + "_AUTH_TOKEN",
    "BEGIN " + "PRIVATE KEY",
    "pass" + "word=",
    "pass" + "word: ",
    "sec" + "ret=",
    "Bear" + "er ",
    "sk-" + r"[A-Za-z0-9]{20,}",
    "gh" + r"[pousr]_[A-Za-z0-9]{20,}",
    "github_" + r"pat_[A-Za-z0-9_]{20,}",
    "personal " + "access token",
    "C:" + r"[\\/]" + "Users" + r"[\\/]",
    "C:" + r"[\\/]" + "AXYOM" + r"_" + "PRIVATE_KEYS",
]

RUNTIME_NETWORK_PATTERNS = [
    "fetch(",
    "XMLHttpRequest",
    "WebSocket",
    "http://",
    "https://",
]

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print("%s=%s%s" % (name, "PASS" if ok else "FAIL", (" | " + detail) if detail else ""))
    return bool(ok)


def iter_files():
    """Yield git-tracked files (the published surface).

    Untracked local work notes are intentionally out of scope: they are never
    committed. Falls back to a plain walk when git is unavailable.
    """
    try:
        proc = subprocess.run(["git", "ls-files", "-z"], capture_output=True, check=True, cwd=str(ROOT))
        rels = [r for r in proc.stdout.decode("utf-8", "replace").split("\0") if r]
    except Exception:  # noqa: BLE001
        rels = None
    if rels is not None:
        for rel in rels:
            path = ROOT / rel
            if path.is_file():
                yield path
        return
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in {".git", "node_modules", "__pycache__"}]
        for name in filenames:
            yield pathlib.Path(dirpath) / name


def read_text(path):
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def main():
    # 1. knowledge JSON parses
    try:
        json.loads(read_text(DOCS / "public_agent_knowledge.json"))
        check("JSON_VALID", True)
    except Exception as exc:  # noqa: BLE001
        check("JSON_VALID", False, str(exc))

    # 2. mirror stays synchronized
    proc = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "knowledge_sync.py"), "check"],
        capture_output=True, text=True, cwd=str(ROOT),
    )
    check("KNOWLEDGE_SYNC", proc.returncode == 0,
          " ".join((proc.stdout or proc.stderr).split())[:160])

    # 3. required files exist
    missing = [rel for rel in REQUIRED_FILES if not (ROOT / rel).is_file()]
    check("REQUIRED_FILES", not missing, ",".join(missing) or "all present")

    # 4. secret / credential / private-path scan
    secret_hits = []
    for path in iter_files():
        text = read_text(path)
        for pattern in SECRET_PATTERNS:
            if re.search(pattern, text):
                secret_hits.append("%s:%s" % (path.relative_to(ROOT), pattern))
    check("PRIVATE_SECRET_FINDINGS", not secret_hits, ",".join(secret_hits[:5]) or "0 findings")

    # 5. unresolved placeholders in public content
    placeholder_hits = []
    for pattern in CONTENT_GLOBS:
        for path in ROOT.glob(pattern):
            text = read_text(path)
            for token in PLACEHOLDERS:
                if token in text:
                    placeholder_hits.append("%s:%s" % (path.relative_to(ROOT), token))
    check("UNRESOLVED_PLACEHOLDERS", not placeholder_hits, ",".join(placeholder_hits[:5]) or "0 findings")

    # 6. forbidden runtime networking in the demo JavaScript
    net_hits = []
    for rel in RUNTIME_JS:
        text = read_text(ROOT / rel)
        for token in RUNTIME_NETWORK_PATTERNS:
            if token in text:
                net_hits.append("%s:%s" % (rel, token))
    check("RUNTIME_EXTERNAL_NETWORK_CALLS", not net_hits, ",".join(net_hits) or "0 findings")

    # 7. required public elements in the page
    html = read_text(DOCS / "index.html")
    required_elements = [
        "<title>AXYOM",
        'name="description"',
        'name="author"',
        'rel="canonical"',
        'property="og:title"',
        'name="twitter:card"',
        'id="lab"',
        'id="governor"',
        'id="judge"',
        'id="evidence"',
        'id="boundaries"',
        "<footer",
        "<noscript>",
    ]
    missing_elements = [e for e in required_elements if e not in html]
    check("HTML_REQUIRED_ELEMENTS", not missing_elements, ",".join(missing_elements) or "all present")

    failed = [name for name, ok, _ in results if not ok]
    print("PUBLIC_DEMO_CHECK=%s" % ("PASS" if not failed else "FAIL"))
    if failed:
        print("FAILED_CHECKS=" + ",".join(failed))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
