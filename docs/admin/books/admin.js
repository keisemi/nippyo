(() => {
  "use strict";

  const queryInput = document.getElementById("book-query");
  const searchButton = document.getElementById("search-button");
  const results = document.getElementById("results");
  const count = document.getElementById("result-count");
  const newBookLink = document.getElementById("new-book-link");
  const modal = document.getElementById("book-modal");
  const modalContent = document.getElementById("book-modal-content");
  const modalClose = document.getElementById("book-modal-close");
  const issueBase = "https://github.com/keisemi/nippyo/issues/new";

  let books = [];
  let dataVersion = Date.now().toString();
  let lastModalTrigger = null;
  const detailCache = new Map();

  const editFields = [
    ["title", "書名", "input"],
    ["subtitle_after", "副題（後）", "input"],
    ["author", "著者", "input"],
    ["author_kana", "著者よみ", "input"],
    ["title_kana", "書名よみ", "input"],
    ["isbn_old", "旧ISBN", "input"],
    ["isbn_new", "新ISBN", "input"],
    ["amazon_asin", "Amazon ASIN", "input"],
    ["pub_month_raw", "刊行年月", "input"],
    ["genres", "分野", "textarea"],
    ["series", "シリーズ", "input"],
    ["series_volume", "シリーズ巻数", "input"],
    ["price_body", "本体価格", "input"],
    ["format", "判型", "input"],
    ["pages", "頁数", "input"],
    ["hp_keywords", "HP検索用キーワード", "textarea"],
    ["pub_note", "刊行年月備考", "input"],
    ["description", "内容紹介", "textarea-large"],
    ["toc", "目次", "textarea-large"],
    ["original_title", "原書名", "textarea"],
  ];

  const issueFieldName = (id) => id === "pub_month_raw" ? "pub_month" : id;

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s\-‐-‒–—―ー]/g, "");
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function safeLinkHref(value) {
    const href = String(value || "").trim();
    if (/^https?:\/\//i.test(href)) return href;
    if (/^(?:\.\.?\/|\/)/.test(href)) return href;
    return "";
  }

  function richText(value) {
    const source = String(value || "");
    const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let out = "";
    let last = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      out += esc(source.slice(last, match.index));
      const href = safeLinkHref(match[2]);
      if (href) {
        const external = /^https?:\/\//i.test(href);
        out += `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(match[1])}</a>`;
      } else {
        out += esc(match[0]);
      }
      last = match.index + match[0].length;
    }
    out += esc(source.slice(last));
    return out.replace(/\r?\n/g, "<br>");
  }

  function authorDisplay(value) {
    return String(value || "").split("|").filter(Boolean).join("／");
  }

  function subtitle(book) {
    return [book.subtitle_before, book.subtitle_after].filter(Boolean).join(" ");
  }

  function formatMonth(value) {
    const m = String(value || "").match(/^(\d{4})[.\/-]?(\d{1,2})?$/);
    if (!m) return String(value || "");
    return m[2] ? `${m[1]}年${Number(m[2])}月` : `${m[1]}年`;
  }

  function detailRow(label, value) {
    if (value === null || value === undefined || value === "") return "";
    return `<div class="detail-row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  }

  function newUrl() {
    const params = new URLSearchParams();
    params.set("template", "book_new.yml");
    return `${issueBase}?${params.toString()}`;
  }

  function closeBookModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastModalTrigger && typeof lastModalTrigger.focus === "function") lastModalTrigger.focus();
    lastModalTrigger = null;
  }

  async function readDataVersion() {
    const stamp = Date.now().toString();
    try {
      const response = await fetch(`../../data/last-updated.txt?t=${stamp}`, { cache: "no-store" });
      if (response.ok) {
        const value = (await response.text()).trim();
        if (value) return value;
      }
    } catch (_) {
      // 検索データ取得時に改めてエラーにする。
    }
    return stamp;
  }

  async function loadSearchData() {
    dataVersion = await readDataVersion();
    const response = await fetch(`../../data/books-search.json?v=${encodeURIComponent(dataVersion)}`);
    if (!response.ok) {
      throw new Error(`books-search.json を取得できませんでした（HTTP ${response.status}）`);
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.books)) {
      throw new Error("books-search.json の形式が不正です。");
    }
    return payload.books;
  }

  async function loadDetailShard(detailKey) {
    const key = String(detailKey || "undated");
    if (!detailCache.has(key)) {
      const promise = fetch(`../../data/book-details/books-detail-${encodeURIComponent(key)}.json?v=${encodeURIComponent(dataVersion)}`)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`書籍詳細データを取得できませんでした（${key}: HTTP ${response.status}）`);
          }
          return response.json();
        })
        .then((payload) => {
          if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            throw new Error(`書籍詳細データの形式が不正です（${key}）`);
          }
          return payload;
        })
        .catch((error) => {
          detailCache.delete(key);
          throw error;
        });
      detailCache.set(key, promise);
    }
    return detailCache.get(key);
  }

  async function loadBookDetail(book) {
    const shard = await loadDetailShard(book.detail_key);
    const detail = shard[String(book.id)];
    if (!detail) throw new Error(`書籍ID ${book.id} の詳細データが見つかりません。`);
    return { ...book, ...detail };
  }

  function fieldHtml(id, label, kind, value) {
    const common = `id="edit-${esc(id)}" data-field="${esc(id)}"`;
    const note = id === "description"
      ? '<p class="field-help">文中リンクは <code>[【コチラ】](https://example.com/)</code> の形式で入力できます。</p>'
      : "";
    if (kind === "textarea" || kind === "textarea-large") {
      const cls = kind === "textarea-large" ? "edit-textarea large" : "edit-textarea";
      return `<label class="edit-field"><span>${esc(label)}</span><textarea class="${cls}" ${common}>${esc(value)}</textarea>${note}</label>`;
    }
    return `<label class="edit-field"><span>${esc(label)}</span><input type="text" ${common} value="${esc(value)}">${note}</label>`;
  }

  function adminSource(detail) {
    return {
      id: String(detail.id || ""),
      title: String(detail.title || ""),
      subtitle_before: String(detail.subtitle_before || ""),
      subtitle_after: String(detail.subtitle_after || ""),
      author: String(detail.author || ""),
      author_kana: String(detail.author_kana || ""),
      title_kana: String(detail.title_kana || ""),
      search_title: String(detail.search_title || ""),
      isbn_old: String(detail.isbn_old || ""),
      isbn_new: String(detail.isbn_new || ""),
      amazon_asin: String(detail.amazon_asin || ""),
      pub_month_raw: String(detail.pub_month_raw || ""),
      genres: Array.isArray(detail.genres) ? detail.genres.join("|") : String(detail.genres || ""),
      series: String(detail.series || ""),
      series_volume: String(detail.series_volume || ""),
      price_body: detail.price_body === null || detail.price_body === undefined ? "" : String(detail.price_body),
      format: String(detail.format || ""),
      pages: detail.pages === null || detail.pages === undefined ? "" : String(detail.pages),
      hp_keywords: String(detail.hp_keywords || ""),
      pub_note: String(detail.pub_note || ""),
      description: String(detail.description || ""),
      toc: String(detail.toc || ""),
      original_title: String(detail.original_title || ""),
      has_errata: detail.has_errata ? "1" : "0",
      has_related_info: detail.has_related_info ? "1" : "0",
    };
  }

  function openEditForm(book, detail, trigger) {
    const source = adminSource(detail);
    lastModalTrigger = trigger || document.activeElement;

    const fields = editFields.map(([id, label, kind]) => fieldHtml(id, label, kind, source[id] || "")).join("");
    const errata = String(source.has_errata || "0");
    const related = String(source.has_related_info || "0");

    modalContent.innerHTML = `
      <p class="admin-modal-kicker">書誌編集</p>
      <h2 id="admin-modal-title" class="admin-modal-title">${esc(source.title)}</h2>
      <p class="edit-intro">現在登録されている値を入力済みにしています。必要な箇所だけ変更してください。</p>
      <form id="book-edit-form">
        <div class="fixed-fields">
          <div><strong>書籍ID</strong><br><code>${esc(source.id)}</code></div>
          <div><strong>現在の書名</strong><br>${esc(source.title)}</div>
        </div>
        <div class="edit-grid">${fields}</div>
        <div class="edit-grid two-col">
          <label class="edit-field"><span>正誤表</span><select id="edit-has_errata" data-field="has_errata"><option value="0"${errata === "0" ? " selected" : ""}>なし</option><option value="1"${errata === "1" ? " selected" : ""}>あり</option></select></label>
          <label class="edit-field"><span>関連情報・付属データ</span><select id="edit-has_related_info" data-field="has_related_info"><option value="0"${related === "0" ? " selected" : ""}>なし</option><option value="1"${related === "1" ? " selected" : ""}>あり</option></select></label>
        </div>
        <div class="edit-submit-box">
          <p>「GitHubで変更を確定」を押すと、<strong>変更した項目だけ</strong>を入れた確認用Issueが開きます。現在値の確認・編集はこの画面で行います。</p>
          <button class="admin-btn" type="submit">GitHubで変更を確定</button>
          <button class="admin-btn secondary" id="back-to-detail" type="button">詳細表示へ戻る</button>
        </div>
      </form>
    `;

    const form = document.getElementById("book-edit-form");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const params = new URLSearchParams();
      params.set("template", "book_edit.yml");
      const nextTitle = document.getElementById("edit-title").value.trim() || source.title;
      params.set("title", `[書誌修正] ${nextTitle}`);
      params.set("book_id", source.id);
      params.set("current_title", source.title);

      let changes = 0;
      for (const [id] of editFields) {
        const el = document.getElementById(`edit-${id}`);
        const before = String(source[id] || "");
        const after = String(el.value || "").trim();
        if (after !== before) {
          params.set(issueFieldName(id), after === "" && before !== "" ? "__CLEAR__" : after);
          changes += 1;
        }
      }
      for (const id of ["has_errata", "has_related_info"]) {
        const el = document.getElementById(`edit-${id}`);
        const before = String(source[id] || "0");
        const after = String(el.value || "0");
        if (after !== before) {
          params.set(id, after === "1" ? "あり" : "なし");
          changes += 1;
        }
      }

      if (!changes) {
        window.alert("変更された項目がありません。");
        return;
      }

      const targetUrl = `${issueBase}?${params.toString()}`;
      if (targetUrl.length > 7000) {
        window.alert("変更内容が長いため、一度にGitHubへ渡せません。内容紹介・目次などの長文は1項目ずつ更新してください。");
        return;
      }
      window.location.href = targetUrl;
    });
    document.getElementById("back-to-detail").addEventListener("click", () => renderBookModal(book, detail, trigger));

    modal.hidden = false;
    document.body.classList.add("modal-open");
    modalClose?.focus();
  }

  function renderBookModal(book, detail, trigger) {
    const sub = subtitle(detail);
    const series = [detail.series, detail.series_volume].filter(Boolean).join(" ");
    const isbnRows = [];
    if (detail.isbn_new) isbnRows.push(detailRow("ISBN", detail.isbn_new));
    if (detail.isbn_old && detail.isbn_old !== detail.isbn_new) isbnRows.push(detailRow("旧ISBN", detail.isbn_old));

    const metaRows = [
      detailRow("書籍ID", detail.id),
      detail.pub_month ? detailRow("刊行年月", `${formatMonth(detail.pub_month)}${detail.pub_note ? `（${detail.pub_note}）` : ""}`) : "",
      ...isbnRows,
      detail.format ? detailRow("判型", detail.format) : "",
      detail.pages ? detailRow("頁数", `${detail.pages}頁`) : "",
      detail.price_body ? detailRow("本体価格", `${Number(detail.price_body).toLocaleString("ja-JP")}円`) : "",
      series ? detailRow("シリーズ", series) : "",
      detail.original_title ? detailRow("原書名", detail.original_title) : ""
    ].filter(Boolean).join("");

    const genreTags = (detail.genres || []).map((g) => `<span class="tag">${esc(g)}</span>`).join("");
    const statusItems = [];
    if (detail.has_errata) statusItems.push("正誤表の登録があります");
    if (detail.has_related_info) statusItems.push("関連情報・付属データの登録があります");

    modalContent.innerHTML = `
      <p class="admin-modal-kicker">現在の登録内容</p>
      <h2 id="admin-modal-title" class="admin-modal-title">${esc(detail.title || "（書名未登録）")}</h2>
      ${sub ? `<p class="admin-modal-subtitle">${esc(sub)}</p>` : ""}
      ${detail.author ? `<p class="admin-modal-author">${esc(authorDisplay(detail.author))}</p>` : ""}
      ${genreTags ? `<div class="admin-modal-tags">${genreTags}</div>` : ""}
      ${metaRows ? `<dl class="detail-grid">${metaRows}</dl>` : ""}
      <div class="admin-edit-box">
        <p>この書誌の現在値を入力済みにした編集フォームを開きます。</p>
        <button class="admin-btn" id="open-edit-form" type="button">この書誌を編集</button>
      </div>
      ${detail.description ? `<section class="admin-detail-section"><h3>内容紹介</h3><p class="admin-detail-copy">${richText(detail.description)}</p></section>` : ""}
      ${detail.toc ? `<section class="admin-detail-section"><h3>目次</h3><div class="admin-detail-toc">${richText(detail.toc)}</div></section>` : ""}
      ${statusItems.length ? `<section class="admin-detail-section"><h3>関連資料</h3><ul>${statusItems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
    `;
    document.getElementById("open-edit-form").addEventListener("click", (event) => openEditForm(book, detail, event.currentTarget));

    modal.hidden = false;
    document.body.classList.add("modal-open");
    modalClose?.focus();
  }

  async function openBookModal(book, trigger) {
    if (!book || !modal || !modalContent) return;
    lastModalTrigger = trigger || document.activeElement;

    modalContent.innerHTML = `<p class="admin-modal-kicker">現在の登録内容</p><h2 id="admin-modal-title" class="admin-modal-title">${esc(book.title || "（書名未登録）")}</h2><p>詳細情報を読み込んでいます…</p>`;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    modalClose?.focus();

    try {
      const detail = await loadBookDetail(book);
      renderBookModal(book, detail, trigger);
    } catch (error) {
      console.error("Failed to load admin book detail.", error);
      modalContent.innerHTML = `<p class="admin-modal-kicker">現在の登録内容</p><h2 id="admin-modal-title" class="admin-modal-title">${esc(book.title || "（書名未登録）")}</h2><p>詳細情報を読み込めませんでした。ページを再読み込みしてください。</p>`;
    }
  }

  function render(items) {
    results.replaceChildren();
    if (!items.length) {
      count.textContent = "該当する書誌がありません。";
      const div = document.createElement("div");
      div.className = "empty";
      div.textContent = "検索語を変えてお試しください。";
      results.appendChild(div);
      return;
    }

    count.textContent = `${items.length.toLocaleString()}件表示`;
    items.forEach((book) => {
      const card = document.createElement("article");
      card.className = "book-result";

      const h2 = document.createElement("h2");
      const titleButton = document.createElement("button");
      titleButton.type = "button";
      titleButton.className = "book-title-button";
      titleButton.textContent = book.title || "（書名なし）";
      titleButton.addEventListener("click", () => openBookModal(book, titleButton));
      h2.appendChild(titleButton);
      card.appendChild(h2);

      const meta = document.createElement("div");
      meta.className = "book-meta";
      const parts = [
        book.author ? `著者：${authorDisplay(book.author)}` : "",
        book.isbn_new ? `ISBN：${book.isbn_new}` : (book.isbn_old ? `ISBN：${book.isbn_old}` : ""),
        book.pub_month ? `刊行：${formatMonth(book.pub_month)}` : "",
        `書籍ID：${book.id}`,
      ].filter(Boolean);
      parts.forEach((part) => {
        const span = document.createElement("span");
        span.textContent = part;
        meta.appendChild(span);
      });
      card.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "book-actions";

      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.className = "admin-btn secondary";
      detailButton.textContent = "詳細を確認・編集";
      detailButton.addEventListener("click", () => openBookModal(book, detailButton));
      actions.appendChild(detailButton);

      card.appendChild(actions);
      results.appendChild(card);
    });
  }

  function search() {
    const terms = queryInput.value.trim().split(/\s+/).filter(Boolean).map(normalize);
    if (!terms.length) {
      count.textContent = "検索語を入力してください。";
      results.replaceChildren();
      return;
    }

    const matched = books.filter((book) => {
      const haystack = normalize([
        book.id,
        book.title,
        book.subtitle_before,
        book.subtitle_after,
        book.author,
        book.isbn_old,
        book.isbn_new,
        (book.genres || []).join(" "),
        book.series,
        book.search_extra,
      ].filter(Boolean).join(" "));
      return terms.every((term) => haystack.includes(term));
    }).slice(0, 50);

    render(matched);
    if (matched.length === 50) {
      count.textContent += "（上位50件。さらに絞り込んでください）";
    }
  }

  async function init() {
    try {
      books = await loadSearchData();
      newBookLink.href = newUrl();
      searchButton.addEventListener("click", search);
      queryInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") search();
      });
      modalClose?.addEventListener("click", closeBookModal);
      modal?.addEventListener("click", (event) => {
        if (event.target.matches("[data-modal-close]")) closeBookModal();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal && !modal.hidden) closeBookModal();
      });
      count.textContent = "検索語を入力してください。";
    } catch (error) {
      console.error("Failed to load current admin book data.", error);
      count.textContent = "書誌データを読み込めませんでした。ページを再読み込みしてください。";
    }
  }

  init();
})();
