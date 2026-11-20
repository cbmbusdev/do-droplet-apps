from __future__ import annotations

import argparse
import json
import sys

from . import __version__
from .client import Translator
from .errors import TranslateError
from .languages import LANGUAGES


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="gtranslate",
        description="Translate text using Google Translate's public web endpoint.",
    )
    parser.add_argument("text", nargs="*", help="text to translate; reads stdin if omitted")
    parser.add_argument("-t", "--to", default="en", metavar="LANG", help="target language (default: en)")
    parser.add_argument("-f", "--from", dest="source", default="auto", metavar="LANG",
                        help="source language (default: auto)")
    parser.add_argument("-j", "--json", action="store_true", help="emit JSON with detected language")
    parser.add_argument("-d", "--detect", action="store_true", help="print the detected language and exit")
    parser.add_argument("--pause", type=float, default=0.0, metavar="SECONDS",
                        help="delay between chunks for long input")
    parser.add_argument("--timeout", type=float, default=30.0, metavar="SECONDS")
    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--no-fallback", action="store_true", help="disable the secondary endpoint")
    parser.add_argument("--languages", action="store_true", help="list supported language codes and exit")
    parser.add_argument("-V", "--version", action="version", version=f"gtranslate {__version__}")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.languages:
        for code, name in sorted(LANGUAGES.items(), key=lambda kv: kv[1]):
            print(f"{code:<10} {name}")
        return 0

    text = " ".join(args.text) if args.text else sys.stdin.read()
    if not text.strip():
        print("gtranslate: no input text", file=sys.stderr)
        return 2

    translator = Translator(
        timeout=args.timeout,
        retries=args.retries,
        pause=args.pause,
        use_fallback=not args.no_fallback,
    )
    try:
        with translator:
            if args.detect:
                print(translator.detect(text))
                return 0
            result = translator.translate(text, to=args.to, source=args.source)
    except TranslateError as exc:
        print(f"gtranslate: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130

    if args.json:
        print(json.dumps({
            "text": result.text,
            "source": result.source,
            "target": result.target,
            "chunks": result.chunks,
        }, ensure_ascii=False, indent=2))
    else:
        print(result.text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
