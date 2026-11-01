(() => {
  "use strict";

  const selector = document.getElementById("magazine-selector");
  const choices = [...selector.querySelectorAll("[data-magazine-id]")];
  const queryInput = document.getElementById("issue-query");
  const searchButton = document.getElementById("search-button");
  const results = document.getElementById("results");
  const count = document.getElementById("result-count");

  let issues = [];
  let selectedMagazineId = "";
  let version = Date.now().toString();

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
            <a class="admin-btn secondary" href="${esc(issueDetailUrl(issue))}" target="_blank" rel="noopener noreferrer">公開ページを確認</a>
            <a class="admin-btn secondary" href="${esc(backnumberUrl(issue))}" target="_blank" rel="noopener noreferrer">バックナンバーを確認</a>
            <span class="status-note">編集機能は次工程</span>
          </div>
        </div>
      `;
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
    } catch (error) {
      console.error(error);
      count.textContent = "雑誌データを読み込めませんでした。ページを再読み込みしてください。";
    }
  }

  init();
})();
