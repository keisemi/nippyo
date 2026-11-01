import csv
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "data" / "book_search_master.csv"
LINKS = ROOT / "docs" / "data" / "book-external-links.csv"
NO_RESPONSE = "_No response_"
FIELDS = ["id", "slot", "title", "comment", "url"]


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
        "書籍ID",
        "現在の書名",
        "操作",
        "現在のリンク番号",
        "現在のURL",
        "リンク名",
        "説明",
        "URL",
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


def load_master_rows() -> list[dict[str, str]]:
    with MASTER.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def verify_target(book_id: str, current_title: str) -> None:
    if not re.fullmatch(r"(?:\d{5}|N\d{5})", book_id):
        raise SystemExit(f"書籍IDが不正です: {book_id}")
    matches = [row for row in load_master_rows() if (row.get("id") or "").strip() == book_id]
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


def load_links() -> list[dict[str, str]]:
    if not LINKS.exists():
        return []
    with LINKS.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != FIELDS:
            raise SystemExit(
                "関連リンクCSVの列構成が不正です。"
                f"期待: {','.join(FIELDS)} / 現在: {','.join(reader.fieldnames or [])}"
            )
        rows = []
        for row in reader:
            rows.append({field: str(row.get(field) or "") for field in FIELDS})
        return rows


def save_links(rows: list[dict[str, str]]) -> None:
    LINKS.parent.mkdir(parents=True, exist_ok=True)
    with LINKS.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def validate_url(url: str) -> str:
    value = (url or "").strip()
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise SystemExit("URLは http:// または https:// から始まる有効なURLを入力してください。")
    return value


def parse_slot(value: str) -> int:
    try:
        slot = int((value or "").strip())
    except ValueError:
        raise SystemExit("現在のリンク番号が不正です。")
    if slot < 1:
        raise SystemExit("現在のリンク番号が不正です。")
    return slot


def find_target(rows: list[dict[str, str]], book_id: str, slot: int, current_url: str) -> int:
    for i, row in enumerate(rows):
        if (row["id"].strip() == book_id and
                row["slot"].strip() == str(slot) and
                row["url"].strip() == current_url.strip()):
            return i
    raise SystemExit(
        "対象の関連リンクが現在のデータと一致しません。"
        "管理画面を再読み込みしてリンクを選び直してください。"
    )


def renumber_book(rows: list[dict[str, str]], book_id: str) -> None:
    indexes = [i for i, row in enumerate(rows) if row["id"].strip() == book_id]
    indexes.sort(key=lambda i: int(rows[i]["slot"] or "999999"))
    for slot, index in enumerate(indexes, start=1):
        rows[index]["slot"] = str(slot)


def add_link(rows: list[dict[str, str]], book_id: str, title: str, comment: str, url: str) -> None:
    url = validate_url(url)
    slots = [
        int(row["slot"])
        for row in rows
        if row["id"].strip() == book_id and str(row["slot"]).isdigit()
    ]
    slot = max(slots, default=0) + 1
    rows.append({
        "id": book_id,
        "slot": str(slot),
        "title": title.strip(),
        "comment": comment.strip(),
        "url": url,
    })
    print("操作: 関連リンク追加")
    print(f"リンク番号: {slot}")


def edit_link(
    rows: list[dict[str, str]],
    book_id: str,
    current_slot: str,
    current_url: str,
    title: str,
    comment: str,
    url: str,
) -> None:
    slot = parse_slot(current_slot)
    index = find_target(rows, book_id, slot, current_url)
    rows[index]["title"] = title.strip()
    rows[index]["comment"] = comment.strip()
    rows[index]["url"] = validate_url(url)
    print("操作: 関連リンク修正")
    print(f"リンク番号: {slot}")


def delete_link(
    rows: list[dict[str, str]],
    book_id: str,
    current_slot: str,
    current_url: str,
) -> None:
    slot = parse_slot(current_slot)
    index = find_target(rows, book_id, slot, current_url)
    removed = rows.pop(index)
    renumber_book(rows, book_id)
    print("操作: 関連リンク削除")
    print(f"削除URL: {removed['url']}")


def main() -> None:
    issue = get_issue()
    issue_title = str(issue.get("title") or "")
    if not issue_title.startswith("[関連リンク管理]"):
        raise SystemExit("関連リンク管理Issueではありません。")

    fields = parse_sections(str(issue.get("body") or ""))
    book_id = fields.get("書籍ID", "").strip()
    current_title = fields.get("現在の書名", "").strip()
    operation = fields.get("操作", "").strip()
    if not operation and issue_title.startswith("[関連リンク管理] 削除:"):
        operation = "削除"

    verify_target(book_id, current_title)
    rows = load_links()

    if operation == "追加":
        add_link(
            rows,
            book_id,
            fields.get("リンク名", ""),
            fields.get("説明", ""),
            fields.get("URL", ""),
        )
    elif operation == "修正":
        edit_link(
            rows,
            book_id,
            fields.get("現在のリンク番号", ""),
            fields.get("現在のURL", ""),
            fields.get("リンク名", ""),
            fields.get("説明", ""),
            fields.get("URL", ""),
        )
    elif operation == "削除":
        delete_link(
            rows,
            book_id,
            fields.get("現在のリンク番号", ""),
            fields.get("現在のURL", ""),
        )
    else:
        raise SystemExit(f"操作が不正です: {operation}")

    save_links(rows)
    print(f"書籍ID: {book_id}")
    print(f"書名: {current_title}")


if __name__ == "__main__":
    main()
