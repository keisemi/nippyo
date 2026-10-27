import csv
import hashlib
import html
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data" / "magazines"
OUTPUT_DIR = ROOT / "docs" / "data"
DETAIL_DIR = OUTPUT_DIR / "magazine-details"
SEARCH_JSON_FILE = OUTPUT_DIR / "magazine-issues-search.json"
SEARCH_INDEX_FILE = OUTPUT_DIR / "magazine-issues-search-index.json"
UPDATED_FILE = OUTPUT_DIR / "magazine-last-updated.txt"

MAGAZINES = [
    ("1", "法律時報", "01_horitsu_jiho.csv"),
    ("2", "法学セミナー", "02_hogaku_seminar.csv"),
    ("3", "経済セミナー", "03_keizai_seminar.csv"),
    ("4", "数学セミナー", "04_sugaku_seminar.csv"),
    ("6", "こころの科学", "05_kokoro_no_kagaku.csv"),
    ("7", "そだちの科学", "06_sodachi_no_kagaku.csv"),
]

# 初期表示用JSONは列名を1回だけ持つ列指向形式にし、検索専用文字列は別索引へ分離する。
SEARCH_COLUMNS = [
    "id",
    "magazine_id",
    "magazine_name",
    "issue",
    "issue_number",
    "pub_date",
    "pub_year",
    "feature",
    "feature_subtitle",
    "feature2",
    "feature2_subtitle",
    "isbn",
    "identifiers",
    "format",
    "pages",
    "price_body",
    "contributors",
]

EXPECTED_COLUMNS = [
    "書籍ID", "WEB公開属性", "出版形態", "アーカイブズID", "雑誌ID", "雑誌月号", "雑誌通算番号",
    "前副題", "特集", "特集よみ", "後副題", "特集用内容紹介文見出", "特集用内容紹介文",
    "前副題2", "特集2", "特集2よみ", "後副題2", "特集２用内容紹介文見出", "特集２用内容紹介文",
    "目次", "検索用キーワード", "ISBNコード", "新ISBNコード", "雑誌コード(1)", "雑誌コード(2)",
    "発刊日", "判型", "ページ数", "本体価格", "商品別消費税率", "在庫ステータス", "受け取りフラグ",
    "外部リンクタイトル（1）", "外部リンクコメント（1）", "外部リンクアドレス（1）",
    "外部リンクタイトル（2）", "外部リンクコメント（2）", "外部リンクアドレス（2）",
    "外部リンクタイトル（3）", "外部リンクコメント（3）", "外部リンクアドレス（3）",
    "電子書籍 kindle版URL", "電子書籍 大学生協版URL", "電子書籍 Google Play", "電子書籍 iTunes",
    "電子書籍自己gaku", "電子書籍kinoppy", "電子書籍e-hon", "電子書籍ebookjapan", "電子書籍honto",
    "電子書籍楽天ブックス", "電子書籍7netショッピング", "電子書籍Fujisan.co.jp", "電子書籍M2PLUS",
    "電子書籍ビューン", "電子書籍タブホ", "電子書籍マガストア", "難易度", "関連雑誌ID",
    "関連書籍（1）", "関連書籍（2）", "関連書籍（3）", "登録日", "修正者", "最終修正日", "閲覧数",
    "次号予告", "次号特集", "次号コメント", "本誌編者",
]

# 古い号は表記が不統一なため、著者名らしさを無理に推測しない。
# 明確な「……氏名」「評者：氏名」「氏名＝編」等だけを検索補助に使う。
ROLE_PREFIX = re.compile(
    r"^(?:評者|著者|執筆|聞き手|語り手|訳者|訳|解説|出題|解答|編者|編)\s*[:：]?\s*"
)
TRAILING_PAGE = re.compile(r"(?:\s|　)+(?:p\.?\s*)?\d+(?:[-–—]\d+)?\s*$", re.I)
TRAILING_ROLE = re.compile(r"(?:\s|　)+(?:扉|表紙)\s*$")
BAD_CONTRIBUTOR_WORDS = (
    "事務局", "編集部", "委員会", "研究会", "出版社", "学会", "センター",
    "特別企画", "最終講義", "講義", "格差論", "データ解析", "今井班",
    "高齢出所者", "休載", "次号", "掲示板", "PICK UP", "BOOK", "REPORT",
    "翻訳", "監修",
)


def clean(value):
    return (value or "").replace("\x00", "").strip()


