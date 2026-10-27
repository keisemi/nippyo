# 日本評論社 臨時ホームページ

通常の日本評論社ウェブサイトのメンテナンス期間中に、必要な情報を継続提供するための臨時サイトです。

## 現在実装済み

- トップページ
- 書籍検索（書名・著者名・ISBN・分野・キーワード）
- 書籍詳細ポップアップ
- Amazon購入導線
- 書誌データからの新刊自動表示
- 書誌追加・修正用 GitHub Issue Form
- 書誌管理用検索・編集ページ
- お知らせ追加・修正・削除用 GitHub Issue Form
- お知らせ管理ページ（現在値を確認・編集してIssueへ引き継ぐ）
- 雑誌ページ（定期雑誌6誌のカード表示。『経済セミナー』note／全記事データベースへのリンクを含む）
- 会社概要・各部署連絡先・アクセス

## データ構造

### 書誌

`data/book_search_master.csv` を書誌の唯一の正本とします。

このCSVから `scripts/build_data.py` が、用途ごとに軽量化した公開用データを自動生成します。

- `docs/data/books-search.json`：書籍検索・一覧表示用の軽量データ
- `docs/data/book-details/books-detail-YYYY.json`：書籍詳細・管理画面用の刊行年別データ
- `docs/data/book-details/books-detail-undated.json`：刊行年がない書籍の詳細データ
- `docs/data/home-books.js`：トップページの新刊表示用・軽量
- `docs/data/last-updated.txt`：書誌生成データのバージョンキー

書籍検索ページは、最初に `books-search.json` だけを読み込みます。内容紹介・目次等の長い詳細情報は、書名をクリックしたときに該当する刊行年の詳細JSONだけを読み込みます。

旧形式の `docs/data/books.js`、`docs/data/books.json`、`docs/data/admin-books.js` は使用しません。

トップページの新刊、通常の書籍検索、書誌管理用検索は、いずれも同じ `data/book_search_master.csv` を正本とします。

### お知らせ

`data/news.csv` をお知らせの正本とします。

このCSVから `scripts/build_news.py` が以下を自動生成します。

- `docs/data/news.json`
- `docs/data/news.js`
- `docs/data/admin-news.js`（お知らせ管理ページ用。非公開データも含む）
- `docs/data/news-last-updated.txt`

通常運用では、これらのCSV・JSON・JavaScriptを直接編集しません。

## 書誌の更新

### 既存書誌の修正

管理用検索ページを開きます。

<https://keisemi.github.io/nippyo/admin/books/>

1. 書名・著者名・ISBN・書籍IDで対象書を検索
2. 書名を押して現在の登録内容を確認
3. 「この書誌を編集」をクリック
4. 現在値が入力済みの編集画面で、必要な箇所だけ変更
5. 「GitHubで変更を確定」を押す
6. GitHub Issue Formで変更内容を確認してIssueを作成

Issueには変更した項目だけが渡されます。編集画面で既存値を空欄にした場合は、自動的に `__CLEAR__` として処理されます。

### 新規書誌の登録

管理用検索ページの「新しい書誌を登録」からGitHub Issue Formを開きます。

書籍IDは自動採番されます。

- ISBNあり：日本評論社ISBNの商品番号5桁（例：`978-4-535-54143-6` → `54143`）
- ISBNなし：`N` + 5桁の管理用ID

サイト更新権限のあるCollaborator等からの申請だけが自動反映されます。

## お知らせの更新

お知らせ管理ページを開きます。

<https://keisemi.github.io/nippyo/admin/news/>

### 既存のお知らせを修正

1. 対象のお知らせを検索または一覧から確認
2. 「修正」を押す
3. 日付・種別・タイトル・本文・リンク先・重要表示・公開状態が現在値入りで表示される
4. 必要な箇所だけ変更
5. 「GitHubで変更を確定」を押す
6. GitHub Issue Formで変更内容を確認してIssueを作成

変更していない項目はIssueへ送りません。本文やリンク先を空にした場合は、自動的に `__CLEAR__` として処理されます。

### 新しいお知らせを登録

お知らせ管理ページの「新しいお知らせを登録」からGitHub Issue Formを開きます。

### お知らせを削除

お知らせ管理ページで対象のお知らせの「削除」を押し、確認後にGitHub Issueを作成します。

書誌と同様、権限のあるユーザーのIssueだけが自動反映されます。処理に成功すると、GitHub Actionsがデータ更新・再生成・GitHub Pages再公開・Issueの自動クローズまで行います。

## 書影

`docs/assets/covers/` に、書籍IDをファイル名にした画像を置きます。

例：書籍ID `54143`

```text
docs/assets/covers/54143.jpg
```

使用できる形式は `.jpg`、`.jpeg`、`.png`、`.webp` です。次回ビルド時に自動認識されます。

## 公開

GitHub Pages は GitHub Actions から `docs/` を公開します。

HTML・画像等をPushした場合は **【自動】臨時サイトを再構築・公開（通常は操作不要）** が動きます。書誌・お知らせのIssueでは、それぞれ専用Workflowが更新と公開まで行います。

## 配色

旧日本評論社サイトで使われていた緑系（濃緑 `#255e17`、黄緑 `#789c18`、淡緑 `#d9e0d8`）を基調にしています。
