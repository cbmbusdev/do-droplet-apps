from __future__ import annotations

import re

_SPLIT = re.compile(r"(\n\n+|\n|(?<=[.!?;:۔。！？；：])\s+)")


def split_text(text: str, limit: int) -> list[str]:
    if limit <= 0:
        raise ValueError("limit must be positive")
    if len(text) <= limit:
        return [text] if text else []

    pieces = [p for p in _SPLIT.split(text) if p]
    chunks: list[str] = []
    buf = ""
    for piece in pieces:
        if len(buf) + len(piece) <= limit:
            buf += piece
            continue
        if buf:
            chunks.append(buf)
            buf = ""
        if len(piece) <= limit:
            buf = piece
            continue
        for part in _hard_split(piece, limit):
            if len(part) == limit:
                chunks.append(part)
            else:
                buf = part
    if buf:
        chunks.append(buf)
    return chunks


def _hard_split(piece: str, limit: int) -> list[str]:
    parts: list[str] = []
    while len(piece) > limit:
        cut = piece.rfind(" ", 0, limit + 1)
        if cut <= 0:
            cut = limit
        parts.append(piece[:cut])
        piece = piece[cut:].lstrip() if cut < len(piece) and piece[cut] == " " else piece[cut:]
    if piece:
        parts.append(piece)
    return parts
