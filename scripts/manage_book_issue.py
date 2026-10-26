import csv
import json
import os
import re
from pathlib import Path

import manage_book

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "data" / "book_search_master.csv"
NO_RESPONSE = "_No response_"

LABEL_TO_ENV = {
    "書名": "BOOK_TITLE",
    "副題（前）": "BOOK_SUBTITLE_BEFORE",
    "副題（後）": "BOOK_SUBTITLE_AFTER",
    "著者": "BOOK_AUTHOR",
    "著者よみ": "BOOK_AUTHOR_KANA",
    "書名よみ": "BOOK_TITLE_KANA",
    "旧ISBN": "BOOK_ISBN_OLD",
    "新ISBN": "BOOK_ISBN_NEW",
    "Amazon ASIN": "BOOK_AMAZON_ASIN",
    "刊行年月": "BOOK_PUB_MONTH",
    "分野": "BOOK_GENRES",
    "シリーズ": "BOOK_SERIES",
    "シリーズ巻数": "BOOK_SERIES_VOLUME",
    "本体価格": "BOOK_PRICE_BODY",
    "判型": "BOOK_FORMAT",
    "頁数": "BOOK_PAGES",
    "HP検索用キーワード": "BOOK_HP_KEYWORDS",
    "刊行年月備考": "BOOK_PUB_NOTE",
    "内容紹介": "BOOK_DESCRIPTION",
    "目次": "BOOK_TOC",
    "原書名": "BOOK_ORIGINAL_TITLE",
    "正誤表": "BOOK_HAS_ERRATA",
    "関連情報・付属データ": "BOOK_HAS_RELATED_INFO",
}


def parse_sections(body: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current = None
    known_labels = {"書籍ID", "現在の書名", *LABEL_TO_ENV.keys()}
    for line in (body or "").splitlines():
        if line.startswith("### ") and line[4:].strip() in known_labels:
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


def load_rows() -> list[dict[str, str]]:
    with MASTER.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def extract_product_code(isbn: str) -> str:
    digits = re.sub(r"\D", "", isbn or "")
    # 日本評論社のISBN: 978-4-535-xxxxx-x / 4-535-xxxxx-x
    # 最終チェックデジットが欠けていても、商品番号5桁が明確なら採用する。
    if digits.startswith("9784535") and len(digits) >= 12:
        return digits[7:12]
    if digits.startswith("4535") and len(digits) >= 9:
        return digits[4:9]
    return ""


def make_new_book_id(fields: dict[str, str]) -> str:
    code_new = extract_product_code(fields.get("新ISBN", ""))
    code_old = extract_product_code(fields.get("旧ISBN", ""))
    if code_new and code_old and code_new != code_old:
        raise SystemExit(
            "新ISBNと旧ISBNの商品番号5桁が一致しません。\n"
            f"新ISBN: {code_new}\n旧ISBN: {code_old}"
        )
    code = code_new or code_old
    rows = load_rows()
    used = {(row.get("id") or "").strip() for row in rows}
    if code:
        if code in used:
            raise SystemExit(f"書籍ID {code} はすでに登録されています。既存書誌を修正してください。")
        return code

    # ISBNなしは N + 5桁連番。既存のN番号の最大値+1を採用する。
    n_values = []
    for book_id in used:
        m = re.fullmatch(r"N(\d{5})", book_id)
        if m:
            n_values.append(int(m.group(1)))
    next_number = max(n_values, default=0) + 1
    while next_number <= 99999:
        candidate = f"N{next_number:05d}"
        if candidate not in used:
            return candidate
        next_number += 1
    raise SystemExit("ISBNなし書籍用IDの空き番号がありません。")


def verify_edit_target(book_id: str, current_title: str) -> None:
    rows = load_rows()
    matches = [row for row in rows if (row.get("id") or "").strip() == book_id]
    if not matches:
        raise SystemExit(f"書籍ID {book_id} は登録されていません。管理用検索ページを更新してください。")
    if len(matches) > 1:
        raise SystemExit(f"書籍ID {book_id} が重複しています。")
    actual = (matches[0].get("title") or "").strip()
    if current_title and actual != current_title:
        raise SystemExit(
            "対象書の書名が現在のマスターと一致しません。\n"
            f"検索ページ表示: {current_title}\n"
            f"現在のマスター: {actual}\n"
            "管理用検索ページを再読み込みして、対象書を選び直してください。"
        )


def main() -> None:
    issue = get_issue()
    issue_title = (issue.get("title") or "").strip()
    fields = parse_sections(issue.get("body") or "")

    if issue_title.startswith("[書誌修正]"):
        operation = "既存データ修正"
        book_id = fields.get("書籍ID", "").strip()
        if not book_id:
            raise SystemExit("書籍IDがありません。")
        current_title = fields.get("現在の書名", "").strip()
        if not current_title:
            raise SystemExit("現在の書名がありません。管理用検索ページからIssueを開いてください。")
        verify_edit_target(book_id, current_title)
    elif issue_title.startswith("[書誌新規]"):
        operation = "新規登録"
        book_id = make_new_book_id(fields)
        print(f"新規書籍IDを自動採番: {book_id}")
    else:
        raise SystemExit("書誌管理用Issueではありません。")

    os.environ["BOOK_OPERATION"] = operation
    os.environ["BOOK_ID"] = book_id

    for label, env_name in LABEL_TO_ENV.items():
        value = fields.get(label, "")
        if operation == "新規登録" and label in {"正誤表", "関連情報・付属データ"}:
            value = value or "なし"
        os.environ[env_name] = value

    manage_book.main()


if __name__ == "__main__":
    main()
