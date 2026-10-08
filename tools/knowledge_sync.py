#!/usr/bin/env python3
"""Keep docs/public_agent_knowledge.json as the single source of truth.

The browser cannot read a .json file without a runtime network request, and
this demo publishes "no network request". The knowledge file is therefore
mirrored byte-for-byte into an inert data block in docs/index.html:

    <script type="application/json" id="public-knowledge"> ... </script>

docs/app.js only reads that block; it contains no knowledge strings of its own.

Modes:
    python tools/knowledge_sync.py check   # verify mirror is in sync (exit 1 on drift)
    python tools/knowledge_sync.py write   # regenerate the mirror from the JSON file

Only the Python standard library is used. No network access.
"""

import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "docs" / "public_agent_knowledge.json"
HTML_PATH = ROOT / "docs" / "index.html"

OPEN_TAG = '<script type="application/json" id="public-knowledge">'
CLOSE_TAG = "</script>"


def normalize(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def read_text(path: pathlib.Path) -> str:
    return normalize(path.read_bytes().decode("utf-8"))


def extract_block(html: str) -> str | None:
    start = html.find(OPEN_TAG)
    if start == -1:
        return None
    start += len(OPEN_TAG)
    end = html.find(CLOSE_TAG, start)
    if end == -1:
        return None
    return html[start:end]


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    if mode not in ("check", "write"):
        print(f"unknown mode: {mode}", file=sys.stderr)
        return 2

    json_text = read_text(JSON_PATH)
    html_text = read_text(HTML_PATH)
    block = extract_block(html_text)

    if block is None:
        print("SYNC=FAIL reason=DATA_BLOCK_NOT_FOUND", file=sys.stderr)
        return 1

    if mode == "write":
        start = html_text.find(OPEN_TAG) + len(OPEN_TAG)
        end = html_text.find(CLOSE_TAG, start)
        new_html = html_text[:start] + json_text + html_text[end:]
        HTML_PATH.write_bytes(new_html.encode("utf-8"))
        print("SYNC=WRITTEN source=docs/public_agent_knowledge.json target=docs/index.html#public-knowledge")
        return 0

    if block == json_text:
        print("SYNC=PASS")
        print("SOURCE=docs/public_agent_knowledge.json")
        print("MIRROR=docs/index.html#public-knowledge")
        print(f"BYTES={len(json_text.encode('utf-8'))}")
        return 0

    print("SYNC=FAIL reason=DRIFT between JSON source and HTML mirror", file=sys.stderr)
    print("ACTION=run: python tools/knowledge_sync.py write", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
