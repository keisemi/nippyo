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


def fallback_target_from_issue_title(issue_title: str, operation: str) -> str:
    prefixes = {
        "既存データ修正": "[お知らせ管理] 修正: ",
        "削除": "[お知らせ管理] 削除: ",
    }
    prefix = prefixes.get(operation, "")
    if prefix and issue_title.startswith(prefix):
        return issue_title[len(prefix):].strip()
    return ""


def parse_named_section(body: str, heading: str) -> str:
    pattern = re.compile(
        rf"(?ms)^### {re.escape(heading)}\s*\n\n(.*?)(?=^### .+?\s*$|\Z)"
    )
    match = pattern.search(body or "")
    if not match:
        return ""
    value = match.group(1).strip()
    return "" if value in EMPTY_RESPONSES else value


def publication_request(issue_title: str, body: str) -> dict[str, str] | None:
    actions = {
        "[お知らせ管理] 公開停止: ": "いいえ",
        "[お知らせ管理] 再公開: ": "はい",
    }
    for prefix, published in actions.items():
        if issue_title.startswith(prefix):
            target = parse_named_section(body, "対象のお知らせ")
            if not target:
                target = issue_title[len(prefix):].strip()
            values = {heading: "" for heading in HEADINGS}
            values["操作"] = "既存データ修正"
            values["修正・削除するお知らせ"] = target
            values["公開する"] = published
            return values
    return None


def main():
    event_path = os.environ.get("GITHUB_EVENT_PATH", "").strip()
    if not event_path:
        raise SystemExit("GITHUB_EVENT_PATH が見つかりません。")

    event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    issue = event.get("issue") or {}
    body = issue.get("body") or ""
    issue_title = (issue.get("title") or "").strip()

    values = publication_request(issue_title, body)
    if values is None:
        values = parse_issue_form(body)
        missing = [heading for heading in HEADINGS if heading not in values]
        if missing:
            raise SystemExit(
                "お知らせ更新フォームを正しく読み取れませんでした。未検出項目: "
                + "、".join(missing)
            )

    operation = values.get("操作", "")
    if not values.get("修正・削除するお知らせ", "") and operation in {"既存データ修正", "削除"}:
        values["修正・削除するお知らせ"] = fallback_target_from_issue_title(
            issue_title, operation
        )

    for heading, env_name in ENV_MAP.items():
        os.environ[env_name] = values.get(heading, "")

    print(f"Issue #{issue.get('number', '')} の入力を読み込みました。")
    print(f"操作: {os.environ.get('NEWS_OPERATION', '')}")
    print(f"対象: {os.environ.get('NEWS_TARGET_TITLE', '')}")
    manage_news.main()


if __name__ == "__main__":
    main()
