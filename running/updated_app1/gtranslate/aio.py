from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass, field
from typing import Iterable, Sequence

from . import protocol
from .chunking import split_text
from .client import RETRY_STATUS, USER_AGENT, Result
from .errors import HTTPError, ParseError, RejectedError, TranslateError
from .languages import normalize

try:
    import httpx
except ModuleNotFoundError as exc:
    raise ModuleNotFoundError(
        "AsyncTranslator needs httpx: pip install 'gtranslate-free[async]'"
    ) from exc


@dataclass
class AsyncTranslator:
    retries: int = 4
    timeout: float = 30.0
    backoff: float = 0.5
    concurrency: int = 8
    use_fallback: bool = True
    client: httpx.AsyncClient = field(default=None)

    def __post_init__(self) -> None:
        if self.client is None:
            self.client = httpx.AsyncClient(
                headers={"User-Agent": USER_AGENT}, timeout=self.timeout
            )
        self._sem = asyncio.Semaphore(max(1, self.concurrency))

    async def __aenter__(self) -> "AsyncTranslator":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self.client.aclose()

    async def translate(self, text: str, to: str = "en", source: str = "auto") -> Result:
        target = normalize(to)
        src = normalize(source)
        if not text or not text.strip():
            return Result(text=text, source=src, target=target, chunks=0)

        parts = split_text(text, protocol.MAX_CHARS)
        pairs = await asyncio.gather(
            *(self._translate_one(part, target, src) for part in parts)
        )
        detected = next((s for _, s in pairs if s), None)
        return Result(
            text="".join(t for t, _ in pairs),
            source=detected or src,
            target=target,
            chunks=len(parts),
        )

    async def translate_batch(
        self, texts: Sequence[str] | Iterable[str], to: str = "en", source: str = "auto"
    ) -> list[Result]:
        return list(
            await asyncio.gather(
                *(self.translate(t, to=to, source=source) for t in texts)
            )
        )

    async def detect(self, text: str) -> str:
        if not text or not text.strip():
            raise ValueError("cannot detect the language of empty text")
        result = await self.translate(text[: protocol.MAX_CHARS], to="en", source="auto")
        return result.source

    async def _translate_one(
        self, text: str, target: str, source: str
    ) -> tuple[str, str | None]:
        async with self._sem:
            last: Exception | None = None
            for attempt in range(max(1, self.retries)):
                try:
                    return await self._rpc(text, target, source)
                except (RejectedError, ParseError) as exc:
                    last = exc
                    break
                except (HTTPError, httpx.HTTPError) as exc:
                    last = exc
                    if isinstance(exc, HTTPError) and exc.status not in RETRY_STATUS:
                        break
                    if attempt < self.retries - 1:
                        await asyncio.sleep(
                            self.backoff * (2 ** attempt) + random.random() * 0.3
                        )
            if self.use_fallback:
                try:
                    return await self._fallback(text, target, source)
                except Exception:
                    pass
            raise last if last else TranslateError("translation failed")

    async def _rpc(self, text: str, target: str, source: str) -> tuple[str, str | None]:
        response = await self.client.post(
            protocol.RPC_URL,
            params=protocol.RPC_PARAMS,
            content=protocol.build_body(text, target, source),
            headers=protocol.RPC_HEADERS,
        )
        if response.status_code != 200:
            raise HTTPError(response.status_code, response.text[:500])
        return protocol.parse_response(response.text)

    async def _fallback(
        self, text: str, target: str, source: str
    ) -> tuple[str, str | None]:
        response = await self.client.get(
            protocol.FALLBACK_URL,
            params=protocol.fallback_params(text, target, source),
        )
        if response.status_code != 200:
            raise HTTPError(response.status_code, response.text[:500])
        return protocol.parse_fallback(response.json())
