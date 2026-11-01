(() => {
  "use strict";

  let news = [];
  const newsMasterUrl = "https://raw.githubusercontent.com/keisemi/nippyo/main/data/news.csv";
  const queryInput = document.getElementById("news-query");
  const searchButton = document.getElementById("search-button");
  const results = document.getElementById("results");
  const count = document.getElementById("result-count");
  const newNewsLink = document.getElementById("new-news-link");
  const modal = document.getElementById("news-modal");
  const modalContent = document.getElementById("news-modal-content");
  const modalClose = document.getElementById("news-modal-close");
  const issueBase = "https://github.com/keisemi/nippyo/issues/new";
  let lastModalTrigger = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function normalize(value) {
    return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  }

  function issueUrl(params) {
    params.set("template", "news_manage.yml");
    return `${issueBase}?${params.toString()}`;
  }

  function newUrl() {
    const params = new URLSearchParams();
    params.set("template", "news_manage.yml");
    params.set("title", "[お知らせ管理] 新規登録");
    params.set("operation", "新規登録");
    return `${issueBase}?${params.toString()}`;
  }

  function openIssueForm(url) {
    window.open(url, "_blank", "noopener");
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

  function truthy(value) {
    return ["1", "true", "yes", "on", "あり", "はい"].includes(String(value ?? "").trim().toLowerCase());
  }

  async function loadNewsMaster() {
    const response = await fetch(`${newsMasterUrl}?t=${Date.now()}`, {cache:"no-store"});
    if (!response.ok) throw new Error(`お知らせ正本データを取得できませんでした（HTTP ${response.status}）`);

    const rows = parseCsv(await response.text());
    if (!rows.length) return [];

    const headers = rows[0].map((value,index) => index === 0 ? value.replace(/^\uFEFF/, "").trim() : value.trim());
    const index = Object.fromEntries(headers.map((name,i) => [name,i]));
    for (const required of ["id","date","category","title","text","url","pinned","published"]) {
      if (!(required in index)) throw new Error(`お知らせ正本データに ${required} 列がありません。`);
    }

    const items = rows.slice(1)
      .filter((values) => values.some((value) => String(value || "").trim()))
      .map((values) => ({
        id: String(values[index.id] || "").trim(),
        date: String(values[index.date] || "").trim(),
        category: String(values[index.category] || "").trim() || "お知らせ",
        title: String(values[index.title] || "").trim(),
        text: String(values[index.text] || "").trim(),
        url: String(values[index.url] || "").trim(),
        pinned: truthy(values[index.pinned]),
        published: truthy(values[index.published]),
      }));

    items.sort((a,b) => {
      const dateDiff = String(b.date || "").localeCompare(String(a.date || ""), "ja", {numeric:true});
      if (dateDiff) return dateDiff;
      return String(b.id || "").localeCompare(String(a.id || ""), "ja", {numeric:true});
    });
    return items;
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastModalTrigger && typeof lastModalTrigger.focus === "function") lastModalTrigger.focus();
    lastModalTrigger = null;
  }

  function openEdit(item, trigger) {
    lastModalTrigger = trigger || document.activeElement;
    modalContent.innerHTML = `
      <h2 id="admin-modal-title" class="admin-modal-title">${esc(item.title)}</h2>
      <p class="edit-intro">現在登録されている内容を入力済みにしています。必要な箇所だけ変更してください。</p>
      <form id="news-edit-form">
        <div class="fixed-fields">
          <div><strong>お知らせID</strong><br><code>${esc(item.id)}</code></div>
          <div><strong>現在のタイトル</strong><br>${esc(item.title)}</div>
        </div>
        <div class="edit-grid two-col">
          <label class="edit-field"><span>日付</span><input id="edit-date" type="text" value="${esc(item.date)}"></label>
          <label class="edit-field"><span>種別</span><input id="edit-category" type="text" value="${esc(item.category)}"></label>
        </div>
        <div class="edit-grid">
          <label class="edit-field"><span>タイトル</span><input id="edit-title" type="text" value="${esc(item.title)}"></label>
          <label class="edit-field"><span>本文</span><textarea id="edit-text">${esc(item.text)}</textarea><p class="field-help">現在の本文を削除する場合は、この欄を空欄にしてください。</p></label>
          <label class="edit-field"><span>リンク先</span><input id="edit-url" type="text" value="${esc(item.url)}"><p class="field-help">https:// で始まるURL、またはサイト内の相対パスを入力できます。</p></label>
        </div>
        <div class="edit-grid two-col">
          <label class="edit-field"><span>重要表示</span><select id="edit-pinned"><option value="0"${item.pinned ? "" : " selected"}>いいえ</option><option value="1"${item.pinned ? " selected" : ""}>はい</option></select></label>
          <label class="edit-field"><span>公開する</span><select id="edit-published"><option value="1"${item.published ? " selected" : ""}>はい</option><option value="0"${item.published ? "" : " selected"}>いいえ</option></select></label>
        </div>
        <div class="edit-submit-box">
          <p>「変更内容を確認する」を押すと、<strong>変更した項目だけ</strong>が入った確認画面が開きます。内容を確認して、最後に更新を送信してください。</p>
          <button class="admin-btn" type="submit">変更内容を確認する</button>
          <button class="admin-btn secondary" id="cancel-edit" type="button">閉じる</button>
        </div>
      </form>
    `;

    document.getElementById("cancel-edit").addEventListener("click", closeModal);
    document.getElementById("news-edit-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const params = new URLSearchParams();
      params.set("title", `[お知らせ管理] 修正: ${item.title}`);
      params.set("operation", "既存データ修正");
      params.set("target_title", item.title);

      const fields = [
        ["date", "edit-date", String(item.date || "")],
        ["category", "edit-category", String(item.category || "")],
        ["news_title", "edit-title", String(item.title || "")],
        ["text", "edit-text", String(item.text || "")],
        ["url", "edit-url", String(item.url || "")],
      ];

      let changes = 0;
      for (const [param, id, before] of fields) {
        const after = String(document.getElementById(id).value || "").trim();
        if (after !== before) {
          params.set(param, after === "" && before !== "" ? "__CLEAR__" : after);
          changes += 1;
        }
      }

      const pinned = document.getElementById("edit-pinned").value === "1";
      if (pinned !== Boolean(item.pinned)) {
        params.set("pinned", pinned ? "はい" : "いいえ");
        changes += 1;
      }

      const published = document.getElementById("edit-published").value === "1";
      if (published !== Boolean(item.published)) {
        params.set("published", published ? "はい" : "いいえ");
        changes += 1;
      }

      if (!changes) {
        window.alert("変更された項目がありません。");
        return;
      }

      const url = issueUrl(params);
      if (url.length > 7000) {
        window.alert("変更内容が長いため、一度に確認画面へ送れません。長い本文は短く分けて更新してください。");
        return;
      }
      openIssueForm(url);
    });

    modal.hidden = false;
    document.body.classList.add("modal-open");
    modalClose?.focus();
  }

  function openDelete(item) {
    if (!window.confirm(`「${item.title}」の削除内容を確認します。次の画面へ進んでよろしいですか？`)) return;
    const params = new URLSearchParams();
    params.set("title", `[お知らせ管理] 削除: ${item.title}`);
    params.set("operation", "削除");
    params.set("target_title", item.title);
    openIssueForm(issueUrl(params));
  }

  function render(items) {
    count.textContent = `${items.length}件`;
    if (!items.length) {
      results.innerHTML = '<div class="empty">該当するお知らせはありません。</div>';
      return;
    }

    results.innerHTML = items.map((item, index) => `
      <article class="news-result">
        <div class="news-meta">
          <span>${esc(item.date)}</span>
          <span>${esc(item.category || "お知らせ")}</span>
          <span class="status ${item.pinned ? "on" : "off"}">重要: ${item.pinned ? "はい" : "いいえ"}</span>
          <span class="status ${item.published ? "on" : "off"}">公開: ${item.published ? "はい" : "いいえ"}</span>
        </div>
        <h2>${esc(item.title)}</h2>
        ${item.text ? `<p class="news-text">${esc(item.text)}</p>` : ""}
        ${item.url ? `<p><small>${esc(item.url)}</small></p>` : ""}
        <div class="news-actions">
          <button class="admin-btn" type="button" data-edit="${index}">修正</button>
          <button class="admin-btn danger" type="button" data-delete="${index}">削除</button>
        </div>
      </article>
    `).join("");

    results.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => openEdit(items[Number(button.dataset.edit)], button));
    });
    results.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", () => openDelete(items[Number(button.dataset.delete)]));
    });
  }

  function search() {
    const q = normalize(queryInput.value);
    if (!q) {
      render(news);
      return;
    }
    render(news.filter((item) => normalize(`${item.title} ${item.category} ${item.text} ${item.url}`).includes(q)));
  }

  async function init() {
    try {
      news = await loadNewsMaster();
      newNewsLink.href = newUrl();
      newNewsLink.target = "_blank";
      newNewsLink.rel = "noopener noreferrer";
      searchButton.addEventListener("click", search);
      queryInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") search();
      });
      modalClose?.addEventListener("click", closeModal);
      modal?.querySelector("[data-modal-close]")?.addEventListener("click", closeModal);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeModal();
      });

      render(news);
    } catch (error) {
      console.error(error);
      count.textContent = "お知らせデータを読み込めませんでした。ページを再読み込みしてください。";
      results.innerHTML = '<div class="empty">管理用データの取得に失敗しました。</div>';
    }
  }

  void init();
})();
