import csv
import html
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data" / "book_search_master.csv"
DOCS = ROOT / "docs"
OUTPUT_DIR = DOCS / "data"
COVERS_DIR = DOCS / "assets" / "covers"
JSON_FILE = OUTPUT_DIR / "books.json"
JS_FILE = OUTPUT_DIR / "books.js"
UPDATED_FILE = OUTPUT_DIR / "last-updated.txt"
HOME_JS_FILE = OUTPUT_DIR / "home-books.js"


def clean(value):
    return (value or "").replace("\x00", "").strip()


def clean_public_text(value):
    value = clean(value)
    if not value:
        return ""
    value = html.unescape(value)
    value = re.sub(r"(?i)<br\s*/?>", "\n", value)
    value = re.sub(r"(?i)</?b>", "", value)
    value = re.sub(r"<[^>]+>", "", value)
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def number(value):
    value = clean(value)
    if not value:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def split_pipe(value):
    return [x.strip() for x in clean(value).split("|") if x.strip()]


def cover_path(book_id):
    book_id = clean(book_id)
    if not book_id:
        return ""
    for ext in ("jpg", "jpeg", "png", "webp"):
        candidate = COVERS_DIR / f"{book_id}.{ext}"
        if candidate.exists():
            return f"assets/covers/{book_id}.{ext}"
    return ""


def build_date_jst():
    return datetime.now(timezone(timedelta(hours=9))).strftime("%Y/%m/%d")


if not INPUT.exists():
    raise SystemExit(f"入力CSVがありません: {INPUT}")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

with INPUT.open("r", encoding="utf-8-sig", newline="") as f:
    rows = list(csv.DictReader(f))

if not rows:
    raise SystemExit("公開用マスターCSVにレコードがありません。")

books = []
for r in rows:
    isbn_old = clean(r.get("isbn_old"))
    isbn_new = clean(r.get("isbn_new"))
    amazon_asin = clean(r.get("amazon_asin")).upper()
    if amazon_asin and not re.fullmatch(r"[A-Z0-9]{10}", amazon_asin):
        raise SystemExit(
            f"Amazon ASINの形式が不正です（書籍ID {clean(r.get('id'))}）: {amazon_asin}"
        )
    search_parts = [
        r.get("title"),
        r.get("subtitle_before"),
        r.get("subtitle_after"),
        r.get("search_title"),
        r.get("title_kana"),
        r.get("author"),
        r.get("author_kana"),
        isbn_old,
        isbn_new,
        r.get("genres"),
        r.get("series"),
        r.get("hp_keywords"),
    ]
    books.append(
        {
            "id": clean(r.get("id")),
            "cover": cover_path(r.get("id")),
            "title": clean(r.get("title")),
            "subtitle_before": clean(r.get("subtitle_before")),
            "subtitle_after": clean(r.get("subtitle_after")),
            "author": clean(r.get("author")),
            "isbn": isbn_new or isbn_old,
            "isbn_old": isbn_old,
            "isbn_new": isbn_new,
            "pub_month": ".".join(clean(r.get("pub_month")).split("-")[:2])
            if clean(r.get("pub_month"))
            else "",
            "pub_year": number(r.get("pub_year")),
            "pub_note": clean_public_text(r.get("pub_note")),
            "genres": split_pipe(r.get("genres")),
            "series": clean(r.get("series")),
            "series_volume": clean(r.get("series_volume")),
            "price_body": number(r.get("price_body")),
            "format": clean(r.get("format")),
            "pages": number(r.get("pages")),
            "description": clean_public_text(r.get("description")),
            "toc": clean_public_text(r.get("toc")),
            "original_title": clean_public_text(r.get("original_title")),
            "amazon_asin": amazon_asin,
            "has_errata": clean(r.get("has_errata")) == "1",
            "has_related_info": clean(r.get("has_related_info")) == "1",
            "search": " ".join(clean(x) for x in search_parts if clean(x)),
        }
    )

if len(books) != len(rows):
    raise SystemExit("CSV行数と生成した書籍件数が一致しません。")
if any(not b["id"] or not b["title"] for b in books):
    raise SystemExit("書籍IDまたは書名が空欄の公開レコードがあります。")
if len({b["id"] for b in books}) != len(books):
    raise SystemExit("書籍IDが重複しています。")

# Top page only needs a small recent-book dataset.
# Keep the master CSV as the single source of truth; this file is regenerated every build.
now_jst = datetime.now(timezone(timedelta(hours=9)))
min_year = now_jst.year - 2
max_year = now_jst.year + 1
home_books = [
    {
        "id": b["id"],
        "cover": b["cover"],
        "title": b["title"],
        "author": b["author"],
        "isbn": b["isbn"],
        "pub_month": b["pub_month"],
        "price_body": b["price_body"],
    }
    for b in books
    if b["pub_year"] is not None and min_year <= b["pub_year"] <= max_year
]

with JSON_FILE.open("w", encoding="utf-8") as f:
    json.dump(books, f, ensure_ascii=False, separators=(",", ":"))

updated_date = build_date_jst()
UPDATED_FILE.write_text(updated_date + "\n", encoding="utf-8")

books_json = json.dumps(books, ensure_ascii=False, separators=(",", ":"))
books_js = (
    "window.NIPPYO_BOOKS=" + books_json + ";\n"
    + "window.NIPPYO_LAST_UPDATED="
    + json.dumps(updated_date, ensure_ascii=False)
    + ";\n"
)
JS_FILE.write_text(books_js, encoding="utf-8")

home_books_js = (
    "window.NIPPYO_HOME_BOOKS="
    + json.dumps(home_books, ensure_ascii=False, separators=(",", ":"))
    + ";\nwindow.NIPPYO_LAST_UPDATED="
    + json.dumps(updated_date, ensure_ascii=False)
    + ";\n"
)
HOME_JS_FILE.write_text(home_books_js, encoding="utf-8")

print("生成完了")
print(f" - {JSON_FILE}")
print(f" - {JS_FILE}（検索画面用）")
print(f" - {HOME_JS_FILE}（トップ新刊用・軽量）")
print(f" - {UPDATED_FILE}")
print(f" - 書籍数: {len(books):,}")
