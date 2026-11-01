(() => {
  "use strict";

  const queryInput = document.getElementById("book-query");
  const searchButton = document.getElementById("search-button");
  const results = document.getElementById("results");
  const count = document.getElementById("result-count");
  const issueBase = "https://github.com/keisemi/nippyo/issues/new";

  let books = [];
  let linksByBook = new Map();
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

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
    if (field || row.length) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
    }
    return rows;
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

  async function loadBooks() {
    dataVersion = await readDataVersion();
    const response = await fetch(`../../../data/books-admin-search.json?v=${encodeURIComponent(dataVersion)}`);
    if (!response.ok) throw new Error(`書籍データを取得できませんでした（HTTP ${response.status}）`);
    return expandRows(await response.json(), "books");
  }

  async function loadExternalLinks() {
    const response = await fetch(`../../../data/book-external-links.csv?t=${Date.now()}`, {cache:"no-store"});
    if (!response.ok) throw new Error(`関連リンクデータを取得できませんでした（HTTP ${response.status}）`);
    const rows = parseCsv(await response.text());
    if (!rows.length) return new Map();

    const headers = rows[0].map((value,index) => index === 0 ? value.replace(/^\uFEFF/,"") : value);
    const index = Object.fromEntries(headers.map((name,i) => [name,i]));
    for (const required of ["id","slot","title","comment","url"]) {
      if (!(required in index)) throw new Error(`関連リンクデータに ${required} 列がありません。`);
    }

    const map = new Map();
    for (const values of rows.slice(1)) {
      const id = String(values[index.id] || "").trim();
      const slot = Number.parseInt(String(values[index.slot] || "").trim(),10);
      const title = String(values[index.title] || "").trim();
      const comment = String(values[index.comment] || "").trim();
      const url = String(values[index.url] || "").trim();
      if (!id || !Number.isInteger(slot) || !/^https?:\/\//i.test(url)) continue;
      if (!map.has(id)) map.set(id,[]);
      map.get(id).push({slot,title,comment,url});
    }
    for (const links of map.values()) links.sort((a,b) => a.slot-b.slot);
    return map;
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
            book.__searchNormalized = normalize([
              payload.search[index],
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

  function issueUrl(book, operation, link = null) {
    const params = new URLSearchParams();
    params.set("template","book_external_link.yml");
    params.set("title",`[関連リンク管理] ${book.title}`);
    params.set("book_id",book.id);
    params.set("current_title",book.title);
    params.set("operation",operation);

    if (link) {
      params.set("current_slot",String(link.slot));
      params.set("current_url",link.url);
      params.set("link_title",link.title || "");
      params.set("comment",link.comment || "");
      params.set("url",link.url);
    }
    return `${issueBase}?${params.toString()}`;
  }

  function render(items) {
    results.replaceChildren();
    if (!items.length) {
      count.textContent = "該当する書籍がありません。";
      results.innerHTML = '<div class="empty">検索条件を変えてお試しください。</div>';
      return;
    }
    count.textContent = `${items.length.toLocaleString()}件表示`;

    items.forEach((book) => {
      const links = linksByBook.get(String(book.id)) || [];
      const article = document.createElement("article");
      article.className = "book-result";

      const linkItems = links.map((link) => `
        <li class="link-item">
          <p class="link-title">${esc(link.title || "（リンク名なし）")}</p>
          ${link.comment ? `<p class="link-comment">${esc(link.comment)}</p>` : ""}
          <p class="link-url"><a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.url)}</a></p>
          <div class="link-actions">
            <a class="admin-btn secondary" href="${esc(issueUrl(book,"修正",link))}" target="_blank" rel="noopener noreferrer">このリンクを修正</a>
            <a class="admin-btn danger" href="${esc(issueUrl(book,"削除",link))}" target="_blank" rel="noopener noreferrer">このリンクを削除</a>
          </div>
        </li>
      `).join("");

      article.innerHTML = `
        <h2>${esc(book.title || "（書名なし）")}</h2>
        <div class="book-meta">
          ${book.author ? `<span>著者：${esc(authorDisplay(book.author))}</span>` : ""}
          ${book.isbn ? `<span>ISBN：${esc(book.isbn)}</span>` : ""}
          <span>書籍ID：${esc(book.id)}</span>
          <span class="status">関連リンク：${links.length}件</span>
        </div>
        <a class="admin-btn" href="${esc(issueUrl(book,"追加"))}" target="_blank" rel="noopener noreferrer">関連リンクを追加する</a>
        ${links.length ? `<ul class="link-list">${linkItems}</ul>` : '<p>現在、関連リンクは登録されていません。</p>'}
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
      [books,linksByBook] = await Promise.all([loadBooks(),loadExternalLinks()]);
      searchButton.addEventListener("click",() => { void search(); });
      queryInput.addEventListener("keydown",(event) => {
        if (event.key === "Enter") void search();
      });
    } catch (error) {
      console.error(error);
      count.textContent = "管理用データを読み込めませんでした。ページを再読み込みしてください。";
    }
  }

  init();
})();
