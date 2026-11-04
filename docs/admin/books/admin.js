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


  function openIssueForm(url) {
    window.open(url, "_blank", "noopener");
  }


  let books = [];
  let dataVersion = Date.now().toString();
  let lastModalTrigger = null;
  let searchIndexPromise = null;
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


  function bytesToBase64Url(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }


  async function encodeCompactEditPayload(payload) {
    const json = JSON.stringify(payload);
    if (typeof CompressionStream === "undefined") {
      return `json1:${json}`;
    }
    const compressed = new Blob([json], { type: "application/json" })
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
    return `gz1:${bytesToBase64Url(bytes)}`;
  }


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


  function hideUrl(book) {
    const params = new URLSearchParams();
    params.set("template", "book_hide.yml");
    params.set("title", `[書誌公開停止] ${book.title}`);
    params.set("book_id", book.id);
    params.set("current_title", book.title);
    return `${issueBase}?${params.toString()}`;
  }


  function restoreUrl(book) {
    const params = new URLSearchParams();
    params.set("template", "book_restore.yml");
    params.set("title", `[書誌再公開] ${book.title}`);
    params.set("book_id", book.id);
    params.set("current_title", book.title);
    return `${issueBase}?${params.toString()}`;
  }


  function deleteUrl(book) {
    const params = new URLSearchParams();
    params.set("template", "book_delete.yml");
    params.set("title", `[書誌削除] ${book.title}`);
    params.set("book_id", book.id);
    params.set("current_title", book.title);
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


  function normalizeSearchBook(book) {
    const statusFlags = Number(book.status_flags || 0);
    return {
      ...book,
      detail_key: book.detail_key || (Number(book.pub_year) > 0 ? String(Number(book.pub_year)) : "undated"),
      published: book.published !== false,
      has_errata: book.has_errata ?? Boolean(statusFlags & 1),
      has_related_info: book.has_related_info ?? Boolean(statusFlags & 2),
    };
  }


  async function loadSearchData() {
    dataVersion = await readDataVersion();
    const response = await fetch(`../../data/books-admin-search.json?v=${encodeURIComponent(dataVersion)}`);
    if (!response.ok) {
      throw new Error(`books-admin-search.json を取得できませんでした（HTTP ${response.status}）`);
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.books)) {
      throw new Error("books-admin-search.json の形式が不正です。");
    }
    return expandRows(payload, "books").map(normalizeSearchBook);
  }


  async function ensureSearchIndex() {
    if (!searchIndexPromise) {
      searchIndexPromise = fetch(`../../data/books-admin-search-index.json?v=${encodeURIComponent(dataVersion)}`)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`books-admin-search-index.json を取得できませんでした（HTTP ${response.status}）`);
          }
          return response.json();
        })
        .then((payload) => {
          if (!payload || !Array.isArray(payload.search) || payload.search.length !== books.length) {
            throw new Error("書籍検索索引と表示データの件数が一致しません。");
          }
          books.forEach((book, index) => {
            book.__adminSearch = String(payload.search[index] || "");
          });
        })
        .catch((error) => {
          searchIndexPromise = null;
          throw error;
        });
    }
    return searchIndexPromise;
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
    };
  }


  function openEditForm(book, detail, trigger) {
    const source = adminSource(detail);
    lastModalTrigger = trigger || document.activeElement;


    const fields = editFields.map(([id, label, kind]) => fieldHtml(id, label, kind, source[id] || "")).join("");


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
        <div class="admin-note">
          書影・正誤表・付属データ・関連リンクはこの書誌フォームでは変更しません。管理画面の「書籍関連ファイル管理」から操作してください。
        </div>
        <div class="edit-submit-box">
          <p>「変更内容を確認する」を押すと、<strong>変更した項目だけ</strong>が入った確認画面が開きます。内容を確認して、最後に更新を送信してください。</p>
          <button class="admin-btn" type="submit">変更内容を確認する</button>
          <button class="admin-btn secondary" id="back-to-detail" type="button">詳細表示へ戻る</button>
        </div>
      </form>
    `;


    const form = document.getElementById("book-edit-form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const params = new URLSearchParams();
      params.set("template", "book_edit.yml");
      const nextTitle = document.getElementById("edit-title").value.trim() || source.title;
      params.set("title", `[書誌修正] ${nextTitle}`);
      params.set("book_id", source.id);
      params.set("current_title", source.title);


      const changedItems = [];
      for (const [id, label] of editFields) {
        const el = document.getElementById(`edit-${id}`);
        const before = String(source[id] || "");
        const after = String(el.value || "").trim();
        if (after !== before) {
          params.set(issueFieldName(id), after === "" && before !== "" ? "__CLEAR__" : after);
          changedItems.push({ id, label, before, after });
        }
      }


      if (!changedItems.length) {
        window.alert("変更された項目がありません。");
        return;
      }


      let targetUrl = `${issueBase}?${params.toString()}`;
      if (targetUrl.length > 7000) {
        const compactPayload = {};
        for (const item of changedItems) {
          compactPayload[item.label] = item.after === "" && item.before !== "" ? "__CLEAR__" : item.after;
        }

        const compactParams = new URLSearchParams();
        compactParams.set("template", "book_edit.yml");
        compactParams.set("title", `[書誌修正] ${nextTitle}`);
        compactParams.set("book_id", source.id);
        compactParams.set("current_title", source.title);
        compactParams.set("edit_payload", await encodeCompactEditPayload(compactPayload));
        targetUrl = `${issueBase}?${compactParams.toString()}`;

        if (targetUrl.length > 7000) {
          window.alert("変更内容が非常に長く、長文用の送信形式でも確認画面へ送れません。管理担当者にご連絡ください。");
          return;
        }
      }


      const preview = document.createElement("div");
      preview.id = "book-change-confirmation";
      preview.className = "admin-note";
      preview.innerHTML = `
        <h3 style="margin-top:0">変更内容の確認</h3>
        <p><strong>${changedItems.length}項目を変更します。</strong> 変更前と変更後を確認してください。</p>
        <div>
          ${changedItems.map((item) => {
            const before = item.before === "" ? "（空欄）" : item.before;
            const after = item.after === "" ? "（空欄にする）" : item.after;
            return `
              <div style="margin:14px 0;padding:12px;border:1px solid #d9e0d8;border-radius:6px;background:#fff">
                <p style="margin:0 0 8px"><strong>${esc(item.label)}</strong></p>
                <div style="margin:6px 0">
                  <small>変更前</small>
                  <div style="white-space:pre-wrap;max-height:12em;overflow:auto;padding:8px;background:#f6f8f5">${esc(before)}</div>
                </div>
                <div style="margin:6px 0">
                  <small>変更後</small>
                  <div style="white-space:pre-wrap;max-height:12em;overflow:auto;padding:8px;background:#f6f8f5">${esc(after)}</div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
        <p>問題なければGitHubの最終確認フォームへ進んでください。まだこの時点では書誌データは変更されません。</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="admin-btn" id="continue-book-update" type="button">GitHub確認フォームへ進む</button>
          <button class="admin-btn secondary" id="review-book-update" type="button">編集内容を見直す</button>
        </div>
      `;


      const editGrid = form.querySelector(".edit-grid");
      const adminNote = form.querySelector(".admin-note");
      const submitBox = form.querySelector(".edit-submit-box");
      const existingPreview = document.getElementById("book-change-confirmation");
      if (existingPreview) existingPreview.remove();
      editGrid.hidden = true;
      adminNote.hidden = true;
      submitBox.hidden = true;
      form.insertBefore(preview, submitBox);


      document.getElementById("continue-book-update").addEventListener("click", () => {
        openIssueForm(targetUrl);
      });
      document.getElementById("review-book-update").addEventListener("click", () => {
        preview.remove();
        editGrid.hidden = false;
        adminNote.hidden = false;
        submitBox.hidden = false;
        document.getElementById(`edit-${changedItems[0].id}`)?.focus();
      });
      preview.scrollIntoView({ block: "start" });
    });
    document.getElementById("back-to-detail").addEventListener("click", () => renderBookModal(book, detail, trigger));


    modal.hidden = false;
    document.body.classList.add("modal-open");
    modalClose?.focus();
  }


  function openHide(book) {
    const ok = window.confirm(
      `「${book.title}」を公開停止します。\n\n` +
      "公開サイトの書籍検索・固有URL・トップの新刊表示から表示されなくなります。\n" +
      "書誌データ自体は削除されません。\n\n" +
      "確認画面へ進んでよろしいですか？"
    );
    if (!ok) return;
    openIssueForm(hideUrl(book));
  }


  function openRestore(book) {
    const ok = window.confirm(
      `「${book.title}」を再公開します。\n\n` +
      "公開サイトの書籍検索・固有URL・トップの新刊表示に再び表示されます。\n" +
      "書誌データは現在登録されている内容をそのまま使用します。\n\n" +
      "確認画面へ進んでよろしいですか？"
    );
    if (!ok) return;
    openIssueForm(restoreUrl(book));
  }


  function openDelete(book) {
    const ok = window.confirm(
      `「${book.title}」の書誌情報そのものを削除します。\n\n` +
      `書籍ID：${book.id}\n\n` +
      "通常の掲載取り下げなら「公開停止」を使用してください。\n" +
      "この操作では正本CSVから書誌レコードを削除します。\n" +
      "書影・正誤表・付属データ等のファイルは削除しません。\n\n" +
      "削除確認画面へ進んでよろしいですか？"
    );
    if (!ok) return;
    openIssueForm(deleteUrl(book));
  }


  function renderBookModal(book, detail, trigger) {
    const sub = subtitle(detail);
    const series = [detail.series, detail.series_volume].filter(Boolean).join(" ");
    const isbnRows = [];
    if (detail.isbn_new) isbnRows.push(detailRow("ISBN", detail.isbn_new));
    if (detail.isbn_old && detail.isbn_old !== detail.isbn_new) isbnRows.push(detailRow("旧ISBN", detail.isbn_old));


    const metaRows = [
      detailRow("書籍ID", detail.id),
      detailRow("公開状態", detail.published === false ? "公開停止中" : "公開中"),
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
    if (detail.errata_pdf) statusItems.push("正誤表ファイルが登録されています");
    if (detail.related_file) statusItems.push("関連情報・付属データのファイルが登録されています");
    const publicationAction = detail.published === false
      ? '<p class="publication-stopped">この書籍は現在、公開停止中です。</p><button class="admin-btn" id="restore-book" type="button">この書誌を再公開</button>'
      : '<button class="admin-btn danger" id="hide-book" type="button">この書誌を公開停止</button>';


    modalContent.innerHTML = `
      <p class="admin-modal-kicker">現在の登録内容</p>
      <h2 id="admin-modal-title" class="admin-modal-title">${esc(detail.title || "（書名未登録）")}</h2>
      ${sub ? `<p class="admin-modal-subtitle">${esc(sub)}</p>` : ""}
      ${detail.author ? `<p class="admin-modal-author">${esc(authorDisplay(detail.author))}</p>` : ""}
      ${genreTags ? `<div class="admin-modal-tags">${genreTags}</div>` : ""}
      ${metaRows ? `<dl class="detail-grid">${metaRows}</dl>` : ""}
      <div class="admin-edit-box">
        <p>この書誌の現在値を入力済みにした編集フォームを開けます。公開停止は書誌データを削除せず、公開サイトからの表示だけを止めます。</p>
        <button class="admin-btn" id="open-edit-form" type="button">この書誌を編集</button>
        ${publicationAction}
      </div>
      <div class="admin-edit-box">
        <p><strong>書誌情報そのものを削除する場合のみ使用してください。</strong><br>通常の掲載取り下げは「公開停止」を使用してください。削除しても書影・正誤表・付属データ等のファイルは自動削除しません。</p>
        <button class="admin-btn danger" id="delete-book" type="button">この書誌情報を削除</button>
      </div>
      ${detail.description ? `<section class="admin-detail-section"><h3>内容紹介</h3><p class="admin-detail-copy">${richText(detail.description)}</p></section>` : ""}
      ${detail.toc ? `<section class="admin-detail-section"><h3>目次</h3><div class="admin-detail-toc">${richText(detail.toc)}</div></section>` : ""}
      ${statusItems.length ? `<section class="admin-detail-section"><h3>関連資料</h3><ul>${statusItems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
    `;
    document.getElementById("open-edit-form").addEventListener("click", (event) => openEditForm(book, detail, event.currentTarget));
    document.getElementById("hide-book")?.addEventListener("click", () => openHide(detail));
    document.getElementById("restore-book")?.addEventListener("click", () => openRestore(detail));
    document.getElementById("delete-book")?.addEventListener("click", () => openDelete(detail));


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
        book.isbn ? `ISBN：${book.isbn}` : (book.isbn_new ? `ISBN：${book.isbn_new}` : (book.isbn_old ? `ISBN：${book.isbn_old}` : "")),
        book.pub_month ? `刊行：${formatMonth(book.pub_month)}` : "",
        `書籍ID：${book.id}`,
      ].filter(Boolean);
      parts.forEach((part) => {
        const span = document.createElement("span");
        span.textContent = part;
        meta.appendChild(span);
      });
      const status = document.createElement("span");
      status.className = book.published === false ? "publication-stopped" : "publication-active";
      status.textContent = book.published === false ? "公開停止中" : "公開中";
      meta.appendChild(status);
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


  async function search() {
    const terms = queryInput.value.trim().split(/\s+/).filter(Boolean).map(normalize);
    if (!terms.length) {
      count.textContent = "検索語を入力してください。";
      results.replaceChildren();
      return;
    }


    try {
      await ensureSearchIndex();
    } catch (error) {
      console.error("Failed to load admin search index.", error);
      count.textContent = "検索用データを読み込めませんでした。ページを再読み込みしてください。";
      return;
    }


    const matched = books.filter((book) =>
      terms.every((term) => String(book.__adminSearch || "").includes(term))
    ).slice(0, 50);


    render(matched);
    if (matched.length === 50) {
      count.textContent += "（上位50件。さらに絞り込んでください）";
    }
  }


  async function init() {
    try {
      books = await loadSearchData();
      newBookLink.href = newUrl();
      newBookLink.target = "_blank";
      newBookLink.rel = "noopener noreferrer";
      searchButton.addEventListener("click", () => { void search(); });
      queryInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") void search();
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
