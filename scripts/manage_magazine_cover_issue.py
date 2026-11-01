import csv
import json
import os
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data" / "magazines"
COVERS_DIR = ROOT / "docs" / "assets" / "magazine-covers"
NO_RESPONSE = "_No response_"
MAX_BYTES = 11 * 1024 * 1024
ALLOWED_URL_RE = re.compile(
    r"https://github\.com/user-attachments/assets/[A-Za-z0-9_-]+(?:\?[^\s)\]>]+)?"
)
COVER_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")

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
    known = {"書籍ID", "雑誌ID", "雑誌名", "現在の雑誌月号", "操作", "画像ファイル", "確認"}
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


def read_rows(path: Path):
    last_error = None
    for encoding in ("utf-8-sig", "cp932"):
        try:
            with path.open("r", encoding=encoding, newline="") as f:
                reader = csv.DictReader(f)
                return reader.fieldnames or [], list(reader), encoding
        except UnicodeDecodeError as error:
            last_error = error
    raise SystemExit(f"CSVの文字コードを判定できません: {path} ({last_error})")


def validate_magazine(magazine_id: str, magazine_name: str):
    if magazine_id not in MAGAZINES:
        raise SystemExit(f"未対応の雑誌IDです: {magazine_id}")
    expected_name, filename = MAGAZINES[magazine_id]
    if magazine_name != expected_name:
        raise SystemExit(
            f"雑誌名が雑誌IDと一致しません。雑誌ID {magazine_id}: {expected_name} / 入力: {magazine_name}"
        )
    return expected_name, SOURCE_DIR / filename


def verify_target(book_id: str, magazine_id: str, magazine_name: str, current_issue: str) -> None:
    if not re.fullmatch(r"\d+", book_id):
        raise SystemExit(f"雑誌号の書籍IDが不正です: {book_id}")
    if not magazine_id or not magazine_name or not current_issue:
        raise SystemExit("対象号の識別情報が不足しています。雑誌管理画面からやり直してください。")

    expected_name, path = validate_magazine(magazine_id, magazine_name)
    _fieldnames, rows, _encoding = read_rows(path)
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
    if actual_issue != current_issue:
        raise SystemExit(
            "対象号の月号表記が現在のCSVと一致しません。\n"
            f"管理画面表示: {current_issue}\nCSV: {actual_issue}\n"
            "管理画面を再読み込みして対象号を選び直してください。"
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
    print("操作: 雑誌書影追加・差替え")
    print(f"保存先: {target.relative_to(ROOT)}")
    print(f"サイズ: {len(data):,} bytes")


def delete_cover(book_id: str) -> None:
    files = existing_covers(book_id)
    if not files:
        raise SystemExit(f"書籍ID {book_id} の雑誌書影は登録されていません。")
    for path in files:
        path.unlink()
        print(f"削除: {path.relative_to(ROOT)}")
    print("操作: 雑誌書影削除")


def main() -> None:
    issue = get_issue()
    title = str(issue.get("title") or "")
    if not title.startswith("[雑誌書影管理]"):
        raise SystemExit("雑誌書影管理Issueではありません。")

    sections = parse_sections(str(issue.get("body") or ""))
    book_id = sections.get("書籍ID", "").strip()
    magazine_id = sections.get("雑誌ID", "").strip()
    magazine_name = sections.get("雑誌名", "").strip()
    current_issue = sections.get("現在の雑誌月号", "").strip()
    operation = sections.get("操作", "").strip()
    if not operation and title.startswith("[雑誌書影管理] 削除:"):
        operation = "削除"

    verify_target(book_id, magazine_id, magazine_name, current_issue)

    if operation == "追加・差替え":
        add_or_replace(book_id, sections.get("画像ファイル", ""))
    elif operation == "削除":
        delete_cover(book_id)
    else:
        raise SystemExit(f"操作が不正です: {operation}")

    print(f"雑誌: {magazine_name}")
    print(f"月号: {current_issue}")
    print(f"書籍ID: {book_id}")


if __name__ == "__main__":
    main()
