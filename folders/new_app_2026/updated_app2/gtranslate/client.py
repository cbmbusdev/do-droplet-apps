from __future__ import annotations

import random
import time
from dataclasses import dataclass, field
from typing import Iterable, Sequence

import requests

from . import protocol
from .chunking import split_text
from .errors import HTTPError, ParseError, RejectedError, TranslateError
from .languages import normalize

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
RETRY_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})


@dataclass
class Result:
    text: str
    source: str
    target: str
    chunks: int = 1

    def __str__(self) -> str:
        return self.text


@dataclass
class Translator:
    retries: int = 4
    timeout: float = 30.0
    pause: float = 0.0
    backoff: float = 0.5
    use_fallback: bool = True
    session: requests.Session = field(default_factory=requests.Session)

    def __post_init__(self) -> None:
        self.session.headers.setdefault("User-Agent", USER_AGENT)

    def __enter__(self) -> "Translator":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        self.session.close()

    def translate(self, text: str, to: str = "en", source: str = "auto") -> Result:
        target = normalize(to)
        src = normalize(source)
        if not text or not text.strip():
            return Result(text=text, source=src, target=target, chunks=0)

        parts = split_text(text, protocol.MAX_CHARS)
        out: list[str] = []
        detected: str | None = None
        for index, part in enumerate(parts):
            chunk_text, chunk_src = self._translate_one(part, target, src)
            out.append(chunk_text)
            detected = detected or chunk_src
            if self.pause and index < len(parts) - 1:
                time.sleep(self.pause)
        return Result(
            text="".join(out),
            source=detected or src,
            target=target,
            chunks=len(parts),
        )

    def translate_batch(
        self, texts: Sequence[str] | Iterable[str], to: str = "en", source: str = "auto"
    ) -> list[Result]:
        items = list(texts)
        results: list[Result] = []
        for index, item in enumerate(items):
            results.append(self.translate(item, to=to, source=source))
            if self.pause and index < len(items) - 1:
                time.sleep(self.pause)
        return results

    def detect(self, text: str) -> str:
        if not text or not text.strip():
            raise ValueError("cannot detect the language of empty text")
        probe = text[: protocol.MAX_CHARS]
        return self.translate(probe, to="en", source="auto").source

    def _translate_one(self, text: str, target: str, source: str) -> tuple[str, str | None]:
        last: Exception | None = None
        for attempt in range(max(1, self.retries)):
            try:
                return self._rpc(text, target, source)
            except (RejectedError, ParseError) as exc:
                last = exc
                break
            except (HTTPError, requests.RequestException) as exc:
                last = exc
                if isinstance(exc, HTTPError) and exc.status not in RETRY_STATUS:
                    break
                if attempt < self.retries - 1:
                    time.sleep(self.backoff * (2 ** attempt) + random.random() * 0.3)
        if self.use_fallback:
            try:
                return self._fallback(text, target, source)
            except Exception:
                pass
        raise last if last else TranslateError("translation failed")

    def _rpc(self, text: str, target: str, source: str) -> tuple[str, str | None]:
        response = self.session.post(
            protocol.RPC_URL,
            params=protocol.RPC_PARAMS,
            data=protocol.build_body(text, target, source),
            headers=protocol.RPC_HEADERS,
            timeout=self.timeout,
        )
        if response.status_code != 200:
            raise HTTPError(response.status_code, response.text[:500])
        return protocol.parse_response(response.text)

    def _fallback(self, text: str, target: str, source: str) -> tuple[str, str | None]:
        response = self.session.get(
            protocol.FALLBACK_URL,
            params=protocol.fallback_params(text, target, source),
            timeout=self.timeout,
        )
        if response.status_code != 200:
            raise HTTPError(response.status_code, response.text[:500])
        return protocol.parse_fallback(response.json())


_default: Translator | None = None


def _shared() -> Translator:
    global _default
    if _default is None:
        _default = Translator()
    return _default


def translate(text: str, to: str = "en", source: str = "auto") -> str:
    return _shared().translate(text, to=to, source=source).text


def translate_batch(
    texts: Sequence[str] | Iterable[str], to: str = "en", source: str = "auto"
) -> list[str]:
    return [r.text for r in _shared().translate_batch(texts, to=to, source=source)]


def detect(text: str) -> str:
    return _shared().detect(text)
