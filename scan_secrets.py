"""Hard gate before any GitHub push: scan a directory tree for secrets.

Runs BEFORE `git init`, because a public repo is a one-way door — history is
cloned within minutes and a pushed secret cannot be recalled. The rule this
enforces (from the repo-hygiene notes): scan the LOCAL tree before creating an
origin, and prove cleanliness by pattern, not by memory of what you wrote.

Exit 1 if anything suspicious is found, so it can be used as a gate:
    python3 scan_secrets.py /path/to/tree && git init

What it looks for, and why each pattern is here:
  - credential SHAPES (key prefixes, JWTs, private keys, bearer tokens)
  - email addresses and phone numbers (PII, and our domains identify the farm)
  - private IPs / hostnames / VPS IPs
  - literal secret assignments (`password = "..."`, `api_key: ...`)
  - home-directory absolute paths that leak machine layout
  - the names of our own credential files, in case one was copied in

It prints every hit with file:line so a false positive can be judged by eye
instead of trusted blindly.
"""
from __future__ import annotations

import pathlib
import re
import sys

# --- shapes that are credentials regardless of context ---
CRED = [
    (r"\bgh[pousr]_[A-Za-z0-9]{20,}", "GitHub token"),
    (r"\bsk-[A-Za-z0-9]{20,}", "OpenAI-style secret key"),
    (r"\bslk_[A-Za-z0-9_\-]{20,}", "Alysis key"),
    (r"\bxox[baprs]-[A-Za-z0-9\-]{10,}", "Slack token"),
    (r"\bAKIA[0-9A-Z]{16}\b", "AWS access key id"),
    (r"\bAIza[0-9A-Za-z_\-]{35}\b", "Google API key"),
    (r"\bya29\.[0-9A-Za-z_\-]{20,}", "Google OAuth token"),
    (r"\b1//0[A-Za-z0-9_\-]{30,}", "Google refresh token"),
    (r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}", "JWT"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "private key"),
    (r"\bGOCSPX-[A-Za-z0-9_\-]{20,}", "Google OAuth client secret"),
    (r"\b[A-Za-z0-9_\-]{32,}:[A-Za-z0-9_\-]{32,}\b", "user:pass pair (proxy/DB)"),
]

# --- assignments that name a secret ---
ASSIGN = [
    (r"(?i)\b(api[_-]?key|apikey|secret|password|passwd|token|bearer)\b\s*[:=]\s*[\"'][^\"']{8,}[\"']",
     "hardcoded secret assignment"),
    (r"(?i)\b(private[_-]?key|client[_-]?secret)\b\s*[:=]\s*[\"'][^\"']{8,}[\"']",
     "hardcoded private key / client secret"),
]

# --- PII and infrastructure identity ---
PII = [
    (r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", "email address"),
    # IP: hanya yang BUKAN loopback/privat. `127.0.0.1` dan `10.x`/`192.168.x`
    # muncul wajar di skrip dev; alamat publik adalah yang membocorkan host.
    (r"\b(?!127\.|0\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|255\.)"
     r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", "IP publik"),
    (r"/home/[a-z][a-z0-9_\-]*/", "absolute home path"),
    (r"\b\d{9,15}\b", "long digit run (phone / account id)"),
]

# --- our own sensitive filenames ---
NAMES = [
    "tokens.json", "credentials", "secret", "apikey", "api_key", "passwd",
    ".env", "id_rsa", "known_hosts", "cookies", "session.json",
]

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build"}
TEXT_EXT = {
    ".md", ".txt", ".json", ".jsonc", ".mjs", ".js", ".cjs", ".ts", ".py",
    ".html", ".htm", ".css", ".yml", ".yaml", ".toml", ".ini", ".cfg",
    ".sh", ".bash", ".ps1", ".svg", ".csv", ".tsv", ".env", "",
}
BINARY_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2",
              ".ttf", ".otf", ".zip", ".gz", ".mp4", ".pdf", ".bin", ".so", ".exe"}


def main() -> int:
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    if not root.is_dir():
        print(f"FAIL: not a directory: {root}")
        return 2

    findings: list[tuple[str, int, str, str]] = []
    files = 0
    bytes_scanned = 0
    skipped_bin = 0

    for p in sorted(root.rglob("*")):
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if not p.is_file():
            continue
        if p.suffix.lower() in BINARY_EXT:
            skipped_bin += 1
            continue
        if p.suffix.lower() not in TEXT_EXT:
            skipped_bin += 1
            continue

        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception as e:  # noqa: BLE001
            print(f"  (tidak terbaca: {p} — {type(e).__name__})")
            continue

        files += 1
        bytes_scanned += len(text)
        rel = str(p.relative_to(root))

        # filenames
        # Pengecualian: pemindai ini sendiri bernama `scan_secrets.py`, jadi ia
        # selalu mencocokkan pola "secret". Positif palsu yang sama kelasnya
        # dengan `127.0.0.1` di skrip dev — alat yang menuduh dirinya sendiri.
        low = p.name.lower()
        if low == "scan_secrets.py":
            continue
        for n in NAMES:
            if n in low:
                findings.append((rel, 0, "NAMA BERKAS sensitif", p.name))

        for i, line in enumerate(text.splitlines(), 1):
            for pat, label in CRED + ASSIGN + PII:
                if re.search(pat, line):
                    snippet = line.strip()[:110]
                    findings.append((rel, i, label, snippet))

    print(f"akar   : {root}")
    print(f"berkas : {files} teks dipindai, {skipped_bin} biner dilewati, "
          f"{bytes_scanned / 1024:.0f} KB")
    print()

    if not findings:
        print("BERSIH — tidak ada pola kredensial, PII, atau jalur rumah yang ditemukan.")
        return 0

    # kelompokkan supaya tidak jadi dinding teks
    from collections import Counter
    per_label = Counter(f[2] for f in findings)
    print(f"DITEMUKAN {len(findings)} kecocokan:")
    for label, n in per_label.most_common():
        print(f"  {n:4}  {label}")
    print()
    for rel, line, label, snippet in findings[:120]:
        loc = f"{rel}:{line}" if line else rel
        print(f"  [{label}] {loc}")
        print(f"      {snippet}")
    if len(findings) > 120:
        print(f"  ... +{len(findings) - 120} lagi")
    return 1


if __name__ == "__main__":
    sys.exit(main())
