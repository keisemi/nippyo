#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
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
ISSUE_BODY = os.environ.get("ISSUE_BODY", "")
ISSUE_TITLE = os.environ.get("ISSUE_TITLE", "")
CONTENT_RETRIES = 12
CONTENT_RETRY_SECONDS = 5


def section_value(body: str, label: str) -> str:
    match = re.search(
        rf"(?ms)^###\s+{re.escape(label)}\s*\n(.*?)(?=^###\s+|\Z)",
        body or "",
    )
    if not match:
        return ""
    value = match.group(1).strip()
    return "" if value in {"No response", "_No response_"} else value


def remote_url(relative: str) -> str:
    base = PAGE_URL if PAGE_URL.endswith("/") else PAGE_URL + "/"
    url = urllib.parse.urljoin(base, relative.lstrip("/"))
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}verify={time.time_ns()}"


def fetch_once(relative: str) -> bytes:
    request = urllib.request.Request(
        remote_url(relative),
        headers={
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "User-Agent": "nippyo-preview-verifier/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}: {relative}")
        return response.read()


def verify_exact(relative: str) -> None:
    clean_relative = relative.split("?", 1)[0]
    local_path = DOCS / clean_relative
    if not local_path.is_file():
        raise SystemExit(f"公開後確認用のローカルファイルがありません: {local_path}")
    local_digest = hashlib.sha256(local_path.read_bytes()).digest()
    last_error: Exception | None = None

    for attempt in range(CONTENT_RETRIES):
        try:
            remote_digest = hashlib.sha256(fetch_once(relative)).digest()
            if local_digest == remote_digest:
                print(f"公開後確認OK: {relative}")
                return
            last_error = RuntimeError("内容不一致")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, RuntimeError) as error:
            last_error = error

        if attempt + 1 < CONTENT_RETRIES:
            print(
                f"公開反映待ち: {relative} "
                f"({attempt + 1}/{CONTENT_RETRIES})。{CONTENT_RETRY_SECONDS}秒後に再確認します。"
            )
            time.sleep(CONTENT_RETRY_SECONDS)

    raise SystemExit(f"公開後確認に失敗しました: {relative}\n{last_error}")


def verify_missing(relative: str) -> None:
    last_status = None
    for attempt in range(CONTENT_RETRIES):
        request = urllib.request.Request(
            remote_url(relative),
            headers={
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "User-Agent": "nippyo-preview-verifier/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                last_status = response.status
        except urllib.error.HTTPError as error:
            if error.code == 404:
                print(f"公開後削除確認OK: {relative}")
                return
            last_status = error.code
        except (urllib.error.URLError, TimeoutError) as error:
            last_status = str(error)

        if attempt + 1 < CONTENT_RETRIES:
            print(
                f"公開削除反映待ち: {relative} "
                f"({attempt + 1}/{CONTENT_RETRIES})。{CONTENT_RETRY_SECONDS}秒後に再確認します。"
            )
            time.sleep(CONTENT_RETRY_SECONDS)

    raise SystemExit(f"公開後削除確認に失敗しました: {relative} / 状態: {last_status}")


def main() -> None:
    if not PAGE_URL.startswith(("https://", "http://")):
        raise SystemExit("公開後確認用のPAGE_URLが取得できませんでした。")

    target_type = section_value(ISSUE_BODY, "対象種別")
    book_id = section_value(ISSUE_BODY, "書籍ID")
    operation = section_value(ISSUE_BODY, "操作")
    if not operation and ISSUE_TITLE.startswith("[立ち読み管理] 削除:"):
        operation = "削除"

    if target_type not in {"書籍", "雑誌"} or not book_id:
        raise SystemExit("公開後確認で対象種別または書籍IDを取得できませんでした。")

    verify_exact("data/preview-index.json")
    payload = json.loads((DOCS / "data" / "preview-index.json").read_text(encoding="utf-8"))
    key = "books" if target_type == "書籍" else "magazines"
    entries = payload.get(key) if isinstance(payload, dict) else None
    if not isinstance(entries, dict):
        raise SystemExit("preview-index.json の形式が不正です。")

    relative = f"assets/preview/{'books' if target_type == '書籍' else 'magazines'}/sample_{book_id}.pdf"
    if operation == "追加・差替え":
        indexed = entries.get(book_id)
        if not isinstance(indexed, str) or not indexed:
            raise SystemExit("立ち読みPDFが公開用インデックスに登録されていません。")
        verify_exact(indexed)
    elif operation == "削除":
        if book_id in entries:
            raise SystemExit("削除した立ち読みPDFが公開用インデックスに残っています。")
        verify_missing(relative)
    else:
        raise SystemExit(f"操作が不正です: {operation}")

    print(f"立ち読みPDFの公開後自動確認完了: {target_type} / {book_id} / {operation}")


if __name__ == "__main__":
    main()
