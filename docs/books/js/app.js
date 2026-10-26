(() => {
  "use strict";

  const PAGE_SIZE = 30;

  const els = {
    q: document.getElementById("q"),
    genre: document.getElementById("genre"),
    year: document.getElementById("year"),
    sort: document.getElementById("sort"),
    results: document.getElementById("results"),
    pagination: document.getElementById("pagination"),
    count: document.getElementById("count"),
    clear: document.getElementById("clear"),
    searchButton: document.getElementById("searchButton"),
    loading: document.getElementById("loading"),
    error: document.getElementById("error"),
    lastUpdated: document.getElementById("lastUpdated"),
    bookModal: document.getElementById("bookModal"),
    bookModalContent: document.getElementById("bookModalContent"),
    bookModalClose: document.getElementById("bookModalClose")
  };

  let books = [];
  let filtered = [];
  let page = 1;
  let lastModalTrigger = null;

  function norm(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLocaleLowerCase("ja-JP")
      .replace(/[‐‑‒–—―−ーｰ]/g, "-")
      .replace(/[・･,，、。\.\/:;；：()（）\[\]【】「」『』<>＜＞]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normIsbn(value) {
    return norm(value).replace(/[^0-9x]/g, "");
  }

  function pubKey(book) {
    const digits = String(book.pub_month || "").replace(/[^0-9]/g, "");
    return Number(digits || book.pub_year || 0);
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function authorDisplay(value) {
    return String(value || "").split("|").filter(Boolean).join("／");
  }

  function formatMonth(value) {
    const m = String(value || "").match(/^(\d{4})[.\/-]?(\d{1,2})?$/);
    if (!m) return esc(value || "");
    return m[2] ? `${m[1]}年${Number(m[2])}月` : `${m[1]}年`;
  }

  function formatPrice(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? `本体価格 ${n.toLocaleString("ja-JP")}円` : "";
  }

  function subtitle(book) {
    return [book.subtitle_before, book.subtitle_after].filter(Boolean).join(" ");
  }


  function amazonUrl(book) {
    const asin = String(book.amazon_asin || "").trim().toUpperCase();
    if (/^[A-Z0-9]{10}$/.test(asin)) {
      return `https://www.amazon.co.jp/dp/${encodeURIComponent(asin)}`;
    }

    const isbn = normIsbn(book.isbn_new || book.isbn_old || book.isbn || "");
    if (isbn) {
      return `https://www.amazon.co.jp/s?k=${encodeURIComponent(isbn)}`;
    }

    const query = [book.title, authorDisplay(book.author)].filter(Boolean).join(" ").trim();
    return query
      ? `https://www.amazon.co.jp/s?k=${encodeURIComponent(query)}`
      : "";
  }

  function amazonButton(book) {
    const url = amazonUrl(book);
    if (!url) return "";
    return `<div class="book-purchase-actions"><a class="amazon-purchase-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Amazonで購入</a></div>`;
  }

  function detailRow(label, value) {
    if (!value) return "";
    return `<div class="detail-row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  }

  function detailText(value) {
    return esc(value || "").replace(/\r?\n/g, "<br>");
  }

  function openBookModal(bookId, trigger) {
    const book = books.find((item) => String(item.id) === String(bookId));
    if (!book || !els.bookModal || !els.bookModalContent) return;

    lastModalTrigger = trigger || document.activeElement;
    const sub = subtitle(book);
    const series = [book.series, book.series_volume].filter(Boolean).join(" ");
    const isbnRows = [];
    if (book.isbn_new) isbnRows.push(detailRow("ISBN", book.isbn_new));
    if (book.isbn_old && book.isbn_old !== book.isbn_new) isbnRows.push(detailRow("旧ISBN", book.isbn_old));

    const metaRows = [
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

    els.bookModalContent.innerHTML = `
      <p class="book-modal-kicker">書籍詳細</p>
      <h2 id="bookModalTitle" class="book-modal-title">${esc(book.title || "（書名未登録）")}</h2>
      ${sub ? `<p class="book-modal-subtitle">${esc(sub)}</p>` : ""}
      ${book.author ? `<p class="book-modal-author">${esc(authorDisplay(book.author))}</p>` : ""}
      ${genreTags ? `<div class="tags book-modal-tags">${genreTags}</div>` : ""}
      ${metaRows ? `<dl class="detail-grid">${metaRows}</dl>` : ""}
      ${amazonButton(book)}
      ${book.description ? `<section class="book-detail-section"><h3>内容紹介</h3><p class="book-detail-copy">${detailText(book.description)}</p></section>` : ""}
      ${book.toc ? `<section class="book-detail-section"><h3>目次</h3><div class="book-detail-toc">${detailText(book.toc)}</div></section>` : ""}
      ${statusItems.length ? `<section class="book-detail-section related-status"><h3>関連資料</h3><ul>${statusItems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p>ダウンロード先は現在準備中です。</p></section>` : ""}
    `;

    els.bookModal.hidden = false;
    document.body.classList.add("modal-open");
    els.bookModalClose?.focus();
  }

  function closeBookModal() {
    if (!els.bookModal || els.bookModal.hidden) return;
    els.bookModal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastModalTrigger && typeof lastModalTrigger.focus === "function") {
      lastModalTrigger.focus();
    }
    lastModalTrigger = null;
  }

  function prepareBooks(data) {
    books = data.map((book, i) => {
      const isbnBits = [book.isbn, book.isbn_old, book.isbn_new]
        .map(normIsbn).filter(Boolean).join(" ");
      return {
        ...book,
        __n: norm(`${book.search || ""} ${isbnBits}`),
        __i: i
      };
    });

    const genres = [...new Set(books.flatMap((b) => Array.isArray(b.genres) ? b.genres : []).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ja"));
    const years = [...new Set(books.map((b) => Number(b.pub_year)).filter((y) => y > 0))]
      .sort((a, b) => b - a);

    for (const g of genres) els.genre.add(new Option(g, g));
    for (const y of years) els.year.add(new Option(String(y), String(y)));
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (els.q.value.trim()) p.set("q", els.q.value.trim());
    if (els.genre.value) p.set("genre", els.genre.value);
    if (els.year.value) p.set("year", els.year.value);
    if (els.sort.value !== "relevance") p.set("sort", els.sort.value);
    if (page > 1) p.set("page", String(page));
    const url = `${location.pathname}${p.toString() ? `?${p}` : ""}`;
    try { history.replaceState(null, "", url); } catch (_) {}
  }

  function restoreUrl() {
    const p = new URLSearchParams(location.search);
    els.q.value = p.get("q") || "";
    if (p.get("genre")) els.genre.value = p.get("genre");
    if (p.get("year")) els.year.value = p.get("year");
    if (["relevance", "newest", "oldest", "title"].includes(p.get("sort"))) els.sort.value = p.get("sort");
    page = Math.max(1, Number(p.get("page")) || 1);
  }

  function relevanceScore(book, raw, tokens) {
    const qNorm = norm(raw);
    const qIsbn = normIsbn(raw);
    const title = norm(book.title);
    const authors = norm(book.author);
    const genres = norm((book.genres || []).join(" "));
    const isbns = [book.isbn, book.isbn_old, book.isbn_new].map(normIsbn).filter(Boolean);
    let score = 0;

    if (qIsbn.length >= 9 && isbns.includes(qIsbn)) score += 2000;
    if (title === qNorm) score += 1200;
    else if (title.startsWith(qNorm)) score += 700;
    else if (title.includes(qNorm)) score += 450;
    if (authors === qNorm) score += 800;
    else if (authors.includes(qNorm)) score += 300;

    for (const token of tokens) {
      if (title.includes(token)) score += 140;
      if (authors.includes(token)) score += 80;
      if (genres.includes(token)) score += 35;
      if (book.__n.includes(token)) score += 10;
    }
    return score;
  }

  function apply() {
    const raw = els.q.value.trim();
    const tokens = norm(raw).split(" ").filter(Boolean);
    const isbnQuery = normIsbn(raw);
    const looksLikeIsbn = isbnQuery.length >= 9 && /^[0-9x]+$/.test(isbnQuery);
    const genre = els.genre.value;
    const year = Number(els.year.value || 0);

    filtered = books.filter((book) => {
      if (genre && !(book.genres || []).includes(genre)) return false;
      if (year && Number(book.pub_year) !== year) return false;
      if (looksLikeIsbn && ![book.isbn, book.isbn_old, book.isbn_new].map(normIsbn).some((x) => x.includes(isbnQuery))) return false;
      if (!looksLikeIsbn && tokens.length && !tokens.every((t) => book.__n.includes(t))) return false;
      return true;
    });

    if (els.sort.value === "relevance") {
      if (!raw) {
        filtered.sort((a, b) => pubKey(b) - pubKey(a) || a.__i - b.__i);
      } else {
        filtered.sort((a, b) => relevanceScore(b, raw, tokens) - relevanceScore(a, raw, tokens) || pubKey(b) - pubKey(a) || a.__i - b.__i);
      }
    } else if (els.sort.value === "newest") {
      filtered.sort((a, b) => pubKey(b) - pubKey(a) || a.__i - b.__i);
    } else if (els.sort.value === "oldest") {
      filtered.sort((a, b) => pubKey(a) - pubKey(b) || a.__i - b.__i);
    } else {
      filtered.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ja"));
    }

    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), pages);
    render();
    syncUrl();
  }

  function render() {
    const start = (page - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);
    els.count.innerHTML = `<strong>${filtered.length.toLocaleString("ja-JP")}</strong> 件`;

    if (!slice.length) {
      els.results.innerHTML = '<li class="empty">該当する書籍がありません。検索語や条件を変えてお試しください。</li>';
    } else {
      els.results.innerHTML = slice.map((book) => {
        const tags = [];
        for (const g of (book.genres || []).slice(0, 4)) tags.push(`<span class="tag">${esc(g)}</span>`);
        if (book.series) tags.push(`<span class="tag">${esc(book.series)}</span>`);
        if (book.has_errata) tags.push('<span class="tag status">正誤表あり</span>');
        if (book.has_related_info) tags.push('<span class="tag status">関連情報あり</span>');

        const meta = [
          book.pub_month ? `${formatMonth(book.pub_month)}刊` : "",
          book.isbn ? `ISBN ${esc(book.isbn)}` : "",
          book.format ? esc(book.format) : "",
          book.pages ? `${esc(book.pages)}頁` : ""
        ].filter(Boolean).map((x) => `<span>${x}</span>`).join("");

        const sub = subtitle(book);
        const price = formatPrice(book.price_body);

        return `<li class="book">
          <div class="book-main">
            <h2 class="book-title"><button class="book-title-button" type="button" data-book-id="${esc(book.id)}">${esc(book.title || "（書名未登録）")}</button></h2>
            ${sub ? `<p class="book-subtitle">${esc(sub)}</p>` : ""}
            ${book.author ? `<p class="book-author">${esc(authorDisplay(book.author))}</p>` : ""}
            <p class="meta">${meta}</p>
            ${tags.length ? `<div class="tags">${tags.join("")}</div>` : ""}
          </div>
          <div class="book-side">${price ? `<p class="price">${price}</p>` : ""}</div>
        </li>`;
      }).join("");
    }
    renderPagination();
  }

  function renderPagination() {
    els.pagination.innerHTML = "";
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (totalPages <= 1) return;

    const add = (label, target, current = false, disabled = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-button";
      button.textContent = label;
      button.disabled = disabled;
      if (current) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => {
        page = target;
        render();
        syncUrl();
        window.scrollTo({ top: document.querySelector(".toolbar").offsetTop - 20, behavior: "smooth" });
      });
      els.pagination.appendChild(button);
    };

    add("‹", Math.max(1, page - 1), false, page === 1);
    const first = Math.max(1, Math.min(page - 2, totalPages - 4));
    const last = Math.min(totalPages, first + 4);
    for (let p = first; p <= last; p += 1) add(String(p), p, p === page, false);
    add("›", Math.min(totalPages, page + 1), false, page === totalPages);
  }

  function bindEvents() {
    let timer;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { page = 1; apply(); }, 180);
    };

    els.q.addEventListener("input", schedule);
    els.q.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { clearTimeout(timer); page = 1; apply(); }
    });
    els.searchButton.addEventListener("click", () => { clearTimeout(timer); page = 1; apply(); });
    els.genre.addEventListener("change", () => { page = 1; apply(); });
    els.year.addEventListener("change", () => { page = 1; apply(); });
    els.sort.addEventListener("change", () => { page = 1; apply(); });
    els.results.addEventListener("click", (event) => {
      const button = event.target.closest(".book-title-button");
      if (!button) return;
      openBookModal(button.dataset.bookId, button);
    });
    els.bookModalClose?.addEventListener("click", closeBookModal);
    els.bookModal?.addEventListener("click", (event) => {
      if (event.target.matches("[data-modal-close]")) closeBookModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && els.bookModal && !els.bookModal.hidden) closeBookModal();
    });
    els.clear.addEventListener("click", () => {
      els.q.value = "";
      els.genre.value = "";
      els.year.value = "";
      els.sort.value = "relevance";
      page = 1;
      apply();
      els.q.focus();
    });
  }

  function loadBookData() {
    if (!Array.isArray(window.NIPPYO_BOOKS)) {
      throw new Error("生成済み書誌データ books.js を読み込めませんでした。");
    }
    return window.NIPPYO_BOOKS;
  }

  function loadUpdatedDate() {
    return window.NIPPYO_LAST_UPDATED
      ? String(window.NIPPYO_LAST_UPDATED).trim()
      : "—";
  }

  async function init() {
    try {
      const data = loadBookData();
      if (!Array.isArray(data)) throw new Error("Book data is not an array");

      prepareBooks(data);
      restoreUrl();
      bindEvents();
      els.lastUpdated.textContent = loadUpdatedDate() || "—";
      els.loading.hidden = true;
      els.results.hidden = false;
      apply();
    } catch (error) {
      console.error("Failed to load book data.", error);
      els.loading.hidden = true;
      els.error.hidden = false;
      els.count.textContent = "読み込みエラー";
    }
  }

  init();
})();
