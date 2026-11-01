(() => {
  "use strict";

  const selector = document.getElementById("magazine-selector");
  const choices = [...selector.querySelectorAll("[data-magazine-id]")];
  const queryInput = document.getElementById("issue-query");
  const searchButton = document.getElementById("search-button");
  const results = document.getElementById("results");
  const count = document.getElementById("result-count");
  const detailOverlay = document.getElementById("detail-overlay");
  const detailClose = document.getElementById("detail-close");
  const detailContent = document.getElementById("detail-content");

  let issues = [];
  let selectedMagazineId = "";
  let version = Date.now().toString();
  const detailCache = new Map();

  const ebookLabels = {
    kindle:"Amazon Kindle",
    univcoop:"大学生協",
    google_play:"Google Play",
    itunes:"Apple Books / iTunes",
    jiko_gaku:"自己学習",
    kinoppy:"Kinoppy",
    e_hon:"e-hon",
    ebookjapan:"ebookjapan",
    honto:"honto",
    rakuten_books:"楽天ブックス",
    "7net":"7net",
    fujisan:"Fujisan.co.jp",
    m2plus:"M2PLUS",
    viewn:"ビューン",
    tabho:"タブホ",
    magastore:"マガストア",
  };

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

  function decodeRows(payload) {
    if (!payload || !Array.isArray(payload.columns) || !Array.isArray(payload.issues)) {
      throw new Error("雑誌検索用データの形式が不正です。");
    }
    return payload.issues.map((row) => {
      const item = {};
      payload.columns.forEach((name,index) => { item[name] = row[index]; });
      return item;
    });
  }

  async function readVersion() {
    const stamp = Date.now().toString();
    try {
      const response = await fetch(`../../data/magazine-last-updated.txt?t=${stamp}`, {cache:"no-store"});
      if (response.ok) {
        const value = (await response.text()).trim();
        if (value) return value;
      }
    } catch (_) {}
    return stamp;
  }

  async function loadData() {
    version = await readVersion();
    const [dataResponse,indexResponse] = await Promise.all([
      fetch(`../../data/magazine-issues-search.json?v=${encodeURIComponent(version)}`),
      fetch(`../../data/magazine-issues-search-index.json?v=${encodeURIComponent(version)}`)
    ]);
    if (!dataResponse.ok) throw new Error(`雑誌データを取得できませんでした（HTTP ${dataResponse.status}）`);
    if (!indexResponse.ok) throw new Error(`雑誌検索索引を取得できませんでした（HTTP ${indexResponse.status}）`);

    const payload = await dataResponse.json();
    const indexPayload = await indexResponse.json();
    const rows = decodeRows(payload);

    if (!Array.isArray(indexPayload.search) || indexPayload.search.length !== rows.length) {
      throw new Error("雑誌検索索引と表示データの件数が一致しません。");
    }

    rows.forEach((issue,index) => {
      issue.__search = normalize([
        indexPayload.search[index],
        issue.id,
        issue.magazine_name,
        issue.issue,
        issue.issue_number,
        issue.pub_date,
        issue.feature,
        issue.feature_subtitle,
        issue.feature2,
        issue.feature2_subtitle,
        issue.isbn,
        issue.identifiers,
        Array.isArray(issue.contributors) ? issue.contributors.join(" ") : issue.contributors,
      ].filter(Boolean).join(" "));
    });

    return rows;
  }

  function issueDetailUrl(issue) {
    return `../../books/?${new URLSearchParams({mag:String(issue.id || "")}).toString()}`;
  }

  function backnumberUrl(issue) {
    return `../../magazines/backnumbers/?${new URLSearchParams({magazine:String(issue.magazine_id || "")}).toString()}`;
  }

  function coverUrl(issue) {
    if (!issue.cover) return "";
    return `../../${String(issue.cover).replace(/^\/+/,"")}`;
  }

  function featureText(issue) {
    return [issue.feature, issue.feature_subtitle].filter(Boolean).join("　");
  }

  function yen(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? `${number.toLocaleString("ja-JP")}円` : "";
  }

  function closeDetail() {
    detailOverlay.hidden = true;
    document.body.classList.remove("detail-open");
  }

  async function loadDetail(issue) {
    const key = issue.pub_year ? String(issue.pub_year) : "undated";
    if (!detailCache.has(key)) {
      detailCache.set(key,
        fetch(`../../data/magazine-details/magazine-details-${encodeURIComponent(key)}.json?v=${encodeURIComponent(version)}`)
          .then((response) => {
            if (!response.ok) throw new Error(`詳細データを取得できませんでした（HTTP ${response.status}）`);
            return response.json();
          })
      );
    }
    const payload = await detailCache.get(key);
    const detail = payload ? payload[String(issue.id || "")] : null;
    if (!detail) throw new Error("この号の登録内容が詳細データにありません。");
    return detail;
  }

  function row(label,value) {
    if (value === null || value === undefined || value === "") return "";
    return `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
  }

  function renderLinks(title, links, formatter) {
    if (!Array.isArray(links) || !links.length) return "";
    const items = links.map((link) => formatter(link)).join("");
    return `
      <section class="detail-section">
        <h3>${esc(title)}</h3>
        <ul class="detail-link-list">${items}</ul>
      </section>
    `;
  }

  function renderDetail(detail) {
    const cover = coverUrl(detail);
    const feature1 = featureText(detail);
    const feature2 = [detail.feature2, detail.feature2_subtitle].filter(Boolean).join("　");
    const contributors = Array.isArray(detail.contributors) ? detail.contributors.join("／") : "";
    const identifiers = [
      detail.isbn_old ? `旧ISBN：${detail.isbn_old}` : "",
      detail.isbn_new ? `新ISBN：${detail.isbn_new}` : "",
      detail.magazine_code_1 ? `雑誌コード(1)：${detail.magazine_code_1}` : "",
      detail.magazine_code_2 ? `雑誌コード(2)：${detail.magazine_code_2}` : "",
    ].filter(Boolean).join(" ／ ");

    const external = renderLinks("外部リンク", detail.external_links, (link) => `
      <li>
        <a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.title || link.url)}</a>
        ${link.comment ? `<div class="detail-link-comment">${esc(link.comment)}</div>` : ""}
      </li>
    `);

    const ebooks = renderLinks("電子書籍リンク", detail.ebook_links, (link) => `
      <li><a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(ebookLabels[link.service] || link.service || link.url)}</a></li>
    `);

    detailContent.innerHTML = `
      <div class="detail-header">
        <div>
          ${cover
            ? `<img class="detail-cover" src="${esc(cover)}" alt="${esc(detail.magazine_name)} ${esc(detail.issue)}の表紙">`
            : '<div class="detail-cover-empty">書影なし</div>'}
        </div>
        <div>
          <p class="detail-kicker">現在の登録内容</p>
          <h2 id="detail-title" class="detail-title">${esc(detail.magazine_name)}　${esc(detail.issue || "")}</h2>
          ${feature1 ? `<p class="detail-feature">特集：${esc(feature1)}</p>` : ""}
          ${feature2 ? `<p class="detail-feature">特集2：${esc(feature2)}</p>` : ""}
        </div>
      </div>

      <table class="detail-table">
        <tbody>
          ${row("書籍ID", detail.id)}
          ${row("雑誌ID", detail.magazine_id)}
          ${row("通巻番号", detail.issue_number)}
          ${row("発刊日", detail.pub_date)}
          ${row("判型", detail.format)}
          ${row("ページ数", detail.pages ? `${detail.pages}頁` : "")}
          ${row("本体価格", yen(detail.price_body))}
          ${row("ISBN", detail.isbn)}
          ${row("その他識別情報", identifiers)}
          ${row("本誌編者", detail.editor)}
          ${row("執筆者等（検索用抽出）", contributors)}
        </tbody>
      </table>

      ${detail.description || detail.description_heading ? `
        <section class="detail-section">
          <h3>${esc(detail.description_heading || "特集内容紹介")}</h3>
          <div class="detail-text">${esc(detail.description || "")}</div>
        </section>
      ` : ""}

      ${detail.description2 || detail.description_heading2 ? `
        <section class="detail-section">
          <h3>${esc(detail.description_heading2 || "特集2 内容紹介")}</h3>
          <div class="detail-text">${esc(detail.description2 || "")}</div>
        </section>
      ` : ""}

      ${detail.toc ? `
        <section class="detail-section">
          <h3>目次</h3>
          <div class="detail-text">${esc(detail.toc)}</div>
        </section>
      ` : ""}

      ${external}
      ${ebooks}
    `;
  }

  async function openDetail(issue) {
    detailOverlay.hidden = false;
    document.body.classList.add("detail-open");
    detailContent.innerHTML = '<p class="detail-loading">登録内容を読み込んでいます。</p>';
    try {
      const detail = await loadDetail(issue);
      renderDetail(detail);
    } catch (error) {
      console.error(error);
      detailContent.innerHTML = `<div class="detail-error">${esc(error.message || "登録内容を読み込めませんでした。")}</div>`;
    }
  }

  function render(items, total) {
    results.replaceChildren();

    if (!items.length) {
      count.textContent = "該当する号がありません。";
      results.innerHTML = '<div class="empty">検索条件を変えてお試しください。</div>';
      return;
    }

    if (total > items.length) {
      count.textContent = `${total.toLocaleString()}件中${items.length.toLocaleString()}件表示（さらに絞り込んでください）`;
    } else {
      count.textContent = `${total.toLocaleString()}件表示`;
    }

    items.forEach((issue) => {
      const article = document.createElement("article");
      article.className = "issue-card";
      const cover = coverUrl(issue);
      const feature = featureText(issue);
      const contributors = Array.isArray(issue.contributors) ? issue.contributors.slice(0,6).join("／") : "";

      article.innerHTML = `
        <div>
          ${cover
            ? `<img class="issue-cover" src="${esc(cover)}" alt="${esc(issue.magazine_name)} ${esc(issue.issue)}の表紙">`
            : '<div class="issue-cover-empty">書影なし</div>'}
        </div>
        <div>
          <h2>${esc(issue.magazine_name)}　${esc(issue.issue || "（月号未登録）")}</h2>
          ${feature ? `<p class="issue-feature">特集：${esc(feature)}</p>` : ""}
          <div class="issue-meta">
            <span>書籍ID：${esc(issue.id)}</span>
            ${issue.issue_number ? `<span>通巻：${esc(issue.issue_number)}</span>` : ""}
            ${issue.pub_date ? `<span>発刊日：${esc(issue.pub_date)}</span>` : ""}
            ${issue.isbn ? `<span>ISBN：${esc(issue.isbn)}</span>` : ""}
            ${contributors ? `<span>執筆者等：${esc(contributors)}</span>` : ""}
          </div>
          <div class="issue-actions">
            <button class="admin-btn" type="button" data-detail-id="${esc(issue.id)}">登録内容を確認</button>
            <a class="admin-btn secondary" href="${esc(issueDetailUrl(issue))}" target="_blank" rel="noopener noreferrer">公開ページを確認</a>
            <a class="admin-btn secondary" href="${esc(backnumberUrl(issue))}" target="_blank" rel="noopener noreferrer">バックナンバーを確認</a>
            <span class="status-note">修正機能は次工程</span>
          </div>
        </div>
      `;

      article.querySelector("[data-detail-id]").addEventListener("click", () => {
        void openDetail(issue);
      });
      results.appendChild(article);
    });
  }

  function runSearch() {
    if (!selectedMagazineId) {
      count.textContent = "雑誌を選んでください。";
      results.replaceChildren();
      return;
    }

    const terms = queryInput.value.trim().split(/\s+/).filter(Boolean).map(normalize);

    const matched = issues.filter((issue) => {
      if (String(issue.magazine_id || "") !== selectedMagazineId) return false;
      return terms.every((term) => String(issue.__search || "").includes(term));
    });

    render(matched.slice(0,50), matched.length);
  }

  function selectMagazine(id) {
    selectedMagazineId = String(id || "");
    choices.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.magazineId === selectedMagazineId);
    });
    queryInput.value = "";
    runSearch();
  }

  async function init() {
    try {
      issues = await loadData();

      choices.forEach((button) => {
        button.addEventListener("click", () => selectMagazine(button.dataset.magazineId));
      });
      searchButton.addEventListener("click", runSearch);
      queryInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") runSearch();
      });

      detailClose.addEventListener("click", closeDetail);
      detailOverlay.addEventListener("click", (event) => {
        if (event.target === detailOverlay) closeDetail();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !detailOverlay.hidden) closeDetail();
      });
    } catch (error) {
      console.error(error);
      count.textContent = "雑誌データを読み込めませんでした。ページを再読み込みしてください。";
    }
  }

  init();
})();
