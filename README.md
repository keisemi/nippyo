# 日本評論社 臨時ホームページ

通常の日本評論社ウェブサイトのメンテナンス期間中に、必要な情報を継続提供するための臨時サイトです。

## 管理画面

> **日常更新はこちらから行います。**  
> <https://keisemi.github.io/nippyo/admin/>

書籍・お知らせなどの日常更新機能は、今後この管理画面に集約します。

現在利用できる管理機能は以下です。

- **書籍管理**：新規書誌の登録、既存書誌の検索・確認・修正
- **お知らせ管理**：新規登録、修正、削除

以下は現在整備中です。

- 雑誌管理
- 書影・正誤表・付属データの管理
- 書籍の公開停止・再公開
- 操作マニュアル

更新操作は、GitHub上でこのリポジトリへの更新権限を持つアカウントから行う必要があります。権限のないアカウントから送信された更新申請は、自動的に拒否され、サイト内容は変更されません。

---

## 公開サイト

<https://keisemi.github.io/nippyo/>

---

## 現在実装済みの主な機能

- トップページ
- 書籍・雑誌号の横断検索
- 書籍・雑誌号の詳細表示
- 書籍・雑誌号ごとの固有URL
- Amazon購入導線
- 新刊の自動表示
- 書誌管理画面
- お知らせ管理画面
- 定期雑誌6誌の最新号表示
- 定期雑誌6誌のバックナンバー表示
- 雑誌号の書誌・目次・特集等の表示
- 正誤表・付属データ等の関連資料表示
- SNSリンク
- 会社概要・各部署連絡先・アクセス
- 特設ページ

---

## 日常更新の考え方

通常の更新担当者は、原則として

- HTML
- CSS
- JavaScript
- Python
- CSV
- JSON
- GitHub Actions

を直接編集しません。

書誌やお知らせは管理画面から入力し、GitHub上の確認画面を経由して更新します。

書影・正誤表・付属データ等についても、最終的には同じ管理画面から操作できる形へ移行する予定です。

細かな操作手順、障害時の対応、復旧方法などは、READMEではなく別途メンテナンス文書にまとめます。

---

## データ構成の概要

### 書籍

書誌の正本は以下です。

```text
data/book_search_master.csv
```

`scripts/build_data.py` が、検索・詳細表示・管理画面・トップページ表示に必要な公開用データを自動生成します。

主な生成先：

```text
docs/data/books-search.json
docs/data/books-search-index.json
docs/data/books-admin-search-index.json
docs/data/book-details/
docs/data/home-books.js
docs/data/last-updated.txt
```

旧形式の以下のファイルは使用しません。

```text
docs/data/books.js
docs/data/books.json
docs/data/admin-books.js
```

### 定期雑誌6誌

雑誌号データの正本は `data/magazines/` 配下の6本のCSVです。

```text
01_horitsu_jiho.csv
02_hogaku_seminar.csv
03_keizai_seminar.csv
04_sugaku_seminar.csv
05_kokoro_no_kagaku.csv
06_sodachi_no_kagaku.csv
```

`scripts/build_magazine_data.py` が、検索・詳細表示・最新号表示・バックナンバー表示に必要な公開用データを自動生成します。

主な生成先：

```text
docs/data/magazine-issues-search.json
docs/data/magazine-issues-search-index.json
docs/data/magazine-details/
docs/data/magazine-last-updated.txt
```

### お知らせ

お知らせの正本は以下です。

```text
data/news.csv
```

`scripts/build_news.py` が公開用・管理画面用データを生成します。

主な生成先：

```text
docs/data/news.json
docs/data/news.js
docs/data/admin-news.js
docs/data/news-last-updated.txt
```

---

## 書影・正誤表・付属データ

### 書籍書影

```text
docs/assets/covers/
```

書籍IDをファイル名として使用します。

### 雑誌書影

```text
docs/assets/magazine-covers/
```

雑誌号IDをファイル名として使用します。

### 正誤表

```text
docs/assets/errata/
```

基本の命名規則：

```text
errata<書籍ID>.pdf
```

### 付属データ・関連資料

```text
docs/assets/related/
```

基本の命名規則：

```text
<書籍ID>.<拡張子>
```

これらは現在、所定の場所へ正しいファイル名で配置すると自動認識されます。今後、管理画面から追加・差替え・削除できるようにする予定です。

---

## 書籍・雑誌号の固有URL

書籍：

```text
https://keisemi.github.io/nippyo/books/?book=<書籍ID>
```

雑誌号：

```text
https://keisemi.github.io/nippyo/books/?mag=<雑誌号ID>
```

---

## 自動更新・公開

GitHub Pages は GitHub Actions から `docs/` を公開します。

現在の主なWorkflowは以下です。

```text
.github/workflows/build-site.yml
.github/workflows/manage-book.yml
.github/workflows/manage-news.yml
```

役割：

- `build-site.yml`：通常の再構築・公開
- `manage-book.yml`：書誌更新申請の反映・再公開
- `manage-news.yml`：お知らせ更新申請の反映・再公開

更新系Workflowは、同時に `main` を変更しないよう共通の待ち列で順番に実行されます。

---

## 現在整備中の項目

引継ぎに向け、以下を順次整備しています。

- 書籍の公開停止・再公開
- 書影管理
- 正誤表管理
- 付属データ管理
- 書籍関連リンク管理
- 雑誌の新規号登録・修正・公開管理
- 雑誌書影管理
- お知らせの非公開データの扱いの整理
- 更新前確認・誤操作防止
- 成功・失敗メッセージの統一
- 日常更新マニュアル
- システム管理・復旧マニュアル

---

## 運用方針

この臨時サイトは、最終的に

> **GitHubやWeb制作の知識がない担当者でも、管理画面から安全に日常更新できること**

を目標にしています。

日常更新担当者がリポジトリ内のコードやデータファイルを直接編集する運用にはしません。

技術的な構成、復旧手順、詳細な更新方法については、別途メンテナンス文書を正本として整備します。
