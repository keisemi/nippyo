import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "data" / "news.csv"
FORM = ROOT / ".github" / "ISSUE_TEMPLATE" / "news_manage.yml"
PLACEHOLDER = "（新規登録では選択不要）"
START_MARKER = "        # NEWS_TITLES_START"
END_MARKER = "        # NEWS_TITLES_END"


def load_titles():
    with MASTER.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    rows.sort(key=lambda row: (row.get("date", ""), row.get("id", "")), reverse=True)
    titles = [row.get("title", "").strip() for row in rows]

    if any(not title for title in titles):
        raise SystemExit("空のお知らせタイトルがあります。")
    if len(titles) != len(set(titles)):
        raise SystemExit("同じタイトルのお知らせが複数あります。プルダウンを一意にできません。")
    return titles


def main():
    titles = load_titles()
    text = FORM.read_text(encoding="utf-8")
    lines = text.splitlines()

    try:
        start = lines.index(START_MARKER)
        end = lines.index(END_MARKER)
    except ValueError as exc:
        raise SystemExit("news_manage.yml にタイトル選択肢の更新マーカーがありません。") from exc

    if end <= start:
        raise SystemExit("news_manage.yml のタイトル選択肢マーカーの順序が不正です。")

    option_lines = [
        "        - " + json.dumps(value, ensure_ascii=False)
        for value in [PLACEHOLDER, *titles]
    ]
    updated = lines[: start + 1] + option_lines + lines[end:]
    FORM.write_text("\n".join(updated) + "\n", encoding="utf-8")
    print(f"Issueフォームのお知らせタイトル候補を更新: {len(titles):,}件")


if __name__ == "__main__":
    main()
