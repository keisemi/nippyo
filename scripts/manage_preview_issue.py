#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOK_MASTER = ROOT / "data" / "book_search_master.csv"
MAGAZINE_DIR = ROOT / "data" / "magazines"
PREVIEW_ROOT = ROOT / "docs" / "assets" / "preview"
BOOK_PREVIEW_DIR = PREVIEW_ROOT / "books"
MAGAZINE_PREVIEW_DIR = PREVIEW_ROOT / "magazines"
INDEX_FILE = ROOT / "docs" / "data" / "preview-index.json"
NO_RESPONSE = "_No response_"
MAX_BYTES = 25 * 1024 * 1024
ATTACHMENT_URL_RE = re.compile(
    r"https://github\.com/user-attachments/(?:assets/[A-Za-z0-9_-]+|files/\d+/[^\s)\]>]+)"
)
MAGAZINES = {
    "1": ("法律時報", "01_horitsu_jiho.csv"),
    "2": ("法学セミナー", "02_hogaku_seminar.csv"),
    "3": ("経済セミナー", "03_keizai_seminar.csv"),
    "4": ("数学セミナー", "04_sugaku_seminar.csv"),
    "6": ("こころの科学", "05_kokoro_no_kagaku.csv"),
    "7": ("そだちの科学", "06_sodachi_no_kagaku.csv"),
}


def get_issue() -> dict:
    event_path = os.environ.get("GITHUB_EVENT_PATH", "").strip()
    if not event_path:
        raise SystemExit("GITHUB_EVENT_PATH がありません。")
    with open(event_path, encoding="utf-8") as f:
        event = json.load(f)
    issue = event.get("issue") or {}
    if not issue:
        raise SystemExit("Issueイベントを取得できません。")
    return issue


def parse_sections(body: str) -> dict[str, str]:
    known = {
        "対象種別",
        "書籍ID",
        "現在の書名",
        "雑誌ID",
        "雑誌名",
        "現在の雑誌月号",
        "操作",
        "立ち読みPDF",
        "確認",
    }
    sections: dict[str, list[str]] = {}
    current = None
    for line in (body or "").splitlines():
        if line.startswith("### ") and line[4:].strip() in known:
            current = line[4:].strip()
            sections[current] = []
            continue
        if current is not None:
            sections[current].append(line)

    out: dict[str, str] = {}
    for key, lines in sections.items():
        value = "\n".join(lines).strip()
        if value == NO_RESPONSE:
            value = ""
        out[key] = value
    return out


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    last_error = None
    for encoding in ("utf-8-sig", "cp932"):
        try:
            with path.open("r", encoding=encoding, newline="") as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError as error:
            last_error = error
    raise SystemExit(f"CSVの文字コードを判定できません: {path} ({last_error})")


def verify_book(book_id: str, current_title: str) -> None:
    if not re.fullmatch(r"(?:\d{5}|N\d{5})", book_id):
        raise SystemExit(f"書籍IDが不正です: {book_id}")
    rows = read_csv_rows(BOOK_MASTER)
    matches = [row for row in rows if (row.get("id") or "").strip() == book_id]
    if not matches:
        raise SystemExit(f"書籍ID {book_id} は登録されていません。")
    if len(matches) > 1:
        raise SystemExit(f"書籍ID {book_id} が重複しています。")
    actual = (matches[0].get("title") or "").strip()
    if not current_title or actual != current_title:
        raise SystemExit(
            "対象書の書名が現在のマスターと一致しません。\n"
            f"管理画面表示: {current_title}\n現在のマスター: {actual}\n"
            "管理画面を再読み込みして対象書を選び直してください。"
        )


def verify_magazine(
    book_id: str,
    magazine_id: str,
    magazine_name: str,
    current_issue: str,
) -> None:
    if not re.fullmatch(r"\d+", book_id):
        raise SystemExit(f"雑誌号の書籍IDが不正です: {book_id}")
    if magazine_id not in MAGAZINES:
        raise SystemExit(f"未対応の雑誌IDです: {magazine_id}")
    expected_name, filename = MAGAZINES[magazine_id]
    if magazine_name != expected_name:
        raise SystemExit(
            f"雑誌名が雑誌IDと一致しません。雑誌ID {magazine_id}: {expected_name} / 入力: {magazine_name}"
        )
    rows = read_csv_rows(MAGAZINE_DIR / filename)
    matches = [row for row in rows if str(row.get("書籍ID") or "").strip() == book_id]
    if not matches:
        raise SystemExit(f"書籍ID {book_id} は {expected_name} のCSVにありません。")
    if len(matches) > 1:
        raise SystemExit(f"書籍ID {book_id} が {expected_name} のCSV内で重複しています。")
    row = matches[0]
    actual_magazine_id = str(row.get("雑誌ID") or "").strip()
    actual_issue = str(row.get("雑誌月号") or "").strip()
    if actual_magazine_id != magazine_id:
        raise SystemExit(f"雑誌IDが一致しません。CSV: {actual_magazine_id} / 申請: {magazine_id}")
    if not current_issue or actual_issue != current_issue:
        raise SystemExit(
            "対象号の月号表記が現在のCSVと一致しません。\n"
            f"管理画面表示: {current_issue}\nCSV: {actual_issue}\n"
            "管理画面を再読み込みして対象号を選び直してください。"
        )


def target_dir(target_type: str) -> Path:
    if target_type == "書籍":
        return BOOK_PREVIEW_DIR
    if target_type == "雑誌":
        return MAGAZINE_PREVIEW_DIR
    raise SystemExit(f"対象種別が不正です: {target_type}")


def target_path(target_type: str, book_id: str) -> Path:
    return target_dir(target_type) / f"sample_{book_id}.pdf"


