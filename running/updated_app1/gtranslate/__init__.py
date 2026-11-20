from __future__ import annotations

from .client import Result, Translator, detect, translate, translate_batch
from .errors import (
    HTTPError,
    ParseError,
    RejectedError,
    TextTooLongError,
    TranslateError,
)
from .languages import LANGUAGES, is_supported, normalize
from .protocol import MAX_CHARS

__version__ = "0.1.0"

__all__ = [
    "LANGUAGES",
    "MAX_CHARS",
    "HTTPError",
    "ParseError",
    "RejectedError",
    "Result",
    "TextTooLongError",
    "TranslateError",
    "Translator",
    "__version__",
    "detect",
    "is_supported",
    "normalize",
    "translate",
    "translate_batch",
]


def __getattr__(name: str):
    if name == "AsyncTranslator":
        from .aio import AsyncTranslator

        return AsyncTranslator
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
