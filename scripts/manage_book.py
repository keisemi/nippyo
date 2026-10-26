import csv
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "data" / "book_search_master.csv"
CLEAR_TOKEN = "__CLEAR__"

FIELD_ORDER = [
    "id",
    "title",
    "subtitle_before",
    "subtitle_after",
    "author",
    "author_kana",
    "title_kana",
    "search_title",
    "isbn_old",
    "isbn_new",
    "pub_month",
    "pub_year",
    "genres",
    "series",
    "series_volume",
    "price_body",
    "format",
    "pages",
    "hp_keywords",
    "has_errata",
    "has_related_info",
    "pub_note",
    "description",
    "toc",
    "original_title",
    "amazon_asin",
]

INPUT_TO_FIELD = {
    "BOOK_TITLE": "title",
    "BOOK_SUBTITLE_BEFORE": "subtitle_before",
    "BOOK_SUBTITLE_AFTER": "subtitle_after",
    "BOOK_AUTHOR": "author",
    "BOOK_AUTHOR_KANA": "author_kana",
    "BOOK_TITLE_KANA": "title_kana",
    "BOOK_ISBN_OLD": "isbn_old",
    "BOOK_ISBN_NEW": "isbn_new",
    "BOOK_PUB_MONTH": "pub_month",
    "BOOK_GENRES": "genres",
    "BOOK_SERIES": "series",
    "BOOK_SERIES_VOLUME": "series_volume",
    "BOOK_PRICE_BODY": "price_body",
    "BOOK_FORMAT": "format",
    "BOOK_PAGES": "pages",
    "BOOK_HP_KEYWORDS": "hp_keywords",
    "BOOK_PUB_NOTE": "pub_note",
    "BOOK_DESCRIPTION": "description",
    "BOOK_TOC": "toc",
    "BOOK_ORIGINAL_TITLE": "original_title",
    "BOOK_AMAZON_ASIN": "amazon_asin",
}


def env(name: str) -> str:
    return os.environ.get(name, "").strip()


def load_master() -> list[dict[str, str]]:
    if not MASTER.exists():
        raise SystemExit(f"公開用マスターCSVがありません: {MASTER}")
    with MASTER.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != FIELD_ORDER:
            raise SystemExit(
                "公開用マスターCSVの列構成が想定と異なります。\n"
                f"想定: {FIELD_ORDER}\n"
                f"実際: {reader.fieldnames}"
            )
        return [dict(row) for row in reader]


def save_master(rows: list[dict[str, str]]) -> None:
    with MASTER.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELD_ORDER, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def clean_number(value: str, label: str) -> str:
    value = value.replace(",", "").strip()
    if not value or value == CLEAR_TOKEN:
        return "" if value == CLEAR_TOKEN else value
    if not re.fullmatch(r"\d+", value):
        raise SystemExit(f"{label}は半角数字で入力してください: {value}")
    return value


def normalize_pub_month(value: str) -> str:
    value = value.strip()
    if not value or value == CLEAR_TOKEN:
        return "" if value == CLEAR_TOKEN else value
    m = re.fullmatch(r"(\d{4})(?:[./-]?)(\d{1,2})?", value)
    if not m:
        raise SystemExit("刊行年月は YYYY-MM（例: 2026-10）で入力してください。")
    year = int(m.group(1))
    month = m.group(2)
    if not month:
        return f"{year:04d}"
    month_i = int(month)
    if not 1 <= month_i <= 12:
        raise SystemExit(f"刊行月が不正です: {month}")
    return f"{year:04d}-{month_i:02d}"


def derive_year(pub_month: str) -> str:
    m = re.match(r"^(\d{4})", pub_month or "")
    return m.group(1) if m else ""



def normalize_asin(value: str) -> str:
    value = value.strip().upper()
    if not value:
        return ""
    if value == CLEAR_TOKEN:
        return ""
    if not re.fullmatch(r"[A-Z0-9]{10}", value):
        raise SystemExit("Amazon ASINは10桁の英数字で入力してください。")
    return value

def normalize_flag(value: str, *, add_mode: bool, existing: str) -> str:
    value = value.strip()
    if value in {"", "変更しない"}:
        return "0" if add_mode else existing
    if value == "あり":
        return "1"
    if value == "なし":
        return "0"
    raise SystemExit(f"フラグ項目の値を解釈できません: {value}")


