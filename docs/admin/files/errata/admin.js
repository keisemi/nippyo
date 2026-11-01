(() => {
  "use strict";

  const queryInput = document.getElementById("book-query");
  const stateFilter = document.getElementById("errata-filter");
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
            const statusFlags = Number(book.status_flags || 0);
            const fileFlags = Number(book.file_flags || 0);
            book.__hasSourceFlag = Boolean(statusFlags & 1);
            book.__hasFile = Boolean(fileFlags & 1);
            book.__pendingUpload = book.__hasSourceFlag && !book.__hasFile;
          });
        });
    }
    return searchIndexPromise;
  }

  function issueUrl(book, operation) {
    const params = new URLSearchParams();
    const deleting = operation === "削除";
    params.set("template", deleting ? "book_errata_delete.yml" : "book_errata.yml");
    params.set("title", deleting ? `[正誤表管理] 削除: ${book.title}` : `[正誤表管理] ${book.title}`);
    params.set("book_id", book.id);
    params.set("current_title", book.title);
    if (!deleting) params.set("operation", operation);
    return `${issueBase}?${params.toString()}`;
  }

  function render(items, total) {
    results.replaceChildren();
    if (!items.length) {
      count.textContent = "該当する書籍がありません。";
      results.innerHTML = '<div class="empty">検索条件を変えてお試しください。</div>';
      return;
    }

    if (total > items.length) {
      count.textContent = `${total.toLocaleString()}件中${items.length.toLocaleString()}件表示（さらに絞り込んでください）`;
    } else {
      count.textContent = `${total.toLocaleString()}件表示`;
    }

    items.forEach((book) => {
      const hasFile = Boolean(book.__hasFile);
      const pending = Boolean(book.__pendingUpload);
      const statusClass = hasFile ? "on" : (pending ? "pending" : "off");
      const statusText = hasFile ? "登録済み" : (pending ? "要アップロード" : "なし");
      const article = document.createElement("article");
      article.className = "book-result";
      article.innerHTML = `
        <h2>${esc(book.title || "（書名なし）")}</h2>
        <div class="book-meta">
          ${book.author ? `<span>著者：${esc(authorDisplay(book.author))}</span>` : ""}
          ${book.isbn ? `<span>ISBN：${esc(book.isbn)}</span>` : ""}
          <span>書籍ID：${esc(book.id)}</span>
          <span class="status ${statusClass}">正誤表：${statusText}</span>
        </div>
        <div class="book-actions">
          <a class="admin-btn" href="${esc(issueUrl(book, "追加・差替え"))}" target="_blank" rel="noopener noreferrer">${hasFile ? "正誤表を差替える" : "正誤表を追加する"}</a>
          ${hasFile ? `<a class="admin-btn danger" href="${esc(issueUrl(book, "削除"))}" target="_blank" rel="noopener noreferrer">正誤表を削除する</a>` : ""}
        </div>
      `;
      results.appendChild(article);
    });
  }

  async function search() {
    const terms = queryInput.value.trim().split(/\s+/).filter(Boolean).map(normalize);
    const filter = stateFilter.value;

    if (!terms.length && filter === "all") {
      count.textContent = "検索語を入力するか、ファイルの状態を選んでください。";
      results.replaceChildren();
      return;
    }

    try {
      await ensureSearchIndex();
      const matched = books.filter((book) => {
        const textMatches = terms.every((term) =>
          String(book.__searchNormalized || "").includes(term)
        );
        if (!textMatches) return false;
        if (filter === "yes") return book.__hasFile === true;
        if (filter === "no") return book.__hasFile === false;
        if (filter === "pending") return book.__pendingUpload === true;
        return true;
      });
      render(matched.slice(0, 50), matched.length);
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
      stateFilter.addEventListener("change", () => { void search(); });
    } catch (error) {
      console.error(error);
      count.textContent = "書籍データを読み込めませんでした。ページを再読み込みしてください。";
    }
  }

  init();
})();
