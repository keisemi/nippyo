import csv
import json
import os
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "data" / "book_search_master.csv"
COVERS_DIR = ROOT / "docs" / "assets" / "covers"
NO_RESPONSE = "_No response_"
MAX_BYTES = 10 * 1024 * 1024
ALLOWED_URL_RE = re.compile(
    r"https://github\.com/user-attachments/assets/[A-Za-z0-9_-]+(?:\?[^\s)\]>]+)?"
)
COVER_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")


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
    known = {"書籍ID", "現在の書名", "操作", "画像ファイル", "確認"}
    sections: dict[str, list[str]] = {}
    current = None
    for line in (body or "").splitlines():
        if line.startswith("### ") and line[4:].strip() in known:
            current = line[4:].strip()
            sections[current] = []
            continue
        if current is not None:
            sections[current].append(line)
    out = {}
    for key, lines in sections.items():
        value = "\n".join(lines).strip()
        if value == NO_RESPONSE:
            value = ""
        out[key] = value
    return out


def load_rows() -> list[dict[str, str]]:
    with MASTER.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def verify_target(book_id: str, current_title: str) -> None:
    if not re.fullmatch(r"(?:\d{5}|N\d{5})", book_id):
        raise SystemExit(f"書籍IDが不正です: {book_id}")
    matches = [row for row in load_rows() if (row.get("id") or "").strip() == book_id]
    if not matches:
        raise SystemExit(f"書籍ID {book_id} は登録されていません。")
    if len(matches) > 1:
        raise SystemExit(f"書籍ID {book_id} が重複しています。")
    actual = (matches[0].get("title") or "").strip()
    if current_title and actual != current_title:
        raise SystemExit(
            "対象書の書名が現在のマスターと一致しません。\n"
            f"管理画面表示: {current_title}\n"
            f"現在のマスター: {actual}\n"
            "管理画面を再読み込みして対象書を選び直してください。"
        )


def existing_covers(book_id: str) -> list[Path]:
    return [
        COVERS_DIR / f"{book_id}{ext}"
        for ext in COVER_EXTENSIONS
        if (COVERS_DIR / f"{book_id}{ext}").exists()
    ]


def detect_image_type(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    raise SystemExit("画像ファイルをJPEG・PNG・WebPとして確認できませんでした。")


def download_attachment(section: str) -> bytes:
    urls = list(dict.fromkeys(ALLOWED_URL_RE.findall(section or "")))
    if not urls:
        raise SystemExit("画像ファイルが添付されていません。")
    if len(urls) != 1:
        raise SystemExit("画像ファイルは1点だけ添付してください。")

    request = urllib.request.Request(
        urls[0],
        headers={"User-Agent": "nippyo-site-maintenance/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(MAX_BYTES + 1)
    if not data:
        raise SystemExit("添付画像が空です。")
    if len(data) > MAX_BYTES:
        raise SystemExit("添付画像が大きすぎます。10MB以下にしてください。")
    return data


def add_or_replace(book_id: str, section: str) -> None:
    data = download_attachment(section)
    ext = detect_image_type(data)
    COVERS_DIR.mkdir(parents=True, exist_ok=True)

    for path in existing_covers(book_id):
        path.unlink()

    target = COVERS_DIR / f"{book_id}{ext}"
    target.write_bytes(data)
    print("操作: 書影追加・差替え")
    print(f"保存先: {target.relative_to(ROOT)}")
    print(f"サイズ: {len(data):,} bytes")


def delete_cover(book_id: str) -> None:
    files = existing_covers(book_id)
    if not files:
        raise SystemExit(f"書籍ID {book_id} の書影は登録されていません。")
    for path in files:
        path.unlink()
        print(f"削除: {path.relative_to(ROOT)}")
    print("操作: 書影削除")


def main() -> None:
    issue = get_issue()
    title = str(issue.get("title") or "")
    if not title.startswith("[書影管理]"):
        raise SystemExit("書影管理Issueではありません。")

    sections = parse_sections(str(issue.get("body") or ""))
    book_id = sections.get("書籍ID", "").strip()
    current_title = sections.get("現在の書名", "").strip()
    operation = sections.get("操作", "").strip()
    if not operation and title.startswith("[書影管理] 削除:"):
        operation = "削除"

    verify_target(book_id, current_title)

    if operation == "追加・差替え":
        add_or_replace(book_id, sections.get("画像ファイル", ""))
    elif operation == "削除":
        delete_cover(book_id)
    else:
        raise SystemExit(f"操作が不正です: {operation}")

    print(f"書籍ID: {book_id}")
    print(f"書名: {current_title}")


if __name__ == "__main__":
    main()
