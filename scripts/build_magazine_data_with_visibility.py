import csv
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data" / "magazines"
OUTPUT_DIR = ROOT / "docs" / "data"
PUBLIC_SEARCH = OUTPUT_DIR / "magazine-issues-search.json"
PUBLIC_INDEX = OUTPUT_DIR / "magazine-issues-search-index.json"
PUBLIC_DETAIL_DIR = OUTPUT_DIR / "magazine-details"
ADMIN_SEARCH = OUTPUT_DIR / "magazine-admin-search.json"
ADMIN_INDEX = OUTPUT_DIR / "magazine-admin-search-index.json"
ADMIN_DETAIL_DIR = OUTPUT_DIR / "magazine-admin-details"
NEXT_ISSUES_FILE = OUTPUT_DIR / "magazine-next-issues.json"
UPDATED_FILE = OUTPUT_DIR / "magazine-last-updated.txt"
BASE_BUILDER = ROOT / "scripts" / "build_magazine_data.py"

MAGAZINE_FILES = [
    "01_horitsu_jiho.csv",
    "02_hogaku_seminar.csv",
    "03_keizai_seminar.csv",
    "04_sugaku_seminar.csv",
    "05_kokoro_no_kagaku.csv",
    "06_sodachi_no_kagaku.csv",
]

MAGAZINE_NAMES = {
    "1": "法律時報",
    "2": "法学セミナー",
    "3": "経済セミナー",
    "4": "数学セミナー",
    "6": "こころの科学",
    "7": "そだちの科学",
}


def read_rows(path: Path):
    last_error = None
    for encoding in ("utf-8-sig", "cp932"):
        try:
            with path.open("r", encoding=encoding, newline="") as f:
                reader = csv.DictReader(f)
                return reader.fieldnames or [], list(reader), encoding
        except UnicodeDecodeError as error:
            last_error = error
    raise SystemExit(f"CSVの文字コードを判定できません: {path} ({last_error})")


