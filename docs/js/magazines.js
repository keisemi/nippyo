(() => {
  "use strict";

  const cards = [...document.querySelectorAll("[data-magazine-id]")];
  const updated = document.getElementById("magazineDataUpdated");
  const nextIssueModal = document.getElementById("nextIssueModal");
  const nextIssueModalPanel = document.getElementById("nextIssueModalPanel");
  const nextIssueModalMagazine = document.getElementById("nextIssueModalMagazine");
  const nextIssueBlock = nextIssueModal?.querySelector("[data-next-issue-block]");
  const nextReleaseDateBlock = nextIssueModal?.querySelector("[data-next-release-date-block]");
  const nextPriceBlock = nextIssueModal?.querySelector("[data-next-price-block]");
  const nextFeatureBlock = nextIssueModal?.querySelector("[data-next-feature-block]");
  const nextCommentBlock = nextIssueModal?.querySelector("[data-next-comment-block]");
  const nextIssueValue = nextIssueModal?.querySelector("[data-next-issue-value]");
  const nextReleaseDateValue = nextIssueModal?.querySelector("[data-next-release-date-value]");
  const nextPriceValue = nextIssueModal?.querySelector("[data-next-price-value]");
  const nextFeatureValue = nextIssueModal?.querySelector("[data-next-feature-value]");
  const nextCommentValue = nextIssueModal?.querySelector("[data-next-comment-value]");
  let lastFocusedElement = null;

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
      const id = String(issue.id || "");
      const currentId = current ? String(current.id || "") : "";
      if (!current || date > currentDate || (date === currentDate && id > currentId)) {
        result.set(key, issue);
      }
    }
    return result;
  }

  function hasNextIssue(item) {
    return Boolean(item && [
      item.next_issue,
      item.next_release_date,
      item.next_price_tax_included,
      item.next_feature,
      item.next_comment
    ].some((value) => String(value || "").trim()));
  }

  function nextIssuesByMagazine(payload) {
    const result = new Map();
    if (!payload || !Array.isArray(payload.magazines)) return result;
    for (const item of payload.magazines) {
      const key = String(item?.magazine_id || "");
      if (key) result.set(key, item);
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

  function setOptionalBlock(block, output, value) {
    if (!block || !output) return;
    const text = String(value || "").trim();
    block.hidden = !text;
    output.textContent = text;
  }

  function closeNextIssueModal() {
    if (!nextIssueModal || nextIssueModal.hidden) return;
    nextIssueModal.hidden = true;
    document.body.classList.remove("next-issue-modal-open");
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }

  function openNextIssueModal(item, trigger) {
    if (!nextIssueModal || !hasNextIssue(item)) return;
    lastFocusedElement = trigger || document.activeElement;
    if (nextIssueModalMagazine) {
      nextIssueModalMagazine.textContent = String(item.magazine_name || "").trim();
    }
    setOptionalBlock(nextIssueBlock, nextIssueValue, item.next_issue);
    setOptionalBlock(nextReleaseDateBlock, nextReleaseDateValue, item.next_release_date);
    setOptionalBlock(nextPriceBlock, nextPriceValue, item.next_price_tax_included);
    setOptionalBlock(nextFeatureBlock, nextFeatureValue, item.next_feature);
    setOptionalBlock(nextCommentBlock, nextCommentValue, item.next_comment);
    nextIssueModal.hidden = false;
    document.body.classList.add("next-issue-modal-open");
    nextIssueModalPanel?.focus();
  }

  function renderCurrent(container, issue, nextIssue) {
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
    const taxIncluded = price ? Math.round(price * 1.1) : 0;
    const coverAlt = [issue.magazine_name, issue.issue].filter(Boolean).join(" ");
    const usableNextIssue = nextIssue
      && String(nextIssue.issue_id || "") === String(issue.id || "")
      && hasNextIssue(nextIssue)
      ? nextIssue
      : null;
    const body = `
      <p class="magazine-current-label">最新号</p>
      <p class="magazine-current-title">${esc(issue.issue || "（月号未登録）")}</p>
      ${feature ? `<p class="magazine-current-feature">特集：${esc(feature)}</p>` : ""}
      ${meta ? `<p class="magazine-current-meta">${esc(meta)}</p>` : ""}
      ${price ? `<p class="magazine-current-price">税込${taxIncluded.toLocaleString("ja-JP")}円（本体${price.toLocaleString("ja-JP")}円）</p>` : ""}
      <div class="magazine-current-actions">
        <a class="button button-primary" href="${esc(detailUrl)}">最新号を詳しく見る</a>
        ${usableNextIssue ? '<button class="button button-secondary magazine-next-issue-button" type="button" data-next-issue-button>次号予告</button>' : ""}
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

    const nextIssueButton = container.querySelector("[data-next-issue-button]");
    if (nextIssueButton && usableNextIssue) {
      nextIssueButton.addEventListener("click", () => openNextIssueModal(usableNextIssue, nextIssueButton));
    }
  }

  nextIssueModal?.querySelectorAll("[data-next-issue-close]").forEach((element) => {
    element.addEventListener("click", closeNextIssueModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nextIssueModal && !nextIssueModal.hidden) {
      closeNextIssueModal();
    }
  });

  async function init() {
    try {
      const stamp = Date.now().toString();
      const versionResponse = await fetch(`../data/magazine-last-updated.txt?t=${stamp}`, { cache: "no-store" });
      const version = versionResponse.ok ? (await versionResponse.text()).trim() : stamp;
      const versionParam = encodeURIComponent(version || stamp);
      const [response, nextResponse] = await Promise.all([
        fetch(`../data/magazine-issues-search.json?v=${versionParam}`),
        fetch(`../data/magazine-next-issues.json?v=${versionParam}`).catch(() => null)
      ]);
      if (!response.ok) throw new Error(`雑誌検索用データを取得できませんでした（HTTP ${response.status}）`);
      const payload = await response.json();
      const issues = decodeRows(payload);
      const latest = latestByMagazine(issues);

      let nextIssues = new Map();
      if (nextResponse?.ok) {
        try {
          nextIssues = nextIssuesByMagazine(await nextResponse.json());
        } catch (error) {
          console.warn("次号予告データの形式を確認できませんでした。", error);
        }
      }

      for (const card of cards) {
        const container = card.querySelector("[data-magazine-current]");
        if (!container) continue;
        const magazineId = String(card.dataset.magazineId || "");
        renderCurrent(container, latest.get(magazineId), nextIssues.get(magazineId));
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
