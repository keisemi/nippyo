(() => {
  "use strict";

  const queryInput = document.getElementById("book-query");
  const searchButton = document.getElementById("search-button");
  const results = document.getElementById("results");
  const count = document.getElementById("result-count");
  const issueBase = "https://github.com/keisemi/nippyo/issues/new";

  let books = [];
  let dataVersion = Date.now().toString();
  let searchIndexPromise = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[‐-‒–—―−ーｰ]/g, "-")
      .replace(/[・･,，、。\./:;；：()（）\[\]【】「」『』<>＜＞\s-]/g, "");
  }

  function authorDisplay(value) {
    return String(value || "").split("|").filter(Boolean).join("／");
  }

  function expandRows(payload, key) {
    const rows = payload && Array.isArray(payload[key]) ? payload[key] : null;
    if (!rows) throw new Error(`${key} の検索データがありません。`);
    if (!rows.length || !Array.isArray(rows[0])) return rows;
    const columns = Array.isArray(payload.columns) ? payload.columns : [];
    if (!columns.length) throw new Error(`${key} の列定義がありません。`);
    return rows.map((row) => {
      const item = {};
      columns.forEach((column, index) => { item[column] = row[index]; });
      return item;
    });
  }

  async function readDataVersion() {
    const stamp = Date.now().toString();
    try {
      const response = await fetch(`../../../data/last-updated.txt?t=${stamp}`, {cache:"no-store"});
      if (response.ok) {
        const value = (await response.text()).trim();
        if (value) return value;
      }
    } catch (_) {}
    return stamp;
  }

  async function loadSearchData() {
    dataVersion = await readDataVersion();
    const response = await fetch(`../../../data/books-admin-search.json?v=${encodeURIComponent(dataVersion)}`);
    if (!response.ok) throw new Error(`書籍データを取得できませんでした（HTTP ${response.status}）`);
    const payload = await response.json();
    return expandRows(payload, "books");
  }

  async function ensureSearchIndex() {
    if (!searchIndexPromise) {
      searchIndexPromise = fetch(`../../../data/books-admin-search-index.json?v=${encodeURIComponent(dataVersion)}`)
        .then((response) => {
          if (!response.ok) throw new Error(`検索索引を取得できませんでした（HTTP ${response.status}）`);
          return response.json();
        })
        .then((payload) => {
          if (!payload || !Array.isArray(payload.search) || payload.search.length !== books.length) {
            throw new Error("検索索引と表示データの件数が一致しません。");
          }
          books.forEach((book,index) => {
            book.__search = String(payload.search[index] || "");
            book.__searchNormalized = normalize([
              book.__search,
              book.id,
              book.title,
              book.subtitle_before,
              book.subtitle_after,
              book.author,
              book.isbn,
              book.identifiers,
              Array.isArray(book.genres) ? book.genres.join(" ") : book.genres,
              book.series,
              book.series_volume,
            ].filter(Boolean).join(" "));
          });
        });
    }
    return searchIndexPromise;
  }

  function coverUrl(book) {
    if (!book.cover) return "";
    const path = String(book.cover).replace(/^\/+/, "");
    return `../../../${path}`;
  }

  function issueUrl(book, operation) {
    const params = new URLSearchParams();
    params.set("template", "book_cover.yml");
    params.set("title", `[書影管理] ${book.title}`);
    params.set("book_id", book.id);
    params.set("current_title", book.title);
    params.set("operation", operation);
    return `${issueBase}?${params.toString()}`;
  }

  function render(items) {
    results.replaceChildren();
    if (!items.length) {
      count.textContent = "該当する書籍がありません。";
      results.innerHTML = '<div class="empty">検索語を変えてお試しください。</div>';
      return;
    }
    count.textContent = `${items.length.toLocaleString()}件表示`;

    items.forEach((book) => {
      const article = document.createElement("article");
      article.className = "book-result";
      const cover = coverUrl(book);
      article.innerHTML = `
        <div>
          ${cover ? `<img class="cover-preview" src="${esc(cover)}" alt="${esc(book.title)}の書影">`
                  : '<div class="cover-empty">書影なし</div>'}
        </div>
        <div>
          <h2>${esc(book.title || "（書名なし）")}</h2>
          <div class="book-meta">
            ${book.author ? `<span>著者：${esc(authorDisplay(book.author))}</span>` : ""}
            ${book.isbn ? `<span>ISBN：${esc(book.isbn)}</span>` : ""}
            <span>書籍ID：${esc(book.id)}</span>
            <span class="status ${cover ? "on" : "off"}">書影：${cover ? "登録済み" : "なし"}</span>
          </div>
          <div class="book-actions">
            <a class="admin-btn" href="${esc(issueUrl(book, "追加・差替え"))}">${cover ? "書影を差替える" : "書影を追加する"}</a>
            ${cover ? `<a class="admin-btn danger" href="${esc(issueUrl(book, "削除"))}">書影を削除する</a>` : ""}
          </div>
        </div>
      `;
      results.appendChild(article);
    });
  }

  async function search() {
    const terms = queryInput.value.trim().split(/\s+/).filter(Boolean).map(normalize);
    if (!terms.length) {
      count.textContent = "検索語を入力してください。";
      results.replaceChildren();
      return;
    }
    try {
      await ensureSearchIndex();
      const matched = books.filter((book) =>
        terms.every((term) => String(book.__searchNormalized || "").includes(term))
      ).slice(0,50);
      render(matched);
      if (matched.length === 50) count.textContent += "（上位50件。さらに絞り込んでください）";
    } catch (error) {
      console.error(error);
      count.textContent = "検索用データを読み込めませんでした。ページを再読み込みしてください。";
    }
  }

  async function init() {
    try {
      books = await loadSearchData();
      searchButton.addEventListener("click", () => { void search(); });
      queryInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") void search();
      });
    } catch (error) {
      console.error(error);
      count.textContent = "書籍データを読み込めませんでした。ページを再読み込みしてください。";
    }
  }

  init();
})();