def write_temp_public_copy(path: Path, fieldnames, rows, encoding, raw: bytes):
    line_ending = "\r\n" if b"\r\n" in raw[:100000] else "\n"
    with path.open("w", encoding=encoding, newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator=line_ending, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            temp = dict(row)
            temp["WEB公開属性"] = "1"
            writer.writerow(temp)


def json_write(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    path.write_text(text, encoding="utf-8")
    return text


def clean_cell(value):
    return str(value or "").replace("\x00", "").strip()


def main():
    originals = {}
    visibility = {}
    next_issues = []

    try:
        for filename in MAGAZINE_FILES:
            path = SOURCE_DIR / filename
            raw = path.read_bytes()
            originals[path] = raw
            fieldnames, rows, encoding = read_rows(path)
            if "WEB公開属性" not in fieldnames or "書籍ID" not in fieldnames:
                raise SystemExit(f"公開状態の判定に必要な列がありません: {path}")

            for row in rows:
                issue_id = clean_cell(row.get("書籍ID"))
                state = clean_cell(row.get("WEB公開属性"))
                if not issue_id:
                    raise SystemExit(f"空の書籍IDがあります: {path}")
                if state not in {"0", "1"}:
                    raise SystemExit(
                        f"WEB公開属性は0または1で入力してください: {path} / 書籍ID {issue_id} / 値 {state!r}"
                    )
                if issue_id in visibility:
                    raise SystemExit(f"雑誌号ID（書籍ID）が重複しています: {issue_id}")
                visibility[issue_id] = state == "1"

            # 各誌の最新公開号だけから次号予告3項目を取得する。
            published_rows = [
                row for row in rows
                if clean_cell(row.get("WEB公開属性")) == "1"
            ]
            if published_rows:
                latest = max(
                    published_rows,
                    key=lambda row: (
                        clean_cell(row.get("発刊日")),
                        clean_cell(row.get("書籍ID")),
                    ),
                )
                magazine_id = clean_cell(latest.get("雑誌ID"))
                magazine_name = MAGAZINE_NAMES.get(magazine_id)
                if not magazine_name:
                    raise SystemExit(
                        f"未定義の雑誌IDです: {path} / 書籍ID {clean_cell(latest.get('書籍ID'))} / 雑誌ID {magazine_id!r}"
                    )
                next_issues.append(
                    {
                        "issue_id": clean_cell(latest.get("書籍ID")),
                        "magazine_id": magazine_id,
                        "magazine_name": magazine_name,
                        "issue": clean_cell(latest.get("雑誌月号")),
                        "next_issue": clean_cell(latest.get("次号予告")),
                        "next_feature": clean_cell(latest.get("次号特集")),
                        "next_comment": clean_cell(latest.get("次号コメント")),
                    }
                )

            # 既存ビルダーは全件1を前提としている。生成時だけ1にし、必ずfinallyで元バイトへ戻す。
            write_temp_public_copy(path, fieldnames, rows, encoding, raw)

        subprocess.run([sys.executable, str(BASE_BUILDER)], cwd=ROOT, check=True)
    finally:
        for path, raw in originals.items():
            path.write_bytes(raw)

    base_search = json.loads(PUBLIC_SEARCH.read_text(encoding="utf-8"))
    base_index = json.loads(PUBLIC_INDEX.read_text(encoding="utf-8"))
    columns = base_search.get("columns")
    rows = base_search.get("issues")
    indexes = base_index.get("search")
    default_order = base_search.get("default_order")

    if not isinstance(columns, list) or "id" not in columns:
        raise SystemExit("雑誌検索データの列定義が不正です。")
    if not isinstance(rows, list) or not isinstance(indexes, list) or len(rows) != len(indexes):
        raise SystemExit("雑誌検索データと検索索引の件数が一致しません。")
    if not isinstance(default_order, list) or sorted(default_order) != list(range(len(rows))):
        raise SystemExit("雑誌検索データの既定表示順が不正です。")

    id_index = columns.index("id")
    ids = [str(row[id_index]) for row in rows]
    if set(ids) != set(visibility):
        missing = sorted(set(visibility) - set(ids))
        extra = sorted(set(ids) - set(visibility))
        raise SystemExit(f"生成データとCSVのIDが一致しません。missing={missing[:5]} extra={extra[:5]}")

    # 管理画面用は全件保持し、公開状態列を追加する。
    admin_columns = [*columns, "published"]
    admin_rows = [
        [*row, bool(visibility[str(row[id_index])])]
        for row in rows
    ]
    admin_search_payload = {
        **base_search,
        "columns": admin_columns,
        "issues": admin_rows,
    }
    admin_index_payload = dict(base_index)
    admin_search_text = json_write(ADMIN_SEARCH, admin_search_payload)
    admin_index_text = json_write(ADMIN_INDEX, admin_index_payload)

    # 公開用は公開中の号だけに絞る。元行順を保ち、default_orderだけ新indexへ写し替える。
    public_old_indices = [i for i, row in enumerate(rows) if visibility[str(row[id_index])]]
    old_to_new = {old: new for new, old in enumerate(public_old_indices)}
    public_rows = [rows[i] for i in public_old_indices]
    public_indexes = [indexes[i] for i in public_old_indices]
    public_order = [old_to_new[i] for i in default_order if i in old_to_new]

    public_search_payload = {
        **base_search,
        "issues": public_rows,
        "default_order": public_order,
    }
    public_index_payload = {
        **base_index,
        "search": public_indexes,
    }
    public_search_text = json_write(PUBLIC_SEARCH, public_search_payload)
    public_index_text = json_write(PUBLIC_INDEX, public_index_payload)

    # 各誌の最新公開号に登録された次号予告だけを軽量JSONとして出力する。
    next_issues.sort(key=lambda item: item["magazine_id"])
    next_issues_text = json_write(
        NEXT_ISSUES_FILE,
        {"magazines": next_issues},
    )

    # 年別詳細も、管理用は全件／公開用は公開中だけに分離する。
    ADMIN_DETAIL_DIR.mkdir(parents=True, exist_ok=True)
    for old in ADMIN_DETAIL_DIR.glob("magazine-admin-details-*.json"):
        old.unlink()

    detail_texts = []
    for path in sorted(PUBLIC_DETAIL_DIR.glob("magazine-details-*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise SystemExit(f"雑誌詳細データの形式が不正です: {path}")

        admin_payload = {}
        public_payload = {}
        for issue_id, detail in payload.items():
            if issue_id not in visibility:
                raise SystemExit(f"雑誌詳細データのIDがCSVにありません: {issue_id}")
            admin_detail = dict(detail)
            admin_detail["published"] = bool(visibility[issue_id])
            admin_payload[issue_id] = admin_detail
            if visibility[issue_id]:
                public_payload[issue_id] = detail

        suffix = path.name.removeprefix("magazine-details-")
        admin_path = ADMIN_DETAIL_DIR / f"magazine-admin-details-{suffix}"
        admin_text = json_write(admin_path, admin_payload)
        detail_texts.append(f"admin:{admin_path.name}\n{admin_text}")

        if public_payload:
            public_text = json_write(path, public_payload)
            detail_texts.append(f"public:{path.name}\n{public_text}")
        else:
            path.unlink()

    version_source = "\n".join([
        public_search_text,
        public_index_text,
        admin_search_text,
        admin_index_text,
        next_issues_text,
        *detail_texts,
    ])
    version = hashlib.sha256(version_source.encode("utf-8")).hexdigest()[:16]
    UPDATED_FILE.write_text(version + "\n", encoding="utf-8")

    public_count = sum(1 for value in visibility.values() if value)
    hidden_count = len(visibility) - public_count
    print("雑誌号公開状態反映完了")
    print(f" - 全登録: {len(visibility):,}号")
    print(f" - 公開: {public_count:,}号")
    print(f" - 非公開: {hidden_count:,}号")
    print(f" - 管理用検索: {ADMIN_SEARCH}")
    print(f" - 管理用詳細: {ADMIN_DETAIL_DIR}")
    print(f" - 次号予告: {NEXT_ISSUES_FILE}")


if __name__ == "__main__":
    main()
