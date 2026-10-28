import csv
import os
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "data" / "news.csv"
FIELD_ORDER = ["id", "date", "category", "title", "text", "url", "pinned", "published"]
CLEAR_TOKEN = "__CLEAR__"
TARGET_PLACEHOLDER = "（新規登録では選択不要）"


def env(name: str) -> str:
    return os.environ.get(name, "").strip()


def load_rows():
    if not MASTER.exists():
        return []
    with MASTER.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != FIELD_ORDER:
            raise SystemExit(
                "お知らせCSVの列構成が想定と異なります。\n"
                f"想定: {FIELD_ORDER}\n実際: {reader.fieldnames}"
            )
        return [dict(row) for row in reader]


def save_rows(rows):
    with MASTER.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELD_ORDER, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def normalize_date(value: str, *, default_today=False) -> str:
    value = value.strip()
    if not value and default_today:
        return datetime.now(ZoneInfo("Asia/Tokyo")).strftime("%Y-%m-%d")
    if not value:
        return ""

    candidates = []
    if len(value) == 6 and value.isdigit():
        candidates.append(("20" + value, "%Y%m%d"))
    if len(value) == 8 and value.isdigit():
        candidates.append((value, "%Y%m%d"))

    normalized_sep = value.replace("/", "-").replace(".", "-")
    candidates.append((normalized_sep, "%Y-%m-%d"))

    for candidate, fmt in candidates:
        try:
            return datetime.strptime(candidate, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass

    raise SystemExit(
        "日付を解釈できません。例：2026-10-27、2026/10/27、20261027、261027"
    )


def normalize_url(value: str) -> str:
    value = value.strip()
    if not value or value == CLEAR_TOKEN:
        return "" if value == CLEAR_TOKEN else value
    if value.startswith(("./", "../", "/")):
        return value
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise SystemExit("リンク先は https:// で始まるURL、またはサイト内の相対パスで入力してください。")
    return value


def normalize_flag(value: str, *, add_mode: bool, existing: str, default: str) -> str:
    value = value.strip()
    if value in {"", "変更しない"}:
        return default if add_mode else existing
    if value in {"はい", "あり", "1"}:
        return "1"
    if value in {"いいえ", "なし", "0"}:
        return "0"
    raise SystemExit(f"はい／いいえを解釈できません: {value}")


def update_text(raw: str, *, add_mode: bool, existing: str) -> str:
    raw = raw.strip()
    if not raw:
        return "" if add_mode else existing
    if raw == CLEAR_TOKEN:
        return ""
    return raw


def find_target(rows, target_title):
    matches = [i for i, row in enumerate(rows) if row.get("title", "").strip() == target_title]
    if not matches:
        raise SystemExit(
            f"対象のお知らせが見つかりません: {target_title}\n"
            "お知らせ管理ページを再読み込みし、対象を選び直してください。"
        )
    if len(matches) > 1:
        raise SystemExit("同じタイトルのお知らせが複数あります。タイトルを一時的に変更するなどして一意にしてください。")
    return matches[0]


def make_id(rows):
    base = datetime.now(ZoneInfo("Asia/Tokyo")).strftime("news-%Y%m%d-%H%M%S")
    used = {row.get("id", "") for row in rows}
    candidate = base
    n = 2
    while candidate in used:
        candidate = f"{base}-{n}"
        n += 1
    return candidate


def main():
    operation = env("NEWS_OPERATION")
    if operation not in {"新規登録", "既存データ修正", "削除"}:
        raise SystemExit("操作を正しく選択してください。")

    rows = load_rows()
    target_title = env("NEWS_TARGET_TITLE")

    if operation == "削除":
        if not target_title or target_title == TARGET_PLACEHOLDER:
            raise SystemExit("削除時は、お知らせ管理ページから対象を選んでください。")
        idx = find_target(rows, target_title)
        removed = rows.pop(idx)
        save_rows(rows)
        print(f"削除: {removed['title']}")
        print(f"残り件数: {len(rows):,}")
        return

    add_mode = operation == "新規登録"
    if add_mode:
        existing = {key: "" for key in FIELD_ORDER}
        idx = None
    else:
        if not target_title or target_title == TARGET_PLACEHOLDER:
            raise SystemExit("修正時は、お知らせ管理ページから対象を選んでください。")
        idx = find_target(rows, target_title)
        existing = rows[idx].copy()

    updated = existing.copy()
    if add_mode:
        updated["id"] = make_id(rows)

    raw_date = env("NEWS_DATE")
    if add_mode:
        updated["date"] = normalize_date(raw_date, default_today=True)
    elif raw_date:
        updated["date"] = normalize_date(raw_date)

    updated["category"] = update_text(
        env("NEWS_CATEGORY"), add_mode=add_mode, existing=existing.get("category", "")
    ) or "お知らせ"
    updated["title"] = update_text(
        env("NEWS_TITLE"), add_mode=add_mode, existing=existing.get("title", "")
    )
    updated["text"] = update_text(
        env("NEWS_TEXT"), add_mode=add_mode, existing=existing.get("text", "")
    )

    raw_url = env("NEWS_URL")
    if raw_url:
        updated["url"] = normalize_url(raw_url)
    elif add_mode:
        updated["url"] = ""

    updated["pinned"] = normalize_flag(
        env("NEWS_PINNED"), add_mode=add_mode, existing=existing.get("pinned", "0"), default="0"
    )
    updated["published"] = normalize_flag(
        env("NEWS_PUBLISHED"), add_mode=add_mode, existing=existing.get("published", "1"), default="1"
    )

    if not updated["title"]:
        raise SystemExit("タイトルは必須です。")
    if not updated["date"]:
        raise SystemExit("日付は必須です。")

    duplicate_titles = [
        i for i, row in enumerate(rows)
        if row.get("title", "").strip() == updated["title"].strip() and i != idx
    ]
    if duplicate_titles:
        raise SystemExit("同じタイトルのお知らせがすでにあります。タイトルは一意にしてください。")

    if add_mode:
        rows.append(updated)
    else:
        rows[idx] = updated

    ids = [row.get("id", "").strip() for row in rows]
    if len(ids) != len(set(ids)):
        raise SystemExit("お知らせIDの重複を検出しました。保存していません。")

    save_rows(rows)
    print(f"操作: {operation}")
    print(f"タイトル: {updated['title']}")
    print(f"日付: {updated['date']}")
    print(f"お知らせ件数: {len(rows):,}")


if __name__ == "__main__":
    main()
