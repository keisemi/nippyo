import json
import os
import re
from pathlib import Path

import manage_news

HEADINGS = [
    "操作",
    "修正・削除するお知らせ",
    "日付",
    "種別",
    "タイトル",
    "本文",
    "リンク先",
    "重要表示",
    "公開する",
]

ENV_MAP = {
    "操作": "NEWS_OPERATION",
    "修正・削除するお知らせ": "NEWS_TARGET_TITLE",
    "日付": "NEWS_DATE",
    "種別": "NEWS_CATEGORY",
    "タイトル": "NEWS_TITLE",
    "本文": "NEWS_TEXT",
    "リンク先": "NEWS_URL",
    "重要表示": "NEWS_PINNED",
    "公開する": "NEWS_PUBLISHED",
}

EMPTY_RESPONSES = {"_No response_", "No response", ""}


def parse_issue_form(body: str) -> dict[str, str]:
    heading_pattern = "|".join(re.escape(x) for x in HEADINGS)
    pattern = re.compile(
        rf"(?ms)^### ({heading_pattern})\s*\n\n(.*?)(?=^### (?:{heading_pattern})\s*$|\Z)"
    )
    values = {}
    for heading, raw_value in pattern.findall(body or ""):
        value = raw_value.strip()
        if value in EMPTY_RESPONSES:
            value = ""
        values[heading] = value
    return values


def main():
    event_path = os.environ.get("GITHUB_EVENT_PATH", "").strip()
    if not event_path:
        raise SystemExit("GITHUB_EVENT_PATH が見つかりません。")

    event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    issue = event.get("issue") or {}
    body = issue.get("body") or ""
    values = parse_issue_form(body)

    missing = [heading for heading in HEADINGS if heading not in values]
    if missing:
        raise SystemExit(
            "お知らせ更新フォームを正しく読み取れませんでした。未検出項目: "
            + "、".join(missing)
        )

    for heading, env_name in ENV_MAP.items():
        os.environ[env_name] = values.get(heading, "")

    print(f"Issue #{issue.get('number', '')} の入力を読み込みました。")
    print(f"操作: {os.environ.get('NEWS_OPERATION', '')}")
    print(f"対象: {os.environ.get('NEWS_TARGET_TITLE', '')}")
    manage_news.main()


if __name__ == "__main__":
    main()
