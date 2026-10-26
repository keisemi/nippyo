(() => {
  "use strict";

  const books = Array.isArray(window.NIPPYO_BOOKS) ? window.NIPPYO_BOOKS : [];
  const queryInput = document.getElementById("book-query");
  const searchButton = document.getElementById("search-button");
  const results = document.getElementById("results");
  const count = document.getElementById("result-count");
  const newBookLink = document.getElementById("new-book-link");
  const modal = document.getElementById("book-modal");
  const modalContent = document.getElementById("book-modal-content");
  const modalClose = document.getElementById("book-modal-close");
  const issueBase = "https://github.com/keisemi/nippyo/issues/new";
  let lastModalTrigger = null;

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s\-‐‑‒–—―ー]/g, "");
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
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

  function detailText(value) {
    return esc(value || "").replace(/\r?\n/g, "<br>");
  }

  function editUrl(book) {
    const params = new URLSearchParams();
    params.set("template", "book_edit.yml");
    params.set("title", `[書誌修正] ${book.title}`);
    params.set("book_id", book.id);
    params.set("current_title", book.title);
    return `${issueBase}?${params.toString()}`;
  }

  function newUrl() {
    const params = new URLSearchParams();
    params.set("template", "book_new.yml");
    return `${issueBase}?${params.toString()}`;
  }

  function openBookModal(book, trigger) {
    if (!book || !modal || !modalContent) return;
    lastModalTrigger = trigger || document.activeElement;

    const sub = subtitle(book);
    const series = [book.series, book.series_volume].filter(Boolean).join(" ");
    const isbnRows = [];
    if (book.isbn_new) isbnRows.push(detailRow("ISBN", book.isbn_new));
    if (book.isbn_old && book.isbn_old !== book.isbn_new) isbnRows.push(detailRow("旧ISBN", book.isbn_old));

    const metaRows = [
      detailRow("書籍ID", book.id),
      book.pub_month ? detailRow("刊行年月", `${formatMonth(book.pub_month)}${book.pub_note ? `（${book.pub_note}）` : ""}`) : "",
      ...isbnRows,
      book.format ? detailRow("判型", book.format) : "",
      book.pages ? detailRow("頁数", `${book.pages}頁`) : "",
      book.price_body ? detailRow("本体価格", `${Number(book.price_body).toLocaleString("ja-JP")}円`) : "",
      series ? detailRow("シリーズ", series) : "",
      book.original_title ? detailRow("原書名", book.original_title) : ""
    ].filter(Boolean).join("");

    const genreTags = (book.genres || []).map((g) => `<span class="tag">${esc(g)}</span>`).join("");
    const statusItems = [];
    if (book.has_errata) statusItems.push("正誤表の登録があります");
    if (book.has_related_info) statusItems.push("関連情報・付属データの登録があります");

    modalContent.innerHTML = `
      <p class="admin-modal-kicker">現在の登録内容</p>
      <h2 id="admin-modal-title" class="admin-modal-title">${esc(book.title || "（書名未登録）")}</h2>
      ${sub ? `<p class="admin-modal-subtitle">${esc(sub)}</p>` : ""}
      ${book.author ? `<p class="admin-modal-author">${esc(authorDisplay(book.author))}</p>` : ""}
      ${genreTags ? `<div class="admin-modal-tags">${genreTags}</div>` : ""}
      ${metaRows ? `<dl class="detail-grid">${metaRows}</dl>` : ""}
      <div class="admin-edit-box">
        <p>この詳細表示と同じ <strong>書籍ID <span class="admin-book-id">${esc(book.id)}</span></strong> の書誌を修正します。修正Issueでは、変更する項目だけ入力してください。</p>
        <a class="admin-btn" href="${esc(editUrl(book))}">この書誌を修正</a>
      </div>
      ${book.description ? `<section class="admin-detail-section"><h3>内容紹介</h3><p class="admin-detail-copy">${detailText(book.description)}</p></section>` : ""}
      ${book.toc ? `<section class="admin-detail-section"><h3>目次</h3><div class="admin-detail-toc">${detailText(book.toc)}</div></section>` : ""}
      ${statusItems.length ? `<section class="admin-detail-section"><h3>関連資料</h3><ul>${statusItems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
    `;

    modal.hidden = false;
    document.body.classList.add("modal-open");
    modalClose?.focus();
  }

  function closeBookModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastModalTrigger && typeof lastModalTrigger.focus === "function") lastModalTrigger.focus();
    lastModalTrigger = null;
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
      detailButton.textContent = "詳細を確認";
      detailButton.addEventListener("click", () => openBookModal(book, detailButton));
      actions.appendChild(detailButton);

      const editLink = document.createElement("a");
      editLink.className = "admin-btn secondary";
      editLink.href = editUrl(book);
      editLink.textContent = "この書誌を修正";
      actions.appendChild(editLink);

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
        book.search,
        book.title,
        book.author,
        book.isbn_old,
        book.isbn_new,
        (book.genres || []).join(" ")
      ].filter(Boolean).join(" "));
      return terms.every((term) => haystack.includes(term));
    }).slice(0, 50);

    render(matched);
    if (matched.length === 50) {
      count.textContent += "（上位50件。さらに絞り込んでください）";
    }
  }

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
})();
