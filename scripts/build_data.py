import csv
import hashlib
import html
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data" / "book_search_master.csv"
HIDDEN_IDS_FILE = ROOT / "data" / "book_hidden_ids.txt"
DOCS = ROOT / "docs"
OUTPUT_DIR = DOCS / "data"
COVERS_DIR = DOCS / "assets" / "covers"
ERRATA_DIR = DOCS / "assets" / "errata"
ERRATA_FILENAME_RE = re.compile(r"^errata(?P<book_id>(?:\d{5}|N\d{5}))\.pdf$")
RELATED_DIR = DOCS / "assets" / "related"
RELATED_FILENAME_RE = re.compile(r"^(?P<book_id>(?:\d{5}|N\d{5}))(?P<ext>\.[A-Za-z0-9]+)$")
RELATED_ALLOWED_EXTENSIONS = {
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
SEARCH_JSON_FILE = OUTPUT_DIR / "books-search.json"
ADMIN_SEARCH_JSON_FILE = OUTPUT_DIR / "books-admin-search.json"
SEARCH_INDEX_FILE = OUTPUT_DIR / "books-search-index.json"
ADMIN_SEARCH_INDEX_FILE = OUTPUT_DIR / "books-admin-search-index.json"
DETAIL_DIR = OUTPUT_DIR / "book-details"
UPDATED_FILE = OUTPUT_DIR / "last-updated.txt"
HOME_JS_FILE = OUTPUT_DIR / "home-books.js"

# 旧構成の巨大生成物。新構成では使用しないため、ビルド時に削除する。
LEGACY_FILES = [
    OUTPUT_DIR / "books.js",
    OUTPUT_DIR / "books.json",
    OUTPUT_DIR / "admin-books.js",
]

# 初期表示用JSONは同じキー名を全書籍で繰り返さない列指向形式にする。
# 検索専用の補助文字列は別索引へ分離し、初期表示の転送量と処理負荷を下げる。
SEARCH_COLUMNS = [
    "id",
    "cover",
    "pub_year",
    "title",
    "subtitle_before",
    "subtitle_after",
    "author",
    "isbn",
    "pub_month",
    "genres",
    "series",
    "series_volume",
    "price_body",
    "format",
    "pages",
    "published",
    "status_flags",
    "identifiers",
]


def clean(value):
    return (value or "").replace("\x00", "").strip()


def clean_public_text(value):
    value = clean(value)
    if not value:
        return ""
    value = html.unescape(value)

    # 旧HP由来のアンカーを、安全なMarkdownリンクへ変換して残す。
    # 例: <a href="https://example.com"><font>【コチラ】</font></a>
    #      -> [【コチラ】](https://example.com)
    def replace_anchor(match):
        attrs = match.group(1) or ""
        inner = match.group(2) or ""
        href_match = re.search(
            r"(?i)\bhref\s*=\s*(?:\"([^\"]+)\"|'([^']+)'|([^\s>]+))",
            attrs,
        )
        if not href_match:
            return re.sub(r"<[^>]+>", "", inner)
        href = next((x for x in href_match.groups() if x is not None), "").strip()
        if not (
            href.startswith("https://")
            or href.startswith("http://")
            or href.startswith("/")
            or href.startswith("./")
            or href.startswith("../")
        ):
            return re.sub(r"<[^>]+>", "", inner)
        label = re.sub(r"<[^>]+>", "", inner).strip() or href
        return f"[{label}]({href})"

    value = re.sub(r"(?is)<a\b([^>]*)>(.*?)</a>", replace_anchor, value)
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


def load_hidden_ids(book_ids):
    if not HIDDEN_IDS_FILE.exists():
        return set()

    hidden_ids = set()
    invalid = []
    for raw_line in HIDDEN_IDS_FILE.read_text(encoding="utf-8").splitlines():
        value = raw_line.strip()
        if not value or value.startswith("#"):
            continue
        if not re.fullmatch(r"(?:\d{5}|N\d{5})", value):
            invalid.append(value)
            continue
        hidden_ids.add(value)

    if invalid:
        raise SystemExit(
            "公開停止IDファイルに不正な書籍IDがあります: " + ", ".join(sorted(invalid))
        )

    unknown = sorted(hidden_ids - set(book_ids))
    if unknown:
        raise SystemExit(
            "公開停止IDに対応する書籍がマスターCSVにありません: " + ", ".join(unknown)
        )

    return hidden_ids


def collect_errata_files(book_ids):
    if not ERRATA_DIR.exists():
        return {}

    errata_files = {}
    invalid_names = []
    invalid_pdfs = []

    for path in sorted(ERRATA_DIR.iterdir()):
        if not path.is_file() or path.name.startswith("."):
            continue
        if path.suffix.lower() != ".pdf":
            continue

        match = ERRATA_FILENAME_RE.fullmatch(path.name)
        if not match:
            invalid_names.append(path.name)
            continue

        content = path.read_bytes()
        if not content.startswith(b"%PDF-"):
            invalid_pdfs.append(path.name)
            continue

        book_id = match.group("book_id")
        digest = hashlib.sha256(content).hexdigest()[:12]
        errata_files[book_id] = f"assets/errata/{path.name}?v={digest}"

    if invalid_names:
        raise SystemExit(
            "正誤表PDFのファイル名が不正です。errata<書籍ID>.pdf にしてください: "
            + ", ".join(invalid_names)
        )
    if invalid_pdfs:
        raise SystemExit(
            "正誤表PDFとして読み込めないファイルがあります: "
            + ", ".join(invalid_pdfs)
        )

    unknown_ids = sorted(set(errata_files) - set(book_ids))
    if unknown_ids:
        raise SystemExit(
            "正誤表PDFに対応する書籍IDが書誌にありません: "
            + ", ".join(unknown_ids)
        )

    return errata_files


def collect_related_files(book_ids):
    if not RELATED_DIR.exists():
        return {}

    related_files = {}
    invalid_names = []
    invalid_types = []
    invalid_files = []
    duplicates = []

    for path in sorted(RELATED_DIR.iterdir()):
        if not path.is_file() or path.name.startswith("."):
            continue

        match = RELATED_FILENAME_RE.fullmatch(path.name)
        if not match:
            invalid_names.append(path.name)
            continue

        book_id = match.group("book_id")
        ext = match.group("ext").lower()
        if ext not in RELATED_ALLOWED_EXTENSIONS:
            invalid_types.append(path.name)
            continue

        if book_id in related_files:
            duplicates.append(book_id)
            continue

        content = path.read_bytes()
        if not content:
            invalid_files.append(path.name)
            continue
        if ext == ".pdf" and not content.startswith(b"%PDF-"):
            invalid_files.append(path.name)
            continue
        if ext in {".zip", ".xlsx", ".xlsm", ".docx", ".pptx"} and not content.startswith(b"PK"):
            invalid_files.append(path.name)
            continue

        digest = hashlib.sha256(content).hexdigest()[:12]
        related_files[book_id] = f"assets/related/{path.name}?v={digest}"

    if invalid_names:
        raise SystemExit(
            "関連情報・付属データのファイル名が不正です。<書籍ID>.<拡張子> にしてください: "
            + ", ".join(invalid_names)
        )
    if invalid_types:
        raise SystemExit(
            "関連情報・付属データで未対応のファイル形式があります。複数資料や特殊形式はZIPにまとめてください: "
            + ", ".join(invalid_types)
        )
    if invalid_files:
        raise SystemExit(
            "関連情報・付属データとして読み込めないファイルがあります: "
            + ", ".join(invalid_files)
        )
    if duplicates:
        raise SystemExit(
            "同じ書籍IDの関連情報・付属データが複数あります。1冊につき1ファイルにし、複数資料はZIPにまとめてください: "
            + ", ".join(sorted(set(duplicates)))
        )

    unknown_ids = sorted(set(related_files) - set(book_ids))
    if unknown_ids:
        raise SystemExit(
            "関連情報・付属データに対応する書籍IDが書誌にありません: "
            + ", ".join(unknown_ids)
        )

    return related_files


def build_date_jst():
    return datetime.now(timezone(timedelta(hours=9))).strftime("%Y/%m/%d")


def normalized_pub_month(value):
    value = clean(value)
    if not value:
        return ""
    parts = re.split(r"[-./]", value)
    if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
        return f"{int(parts[0]):04d}.{int(parts[1]):02d}"
    if len(parts) == 1 and parts[0].isdigit() and len(parts[0]) == 4:
        return parts[0]
    return value


def detail_key(pub_year):
    return str(pub_year) if isinstance(pub_year, int) and pub_year > 0 else "undated"


def normalize_search_text(value):
    value = unicodedata.normalize("NFKC", str(value or "")).lower()
    value = re.sub(r"[‐-‒–—―−ーｰ]", "-", value)
    value = re.sub(r"[・･,，、。\./:;；：()（）\[\]【】「」『』<>＜＞]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def normalize_identifier(value):
    return re.sub(r"[^0-9x]", "", normalize_search_text(value))


def publication_sort_key(book):
    match = re.match(r"^(\d{4})[.\/-]?(\d{1,2})?", str(book.get("pub_month") or ""))
    if match:
        return int(match.group(1)) * 10000 + int(match.group(2) or 0) * 100
    return int(book.get("pub_year") or 0) * 10000


def make_search_row(book):
    identifiers = []
    for value in (book.get("isbn_old"), book.get("isbn_new")):
        value = clean(value)
        if value and value not in identifiers:
            identifiers.append(value)
    status_flags = (1 if book.get("has_errata") else 0) | (2 if book.get("has_related_info") else 0)
    return [
        book.get("id", ""),
        book.get("cover", ""),
        book.get("pub_year"),
        book.get("title", ""),
        book.get("subtitle_before", ""),
        book.get("subtitle_after", ""),
        book.get("author", ""),
        book.get("isbn", ""),
        book.get("pub_month", ""),
        book.get("genres", []),
        book.get("series", ""),
        book.get("series_volume", ""),
        book.get("price_body"),
        book.get("format", ""),
        book.get("pages"),
        bool(book.get("published", True)),
        status_flags,
        "|".join(identifiers),
    ]


def make_search_index(book, *, include_id=False):
    identifiers = []
    for value in (book.get("isbn_old"), book.get("isbn_new")):
        value = clean(value)
        if value and value not in identifiers:
            identifiers.append(value)
    index_identifiers = []
    for value in (book.get("isbn"), *identifiers):
        normalized = normalize_identifier(value)
        if normalized and normalized not in index_identifiers:
            index_identifiers.append(normalized)

    values = []
    if include_id:
        values.append(book.get("id", ""))
    values.extend([
        book.get("title", ""),
        book.get("subtitle_before", ""),
        book.get("subtitle_after", ""),
        book.get("author", ""),
        book.get("isbn", "") if include_id else " ".join(index_identifiers),
        "|".join(identifiers) if include_id else "",
        " ".join(book.get("genres", [])),
        book.get("series", ""),
        book.get("search_extra", ""),
    ])
    return normalize_search_text(" ".join(str(value) for value in values if value))


if not INPUT.exists():
    raise SystemExit(f"入力CSVがありません: {INPUT}")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DETAIL_DIR.mkdir(parents=True, exist_ok=True)

with INPUT.open("r", encoding="utf-8-sig", newline="") as f:
    rows = list(csv.DictReader(f))

if not rows:
    raise SystemExit("公開用マスターCSVにレコードがありません。")

book_ids_from_rows = [clean(r.get("id")) for r in rows]
hidden_ids = load_hidden_ids(book_ids_from_rows)
errata_files = collect_errata_files(book_ids_from_rows)
related_files = collect_related_files(book_ids_from_rows)

updated_date = build_date_jst()
search_books = []
details_by_year = defaultdict(dict)

for r in rows:
    book_id = clean(r.get("id"))
    title = clean(r.get("title"))
    isbn_old = clean(r.get("isbn_old"))
    isbn_new = clean(r.get("isbn_new"))
    amazon_asin = clean(r.get("amazon_asin")).upper()
    pub_year = number(r.get("pub_year"))
    pub_month = normalized_pub_month(r.get("pub_month"))
    year_key = detail_key(pub_year)
    errata_pdf = errata_files.get(book_id, "")
    related_file = related_files.get(book_id, "")
    has_errata = clean(r.get("has_errata")) == "1" or bool(errata_pdf)
    has_related_info = clean(r.get("has_related_info")) == "1" or bool(related_file)
    published = book_id not in hidden_ids

    if amazon_asin and not re.fullmatch(r"[A-Z0-9]{10}", amazon_asin):
        raise SystemExit(
            f"Amazon ASINの形式が不正です（書籍ID {book_id}）: {amazon_asin}"
        )

    search_extra_parts = [
        r.get("search_title"),
        r.get("title_kana"),
        r.get("author_kana"),
        r.get("hp_keywords"),
    ]

    search_book = {
        "id": book_id,
        "detail_key": year_key,
        "cover": cover_path(book_id),
        "title": title,
        "subtitle_before": clean(r.get("subtitle_before")),
        "subtitle_after": clean(r.get("subtitle_after")),
        "author": clean(r.get("author")),
        "isbn": isbn_new or isbn_old,
        "isbn_old": isbn_old,
        "isbn_new": isbn_new,
        "pub_month": pub_month,
        "pub_year": pub_year,
        "genres": split_pipe(r.get("genres")),
        "series": clean(r.get("series")),
        "series_volume": clean(r.get("series_volume")),
        "price_body": number(r.get("price_body")),
        "format": clean(r.get("format")),
        "pages": number(r.get("pages")),
        "published": published,
        "has_errata": has_errata,
        "has_related_info": has_related_info,
        "search_extra": " ".join(clean(x) for x in search_extra_parts if clean(x)),
    }
    search_books.append(search_book)

    details_by_year[year_key][book_id] = {
        "id": book_id,
        "title": title,
        "subtitle_before": clean(r.get("subtitle_before")),
        "subtitle_after": clean(r.get("subtitle_after")),
        "author": clean(r.get("author")),
        "author_kana": clean(r.get("author_kana")),
        "title_kana": clean(r.get("title_kana")),
        "search_title": clean(r.get("search_title")),
        "isbn_old": isbn_old,
        "isbn_new": isbn_new,
        "amazon_asin": amazon_asin,
        "pub_month": pub_month,
        "pub_month_raw": clean(r.get("pub_month")),
        "pub_year": pub_year,
        "genres": split_pipe(r.get("genres")),
        "series": clean(r.get("series")),
        "series_volume": clean(r.get("series_volume")),
        "price_body": number(r.get("price_body")),
        "format": clean(r.get("format")),
        "pages": number(r.get("pages")),
        "hp_keywords": clean(r.get("hp_keywords")),
        "pub_note": clean_public_text(r.get("pub_note")),
        "description": clean_public_text(r.get("description")),
        "toc": clean_public_text(r.get("toc")),
        "original_title": clean_public_text(r.get("original_title")),
        "has_errata": has_errata,
        "errata_pdf": errata_pdf,
        "has_related_info": has_related_info,
        "related_file": related_file,
    }

if len(search_books) != len(rows):
    raise SystemExit("CSV行数と生成した書籍件数が一致しません。")
if any(not b["id"] or not b["title"] for b in search_books):
    raise SystemExit("書籍IDまたは書名が空欄のレコードがあります。")
if len({b["id"] for b in search_books}) != len(search_books):
    raise SystemExit("書籍IDが重複しています。")

public_books = [book for book in search_books if book.get("published", True)]

# Top page only needs a small recent-book dataset.
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
    for b in public_books
    if b["pub_year"] is not None and min_year <= b["pub_year"] <= max_year
]

# 公開検索は公開中の書籍だけ、管理画面は公開停止中を含む全書籍を持つ。
search_rows = [make_search_row(book) for book in public_books]
search_index = [make_search_index(book, include_id=False) for book in public_books]
search_sort_keys = [publication_sort_key(book) for book in public_books]
default_order = sorted(range(len(search_rows)), key=lambda i: (-search_sort_keys[i], i))

admin_search_rows = [make_search_row(book) for book in search_books]
admin_search_index = [make_search_index(book, include_id=True) for book in search_books]
admin_sort_keys = [publication_sort_key(book) for book in search_books]
admin_default_order = sorted(range(len(admin_search_rows)), key=lambda i: (-admin_sort_keys[i], i))

search_payload = {
    "updated": updated_date,
    "columns": SEARCH_COLUMNS,
    "default_order": default_order,
    "books": search_rows,
}
admin_search_payload = {
    "updated": updated_date,
    "columns": SEARCH_COLUMNS,
    "default_order": admin_default_order,
    "books": admin_search_rows,
}
search_index_payload = {
    "updated": updated_date,
    "search": search_index,
}
admin_search_index_payload = {
    "updated": updated_date,
    "search": admin_search_index,
}
search_json = json.dumps(search_payload, ensure_ascii=False, separators=(",", ":"))
admin_search_json = json.dumps(admin_search_payload, ensure_ascii=False, separators=(",", ":"))
search_index_json = json.dumps(search_index_payload, ensure_ascii=False, separators=(",", ":"))
admin_search_index_json = json.dumps(admin_search_index_payload, ensure_ascii=False, separators=(",", ":"))
home_books_js = (
    "window.NIPPYO_HOME_BOOKS="
    + json.dumps(home_books, ensure_ascii=False, separators=(",", ":"))
    + ";\nwindow.NIPPYO_LAST_UPDATED="
    + json.dumps(updated_date, ensure_ascii=False)
    + ";\n"
)

for old_detail in DETAIL_DIR.glob("books-detail-*.json"):
    old_detail.unlink()

DETAIL_DIR.mkdir(parents=True, exist_ok=True)
detail_contents = []
for year_key in sorted(details_by_year, key=lambda x: (x == "undated", x)):
    detail_payload = details_by_year[year_key]
    detail_json = json.dumps(detail_payload, ensure_ascii=False, separators=(",", ":"))
    detail_path = DETAIL_DIR / f"books-detail-{year_key}.json"
    detail_path.write_text(detail_json + "\n", encoding="utf-8")
    detail_contents.append(f"{year_key}\n{detail_json}")

SEARCH_JSON_FILE.write_text(search_json + "\n", encoding="utf-8")
ADMIN_SEARCH_JSON_FILE.write_text(admin_search_json + "\n", encoding="utf-8")
SEARCH_INDEX_FILE.write_text(search_index_json + "\n", encoding="utf-8")
ADMIN_SEARCH_INDEX_FILE.write_text(admin_search_index_json + "\n", encoding="utf-8")
HOME_JS_FILE.write_text(home_books_js, encoding="utf-8")

data_version = hashlib.sha256(
    (
        search_json
        + "\n"
        + admin_search_json
        + "\n"
        + search_index_json
        + "\n"
        + admin_search_index_json
        + "\n"
        + home_books_js
        + "\n"
        + "\n".join(detail_contents)
    ).encode("utf-8")
).hexdigest()[:16]
UPDATED_FILE.write_text(data_version + "\n", encoding="utf-8")

for legacy_file in LEGACY_FILES:
    if legacy_file.exists():
        legacy_file.unlink()

print("生成完了")
print(f" - {SEARCH_JSON_FILE}（公開検索用・軽量）")
print(f" - {ADMIN_SEARCH_JSON_FILE}（管理画面用・公開停止中を含む）")
print(f" - {SEARCH_INDEX_FILE}（公開用・正規化済み検索索引・遅延読込）")
print(f" - {ADMIN_SEARCH_INDEX_FILE}（管理画面用・正規化済み検索索引・遅延読込）")
print(f" - {DETAIL_DIR}（書籍詳細・刊行年別）")
print(f" - {HOME_JS_FILE}（トップ新刊用・軽量）")
print(f" - {UPDATED_FILE}")
print(f" - 書籍数: {len(search_books):,}（公開 {len(public_books):,}／公開停止 {len(hidden_ids):,}）")
print(f" - 正誤表PDF: {len(errata_files):,}")
print(f" - 関連情報・付属データ: {len(related_files):,}")
print(f" - 詳細ファイル数: {len(details_by_year):,}")
print(f" - 公開検索データ: {SEARCH_JSON_FILE.stat().st_size / 1024 / 1024:.2f} MB")
print(f" - 管理検索データ: {ADMIN_SEARCH_JSON_FILE.stat().st_size / 1024 / 1024:.2f} MB")
print(f" - 公開検索索引: {SEARCH_INDEX_FILE.stat().st_size / 1024 / 1024:.2f} MB")
print(f" - 管理索引: {ADMIN_SEARCH_INDEX_FILE.stat().st_size / 1024 / 1024:.2f} MB")
