# data

このディレクトリのCSVが公開サイトの正本データです。

- `book_search_master.csv`：書誌情報の正本
- `news.csv`：お知らせ情報の正本
- `magazines/`：定期雑誌6誌の号データの正本

書誌・お知らせは、通常の更新担当者が正本CSVを直接編集せず、管理ページとGitHub Issue Formから更新します。

雑誌号データは、現段階では会社から提供された6誌のCSVを `magazines/` に差し替え、GitHub Actionsで公開用の軽量検索データと刊行年別詳細データを再生成します。
