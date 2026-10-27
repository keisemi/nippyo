# 日本評論社 臨時ホームページ

通常の日本評論社ウェブサイトのメンテナンス期間中に、必要な情報を継続提供するための臨時サイトです。

## 現在実装済み

- トップページ
- 書籍・雑誌号横断検索（書籍：書名・著者名・ISBN・分野・キーワード／雑誌：雑誌名・月号・通巻番号・特集・執筆者名等）
- 書籍・雑誌号の詳細ポップアップと固有URL（`?book=ID` / `?mag=ID`）
- Amazon購入導線
- 書誌データからの新刊自動表示
- 書誌追加・修正用 GitHub Issue Form
- 書誌管理用検索・編集ページ
- お知らせ追加・修正・削除用 GitHub Issue Form
- お知らせ管理ページ（現在値を確認・編集してIssueへ引き継ぐ）
- 雑誌ページ（定期雑誌6誌の最新号を自動表示。『経済セミナー』note／全記事データベースへのリンクを含む）
- 定期雑誌6誌のバックナンバーページ（誌別・刊行年別の絞り込み、30号ずつのページ送り、各号の固有URLへの導線）
- 定期雑誌6誌の号データ（検索用軽量JSON＋刊行年別詳細JSON）を既存検索画面に統合
- 会社概要・各部署連絡先・アクセス

## データ構造

### 書誌

`data/book_search_master.csv` を書誌の唯一の正本とします。

このCSVから `scripts/build_data.py` が、用途ごとに軽量化した公開用データを自動生成します。

- `docs/data/books-search.json`：初期表示・一覧表示用の軽量データ（列名を1回だけ持つコンパクト形式）
- `docs/data/books-search-index.json`：正規化済みの書籍検索索引（検索時に遅延読込）
- `docs/data/books-admin-search-index.json`：管理画面用の正規化済み書籍検索索引（管理画面で検索時に遅延読込）
- `docs/data/book-details/books-detail-YYYY.json`：書籍詳細・管理画面用の刊行年別データ
- `docs/data/book-details/books-detail-undated.json`：刊行年がない書籍の詳細データ
- `docs/data/home-books.js`：トップページの新刊表示用・軽量
- `docs/data/last-updated.txt`：書誌生成データのバージョンキー

書籍検索ページは、最初に `books-search.json` だけを読み込みます。検索専用の補助文字列は初期表示用JSONから分離し、ビルド時に正規化済みの `books-search-index.json` を生成します。この検索索引は初期表示を妨げない形で遅延読込し、初期表示時に全書籍の検索文字列をブラウザ側で生成しません。検索語付きURLでは表示用データと並行して先読みします。管理画面は公開検索とは別の `books-admin-search-index.json` を使い、従来の書籍ID・ISBN等の検索挙動を維持します。内容紹介・目次等の長い詳細情報は、書名をクリックしたときに該当する刊行年の詳細JSONだけを読み込みます。

旧形式の `docs/data/books.js`、`docs/data/books.json`、`docs/data/admin-books.js` は使用しません。

トップページの新刊、通常の書籍検索、書誌管理用検索は、いずれも同じ `data/book_search_master.csv` を正本とします。

### 定期雑誌6誌の号データ

会社から提供された定期雑誌6誌のCSVを `data/magazines/` に置き、号データの正本とします。

- `01_horitsu_jiho.csv`：法律時報
- `02_hogaku_seminar.csv`：法学セミナー
- `03_keizai_seminar.csv`：経済セミナー
- `04_sugaku_seminar.csv`：数学セミナー
- `05_kokoro_no_kagaku.csv`：こころの科学
- `06_sodachi_no_kagaku.csv`：そだちの科学

`scripts/build_magazine_data.py` が以下を自動生成します。

- `docs/data/magazine-issues-search.json`：6誌全号の初期表示・一覧表示用の軽量データ（列名を1回だけ持つコンパクト形式）
- `docs/data/magazine-issues-search-index.json`：正規化済みの雑誌号検索索引（検索時に遅延読込）
- `docs/data/magazine-details/magazine-details-YYYY.json`：雑誌号詳細用の刊行年別データ
- `docs/data/magazine-details/magazine-details-undated.json`：発刊年が取れない号がある場合の詳細データ
- `docs/data/magazine-last-updated.txt`：雑誌号生成データのバージョンキー

検索用JSONには目次全文・記事タイトル・長い内容紹介を入れません。雑誌名、月号、通巻番号、特集、ISBN・雑誌コード等に加え、目次から明確に判定できる執筆者・評者等の人名だけを検索補助情報として保持します。古い号などで人名を安全に判定できない場合は無理に補完しません。

書籍・雑誌検索ページでは `books-search.json` と `magazine-issues-search.json` の表示用軽量データだけを最初に読み込みます。検索専用の正規化済み索引は別ファイルに分離し、初期表示後に遅延読込します。これにより、初期表示では全8,000件超の検索文字列生成を行わず、既定の新着順もビルド時に計算した順序を使います。雑誌号の内容紹介・目次等は、号をクリックしたときに該当する刊行年の `magazine-details-YYYY.json` だけを読み込みます。

雑誌ページでは `magazine-issues-search.json` から6誌それぞれの最新号を自動判定し、月号・特集・発刊日・通巻番号・判型・頁数・本体価格を表示します。最新号は固有URLで詳細ポップアップへ直接つなぎ、各誌の「バックナンバーを見る」から共通バックナンバーページ `magazines/backnumbers/?magazine=雑誌ID` へ移動します。バックナンバーページでは、誌別・刊行年別の絞り込みと30号ずつのページ送りを行い、各号の「詳細を見る」から `books/?mag=雑誌号ID` の固有URLへつなぎます。

雑誌の検索結果はあくまで「号」単位です。目次全文や記事タイトルは検索対象にせず、目次から明確に判定できた執筆者・評者等の人名だけを検索補助に使います。

### 書籍・雑誌号の固有URL

検索結果の詳細ポップアップには、書籍・雑誌号ごとの固有URLを使用します。

- 書籍：`books/?book=書籍ID`（例：`books/?book=54143`）
- 雑誌号：`books/?mag=雑誌号ID`（例：経済セミナー2026年10・11月号は `books/?mag=9792`）

固有URLを直接開くと、検索データの読み込み後に該当する詳細ポップアップが自動で開きます。検索結果から詳細を開いた場合もURLが固有URLに切り替わり、ブラウザの「戻る」で元の検索結果へ戻れます。雑誌号IDには、6誌CSVの `書籍ID` をそのまま使用します。

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