def download_attachment(section: str) -> bytes:
    urls = list(dict.fromkeys(ATTACHMENT_URL_RE.findall(section or "")))
    if not urls:
        raise SystemExit("立ち読みPDFが添付されていません。")
    if len(urls) != 1:
        raise SystemExit("立ち読みPDFは1点だけ添付してください。")

    request = urllib.request.Request(
        urls[0],
        headers={"User-Agent": "nippyo-site-maintenance/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(MAX_BYTES + 1)
    if not data:
        raise SystemExit("添付PDFが空です。")
    if len(data) > MAX_BYTES:
        raise SystemExit("添付PDFが大きすぎます。25MB以下にしてください。")
    if not data.startswith(b"%PDF-"):
        raise SystemExit("添付ファイルをPDFとして確認できませんでした。")
    return data


def add_or_replace(target_type: str, book_id: str, section: str) -> None:
    data = download_attachment(section)
    directory = target_dir(target_type)
    directory.mkdir(parents=True, exist_ok=True)
    target = target_path(target_type, book_id)
    target.write_bytes(data)
    print(f"操作: {target_type} 立ち読みPDF追加・差替え")
    print(f"保存先: {target.relative_to(ROOT)}")
    print(f"サイズ: {len(data):,} bytes")


def delete_preview(target_type: str, book_id: str) -> None:
    target = target_path(target_type, book_id)
    if not target.is_file():
        raise SystemExit(f"{target_type} 書籍ID {book_id} の立ち読みPDFは登録されていません。")
    target.unlink()
    print(f"操作: {target_type} 立ち読みPDF削除")
    print(f"削除: {target.relative_to(ROOT)}")


def known_book_ids() -> set[str]:
    return {(row.get("id") or "").strip() for row in read_csv_rows(BOOK_MASTER) if (row.get("id") or "").strip()}


def known_magazine_ids() -> set[str]:
    result: set[str] = set()
    for _magazine_id, (_name, filename) in MAGAZINES.items():
        for row in read_csv_rows(MAGAZINE_DIR / filename):
            value = str(row.get("書籍ID") or "").strip()
            if value:
                result.add(value)
    return result


def collect_preview_files(directory: Path, valid_ids: set[str], label: str) -> dict[str, str]:
    if not directory.exists():
        return {}
    result: dict[str, str] = {}
    invalid_names: list[str] = []
    invalid_pdfs: list[str] = []
    unknown_ids: list[str] = []

    for path in sorted(directory.iterdir()):
        if not path.is_file() or path.name.startswith("."):
            continue
        match = re.fullmatch(r"sample_(.+)\.pdf", path.name)
        if not match:
            invalid_names.append(path.name)
            continue
        item_id = match.group(1)
        if item_id not in valid_ids:
            unknown_ids.append(item_id)
            continue
        data = path.read_bytes()
        if not data.startswith(b"%PDF-"):
            invalid_pdfs.append(path.name)
            continue
        digest = hashlib.sha256(data).hexdigest()[:16]
        relative = path.relative_to(ROOT / "docs").as_posix()
        result[item_id] = f"{relative}?v={digest}"

    if invalid_names:
        raise SystemExit(f"{label}立ち読みPDFのファイル名が不正です: " + ", ".join(invalid_names))
    if invalid_pdfs:
        raise SystemExit(f"{label}立ち読みPDFとして読み込めないファイルがあります: " + ", ".join(invalid_pdfs))
    if unknown_ids:
        raise SystemExit(f"{label}立ち読みPDFに対応する書籍IDがありません: " + ", ".join(sorted(unknown_ids)))
    return result


def rebuild_index() -> None:
    BOOK_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    MAGAZINE_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)

    books = collect_preview_files(BOOK_PREVIEW_DIR, known_book_ids(), "書籍")
    magazines = collect_preview_files(MAGAZINE_PREVIEW_DIR, known_magazine_ids(), "雑誌")
    now = datetime.now(timezone(timedelta(hours=9))).strftime("%Y/%m/%d %H:%M:%S")
    payload = {
        "updated": now,
        "books": dict(sorted(books.items())),
        "magazines": dict(sorted(magazines.items(), key=lambda item: (len(item[0]), item[0]))),
    }
    INDEX_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"立ち読みインデックス更新: 書籍{len(books)}件 / 雑誌{len(magazines)}件")


def main() -> None:
    issue = get_issue()
    title = str(issue.get("title") or "")
    if not title.startswith("[立ち読み管理]"):
        raise SystemExit("立ち読み管理Issueではありません。")

    sections = parse_sections(str(issue.get("body") or ""))
    target_type = sections.get("対象種別", "").strip()
    book_id = sections.get("書籍ID", "").strip()
    current_title = sections.get("現在の書名", "").strip()
    magazine_id = sections.get("雑誌ID", "").strip()
    magazine_name = sections.get("雑誌名", "").strip()
    current_issue = sections.get("現在の雑誌月号", "").strip()
    operation = sections.get("操作", "").strip()
    if not operation and title.startswith("[立ち読み管理] 削除:"):
        operation = "削除"

    if target_type == "書籍":
        verify_book(book_id, current_title)
    elif target_type == "雑誌":
        verify_magazine(book_id, magazine_id, magazine_name, current_issue)
    else:
        raise SystemExit(f"対象種別が不正です: {target_type}")

    if operation == "追加・差替え":
        add_or_replace(target_type, book_id, sections.get("立ち読みPDF", ""))
    elif operation == "削除":
        delete_preview(target_type, book_id)
    else:
        raise SystemExit(f"操作が不正です: {operation}")

    rebuild_index()
    print(f"対象種別: {target_type}")
    print(f"書籍ID: {book_id}")


if __name__ == "__main__":
    main()
