import csv
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data" / "news.csv"
OUTPUT_DIR = ROOT / "docs" / "data"
JSON_FILE = OUTPUT_DIR / "news.json"
JS_FILE = OUTPUT_DIR / "news.js"
UPDATED_FILE = OUTPUT_DIR / "news-last-updated.txt"

FIELD_ORDER = ["id", "date", "category", "title", "text", "url", "pinned", "published"]


def clean(value):
    return (value or "").replace("\x00", "").strip()


def truthy(value):
    return clean(value).lower() in {"1", "true", "yes", "on", "あり", "はい"}


def valid_date(value):
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


if not INPUT.exists():
    raise SystemExit(f"お知らせマスターがありません: {INPUT}")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

with INPUT.open("r", encoding="utf-8-sig", newline="") as f:
    reader = csv.DictReader(f)
    if reader.fieldnames != FIELD_ORDER:
        raise SystemExit(
            "お知らせCSVの列構成が想定と異なります。\n"
            f"想定: {FIELD_ORDER}\n実際: {reader.fieldnames}"
        )
    rows = [dict(row) for row in reader]

ids = []
public_news = []
for row in rows:
    news_id = clean(row.get("id"))
    date = clean(row.get("date"))
    title = clean(row.get("title"))
    if not news_id:
        raise SystemExit("空のお知らせIDがあります。")
    if not date or not valid_date(date):
        raise SystemExit(f"日付が不正です（{news_id}）: {date}")
    if not title:
        raise SystemExit(f"タイトルが空です（{news_id}）。")
    ids.append(news_id)

    if truthy(row.get("published")):
        public_news.append({
            "id": news_id,
            "date": date,
            "category": clean(row.get("category")) or "お知らせ",
            "title": title,
            "text": clean(row.get("text")),
            "url": clean(row.get("url")),
            "pinned": truthy(row.get("pinned")),
        })

if len(ids) != len(set(ids)):
    raise SystemExit("お知らせIDが重複しています。")

public_news.sort(key=lambda x: (x["pinned"], x["date"], x["id"]), reverse=True)

with JSON_FILE.open("w", encoding="utf-8") as f:
    json.dump(public_news, f, ensure_ascii=False, separators=(",", ":"))

JS_FILE.write_text(
    "window.NIPPYO_NEWS=" + json.dumps(public_news, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)

updated = datetime.now(timezone(timedelta(hours=9))).strftime("%Y/%m/%d")
UPDATED_FILE.write_text(updated + "\n", encoding="utf-8")

print("お知らせデータ生成完了")
print(f" - 公開件数: {len(public_news):,}")
print(f" - {JSON_FILE}")
print(f" - {JS_FILE}")
