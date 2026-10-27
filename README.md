# 雑誌・後副題の `??` 表示修正

## 変更対象

`scripts/build_magazine_data.py` のみ。

## 変更内容

雑誌CSVの `後副題` / `後副題2` を公開データへ変換する際、文字列先頭の `??` だけを `―` に変換します。

例：

- 修正前：`??リストカットとオーバードーズ`
- 修正後：`―リストカットとオーバードーズ`

`特集` / `特集2` 本体、単独の `?`、書籍データ、raw CSVには触れません。

## 現行公開データでの影響範囲確認

2026-10-27 のGitHub Pages公開成果物（雑誌1,901号）で確認：

- `feature_subtitle` / `feature2_subtitle` の先頭 `??`：41件 → `―` に変換
- `feature` / `feature2` 内の `??`：5件 → 今回は未変更
- 単独の正常な `?`：未変更

## 適用方法

ZIP内の `scripts/build_magazine_data.py` をリポジトリの同じ場所へ上書きし、commit / pushしてください。
GitHub Actions が雑誌公開データを再生成します。

`MAINTENANCE.md`、raw CSV、その他ファイルは変更しません。