def clean_public_text(value):
    value = html.unescape(clean(value))
    if not value:
        return ""
    value = re.sub(r"(?i)<br\s*/?>", "\n", value)
    value = re.sub(r"(?is)<[^>]+>", "", value)
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def clean_feature_subtitle(value):
    value = clean_public_text(value)
    return re.sub(r"^\?\?", "―", value)


def number(value):
    value = clean(value)
    if not value:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def build_date_jst():
    return datetime.now(timezone(timedelta(hours=9))).strftime("%Y/%m/%d")


def read_source_csv(path):
    last_error = None
    for encoding in ("utf-8-sig", "cp932"):
        try:
            with path.open("r", encoding=encoding, newline="") as f:
                reader = csv.DictReader(f)
                fieldnames = reader.fieldnames or []
                rows = list(reader)
            return fieldnames, rows, encoding
        except UnicodeDecodeError as error:
            last_error = error
    raise SystemExit(f"CSVの文字コードを判定できません: {path} ({last_error})")


def publication_year(row):
    pub_date = clean(row.get("発刊日"))
    match = re.match(r"(\d{4})", pub_date)
    if match:
        return int(match.group(1))
    issue = clean(row.get("雑誌月号"))
    match = re.search(r"(?:19|20)\d{2}", issue)
    return int(match.group(0)) if match else None


def detail_key(year):
    return str(year) if isinstance(year, int) and year > 0 else "undated"


