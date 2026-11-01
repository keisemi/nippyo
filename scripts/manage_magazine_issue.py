import csv
import io
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data" / "magazines"
NO_RESPONSE = "_No response_"

MAGAZINES = {
    "1": ("法律時報", "01_horitsu_jiho.csv"),
    "2": ("法学セミナー", "02_hogaku_seminar.csv"),
    "3": ("経済セミナー", "03_keizai_seminar.csv"),
    "4": ("数学セミナー", "04_sugaku_seminar.csv"),
    "6": ("こころの科学", "05_kokoro_no_kagaku.csv"),
    "7": ("そだちの科学", "06_sodachi_no_kagaku.csv"),
}

LABEL_TO_COLUMN = {
    "雑誌月号": "雑誌月号",
    "雑誌通算番号": "雑誌通算番号",
    "発刊日": "発刊日",
    "判型": "判型",
    "ページ数": "ページ数",
    "本体価格": "本体価格",
    "旧ISBN": "ISBNコード",
    "新ISBN": "新ISBNコード",
    "雑誌コード(1)": "雑誌コード(1)",
    "雑誌コード(2)": "雑誌コード(2)",
    "前副題": "前副題",
    "特集": "特集",
    "特集よみ": "特集よみ",
    "後副題": "後副題",
    "特集内容紹介文見出": "特集用内容紹介文見出",
    "特集内容紹介文": "特集用内容紹介文",
    "前副題2": "前副題2",
    "特集2": "特集2",
    "特集2よみ": "特集2よみ",
    "後副題2": "後副題2",
    "特集2 内容紹介文見出": "特集２用内容紹介文見出",
    "特集2 内容紹介文": "特集２用内容紹介文",
    "目次": "目次",
    "外部リンク1 タイトル": "外部リンクタイトル（1）",
    "外部リンク1 コメント": "外部リンクコメント（1）",
    "外部リンク1 URL": "外部リンクアドレス（1）",
    "外部リンク2 タイトル": "外部リンクタイトル（2）",
    "外部リンク2 コメント": "外部リンクコメント（2）",
    "外部リンク2 URL": "外部リンクアドレス（2）",
    "外部リンク3 タイトル": "外部リンクタイトル（3）",
    "外部リンク3 コメント": "外部リンクコメント（3）",
    "外部リンク3 URL": "外部リンクアドレス（3）",
    "本誌編者": "本誌編者",
}

# 雛形号から新号へコピーしてはいけない、号ごとの項目。
# ここにない列（WEB公開属性、出版形態、雑誌ID、商品別消費税率等）は固定項目として継承する。
NEW_ISSUE_CLEAR_COLUMNS = {
    "書籍ID", "アーカイブズID", "雑誌月号", "雑誌通算番号",
    "前副題", "特集", "特集よみ", "後副題", "特集用内容紹介文見出", "特集用内容紹介文",
    "前副題2", "特集2", "特集2よみ", "後副題2", "特集２用内容紹介文見出", "特集２用内容紹介文",
    "目次", "検索用キーワード", "ISBNコード", "新ISBNコード", "雑誌コード(1)", "雑誌コード(2)",
    "発刊日", "ページ数", "本体価格",
    "外部リンクタイトル（1）", "外部リンクコメント（1）", "外部リンクアドレス（1）",
    "外部リンクタイトル（2）", "外部リンクコメント（2）", "外部リンクアドレス（2）",
    "外部リンクタイトル（3）", "外部リンクコメント（3）", "外部リンクアドレス（3）",
    "電子書籍 kindle版URL", "電子書籍 大学生協版URL", "電子書籍 Google Play", "電子書籍 iTunes",
    "電子書籍自己gaku", "電子書籍kinoppy", "電子書籍e-hon", "電子書籍ebookjapan", "電子書籍honto",
    "電子書籍楽天ブックス", "電子書籍7netショッピング", "電子書籍Fujisan.co.jp", "電子書籍M2PLUS",
    "電子書籍ビューン", "電子書籍タブホ", "電子書籍マガストア",
    "関連書籍（1）", "関連書籍（2）", "関連書籍（3）",
    "登録日", "修正者", "最終修正日", "閲覧数",
    "次号予告", "次号特集", "次号コメント",
}


def get_issue() -> dict:
    event_path = os.environ.get("GITHUB_EVENT_PATH", "").strip()
    if not event_path:
        raise SystemExit("GITHUB_EVENT_PATH がありません。")
    with open(event_path, encoding="utf-8") as f:
        event = json.load(f)
    issue = event.get("issue") or {}
    if not issue:
        raise SystemExit("Issueイベントを取得できません。")
    return issue


