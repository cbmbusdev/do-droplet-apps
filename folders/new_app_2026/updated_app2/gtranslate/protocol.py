from __future__ import annotations

import json
import urllib.parse
from typing import Any

from .errors import ParseError, RejectedError

RPC_URL = "https://translate.google.com/_/TranslateWebserverUi/data/batchexecute"
RPC_ID = "MkEWBc"
FALLBACK_URL = "https://clients5.google.com/translate_a/single"
MAX_CHARS = 5000

RPC_PARAMS = {"rpcids": RPC_ID, "rt": "c"}
RPC_HEADERS = {"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"}


def build_body(text: str, target: str, source: str = "auto") -> bytes:
    inner = json.dumps([[text, source, target, 1, None, 2], []], ensure_ascii=False)
    envelope = json.dumps([[[RPC_ID, inner, None, "generic"]]], ensure_ascii=False)
    return ("f.req=" + urllib.parse.quote(envelope)).encode("utf-8")


def parse_response(raw: str) -> tuple[str, str | None]:
    payload = _extract_payload(raw)
    try:
        sentences = payload[1][0][0][5]
        detected = payload[2]
    except (IndexError, TypeError, KeyError) as exc:
        raise ParseError(f"unexpected payload shape: {exc}") from exc
    if not isinstance(sentences, list):
        raise ParseError("sentence list missing from payload")
    return join_sentences(sentences), detected if isinstance(detected, str) else None


def _extract_payload(raw: str) -> Any:
    for line in raw.splitlines():
        line = line.strip()
        if not line.startswith('[["wrb.fr"'):
            continue
        try:
            envelope = json.loads(line)
        except json.JSONDecodeError:
            continue
        for frame in envelope:
            if not isinstance(frame, list) or len(frame) < 3:
                continue
            if frame[0] != "wrb.fr" or frame[1] != RPC_ID:
                continue
            if frame[2] is None:
                raise RejectedError(
                    "upstream returned an empty payload; the text is over "
                    f"{MAX_CHARS} characters or was rejected"
                )
            try:
                return json.loads(frame[2])
            except json.JSONDecodeError as exc:
                raise ParseError(f"inner payload is not valid JSON: {exc}") from exc
    raise ParseError("no wrb.fr frame found in response")


def join_sentences(sentences: list) -> str:
    out: list[str] = []
    for sentence in sentences:
        if not isinstance(sentence, list) or not sentence:
            continue
        if len(sentence) > 2 and sentence[2] and out:
            out.append(" ")
        out.append(sentence[0] or "")
    return "".join(out)


def fallback_params(text: str, target: str, source: str = "auto") -> dict[str, str]:
    return {
        "dj": "1",
        "dt": "t",
        "client": "dict-chrome-ex",
        "sl": source,
        "tl": target,
        "q": text,
    }


def parse_fallback(data: Any) -> tuple[str, str | None]:
    if not isinstance(data, dict):
        raise ParseError("fallback response was not a JSON object")
    sentences = data.get("sentences")
    if not isinstance(sentences, list):
        raise ParseError("fallback response had no sentences")
    text = "".join(s.get("trans", "") for s in sentences if isinstance(s, dict))
    src = data.get("src")
    return text, src if isinstance(src, str) else None
