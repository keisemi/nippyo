#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
PAGE_URL = os.environ.get("PAGE_URL", "").strip()
VERIFY_KIND = os.environ.get("VERIFY_KIND", "").strip()
ISSUE_BODY = os.environ.get("ISSUE_BODY", "")

RETRIES = 6
RETRY_SECONDS = 3


def section_value(body: str, label: str) -> str:
    match = re.search(
        rf"(?ms)^###\s+{re.escape(label)}\s*\n(.*?)(?=^###\s+|\Z)",
        body or "",
    )
    if not match:
        return ""
    value = match.group(1).strip()
    return "" if value == "No response" else value


def remote_url(relative: str) -> str:
    base = PAGE_URL if PAGE_URL.endswith("/") else PAGE_URL + "/"
    url = urllib.parse.urljoin(base, relative.lstrip("/"))
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}verify={time.time_ns()}"


def fetch(relative: str) -> bytes:
    last_error: Exception | None = None
    for attempt in range(RETRIES):
        request = urllib.request.Request(
            remote_url(relative),
            headers={
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "User-Agent": "nippyo-public-verifier/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}: {relative}")
                return response.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, RuntimeError) as error:
            last_error = error
            if attempt + 1 < RETRIES:
                time.sleep(RETRY_SECONDS)
    raise SystemExit(f"公開後確認に失敗しました: {relative}\n{last_error}")


def verify_exact(relative: str) -> None:
    local_path = DOCS / relative
    if not local_path.is_file():
        raise SystemExit(f"公開後確認用のローカルファイルがありません: {local_path}")
    local = local_path.read_bytes()
    remote = fetch(relative)
    if hashlib.sha256(local).digest() != hashlib.sha256(remote).digest():
        raise SystemExit(f"公開後確認で内容が一致しません: {relative}")
    print(f"公開後確認OK: {relative}")


def verify_book_data() -> None:
    verify_exact("data/books-last-updated.txt")
    verify_exact("data/books-search.json")


def verify_magazine_data() -> None:
    verify_exact("data/magazine-last-updated.txt")
    verify_exact("data/magazine-issues-search.json")


def verify_asset(path: Path) -> None:
    if not path.is_file():
        return
    relative = path.relative_to(DOCS).as_posix()
    verify_exact(relative)


def require_book_id() -> str:
    book_id = section_value(ISSUE_BODY, "書籍ID")
    if not re.fullmatch(r"(?:\d{5}|N\d{5}|[A-Za-z0-9_-]+)", book_id):
        raise SystemExit("公開後確認で書籍IDをIssueから取得できませんでした。")
    return book_id


def verify_book_cover() -> None:
    verify_book_data()
    book_id = require_book_id()
    for path in sorted((DOCS / "assets" / "covers").glob(f"{book_id}.*")):
        verify_asset(path)


def verify_magazine_cover() -> None:
    verify_magazine_data()
    book_id = require_book_id()
    for path in sorted((DOCS / "assets" / "magazine-covers").glob(f"{book_id}.*")):
        verify_asset(path)


def verify_errata() -> None:
    verify_book_data()
    book_id = require_book_id()
    verify_asset(DOCS / "assets" / "errata" / f"errata{book_id}.pdf")


def verify_related() -> None:
    verify_book_data()
    book_id = require_book_id()
    for path in sorted((DOCS / "assets" / "related").glob(f"{book_id}.*")):
        verify_asset(path)


def verify_news() -> None:
    verify_exact("data/news-last-updated.txt")
    verify_exact("data/news.json")


def main() -> None:
    if not PAGE_URL.startswith(("https://", "http://")):
        raise SystemExit("公開後確認用のPAGE_URLが取得できませんでした。")

    checks = {
        "book": verify_book_data,
        "magazine": verify_magazine_data,
        "book-cover": verify_book_cover,
        "magazine-cover": verify_magazine_cover,
        "errata": verify_errata,
        "related": verify_related,
        "external-link": lambda: verify_exact("data/book-external-links.csv"),
        "news": verify_news,
    }
    check = checks.get(VERIFY_KIND)
    if check is None:
        raise SystemExit(f"未対応の公開後確認種別です: {VERIFY_KIND}")
    check()
    print(f"公開後自動確認完了: {VERIFY_KIND}")


if __name__ == "__main__":
    main()