def update_value(raw: str, *, add_mode: bool, existing: str) -> str:
    raw = raw.strip()
    if not raw:
        return "" if add_mode else existing
    if raw == CLEAR_TOKEN:
        return ""
    return raw


def main() -> None:
    operation = env("BOOK_OPERATION")
    if operation not in {"新規登録", "既存データ修正"}:
        raise SystemExit("操作は「新規登録」または「既存データ修正」を選択してください。")

    add_mode = operation == "新規登録"
    book_id = env("BOOK_ID")
    if not book_id:
        raise SystemExit("書籍IDは必須です。")
    if not re.fullmatch(r"(?:\d{5}|N\d{5})", book_id):
        raise SystemExit(
            "書籍IDはISBNの商品番号5桁、またはISBNなし書籍用の N+5桁である必要があります: "
            + book_id
        )

    rows = load_master()
    by_id = {row["id"]: i for i, row in enumerate(rows)}

    if add_mode and book_id in by_id:
        raise SystemExit(f"書籍ID {book_id} はすでに登録されています。既存データ修正を選んでください。")
    if not add_mode and book_id not in by_id:
        raise SystemExit(f"書籍ID {book_id} は登録されていません。新規登録を選んでください。")

    existing = {key: "" for key in FIELD_ORDER} if add_mode else rows[by_id[book_id]].copy()
    updated = existing.copy()
    updated["id"] = book_id

    old_title = existing.get("title", "")
    old_search_title = existing.get("search_title", "")

    for input_name, field in INPUT_TO_FIELD.items():
        raw = env(input_name)
        updated[field] = update_value(raw, add_mode=add_mode, existing=existing.get(field, ""))

    updated["amazon_asin"] = normalize_asin(updated["amazon_asin"])

    updated["price_body"] = clean_number(updated["price_body"], "本体価格")
    updated["pages"] = clean_number(updated["pages"], "頁数")

    # 既存マスターには YYYY-MM-00 の旧形式が残っている。
    # 管理画面から現在値をすべて再送するため、既存値と同一ならそのまま保持する。
    # 新規登録、または刊行年月を実際に変更した場合だけ正規化する。
    raw_pub_month = env("BOOK_PUB_MONTH")
    if add_mode:
        updated["pub_month"] = normalize_pub_month(updated["pub_month"])
    elif raw_pub_month and raw_pub_month != existing.get("pub_month", ""):
        updated["pub_month"] = normalize_pub_month(raw_pub_month)
    else:
        updated["pub_month"] = existing.get("pub_month", updated["pub_month"])
    updated["pub_year"] = derive_year(updated["pub_month"])

    updated["has_errata"] = normalize_flag(
        env("BOOK_HAS_ERRATA"), add_mode=add_mode, existing=existing.get("has_errata", "0")
    )
    updated["has_related_info"] = normalize_flag(
        env("BOOK_HAS_RELATED_INFO"), add_mode=add_mode, existing=existing.get("has_related_info", "0")
    )

    # 検索用書名は通常入力させない。
    # 新規登録では書名を設定。既存データ修正では、従来が空欄または旧書名と同一なら書名変更に追随させる。
    if add_mode:
        updated["search_title"] = updated["title"]
    elif updated["title"] != old_title and (not old_search_title or old_search_title == old_title):
        updated["search_title"] = updated["title"]

    if not updated["title"]:
        raise SystemExit("書名は必須です。")

    # 新規登録で最低限必要な項目を明示。
    if add_mode and not updated["author"]:
        print("注意: 著者が空欄です。")

    if add_mode:
        rows.append(updated)
    else:
        rows[by_id[book_id]] = updated

    ids = [row["id"] for row in rows]
    if any(not x for x in ids):
        raise SystemExit("空の書籍IDがあります。CSVは保存していません。")
    if len(ids) != len(set(ids)):
        raise SystemExit("書籍IDの重複を検出しました。CSVは保存していません。")
    if any(not row["title"].strip() for row in rows):
        raise SystemExit("空の書名があります。CSVは保存していません。")

    save_master(rows)

    print(f"操作: {operation}")
    print(f"書籍ID: {book_id}")
    print(f"書名: {updated['title']}")
    print(f"公開用マスター件数: {len(rows):,}")


if __name__ == "__main__":
    main()