def parse_sections(body: str) -> dict[str, str]:
    known = {
        "書籍ID", "雑誌ID", "雑誌名", "現在の雑誌月号", "確認",
        "雛形号の書籍ID", "雛形号の雑誌月号", "新しい書籍ID",
        *LABEL_TO_COLUMN.keys(),
    }
    sections: dict[str, list[str]] = {}
    current = None
    for line in (body or "").splitlines():
        if line.startswith("### ") and line[4:].strip() in known:
            current = line[4:].strip()
            sections[current] = []
            continue
        if current is not None:
            sections[current].append(line)

    out: dict[str, str] = {}
    for key, lines in sections.items():
        value = "\n".join(lines).strip()
        if value == NO_RESPONSE:
            value = ""
        out[key] = value
    return out


def read_rows(path: Path):
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


def write_rows(path: Path, fieldnames: list[str], rows: list[dict[str, str]], encoding: str) -> None:
    temp = path.with_suffix(path.suffix + ".tmp")
    try:
        with temp.open("w", encoding=encoding, newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n", extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        temp.replace(path)
    finally:
        if temp.exists():
            temp.unlink()


def append_row(path: Path, fieldnames: list[str], row: dict[str, str], encoding: str) -> None:
    raw = path.read_bytes()
    line_ending = "\r\n" if b"\r\n" in raw[:100000] else "\n"
    codec = "utf-8" if encoding == "utf-8-sig" else encoding

    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fieldnames, lineterminator=line_ending, extrasaction="ignore")
    writer.writerow(row)
    payload = buffer.getvalue().encode(codec)

    prefix = b""
    if raw and not raw.endswith(b"\n") and not raw.endswith(b"\r"):
        prefix = line_ending.encode("ascii")
    with path.open("ab") as f:
        f.write(prefix + payload)


def validate_changed_value(label: str, value: str) -> None:
    if value == "":
        return
    if label in {"ページ数", "本体価格"} and not re.fullmatch(r"\d+", value):
        raise SystemExit(f"{label}は数字のみで入力してください: {value}")
    if label == "発刊日" and not re.fullmatch(r"\d{4}[-/.]\d{1,2}[-/.]\d{1,2}", value):
        raise SystemExit(f"発刊日は YYYY-MM-DD 形式で入力してください: {value}")
    if label.endswith(" URL"):
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise SystemExit(f"{label}は http:// または https:// から始まるURLを入力してください。")


def validate_magazine(magazine_id: str, magazine_name: str):
    if magazine_id not in MAGAZINES:
        raise SystemExit(f"未対応の雑誌IDです: {magazine_id}")
    expected_name, filename = MAGAZINES[magazine_id]
    if magazine_name and magazine_name != expected_name:
        raise SystemExit(
            f"雑誌名が雑誌IDと一致しません。雑誌ID {magazine_id}: {expected_name} / 入力: {magazine_name}"
        )
    return expected_name, SOURCE_DIR / filename


def find_one(rows: list[dict[str, str]], book_id: str, label: str):
    matches = [(index, row) for index, row in enumerate(rows) if str(row.get("書籍ID") or "").strip() == book_id]
    if not matches:
        raise SystemExit(f"書籍ID {book_id} は {label} のCSVにありません。")
    if len(matches) > 1:
        raise SystemExit(f"書籍ID {book_id} が {label} のCSV内で重複しています。")
    return matches[0]


def all_existing_ids() -> set[str]:
    result = set()
    for _magazine_id, (_name, filename) in MAGAZINES.items():
        _fieldnames, rows, _encoding = read_rows(SOURCE_DIR / filename)
        result.update(str(row.get("書籍ID") or "").strip() for row in rows if str(row.get("書籍ID") or "").strip())
    return result


def apply_edit(fields: dict[str, str]) -> None:
    book_id = fields.get("書籍ID", "").strip()
    magazine_id = fields.get("雑誌ID", "").strip()
    magazine_name = fields.get("雑誌名", "").strip()
    current_issue = fields.get("現在の雑誌月号", "").strip()

    if not book_id or not magazine_id or not current_issue:
        raise SystemExit("対象号の識別情報が不足しています。管理画面からやり直してください。")
    expected_name, path = validate_magazine(magazine_id, magazine_name)
    fieldnames, rows, encoding = read_rows(path)
    missing = sorted(set(LABEL_TO_COLUMN.values()) - set(fieldnames))
    if missing:
        raise SystemExit("雑誌CSVに必要な列がありません: " + ", ".join(missing))

    row_index, row = find_one(rows, book_id, expected_name)
    actual_magazine_id = str(row.get("雑誌ID") or "").strip()
    actual_issue = str(row.get("雑誌月号") or "").strip()
    if actual_magazine_id != magazine_id:
        raise SystemExit(f"雑誌IDが一致しません。CSV: {actual_magazine_id} / 申請: {magazine_id}")
    if actual_issue != current_issue:
        raise SystemExit(
            "対象号の月号表記が現在のCSVと一致しません。\n"
            f"管理画面表示: {current_issue}\nCSV: {actual_issue}\n"
            "管理画面を再読み込みして対象号を選び直してください。"
        )

    changes = []
    for label, column in LABEL_TO_COLUMN.items():
        raw = fields.get(label, "")
        if raw == "":
            continue
        value = "" if raw == "__CLEAR__" else raw
        validate_changed_value(label, value)
        before = str(row.get(column) or "")
        if before != value:
            row[column] = value
            changes.append((label, before, value))

    if not changes:
        raise SystemExit("変更された項目がありません。")

    rows[row_index] = row
    write_rows(path, fieldnames, rows, encoding)
    print(f"雑誌号修正: {expected_name} / {current_issue} / 書籍ID {book_id}")
    for label, before, after in changes:
        print(f" - {label}: {before.replace(chr(10), ' ')[:100]!r} -> {after.replace(chr(10), ' ')[:100]!r}")


