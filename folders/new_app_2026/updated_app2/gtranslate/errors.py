from __future__ import annotations


class TranslateError(Exception):
    pass


class HTTPError(TranslateError):
    def __init__(self, status: int, body: str = "") -> None:
        super().__init__(f"upstream returned HTTP {status}")
        self.status = status
        self.body = body


class RejectedError(TranslateError):
    pass


class ParseError(TranslateError):
    pass


class TextTooLongError(TranslateError):
    def __init__(self, length: int, limit: int) -> None:
        super().__init__(f"text is {length} characters, limit is {limit}")
        self.length = length
        self.limit = limit
