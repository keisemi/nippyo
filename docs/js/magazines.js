(() => {
  "use strict";

  const cards = [...document.querySelectorAll("[data-magazine-id]")];
  const updated = document.getElementById("magazineDataUpdated");

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function decodeRows(payload) {
    if (!payload || !Array.isArray(payload.columns) || !Array.isArray(payload.issues)) {
      throw new Error("magazine-issues-search.json の形式が不正です。");
    }
    const columns = payload.columns;
    return payload.issues.map((row) => {
      const item = {};
      columns.forEach((name, index) => { item[name] = row[index]; });
      return item;
    });
  }

  function formatDate(value) {
    const m = String(value || "").match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/);
    if (!m) return String(value || "");
    return m[3]
      ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日`
      : `${m[1]}年${Number(m[2])}月`;
  }

  function latestByMagazine(issues) {
    const result = new Map();
    for (const issue of issues) {
      const key = String(issue.magazine_id || "");
      if (!key) continue;
      const current = result.get(key);
      const date = String(issue.pub_date || "");
      const currentDate = current ? String(current.pub_date || "") : "";
      if (!current || date > currentDate) result.set(key, issue);
    }
    return result;
  }

  function issueDetailUrl(issue) {
    const params = new URLSearchParams({ mag: String(issue.id || "") });
    return `../books/?${params.toString()}`;
  }

  function backnumberUrl(issue) {
    const params = new URLSearchParams({ magazine: String(issue.magazine_id || "") });
    return `backnumbers/?${params.toString()}`;
  }

  function renderCurrent(container, issue) {
    if (!issue) {
      container.textContent = "現在表示できる最新号情報はありません。";
      return;
    }

    const detailUrl = issueDetailUrl(issue);
    const feature = [issue.feature, issue.feature_subtitle].filter(Boolean).join("　");
    const meta = [
      issue.pub_date ? formatDate(issue.pub_date) : "",
      issue.issue_number ? `通巻${issue.issue_number}号` : "",
      issue.format || "",
      issue.pages ? `${issue.pages}頁` : ""
    ].filter(Boolean).join(" ／ ");
    const price = Number(issue.price_body || 0);
    const coverAlt = [issue.magazine_name, issue.issue].filter(Boolean).join(" ");
    const body = `
      <p class="magazine-current-label">最新号</p>
      <p class="magazine-current-title">${esc(issue.issue || "（月号未登録）")}</p>
      ${feature ? `<p class="magazine-current-feature">特集：${esc(feature)}</p>` : ""}
      ${meta ? `<p class="magazine-current-meta">${esc(meta)}</p>` : ""}
      ${price ? `<p class="magazine-current-price">本体 ${price.toLocaleString("ja-JP")}円</p>` : ""}
      <div class="magazine-current-actions">
        <a class="button button-primary" href="${esc(detailUrl)}">最新号を詳しく見る</a>
        <a class="button button-secondary" href="${esc(backnumberUrl(issue))}">バックナンバーを見る</a>
      </div>
    `;

    if (issue.cover) {
      container.innerHTML = `
        <div class="magazine-current-layout">
          <a class="magazine-current-cover-link" href="${esc(detailUrl)}">
            <img class="magazine-current-cover" src="../${esc(issue.cover)}" alt="${esc(coverAlt)}">
          </a>
          <div>${body}</div>
        </div>
      `;
    } else {
      container.innerHTML = body;
    }
  }

  async function init() {
    try {
      const stamp = Date.now().toString();
      const versionResponse = await fetch(`../data/magazine-last-updated.txt?t=${stamp}`, { cache: "no-store" });
      const version = versionResponse.ok ? (await versionResponse.text()).trim() : stamp;
      const response = await fetch(`../data/magazine-issues-search.json?v=${encodeURIComponent(version || stamp)}`);
      if (!response.ok) throw new Error(`雑誌検索用データを取得できませんでした（HTTP ${response.status}）`);
      const payload = await response.json();
      const issues = decodeRows(payload);
      const latest = latestByMagazine(issues);

      for (const card of cards) {
        const container = card.querySelector("[data-magazine-current]");
        if (!container) continue;
        renderCurrent(container, latest.get(String(card.dataset.magazineId || "")));
      }
      if (updated) updated.textContent = String(payload.updated || "—");
    } catch (error) {
      console.error("Failed to load magazine data.", error);
      for (const card of cards) {
        const container = card.querySelector("[data-magazine-current]");
        if (container) container.textContent = "最新号情報を読み込めませんでした。";
      }
    }
  }

  init();
})();
