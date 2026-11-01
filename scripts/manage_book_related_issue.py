import csv
import json
import os
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "data" / "book_search_master.csv"
RELATED_DIR = ROOT / "docs" / "assets" / "related"
NO_RESPONSE = "_No response_"
MAX_BYTES = 25 * 1024 * 1024

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".zip",
    ".xlsx",
    ".xls",
    ".xlsm",
    ".csv",
    ".docx",
    ".pptx",
    ".ppt",
    ".txt",
}

ATTACHMENT_LINK_RE = re.compile(
    r"\[([^\]]+)\]\((https://github\.com/user-attachments/"
    r"(?:assets/[A-Za-z0-9_-]+|files/\d+/[^\s)\]>]+))\)"
)


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
    known = {"書籍ID", "現在の書名", "操作", "付属データファイル", "確認"}
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


def existing_related_files(book_id: str) -> list[Path]:
    if not RELATED_DIR.exists():
        return []
    files = []
    for path in RELATED_DIR.iterdir():
        if not path.is_file():
            continue
        match = re.fullmatch(rf"{re.escape(book_id)}(\.[A-Za-z0-9]+)", path.name)
        if match and match.group(1).lower() in ALLOWED_EXTENSIONS:
            files.append(path)
    return sorted(files)


def read_attachment(section: str) -> tuple[str, bytes]:
    matches = ATTACHMENT_LINK_RE.findall(section or "")
    unique = []
    seen = set()
    for filename, url in matches:
        key = (filename, url)
        if key not in seen:
            seen.add(key)
            unique.append(key)

    if not unique:
        raise SystemExit("付属データファイルが添付されていません。")
    if len(unique) != 1:
        raise SystemExit("付属データファイルは1点だけ添付してください。複数資料はZIPにまとめてください。")

    filename, url = unique[0]
    ext = Path(filename.strip()).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise SystemExit(
            "未対応のファイル形式です。PDF・ZIP・Excel・CSV・Word・PowerPoint・TXTを使用してください。"
        )

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "nippyo-site-maintenance/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(MAX_BYTES + 1)

    if not data:
        raise SystemExit("添付ファイルが空です。")
    if len(data) > MAX_BYTES:
        raise SystemExit("添付ファイルが大きすぎます。25MB以下にしてください。")

    if ext == ".pdf" and not data.startswith(b"%PDF-"):
        raise SystemExit("添付ファイルをPDFとして確認できませんでした。")
    if ext in {".zip", ".xlsx", ".xlsm", ".docx", ".pptx"} and not data.startswith(b"PK"):
        raise SystemExit("添付ファイルの形式を確認できませんでした。")

    return ext, data


def add_or_replace(book_id: str, section: str) -> None:
    ext, data = read_attachment(section)
    RELATED_DIR.mkdir(parents=True, exist_ok=True)

    for path in existing_related_files(book_id):
        path.unlink()
        print(f"旧ファイル削除: {path.relative_to(ROOT)}")

    target = RELATED_DIR / f"{book_id}{ext}"
    target.write_bytes(data)

    print("操作: 付属データ追加・差替え")
    print(f"保存先: {target.relative_to(ROOT)}")
    print(f"サイズ: {len(data):,} bytes")


def delete_related(book_id: str) -> None:
    files = existing_related_files(book_id)
    if not files:
        raise SystemExit(f"書籍ID {book_id} の付属データは登録されていません。")
    for path in files:
        path.unlink()
        print(f"削除: {path.relative_to(ROOT)}")
    print("操作: 付属データ削除")


def main() -> None:
    issue = get_issue()
    title = str(issue.get("title") or "")
    if not title.startswith("[付属データ管理]"):
        raise SystemExit("付属データ管理Issueではありません。")

    sections = parse_sections(str(issue.get("body") or ""))
    book_id = sections.get("書籍ID", "").strip()
    current_title = sections.get("現在の書名", "").strip()
    operation = sections.get("操作", "").strip()
    if not operation and title.startswith("[付属データ管理] 削除:"):
        operation = "削除"

    verify_target(book_id, current_title)

    if operation == "追加・差替え":
        add_or_replace(book_id, sections.get("付属データファイル", ""))
    elif operation == "削除":
        delete_related(book_id)
    else:
        raise SystemExit(f"操作が不正です: {operation}")

    print(f"書籍ID: {book_id}")
    print(f"書名: {current_title}")


if __name__ == "__main__":
    main()
