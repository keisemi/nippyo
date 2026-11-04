(() => {
  "use strict";

  const queryInput = document.getElementById("preview-query");
  const typeFilter = document.getElementById("type-filter");
  const stateFilter = document.getElementById("state-filter");
  const searchButton = document.getElementById("search-button");
  const count = document.getElementById("result-count");
  const results = document.getElementById("results");
  const issueBase = "https://github.com/keisemi/nippyo/issues/new";

  let items = [];
  let previewIndex = { books: {}, magazines: {} };

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
      .replace(/[・･,，、。\.\/:;；：()（）\[\]【】「」『』<>＜＞]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function decodeRows(payload, key) {
    if (!payload || !Array.isArray(payload.columns) || !Array.isArray(payload[key])) {
      throw new Error(`${key} の管理データ形式が不正です。`);
    }
    return payload[key].map((row) => {
      if (!Array.isArray(row) || row.length !== payload.columns.length) {
        throw new Error(`${key} の行長が列定義と一致しません。`);
      }
      const item = {};
      payload.columns.forEach((name, index) => { item[name] = row[index]; });
      return item;
    });
  }

  async function version(path) {
    const stamp = Date.now().toString();
    try {
      const response = await fetch(`${path}?t=${stamp}`, { cache: "no-store" });
      if (response.ok) {
        const value = (await response.text()).trim();
        if (value) return value;
      }
    } catch (_) {}
    return stamp;
  }

  async function loadData() {
    const stamp = Date.now().toString();
    const [bookVersion, magazineVersion, previewResponse] = await Promise.all([
      version("../../../data/last-updated.txt"),
      version("../../../data/magazine-last-updated.txt"),
      fetch(`../../../data/preview-index.json?t=${stamp}`, { cache: "no-store" })
    ]);
    const [bookResponse, magazineResponse] = await Promise.all([
      fetch(`../../../data/books-admin-search.json?v=${encodeURIComponent(bookVersion)}`),
      fetch(`../../../data/magazine-admin-search.json?v=${encodeURIComponent(magazineVersion)}`)
    ]);
    if (!bookResponse.ok) throw new Error(`書籍管理データを取得できませんでした（HTTP ${bookResponse.status}）`);
    if (!magazineResponse.ok) throw new Error(`雑誌管理データを取得できませんでした（HTTP ${magazineResponse.status}）`);
    if (!previewResponse.ok) throw new Error(`立ち読みPDFデータを取得できませんでした（HTTP ${previewResponse.status}）`);

    const [bookPayload, magazinePayload, previewPayload] = await Promise.all([
      bookResponse.json(), magazineResponse.json(), previewResponse.json()
    ]);
    previewIndex = {
      books: previewPayload && typeof previewPayload.books === "object" && previewPayload.books ? previewPayload.books : {},
      magazines: previewPayload && typeof previewPayload.magazines === "object" && previewPayload.magazines ? previewPayload.magazines : {}
    };

    const books = decodeRows(bookPayload, "books").map((book) => ({
      ...book,
      __type: "book",
      __label: String(book.title || ""),
      __search: normalize([
        book.id, book.title, book.subtitle_before, book.subtitle_after,
        String(book.author || "").split("|").join(" "), book.isbn, book.series
      ].filter(Boolean).join(" "))
    }));
    const magazines = decodeRows(magazinePayload, "issues").map((issue) => ({
      ...issue,
      __type: "magazine",
      __label: [issue.magazine_name, issue.issue].filter(Boolean).join(" "),
      __search: normalize([
        issue.id, issue.magazine_name, issue.issue, issue.issue_number,
        issue.feature, issue.feature_subtitle, issue.feature2, issue.feature2_subtitle,
        issue.isbn, Array.isArray(issue.contributors) ? issue.contributors.join(" ") : issue.contributors
      ].filter(Boolean).join(" "))
    }));
    items = [...books, ...magazines];
  }

  function hasPreview(item) {
    const entries = item.__type === "book" ? previewIndex.books : previewIndex.magazines;
    return Boolean(entries && entries[String(item.id)]);
  }

  function issueUrl(item, operation) {
    const deleting = operation === "削除";
    const params = new URLSearchParams();
    params.set("template", deleting ? "preview_delete.yml" : "preview.yml");
    params.set("title", deleting ? `[立ち読み管理] 削除: ${item.__label}` : `[立ち読み管理] ${item.__label}`);
    params.set("target_type", item.__type === "book" ? "書籍" : "雑誌");
    params.set("book_id", String(item.id || ""));
    if (item.__type === "book") {
      params.set("current_title", String(item.title || ""));
    } else {
      params.set("magazine_id", String(item.magazine_id || ""));
      params.set("magazine_name", String(item.magazine_name || ""));
      params.set("current_issue", String(item.issue || ""));
    }
    if (!deleting) params.set("operation", operation);
    return `${issueBase}?${params.toString()}`;
  }

  function renderItem(item) {
    const registered = hasPreview(item);
    const typeLabel = item.__type === "book" ? "書籍" : "雑誌";
    const meta = item.__type === "book"
      ? [
          item.author ? `著者：${String(item.author).split("|").filter(Boolean).join("／")}` : "",
          item.isbn ? `ISBN：${item.isbn}` : "",
          `書籍ID：${item.id}`
        ]
      : [
          item.issue_number ? `通巻：${item.issue_number}` : "",
          item.pub_date ? `発刊日：${item.pub_date}` : "",
          item.feature ? `特集：${item.feature}` : "",
          `書籍ID：${item.id}`
        ];
    return `<article class="preview-result">
      <h2><span class="type-badge">${typeLabel}</span>${esc(item.__label || "（名称未登録）")}</h2>
      <div class="preview-meta">
        ${meta.filter(Boolean).map((value) => `<span>${esc(value)}</span>`).join("")}
        <span class="status ${registered ? "on" : "off"}">${registered ? "立ち読み登録済み" : "立ち読み未登録"}</span>
      </div>
      <div class="preview-actions">
        <a class="admin-btn" href="${esc(issueUrl(item, "追加・差替え"))}" target="_blank" rel="noopener noreferrer">${registered ? "立ち読みPDFを差替える" : "立ち読みPDFを追加する"}</a>
        ${registered ? `<a class="admin-btn danger" href="${esc(issueUrl(item, "削除"))}" target="_blank" rel="noopener noreferrer">立ち読みPDFを削除する</a>` : ""}
      </div>
    </article>`;
  }

  function runSearch() {
    const raw = queryInput.value.trim();
    const terms = raw.split(/\s+/).filter(Boolean).map(normalize);
    const type = typeFilter.value;
    const state = stateFilter.value;

    if (!raw && type === "all" && state === "all") {
      count.textContent = "検索語を入力するか、対象・登録状態を選んでください。";
      results.innerHTML = "";
      return;
    }

    const matched = items.filter((item) => {
      if (type !== "all" && item.__type !== type) return false;
      const registered = hasPreview(item);
      if (state === "yes" && !registered) return false;
      if (state === "no" && registered) return false;
      if (terms.length && !terms.every((term) => item.__search.includes(term))) return false;
      return true;
    }).slice(0, 100);

    const total = items.filter((item) => {
      if (type !== "all" && item.__type !== type) return false;
      const registered = hasPreview(item);
      if (state === "yes" && !registered) return false;
      if (state === "no" && registered) return false;
      if (terms.length && !terms.every((term) => item.__search.includes(term))) return false;
      return true;
    }).length;

    count.textContent = total > matched.length
      ? `${total.toLocaleString()}件中${matched.length.toLocaleString()}件表示（さらに絞り込んでください）`
      : `${total.toLocaleString()}件表示`;
    results.innerHTML = matched.length
      ? matched.map(renderItem).join("")
      : '<div class="empty">該当する書籍・雑誌号がありません。</div>';
  }

  async function init() {
    try {
      await loadData();
      searchButton.addEventListener("click", runSearch);
      queryInput.addEventListener("keydown", (event) => { if (event.key === "Enter") runSearch(); });
      typeFilter.addEventListener("change", runSearch);
      stateFilter.addEventListener("change", runSearch);
    } catch (error) {
      console.error(error);
      count.textContent = "管理データを読み込めませんでした。ページを再読み込みしてください。";
    }
  }

  void init();
})();