def apply_new(fields: dict[str, str]) -> None:
    source_book_id = fields.get("雛形号の書籍ID", "").strip()
    source_issue = fields.get("雛形号の雑誌月号", "").strip()
    magazine_id = fields.get("雑誌ID", "").strip()
    magazine_name = fields.get("雑誌名", "").strip()
    new_book_id = fields.get("新しい書籍ID", "").strip()
    new_issue = fields.get("雑誌月号", "").strip()
    new_issue_number = fields.get("雑誌通算番号", "").strip()
    pub_date = fields.get("発刊日", "").strip()

    if not all([source_book_id, source_issue, magazine_id, new_book_id, new_issue, new_issue_number, pub_date]):
        raise SystemExit("新号登録に必要な識別情報が不足しています。管理画面からやり直してください。")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", new_book_id):
        raise SystemExit("新しい書籍IDは半角英数字・ハイフン・アンダースコアで入力してください。")
    if new_book_id in all_existing_ids():
        raise SystemExit(f"書籍ID {new_book_id} はすでに雑誌CSVで使われています。")

    expected_name, path = validate_magazine(magazine_id, magazine_name)
    fieldnames, rows, encoding = read_rows(path)
    missing = sorted((set(LABEL_TO_COLUMN.values()) | NEW_ISSUE_CLEAR_COLUMNS | {"WEB公開属性", "雑誌ID"}) - set(fieldnames))
    if missing:
        raise SystemExit("雑誌CSVに必要な列がありません: " + ", ".join(missing))

    _source_index, source = find_one(rows, source_book_id, expected_name)
    if str(source.get("雑誌ID") or "").strip() != magazine_id:
        raise SystemExit("雛形号の雑誌IDが一致しません。")
    if str(source.get("雑誌月号") or "").strip() != source_issue:
        raise SystemExit(
            "雛形号の月号表記が現在のCSVと一致しません。\n"
            f"管理画面表示: {source_issue}\nCSV: {str(source.get('雑誌月号') or '').strip()}"
        )

    if any(str(row.get("雑誌月号") or "").strip() == new_issue for row in rows):
        raise SystemExit(f"雑誌月号 {new_issue} はすでに {expected_name} に登録されています。")
    if any(str(row.get("雑誌通算番号") or "").strip() == new_issue_number for row in rows):
        raise SystemExit(f"雑誌通算番号 {new_issue_number} はすでに {expected_name} に登録されています。")

    new_row = dict(source)
    for column in NEW_ISSUE_CLEAR_COLUMNS:
        new_row[column] = ""
    new_row["書籍ID"] = new_book_id
    new_row["雑誌ID"] = magazine_id

    # 現行ビルダーはWEB公開属性=1のみ許容。公開前登録は次工程F-07で分離する。
    if str(new_row.get("WEB公開属性") or "").strip() != "1":
        raise SystemExit("雛形号のWEB公開属性が1ではありません。F-07の公開状態対応前には新規登録できません。")

    for label, column in LABEL_TO_COLUMN.items():
        raw = fields.get(label, "")
        if raw == "":
            continue
        validate_changed_value(label, raw)
        new_row[column] = raw

    # 必須値はフォームとサーバー側の両方で確認する。
    for column, label in (("雑誌月号", "雑誌月号"), ("雑誌通算番号", "雑誌通算番号"), ("発刊日", "発刊日")):
        if not str(new_row.get(column) or "").strip():
            raise SystemExit(f"{label}がありません。")

    append_row(path, fieldnames, new_row, encoding)
    print(f"雑誌号新規登録: {expected_name} / {new_issue} / 書籍ID {new_book_id}")
    print(f"雛形号: {source_issue} / 書籍ID {source_book_id}")
    print(f"更新ファイル: {path.relative_to(ROOT)} / encoding={encoding}")


def main() -> None:
    issue = get_issue()
    title = str(issue.get("title") or "").strip()
    fields = parse_sections(str(issue.get("body") or ""))

    if title.startswith("[雑誌号修正]"):
        apply_edit(fields)
        return
    if title.startswith("[雑誌号新規]"):
        apply_new(fields)
        return
    raise SystemExit("雑誌号管理用Issueではありません。")


if __name__ == "__main__":
    main()
