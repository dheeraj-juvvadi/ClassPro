#!/usr/bin/env python3
"""Persistent JSONL CAPTCHA recognition worker (ddddocr, CPU, fully offline).

Protocol: one JSON object per line on stdin, one per line on stdout.
  in : {"id": <any>, "image": "<base64 PNG or data: URL>"}
  out: {"id": <any>, "candidates": [{"answer", "engine", "confidence",
                                     "minCharConfidence"}]}
       {"id": <any>, "error": "OCR_FAILED"}   (reasons go to stderr, never image data)

stdout carries responses only (no banners, no model chatter). Diagnostics go to
stderr. Image bytes are never echoed into replies or diagnostics.

Run:
  portal-app/.venv-ocr/bin/python portal-app/scripts/captcha-worker.py
Setup:
  python3.12 -m venv portal-app/.venv-ocr
  portal-app/.venv-ocr/bin/pip install -r portal-app/requirements-ocr.txt
"""
from __future__ import annotations

import base64
import binascii
import json
import re
import sys
import time

# Exact mixed-case alphanumeric charset: case matters for these challenges.
CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
ANSWER_RE = re.compile(r"^[A-Za-z0-9]{3,10}$")
DATA_URL_RE = re.compile(r"^data:image/[A-Za-z0-9.+-]+;base64,", re.IGNORECASE)
# Anything long enough to be an embedded image payload, if it ever reached a message.
BLOB_RE = re.compile(r"[A-Za-z0-9+/=]{40,}")

MAX_LINE_BYTES = 1_400_000      # ~1 MB image after base64 + JSON overhead
MAX_IMAGE_BYTES = 1_000_000     # decoded image ceiling
ENGINE = "ddddocr"


def load_engine():
    """Import and warm the model once, before the request loop starts."""
    import ddddocr

    started = time.perf_counter()
    ocr = ddddocr.DdddOcr(show_ad=False)  # show_ad=False: no stdout banners
    ocr.set_ranges(CHARSET)
    return ocr, (time.perf_counter() - started) * 1000.0


def sanitize(message, limit=160):
    """Short reason text that can never carry an embedded image payload."""
    text = BLOB_RE.sub("<redacted>", str(message)).replace("\n", " ").strip()
    return text[:limit]


def decode(ocr, image_bytes):
    """One deterministic CTC decode; returns candidates or raises."""
    payload = ocr.classification(image_bytes, probability=True)
    charsets = payload.get("charsets") or []
    steps = payload.get("probability") or []
    chars, confidences = [], []
    previous = None
    for step in steps:
        if not step:
            continue
        index = max(range(len(step)), key=step.__getitem__)
        char = charsets[index] if index < len(charsets) else ""
        # Greedy CTC: drop the blank symbol and collapsed repeats. This is what
        # makes the decode unambiguous instead of a per-frame dump.
        if char == previous:
            continue
        previous = char
        if char == "":
            continue
        chars.append(char)
        confidences.append(float(step[index]))
    answer = "".join(chars)
    if not ANSWER_RE.match(answer):
        raise ValueError(f"decoded {len(answer)} char(s) outside alnum 3-10")
    return [{
        "answer": answer,
        "engine": ENGINE,
        "confidence": round(sum(confidences) / len(confidences) * 100, 2),
        "minCharConfidence": round(min(confidences) * 100, 2),
    }]


def extract_image(raw):
    """Accept base64 or data: URL strings; enforce the decoded size bound."""
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError("image must be a non-empty base64 string")
    encoded = DATA_URL_RE.sub("", raw.strip())
    try:
        image = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"invalid base64 image: {exc}") from exc
    if not image:
        raise ValueError("empty image payload")
    if len(image) > MAX_IMAGE_BYTES:
        raise ValueError(f"image {len(image)}B exceeds {MAX_IMAGE_BYTES}B limit")
    return image


def read_line(stream, limit):
    """Read one line bounded to `limit` bytes. None at EOF, b'<oversize>' if longer.

    Keeps the stream framed: an oversized line is drained to its newline so the
    next request still parses, and memory stays bounded regardless of input.
    """
    chunk = stream.readline(limit + 1)
    if not chunk:
        return None
    if len(chunk) > limit:
        while not chunk.endswith(b"\n"):
            chunk = stream.readline(limit + 1)
            if not chunk:
                break
        return b"<oversize>"
    return chunk


def emit(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def main():
    ocr, load_ms = load_engine()
    print(
        f"ready engine={ENGINE} charset={len(CHARSET)} model_load_ms={load_ms:.1f}",
        file=sys.stderr,
        flush=True,
    )
    handled = 0
    while True:
        line = read_line(sys.stdin.buffer, MAX_LINE_BYTES)
        if line is None:
            break
        if line == b"<oversize>":
            emit({"id": None, "error": "OCR_FAILED"})
            print(f"fail id=None reason=line exceeds {MAX_LINE_BYTES}B limit",
                  file=sys.stderr, flush=True)
            handled += 1
            continue
        stripped = line.strip()
        if not stripped:
            continue
        request_id = None
        try:
            request = json.loads(stripped)
            if not isinstance(request, dict):
                raise ValueError("request must be a JSON object")
            request_id = request.get("id")
            image = extract_image(request.get("image"))
            started = time.perf_counter()
            candidates = decode(ocr, image)
            elapsed_ms = (time.perf_counter() - started) * 1000.0
            emit({"id": request_id, "candidates": candidates})
            print(
                f"ok id={request_id!r} bytes={len(image)} chars={len(candidates[0]['answer'])}"
                f" conf={candidates[0]['confidence']} ms={elapsed_ms:.1f}",
                file=sys.stderr,
                flush=True,
            )
        except Exception as exc:  # any failure is OCR_FAILED, never a partial answer
            emit({"id": request_id, "error": "OCR_FAILED"})
            print(
                f"fail id={request_id!r} reason={sanitize(exc)}",
                file=sys.stderr,
                flush=True,
            )
        handled += 1
    print(f"eof after {handled} request(s)", file=sys.stderr, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