def normalize_search_text(value):
    value = unicodedata.normalize("NFKC", str(value or "")).lower()
    value = re.sub(r"[‐-‒–—―−ーｰ]", "-", value)
    value = re.sub(r"[・･,，、。\./:;；：()（）\[\]【】「」『』<>＜＞]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def normalize_identifier(value):
    return re.sub(r"[^0-9x]", "", normalize_search_text(value))


def publication_sort_key(issue):
    match = re.match(r"^(\d{4})[-/.]?(\d{1,2})?[-/.]?(\d{1,2})?", str(issue.get("pub_date") or ""))
    if match:
        return int(match.group(1)) * 10000 + int(match.group(2) or 0) * 100 + int(match.group(3) or 0)
    return int(issue.get("pub_year") or 0) * 10000


def normalize_contributor_piece(value):
    value = clean_public_text(value)
    value = ROLE_PREFIX.sub("", value)
    value = TRAILING_PAGE.sub("", value)
    value = TRAILING_ROLE.sub("", value)
    value = re.sub(r"^[\s　・･,，、:：]+|[\s　・･,，、:：]+$", "", value)
    value = re.sub(r"\s*(?:（.*?）|\(.*?\))\s*$", "", value)
    value = re.sub(
        r"\s*(?:＝|=)\s*(?:編著|編者|編|著者|著|監修|訳者|訳)\s*$",
        "",
        value,
    )
    return value.strip()


def plausible_contributor(value):
    if not value or len(value) > 32:
        return False
    if any(word.lower() in value.lower() for word in BAD_CONTRIBUTOR_WORDS):
        return False
    if re.search(r"[「」『』【】<>〈〉［］\[\]!?！？;；]", value):
        return False
    if re.search(r"\d", value):
        return False
    if not re.fullmatch(
        r"[一-龥々〆ヶぁ-んァ-ヶーA-Za-zÀ-ÖØ-öø-ÿ\s　・･.\-]+",
        value,
    ):
        return False

    compact = re.sub(r"[\s　・･.\-]", "", value)
    if len(compact) < 2:
        return False

    has_kanji = bool(re.search(r"[一-龥々〆ヶ]", value))
    has_latin = bool(re.search(r"[A-Za-zÀ-ÖØ-öø-ÿ]", value))
    has_katakana = bool(re.search(r"[ァ-ヶ]", value))

    if has_kanji:
        # 日本語の人名は姓・名の間に空白が1つ入ることはあるが、
        # 3語以上の文章断片は人名と断定しない。
        if len(re.split(r"[\s　]+", value.strip())) >= 3:
            return False
        return len(compact) <= 16
    if has_latin:
        return len(compact) <= 28 and (" " in value or "-" in value or "." in value)
    if has_katakana:
        return len(compact) <= 20 and ("・" in value or " " in value or "　" in value)
    return False


def split_contributors(value):
    value = normalize_contributor_piece(value)
    if not value:
        return []

    # 古いデータに「氏名 氏名 氏名」のように複数人が空白だけで
    # 並ぶ例がある。各語が明確な日本人名らしい場合だけ分割する。
    whitespace_parts = [part for part in re.split(r"[\s　]+", value) if part]
    if (
        len(whitespace_parts) >= 3
        and all(
            2 <= len(part) <= 8 and re.search(r"[一-龥々〆ヶ]", part)
            for part in whitespace_parts
        )
    ):
        parts = whitespace_parts
    else:
        parts = re.split(r"\s*(?:×|／|/|、|，|,|\+|＋|＆|&)\s*", value)
    expanded = []
    for part in parts:
        part = part.strip()
        if "・" in part:
            pieces = [piece.strip() for piece in part.split("・") if piece.strip()]
            # 日本人名が中黒で複数並んでいるケースだけ分割する。
            # 外国人名（例：ケネス・盛・マッケルウェイン）は分割しない。
            if (
                2 <= len(pieces) <= 12
                and all(
                    re.search(r"[一-龥々〆ヶ]", piece)
                    and len(re.sub(r"[\s　]", "", piece)) <= 10
                    for piece in pieces
                )
            ):
                expanded.extend(pieces)
            else:
                expanded.append(part)
        else:
            expanded.append(part)

    result = []
    for part in expanded:
        candidate = normalize_contributor_piece(part)
        if candidate and plausible_contributor(candidate):
            result.append(candidate)
    return result


def extract_contributors(toc):
    text = clean_public_text(toc)
    if not text:
        return []

    names = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue

        # 現行データで最も一般的な「記事名……著者名」の形。
        match = re.search(r"(?:…{2,}|\.\.\.+)\s*([^…]+)$", line)
        if match:
            names.extend(split_contributors(match.group(1)))

        # 「……評者：氏名」等の明示的な役割表記。
        for role_match in re.finditer(
            r"(?:評者|著者|執筆|聞き手|語り手|訳者|解説|出題|解答)\s*[:：]\s*([^\n]+)$",
            line,
        ):
            names.extend(split_contributors(role_match.group(1)))

        # 「氏名＝編」「氏名＝著」等。
        for editor_match in re.finditer(
            r"([一-龥々〆ヶぁ-んァ-ヶーA-Za-zÀ-ÖØ-öø-ÿ\s　・･.\-]{2,32})"
            r"\s*(?:＝|=)\s*(?:編著|編者|編|著者|著)(?=\s|（|\(|$)",
            line,
        ):
            names.extend(split_contributors(editor_match.group(1)))

    # 出現順を保って重複除去。
    seen = set()
    result = []
    for name in names:
        name = re.sub(r"\s+", " ", name).strip()
        if name and name not in seen:
            seen.add(name)
            result.append(name)
    return result


def external_links(row):
    links = []
    for i in (1, 2, 3):
        url = clean(row.get(f"外部リンクアドレス（{i}）"))
        if not url:
            continue
        links.append(
            {
                "title": clean(row.get(f"外部リンクタイトル（{i}）")),
                "comment": clean_public_text(row.get(f"外部リンクコメント（{i}）")),
                "url": url,
            }
        )
    return links


def ebook_links(row):
    links = []
    for service, column in (
        ("kindle", "電子書籍 kindle版URL"),
        ("univcoop", "電子書籍 大学生協版URL"),
        ("google_play", "電子書籍 Google Play"),
        ("itunes", "電子書籍 iTunes"),
        ("jiko_gaku", "電子書籍自己gaku"),
        ("kinoppy", "電子書籍kinoppy"),
        ("e_hon", "電子書籍e-hon"),
        ("ebookjapan", "電子書籍ebookjapan"),
        ("honto", "電子書籍honto"),
        ("rakuten_books", "電子書籍楽天ブックス"),
        ("7net", "電子書籍7netショッピング"),
        ("fujisan", "電子書籍Fujisan.co.jp"),
        ("m2plus", "電子書籍M2PLUS"),
        ("viewn", "電子書籍ビューン"),
        ("tabho", "電子書籍タブホ"),
        ("magastore", "電子書籍マガストア"),
    ):
        url = clean(row.get(column))
        if url:
            links.append({"service": service, "url": url})
    return links


OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DETAIL_DIR.mkdir(parents=True, exist_ok=True)

updated_date = build_date_jst()
search_issues = []
details_by_year = defaultdict(dict)
source_encodings = {}
contributor_stats = defaultdict(lambda: {"issues": 0, "with_contributors": 0, "names": 0})

for magazine_id, magazine_name, filename in MAGAZINES:
    path = SOURCE_DIR / filename
    if not path.exists():
        raise SystemExit(f"雑誌CSVがありません: {path}")

    fieldnames, rows, encoding = read_source_csv(path)
    source_encodings[filename] = encoding
    if fieldnames != EXPECTED_COLUMNS:
        raise SystemExit(f"CSV列構成が想定と一致しません: {path}")
    if not rows:
        raise SystemExit(f"雑誌CSVが空です: {path}")

    for row in rows:
        if clean(row.get("雑誌ID")) != magazine_id:
            raise SystemExit(
                f"雑誌IDがファイルと一致しません: {path} / 書籍ID {clean(row.get('書籍ID'))}"
            )
        # 現在の6CSVは全件1。将来0等が混入した場合に意味を推測して
        # 公開しないよう、ビルドを止めて人間の確認を求める。
        if clean(row.get("WEB公開属性")) != "1":
            raise SystemExit(
                f"WEB公開属性が1ではありません。公開可否を確認してください: "
                f"{path} / 書籍ID {clean(row.get('書籍ID'))} / 値 {clean(row.get('WEB公開属性'))}"
            )

        issue_id = clean(row.get("書籍ID"))
        issue_label = clean(row.get("雑誌月号"))
        pub_year = publication_year(row)
        year_key = detail_key(pub_year)
        contributors = extract_contributors(row.get("目次"))
        isbn_old = clean(row.get("ISBNコード"))
        isbn_new = clean(row.get("新ISBNコード"))

        search_issue = {
            "id": issue_id,
            "detail_key": year_key,
            "type": "magazine_issue",
            "magazine_id": magazine_id,
            "magazine_name": magazine_name,
            "issue": issue_label,
            "issue_number": clean(row.get("雑誌通算番号")),
            "pub_date": clean(row.get("発刊日")),
            "pub_year": pub_year,
            "feature": clean_public_text(row.get("特集")),
            "feature_subtitle": clean_feature_subtitle(row.get("後副題")),
            "feature2": clean_public_text(row.get("特集2")),
            "feature2_subtitle": clean_feature_subtitle(row.get("後副題2")),
            "isbn": isbn_new or isbn_old,
            "isbn_old": isbn_old,
            "isbn_new": isbn_new,
            "magazine_code_1": clean(row.get("雑誌コード(1)")),
            "magazine_code_2": clean(row.get("雑誌コード(2)")),
            "format": clean(row.get("判型")),
            "pages": number(row.get("ページ数")),
            "price_body": number(row.get("本体価格")),
            "contributors": contributors,
            # 目次全文や記事タイトルは入れない。特集よみ＋確実に抽出できた人名だけを検索補助にする。
            "search_extra": " ".join(
                value
                for value in (
                    clean(row.get("特集よみ")),
                    clean(row.get("特集2よみ")),
                )
                if value
            ),
        }
        search_issues.append(search_issue)

        details_by_year[year_key][issue_id] = {
            **search_issue,
            "subtitle_before": clean_public_text(row.get("前副題")),
            "feature_yomi": clean(row.get("特集よみ")),
            "description_heading": clean_public_text(row.get("特集用内容紹介文見出")),
            "description": clean_public_text(row.get("特集用内容紹介文")),
            "subtitle_before2": clean_public_text(row.get("前副題2")),
            "feature2_yomi": clean(row.get("特集2よみ")),
            "description_heading2": clean_public_text(row.get("特集２用内容紹介文見出")),
            "description2": clean_public_text(row.get("特集２用内容紹介文")),
            "toc": clean_public_text(row.get("目次")),
            "external_links": external_links(row),
            "ebook_links": ebook_links(row),
            "editor": clean_public_text(row.get("本誌編者")),
        }

        stats = contributor_stats[magazine_name]
        stats["issues"] += 1
        if contributors:
            stats["with_contributors"] += 1
            stats["names"] += len(contributors)

if not search_issues:
    raise SystemExit("雑誌号データがありません。")

ids = [issue["id"] for issue in search_issues]
if any(not issue_id for issue_id in ids):
    raise SystemExit("空の雑誌号IDがあります。")
if len(ids) != len(set(ids)):
    raise SystemExit("雑誌号ID（書籍ID）が重複しています。")
if any(not issue["magazine_name"] or not issue["issue"] for issue in search_issues):
    raise SystemExit("雑誌名または雑誌月号が空欄の公開レコードがあります。")

# 検索用データは新しい号を先にする。日付が同じ場合は元のID順。
search_issues.sort(
    key=lambda issue: (
        issue.get("pub_date") or "",
        issue.get("magazine_id") or "",
        issue.get("id") or "",
    ),
    reverse=True,
)

search_rows = []
search_index = []
sort_keys = []
for issue in search_issues:
    identifiers = []
    for value in (
        issue.get("isbn_old"),
        issue.get("isbn_new"),
        issue.get("magazine_code_1"),
        issue.get("magazine_code_2"),
    ):
        value = clean(value)
        if value and value not in identifiers:
            identifiers.append(value)
    index_identifiers = []
    for value in (issue.get("isbn"), *identifiers):
        normalized = normalize_identifier(value)
        if normalized and normalized not in index_identifiers:
            index_identifiers.append(normalized)
    search_rows.append([
        issue.get("id", ""),
        issue.get("magazine_id", ""),
        issue.get("magazine_name", ""),
        issue.get("issue", ""),
        issue.get("issue_number", ""),
        issue.get("pub_date", ""),
        issue.get("pub_year"),
        issue.get("feature", ""),
        issue.get("feature_subtitle", ""),
        issue.get("feature2", ""),
        issue.get("feature2_subtitle", ""),
        issue.get("isbn", ""),
        "|".join(identifiers),
        issue.get("format", ""),
        issue.get("pages"),
        issue.get("price_body"),
        issue.get("contributors", []),
    ])
    search_index.append(normalize_search_text(" ".join(
        str(value)
        for value in (
            issue.get("magazine_name", ""),
            issue.get("issue", ""),
            issue.get("issue_number", ""),
            issue.get("feature", ""),
            issue.get("feature_subtitle", ""),
            issue.get("feature2", ""),
            issue.get("feature2_subtitle", ""),
            " ".join(index_identifiers),
            " ".join(issue.get("contributors", [])),
            issue.get("search_extra", ""),
        )
        if value
    )))
    sort_keys.append(publication_sort_key(issue))

default_order = sorted(range(len(search_rows)), key=lambda i: (-sort_keys[i], i))

search_payload = {
    "updated": updated_date,
    "columns": SEARCH_COLUMNS,
    "default_order": default_order,
    "issues": search_rows,
}
search_index_payload = {
    "updated": updated_date,
    "search": search_index,
}
search_json = json.dumps(search_payload, ensure_ascii=False, separators=(",", ":"))
search_index_json = json.dumps(search_index_payload, ensure_ascii=False, separators=(",", ":"))
SEARCH_JSON_FILE.write_text(search_json + "\n", encoding="utf-8")
SEARCH_INDEX_FILE.write_text(search_index_json + "\n", encoding="utf-8")

# 前回生成した年別詳細だけを削除し、現在の6CSVから再生成する。
for old_detail in DETAIL_DIR.glob("magazine-details-*.json"):
    old_detail.unlink()

detail_contents = []
for year_key in sorted(details_by_year, key=lambda value: (value == "undated", value)):
    payload = details_by_year[year_key]
    detail_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    detail_path = DETAIL_DIR / f"magazine-details-{year_key}.json"
    detail_path.write_text(detail_json + "\n", encoding="utf-8")
    detail_contents.append(f"{year_key}\n{detail_json}")

version = hashlib.sha256(
    (search_json + "\n" + search_index_json + "\n" + "\n".join(detail_contents)).encode("utf-8")
).hexdigest()[:16]
UPDATED_FILE.write_text(version + "\n", encoding="utf-8")

print("雑誌号データ生成完了")
print(f" - {SEARCH_JSON_FILE}（初期表示用・軽量）")
print(f" - {SEARCH_INDEX_FILE}（正規化済み検索索引・遅延読込）")
print(f" - {DETAIL_DIR}（雑誌号詳細・刊行年別）")
print(f" - {UPDATED_FILE}")
print(f" - 雑誌号数: {len(search_issues):,}")
print(f" - 詳細ファイル数: {len(details_by_year):,}")
print(f" - 初期表示データ: {SEARCH_JSON_FILE.stat().st_size / 1024 / 1024:.2f} MB")
print(f" - 検索索引: {SEARCH_INDEX_FILE.stat().st_size / 1024 / 1024:.2f} MB")
for _, magazine_name, filename in MAGAZINES:
    stats = contributor_stats[magazine_name]
    rate = stats["with_contributors"] / stats["issues"] if stats["issues"] else 0
    print(
        f" - {magazine_name}: {stats['issues']:,}号 / "
        f"人名抽出あり {stats['with_contributors']:,}号 ({rate:.1%}) / "
        f"抽出人名 {stats['names']:,}件 / {filename}={source_encodings[filename]}"
    )
