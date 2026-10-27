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
  let magazineIssues = [];
  let items = [];
  let filtered = [];
  let page = 1;
  let lastModalTrigger = null;
  let bookDataVersion = Date.now().toString();
  let magazineDataVersion = Date.now().toString();
  const bookDetailCache = new Map();
  const magazineDetailCache = new Map();

  function norm(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLocaleLowerCase("ja-JP")
      .replace(/[‐-‒–—―−ーｰ]/g, "-")
      .replace(/[・･,，、。\.\/:;；：()（）\[\]【】「」『』<>＜＞]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normIdentifier(value) {
    return norm(value).replace(/[^0-9x]/g, "");
  }

  function itemIdentifiers(item) {
    const values = [item.isbn, item.isbn_old, item.isbn_new];
    if (item.identifiers) {
      values.push(...String(item.identifiers).split("|").filter(Boolean));
    }
    if (item.__type === "magazine_issue") {
      values.push(item.magazine_code_1, item.magazine_code_2);
    }
    return [...new Set(values.map(normIdentifier).filter(Boolean))];
  }

  function pubKey(item) {
    if (item.__type === "magazine_issue") {
      const match = String(item.pub_date || "").match(/^(\d{4})[-/.]?(\d{1,2})?[-/.]?(\d{1,2})?/);
      if (match) {
        const year = Number(match[1]);
        const month = Number(match[2] || 0);
        const day = Number(match[3] || 0);
        return year * 10000 + month * 100 + day;
      }
    }

    const match = String(item.pub_month || "").match(/^(\d{4})[.\/-]?(\d{1,2})?/);
    if (match) {
      return Number(match[1]) * 10000 + Number(match[2] || 0) * 100;
    }
    return Number(item.pub_year || 0) * 10000;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function authorDisplay(value) {
    return String(value || "").split("|").filter(Boolean).join("／");
  }

  function contributorDisplay(value, rawQuery = "") {
    const names = Array.isArray(value) ? value.filter(Boolean) : [];
    if (!names.length) return "";
    const queryTerms = norm(rawQuery).split(" ").filter(Boolean);
    const matching = queryTerms.length
      ? names.filter((name) => queryTerms.every((term) => norm(name).includes(term)))
      : [];
    const ordered = [...matching, ...names.filter((name) => !matching.includes(name))];
    const shown = ordered.slice(0, 6).join("／");
    return ordered.length > 6 ? `${shown} ほか` : shown;
  }

  function formatMonth(value) {
    const m = String(value || "").match(/^(\d{4})[.\/-]?(\d{1,2})?$/);
    if (!m) return esc(value || "");
    return m[2] ? `${m[1]}年${Number(m[2])}月` : `${m[1]}年`;
  }

  function formatDate(value) {
    const m = String(value || "").match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/);
    if (!m) return String(value || "");
    const day = Number(m[3] || 0);
    return day > 0
      ? `${m[1]}年${Number(m[2])}月${day}日`
      : `${m[1]}年${Number(m[2])}月`;
  }

  function formatPrice(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? `本体価格 ${n.toLocaleString("ja-JP")}円` : "";
  }

  function subtitle(book) {
    return [book.subtitle_before, book.subtitle_after].filter(Boolean).join(" ");
  }

  function magazineTitle(issue) {
    return [issue.magazine_name, issue.issue].filter(Boolean).join(" ");
  }

  function magazineFeature(issue) {
    return [issue.feature, issue.feature_subtitle].filter(Boolean).join("　");
  }

  function itemTitle(item) {
    return item.__type === "magazine_issue" ? magazineTitle(item) : String(item.title || "");
  }

  function amazonUrl(book) {
    const asin = String(book.amazon_asin || "").trim().toUpperCase();
    if (/^[A-Z0-9]{10}$/.test(asin)) {
      return `https://www.amazon.co.jp/dp/${encodeURIComponent(asin)}`;
    }

    const isbn = normIdentifier(book.isbn_new || book.isbn_old || book.isbn || "");
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
    if (value === null || value === undefined || value === "") return "";
    return `<div class="detail-row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  }

  function safeLinkHref(value) {
    const href = String(value || "").trim();
    if (/^https?:\/\//i.test(href)) return href;
    if (/^(?:\.\.?\/|\/)/.test(href)) return href;
    return "";
  }

  function detailText(value) {
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

  function renderLinkList(links) {
    const valid = (Array.isArray(links) ? links : [])
      .map((link) => ({
        title: String(link?.title || "").trim(),
        comment: String(link?.comment || "").trim(),
        href: safeLinkHref(link?.url)
      }))
      .filter((link) => link.href);
    if (!valid.length) return "";
    return `<section class="book-detail-section"><h3>関連リンク</h3><ul>${valid.map((link) => {
      const label = link.title || link.href;
      return `<li><a href="${esc(link.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>${link.comment ? ` — ${detailText(link.comment)}` : ""}</li>`;
    }).join("")}</ul></section>`;
  }

  function renderEbookLinks(links) {
    const labels = {
      kindle: "Kindle",
      univcoop: "大学生協",
      google_play: "Google Play",
      itunes: "Apple Books",
      jiko_gaku: "自己学習用",
      kinoppy: "Kinoppy",
      e_hon: "e-hon",
      ebookjapan: "ebookjapan",
      honto: "honto",
      rakuten_books: "楽天ブックス",
      "7net": "7net",
      fujisan: "Fujisan.co.jp",
      m2plus: "M2PLUS",
      viewn: "ビューン",
      tabho: "タブホ",
      magastore: "マガストア"
    };
    const valid = (Array.isArray(links) ? links : [])
      .map((link) => ({ service: String(link?.service || "").trim(), href: safeLinkHref(link?.url) }))
      .filter((link) => link.href);
    if (!valid.length) return "";
    return `<section class="book-detail-section"><h3>電子版</h3><ul>${valid.map((link) => `<li><a href="${esc(link.href)}" target="_blank" rel="noopener noreferrer">${esc(labels[link.service] || link.service || "電子版")}</a></li>`).join("")}</ul></section>`;
  }

  async function readVersion(path) {
    const stamp = Date.now().toString();
    try {
      const response = await fetch(`${path}?t=${stamp}`, { cache: "no-store" });
      if (response.ok) {
        const value = (await response.text()).trim();
        if (value) return value;
      }
    } catch (_) {
      // 本体データ側の取得で改めてエラー表示する。
    }
    return stamp;
  }

  function expandRows(payload, key) {
    const rows = payload && Array.isArray(payload[key]) ? payload[key] : null;
    if (!rows) throw new Error(`${key} の検索データがありません。`);
    if (!rows.length || !Array.isArray(rows[0])) return rows;
    const columns = Array.isArray(payload.columns) ? payload.columns : [];
    if (!columns.length) throw new Error(`${key} の列定義がありません。`);
    return rows.map((row) => {
      if (!Array.isArray(row) || row.length !== columns.length) {
        throw new Error(`${key} の行長が列定義と一致しません。`);
      }
      const item = {};
      columns.forEach((column, index) => { item[column] = row[index]; });
      return item;
    });
  }

  async function loadSearchData() {
    [bookDataVersion, magazineDataVersion] = await Promise.all([
      readVersion("../data/last-updated.txt"),
      readVersion("../data/magazine-last-updated.txt")
    ]);

    const [bookResponse, magazineResponse] = await Promise.all([
      fetch(`../data/books-search.json?v=${encodeURIComponent(bookDataVersion)}`),
      fetch(`../data/magazine-issues-search.json?v=${encodeURIComponent(magazineDataVersion)}`)
    ]);

    if (!bookResponse.ok) {
      throw new Error(`books-search.json を取得できませんでした（HTTP ${bookResponse.status}）`);
    }
    if (!magazineResponse.ok) {
      throw new Error(`magazine-issues-search.json を取得できませんでした（HTTP ${magazineResponse.status}）`);
    }

    const [bookPayload, magazinePayload] = await Promise.all([
      bookResponse.json(),
      magazineResponse.json()
    ]);

    if (!bookPayload || !Array.isArray(bookPayload.books)) {
      throw new Error("books-search.json の形式が不正です。");
    }
    if (!magazinePayload || !Array.isArray(magazinePayload.issues)) {
      throw new Error("magazine-issues-search.json の形式が不正です。");
    }

    return {
      bookPayload: { ...bookPayload, books: expandRows(bookPayload, "books") },
      magazinePayload: { ...magazinePayload, issues: expandRows(magazinePayload, "issues") }
    };
  }

  async function loadBookDetailShard(detailKey) {
    const key = String(detailKey || "undated");
    if (!bookDetailCache.has(key)) {
      const promise = fetch(`../data/book-details/books-detail-${encodeURIComponent(key)}.json?v=${encodeURIComponent(bookDataVersion)}`)
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
          bookDetailCache.delete(key);
          throw error;
        });
      bookDetailCache.set(key, promise);
    }
    return bookDetailCache.get(key);
  }

  async function loadMagazineDetailShard(detailKey) {
    const key = String(detailKey || "undated");
    if (!magazineDetailCache.has(key)) {
      const promise = fetch(`../data/magazine-details/magazine-details-${encodeURIComponent(key)}.json?v=${encodeURIComponent(magazineDataVersion)}`)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`雑誌号詳細データを取得できませんでした（${key}: HTTP ${response.status}）`);
          }
          return response.json();
        })
        .then((payload) => {
          if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            throw new Error(`雑誌号詳細データの形式が不正です（${key}）`);
          }
          return payload;
        })
        .catch((error) => {
          magazineDetailCache.delete(key);
          throw error;
        });
      magazineDetailCache.set(key, promise);
    }
    return magazineDetailCache.get(key);
  }

  async function loadBookDetail(book) {
    const shard = await loadBookDetailShard(book.detail_key);
    const detail = shard[String(book.id)];
    if (!detail) throw new Error(`書籍ID ${book.id} の詳細データが見つかりません。`);
    return { ...book, ...detail };
  }

  async function loadMagazineDetail(issue) {
    const shard = await loadMagazineDetailShard(issue.detail_key);
    const detail = shard[String(issue.id)];
    if (!detail) throw new Error(`雑誌号ID ${issue.id} の詳細データが見つかりません。`);
    return { ...issue, ...detail };
  }

  function renderBookDetail(detail) {
    const sub = subtitle(detail);
    const series = [detail.series, detail.series_volume].filter(Boolean).join(" ");
    const isbnRows = [];
    if (detail.isbn_new) isbnRows.push(detailRow("ISBN", detail.isbn_new));
    if (detail.isbn_old && detail.isbn_old !== detail.isbn_new) isbnRows.push(detailRow("旧ISBN", detail.isbn_old));

    const metaRows = [
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

    return `
      <p class="book-modal-kicker">書籍詳細</p>
      <h2 id="bookModalTitle" class="book-modal-title">${esc(detail.title || "（書名未登録）")}</h2>
      ${sub ? `<p class="book-modal-subtitle">${esc(sub)}</p>` : ""}
      ${detail.author ? `<p class="book-modal-author">${esc(authorDisplay(detail.author))}</p>` : ""}
      ${genreTags ? `<div class="tags book-modal-tags">${genreTags}</div>` : ""}
      ${metaRows ? `<dl class="detail-grid">${metaRows}</dl>` : ""}
      ${amazonButton(detail)}
      ${detail.description ? `<section class="book-detail-section"><h3>内容紹介</h3><p class="book-detail-copy">${detailText(detail.description)}</p></section>` : ""}
      ${detail.toc ? `<section class="book-detail-section"><h3>目次</h3><div class="book-detail-toc">${detailText(detail.toc)}</div></section>` : ""}
      ${statusItems.length ? `<section class="book-detail-section related-status"><h3>関連資料</h3><ul>${statusItems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p>ダウンロード先は現在準備中です。</p></section>` : ""}
    `;
  }

  function renderMagazineDetail(detail) {
    const feature = magazineFeature(detail);
    const feature2 = [detail.feature2, detail.feature2_subtitle].filter(Boolean).join("　");
    const isbnRows = [];
    if (detail.isbn_new) isbnRows.push(detailRow("ISBN", detail.isbn_new));
    if (detail.isbn_old && detail.isbn_old !== detail.isbn_new) isbnRows.push(detailRow("旧ISBN", detail.isbn_old));
    const magazineCodes = [detail.magazine_code_1, detail.magazine_code_2].filter(Boolean).join(" / ");

    const metaRows = [
      detail.issue_number ? detailRow("通巻", `通巻${detail.issue_number}号`) : "",
      detail.pub_date ? detailRow("発刊日", formatDate(detail.pub_date)) : "",
      ...isbnRows,
      magazineCodes ? detailRow("雑誌コード", magazineCodes) : "",
      detail.format ? detailRow("判型", detail.format) : "",
      detail.pages ? detailRow("頁数", `${detail.pages}頁`) : "",
      detail.price_body ? detailRow("本体価格", `${Number(detail.price_body).toLocaleString("ja-JP")}円`) : "",
      detail.editor ? detailRow("本誌編者", detail.editor) : ""
    ].filter(Boolean).join("");

    const descriptionHeading = detail.description_heading || "内容紹介";
    const descriptionHeading2 = detail.description_heading2 || "第2特集 内容紹介";

    return `
      <p class="book-modal-kicker">雑誌号詳細</p>
      <h2 id="bookModalTitle" class="book-modal-title">${esc(magazineTitle(detail) || "（雑誌号未登録）")}</h2>
      ${feature ? `<p class="book-modal-subtitle">特集：${esc(feature)}</p>` : ""}
      ${feature2 ? `<p class="book-modal-subtitle">第2特集：${esc(feature2)}</p>` : ""}
      ${metaRows ? `<dl class="detail-grid">${metaRows}</dl>` : ""}
      ${detail.description ? `<section class="book-detail-section"><h3>${esc(descriptionHeading)}</h3><p class="book-detail-copy">${detailText(detail.description)}</p></section>` : ""}
      ${detail.description2 ? `<section class="book-detail-section"><h3>${esc(descriptionHeading2)}</h3><p class="book-detail-copy">${detailText(detail.description2)}</p></section>` : ""}
      ${detail.toc ? `<section class="book-detail-section"><h3>目次</h3><div class="book-detail-toc">${detailText(detail.toc)}</div></section>` : ""}
      ${renderLinkList(detail.external_links)}
      ${renderEbookLinks(detail.ebook_links)}
    `;
  }

  async function openItemModal(type, itemId, trigger) {
    const item = items.find((candidate) => candidate.__type === type && String(candidate.id) === String(itemId));
    if (!item || !els.bookModal || !els.bookModalContent) return;

    lastModalTrigger = trigger || document.activeElement;
    const loadingLabel = type === "magazine_issue" ? "雑誌号詳細" : "書籍詳細";
    els.bookModalContent.innerHTML = `<p class="book-modal-kicker">${loadingLabel}</p><p>詳細情報を読み込んでいます…</p>`;
    els.bookModal.hidden = false;
    document.body.classList.add("modal-open");
    els.bookModalClose?.focus();

    try {
      if (type === "magazine_issue") {
        const detail = await loadMagazineDetail(item);
        els.bookModalContent.innerHTML = renderMagazineDetail(detail);
      } else {
        const detail = await loadBookDetail(item);
        els.bookModalContent.innerHTML = renderBookDetail(detail);
      }
    } catch (error) {
      console.error("Failed to load item detail.", error);
      els.bookModalContent.innerHTML = `
        <p class="book-modal-kicker">${loadingLabel}</p>
        <h2 id="bookModalTitle" class="book-modal-title">${esc(itemTitle(item) || "（未登録）")}</h2>
        <p>詳細情報を読み込めませんでした。ページを再読み込みして、もう一度お試しください。</p>
      `;
    }
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

  function prepareItems(bookData, issueData) {
    books = bookData.map((book, i) => {
      const statusFlags = Number(book.status_flags || 0);
      const normalizedBook = {
        ...book,
        detail_key: book.detail_key || (Number(book.pub_year) > 0 ? String(Number(book.pub_year)) : "undated"),
        has_errata: book.has_errata ?? Boolean(statusFlags & 1),
        has_related_info: book.has_related_info ?? Boolean(statusFlags & 2),
      };
      const identifiers = itemIdentifiers(normalizedBook).join(" ");
      const searchParts = [
        normalizedBook.title,
        normalizedBook.subtitle_before,
        normalizedBook.subtitle_after,
        normalizedBook.author,
        identifiers,
        ...(Array.isArray(normalizedBook.genres) ? normalizedBook.genres : []),
        normalizedBook.series,
        normalizedBook.search_extra,
      ];
      return {
        ...normalizedBook,
        __type: "book",
        __n: norm(searchParts.filter(Boolean).join(" ")),
        __i: i
      };
    });

    magazineIssues = issueData.map((issue, i) => {
      const normalizedIssue = {
        ...issue,
        detail_key: issue.detail_key || (Number(issue.pub_year) > 0 ? String(Number(issue.pub_year)) : "undated"),
      };
      const identifiers = itemIdentifiers({ ...normalizedIssue, __type: "magazine_issue" }).join(" ");
      const searchParts = [
        normalizedIssue.magazine_name,
        normalizedIssue.issue,
        normalizedIssue.issue_number,
        normalizedIssue.feature,
        normalizedIssue.feature_subtitle,
        normalizedIssue.feature2,
        normalizedIssue.feature2_subtitle,
        identifiers,
        ...(Array.isArray(normalizedIssue.contributors) ? normalizedIssue.contributors : []),
        normalizedIssue.search_extra,
      ];
      return {
        ...normalizedIssue,
        __type: "magazine_issue",
        __n: norm(searchParts.filter(Boolean).join(" ")),
        __i: books.length + i
      };
    });

    items = [...books, ...magazineIssues];

    const genres = [...new Set(books.flatMap((b) => Array.isArray(b.genres) ? b.genres : []).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ja"));
    const years = [...new Set(items.map((item) => Number(item.pub_year)).filter((y) => y > 0))]
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

  function relevanceScore(item, raw, tokens) {
    const qNorm = norm(raw);
    const qIdentifier = normIdentifier(raw);
    const title = norm(itemTitle(item));
    const identifiers = itemIdentifiers(item);
    let score = 0;

    if (qIdentifier.length >= 9 && identifiers.includes(qIdentifier)) score += 2000;
    if (title === qNorm) score += 1200;
    else if (title.startsWith(qNorm)) score += 700;
    else if (title.includes(qNorm)) score += 450;

    if (item.__type === "book") {
      const authors = norm(item.author);
      const genres = norm((item.genres || []).join(" "));
      if (authors === qNorm) score += 800;
      else if (authors.includes(qNorm)) score += 300;
      for (const token of tokens) {
        if (authors.includes(token)) score += 80;
        if (genres.includes(token)) score += 35;
      }
    } else {
      const magazineName = norm(item.magazine_name);
      const issue = norm(item.issue);
      const issueNumber = norm(item.issue_number);
      const feature = norm([item.feature, item.feature_subtitle, item.feature2, item.feature2_subtitle].filter(Boolean).join(" "));
      const contributors = norm((item.contributors || []).join(" "));
      if (magazineName === qNorm) score += 900;
      if (issue === qNorm) score += 700;
      if (issueNumber === qNorm) score += 900;
      if (feature === qNorm) score += 700;
      else if (feature.includes(qNorm)) score += 350;
      if (contributors === qNorm) score += 800;
      else if (contributors.includes(qNorm)) score += 300;
      for (const token of tokens) {
        if (magazineName.includes(token)) score += 100;
        if (issue.includes(token)) score += 90;
        if (issueNumber.includes(token)) score += 100;
        if (feature.includes(token)) score += 90;
        if (contributors.includes(token)) score += 80;
      }
    }

    for (const token of tokens) {
      if (title.includes(token)) score += 140;
      if (item.__n.includes(token)) score += 10;
    }
    return score;
  }

  function apply() {
    const raw = els.q.value.trim();
    const tokens = norm(raw).split(" ").filter(Boolean);
    const identifierQuery = normIdentifier(raw);
    const looksLikeIdentifier = identifierQuery.length >= 9 && /^[0-9x]+$/.test(identifierQuery);
    const genre = els.genre.value;
    const year = Number(els.year.value || 0);

    filtered = items.filter((item) => {
      if (genre) {
        if (item.__type !== "book" || !(item.genres || []).includes(genre)) return false;
      }
      if (year && Number(item.pub_year) !== year) return false;
      if (looksLikeIdentifier && !itemIdentifiers(item).some((value) => value.includes(identifierQuery))) return false;
      if (!looksLikeIdentifier && tokens.length && !tokens.every((token) => item.__n.includes(token))) return false;
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
      filtered.sort((a, b) => itemTitle(a).localeCompare(itemTitle(b), "ja"));
    }

    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), pages);
    render();
    syncUrl();
  }

  function renderBookResult(book) {
    const tags = ['<span class="tag">書籍</span>'];
    for (const g of (book.genres || []).slice(0, 4)) tags.push(`<span class="tag">${esc(g)}</span>`);
    if (book.series) tags.push(`<span class="tag">${esc(book.series)}</span>`);
    if (book.has_errata) tags.push('<span class="tag status">正誤表あり</span>');
    if (book.has_related_info) tags.push('<span class="tag status">関連情報あり</span>');

    const meta = [
      book.pub_month ? `${formatMonth(book.pub_month)}刊` : "",
      book.isbn ? `ISBN ${esc(book.isbn)}` : "",
      book.format ? esc(book.format) : "",
      book.pages ? `${esc(book.pages)}頁` : ""
    ].filter(Boolean).map((value) => `<span>${value}</span>`).join("");

    const sub = subtitle(book);
    const price = formatPrice(book.price_body);

    return `<li class="book">
      <div class="book-main">
        <h2 class="book-title"><button class="book-title-button" type="button" data-item-type="book" data-item-id="${esc(book.id)}">${esc(book.title || "（書名未登録）")}</button></h2>
        ${sub ? `<p class="book-subtitle">${esc(sub)}</p>` : ""}
        ${book.author ? `<p class="book-author">${esc(authorDisplay(book.author))}</p>` : ""}
        <p class="meta">${meta}</p>
        <div class="tags">${tags.join("")}</div>
      </div>
      <div class="book-side">${price ? `<p class="price">${price}</p>` : ""}</div>
    </li>`;
  }

  function renderMagazineResult(issue) {
    const tags = ['<span class="tag">雑誌</span>'];
    const meta = [
      issue.pub_date ? `${esc(formatDate(issue.pub_date))}刊` : "",
      issue.issue_number ? `通巻${esc(issue.issue_number)}号` : "",
      issue.isbn ? `ISBN ${esc(issue.isbn)}` : "",
      issue.format ? esc(issue.format) : "",
      issue.pages ? `${esc(issue.pages)}頁` : ""
    ].filter(Boolean).map((value) => `<span>${value}</span>`).join("");
    const feature = magazineFeature(issue);
    const contributors = contributorDisplay(issue.contributors, els.q.value);
    const price = formatPrice(issue.price_body);

    return `<li class="book">
      <div class="book-main">
        <h2 class="book-title"><button class="book-title-button" type="button" data-item-type="magazine_issue" data-item-id="${esc(issue.id)}">${esc(magazineTitle(issue) || "（雑誌号未登録）")}</button></h2>
        ${feature ? `<p class="book-subtitle">特集：${esc(feature)}</p>` : ""}
        ${contributors ? `<p class="book-author">執筆者等：${esc(contributors)}</p>` : ""}
        <p class="meta">${meta}</p>
        <div class="tags">${tags.join("")}</div>
      </div>
      <div class="book-side">${price ? `<p class="price">${price}</p>` : ""}</div>
    </li>`;
  }

  function render() {
    const start = (page - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);
    els.count.innerHTML = `<strong>${filtered.length.toLocaleString("ja-JP")}</strong> 件`;

    if (!slice.length) {
      els.results.innerHTML = '<li class="empty">該当する書籍・雑誌号がありません。検索語や条件を変えてお試しください。</li>';
    } else {
      els.results.innerHTML = slice.map((item) => item.__type === "magazine_issue" ? renderMagazineResult(item) : renderBookResult(item)).join("");
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
      openItemModal(button.dataset.itemType, button.dataset.itemId, button);
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

  async function init() {
    try {
      const { bookPayload, magazinePayload } = await loadSearchData();
      prepareItems(bookPayload.books, magazinePayload.issues);
      restoreUrl();
      bindEvents();
      els.lastUpdated.textContent = `書籍 ${String(bookPayload.updated || "—")} ／ 雑誌 ${String(magazinePayload.updated || "—")}`;
      els.loading.hidden = true;
      els.results.hidden = false;
      apply();
    } catch (error) {
      console.error("Failed to load search data.", error);
      els.loading.hidden = true;
      els.error.hidden = false;
      els.count.textContent = "読み込みエラー";
    }
  }

  init();
})();
