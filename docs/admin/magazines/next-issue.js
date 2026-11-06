(() => {
  "use strict";

  const detailContent = document.getElementById("detail-content");
  if (!detailContent) return;

  const issueBase = "https://github.com/keisemi/nippyo/issues/new";
  let selectedIssueId = "";
  let nextByIssueId = new Map();

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function shown(value) {
    const v = text(value);
    return v ? esc(v) : "（未登録）";
  }

  async function readVersion() {
    const stamp = Date.now().toString();
    try {
      const response = await fetch(`../../data/magazine-last-updated.txt?t=${stamp}`, { cache: "no-store" });
      if (response.ok) {
        const value = (await response.text()).trim();
        if (value) return value;
      }
    } catch (_) {}
    return stamp;
  }

  async function loadNextIssues() {
    const version = await readVersion();
    const response = await fetch(`../../data/magazine-next-issues.json?v=${encodeURIComponent(version)}`);
    if (!response.ok) {
      throw new Error(`次号予告データを取得できませんでした（HTTP ${response.status}）`);
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.magazines)) {
      throw new Error("次号予告データの形式が不正です。");
    }
    nextByIssueId = new Map(
      payload.magazines
        .filter((item) => text(item?.issue_id))
        .map((item) => [text(item.issue_id), item])
    );
  }

  function buildIssueUrl(item, values) {
    const params = new URLSearchParams();
    params.set("template", "magazine_edit.yml");
    params.set("title", `[雑誌号修正] ${text(item.magazine_name)} ${text(item.issue)}`);
    params.set("book_id", text(item.issue_id));
    params.set("magazine_id", text(item.magazine_id));
    params.set("magazine_name", text(item.magazine_name));
    params.set("current_issue", text(item.issue));

    const fields = [
      ["next_issue", text(item.next_issue), values.next_issue],
      ["next_release_date", text(item.next_release_date), values.next_release_date],
      ["next_price_tax_included", text(item.next_price_tax_included), values.next_price_tax_included],
      ["next_feature", text(item.next_feature), values.next_feature],
      ["next_comment", text(item.next_comment), values.next_comment],
    ];

    let changed = 0;
    for (const [id, before, afterRaw] of fields) {
      const after = text(afterRaw);
      if (after === before) continue;
      params.set(id, after === "" && before !== "" ? "__CLEAR__" : after);
      changed += 1;
    }

    if (!changed) return { url: "", changed: 0 };
    return { url: `${issueBase}?${params.toString()}`, changed };
  }

  function renderDisplay(section, item) {
    section.innerHTML = `
      <h3>次号予告</h3>
      <p>一般公開サイトに表示される<strong>最新公開号の次号予告</strong>です。</p>
      <table class="detail-table">
        <tbody>
          <tr><th>次号予告</th><td>${shown(item.next_issue)}</td></tr>
          <tr><th>発売予定日</th><td>${shown(item.next_release_date)}</td></tr>
          <tr><th>予定価格（税込）</th><td>${shown(item.next_price_tax_included)}</td></tr>
          <tr><th>次号特集</th><td>${shown(item.next_feature)}</td></tr>
          <tr><th>次号コメント</th><td><div class="detail-text">${shown(item.next_comment)}</div></td></tr>
        </tbody>
      </table>
      <div class="edit-submit-actions">
        <button class="admin-btn" type="button" data-next-issue-edit>次号予告を登録・編集</button>
      </div>
    `;

    section.querySelector("[data-next-issue-edit]")?.addEventListener("click", () => {
      renderEditor(section, item);
    });
  }

  function renderEditor(section, item) {
    section.innerHTML = `
      <h3>次号予告を登録・編集</h3>
      <p class="edit-intro">現在の値を入力済みにしています。変更した項目だけが更新されます。空欄にして送信すると、その項目を削除します。</p>
      <form data-next-issue-form>
        <div class="edit-grid">
          <label class="edit-field wide">
            <span>次号予告</span>
            <input type="text" data-next-issue-input value="${esc(text(item.next_issue))}">
          </label>
          <label class="edit-field">
            <span>発売予定日</span>
            <input type="text" data-next-release-date-input value="${esc(text(item.next_release_date))}" placeholder="例：2027年1月27日発売予定">
          </label>
          <label class="edit-field">
            <span>予定価格（税込）</span>
            <input type="text" data-next-price-input value="${esc(text(item.next_price_tax_included))}" placeholder="例：1,650円">
          </label>
          <label class="edit-field wide">
            <span>次号特集</span>
            <input type="text" data-next-feature-input value="${esc(text(item.next_feature))}">
          </label>
          <label class="edit-field wide">
            <span>次号コメント</span>
            <textarea data-next-comment-input>${esc(text(item.next_comment))}</textarea>
          </label>
        </div>
        <div class="edit-submit-actions">
          <button class="admin-btn" type="submit">GitHubの確認フォームへ進む</button>
          <button class="admin-btn secondary" type="button" data-next-issue-cancel>戻る</button>
        </div>
      </form>
    `;

    section.querySelector("[data-next-issue-cancel]")?.addEventListener("click", () => {
      renderDisplay(section, item);
    });

    section.querySelector("[data-next-issue-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = {
        next_issue: section.querySelector("[data-next-issue-input]")?.value || "",
        next_release_date: section.querySelector("[data-next-release-date-input]")?.value || "",
        next_price_tax_included: section.querySelector("[data-next-price-input]")?.value || "",
        next_feature: section.querySelector("[data-next-feature-input]")?.value || "",
        next_comment: section.querySelector("[data-next-comment-input]")?.value || "",
      };
      const result = buildIssueUrl(item, values);
      if (!result.changed) {
        window.alert("変更された項目がありません。");
        return;
      }
      if (result.url.length > 7000) {
        window.alert("次号コメントが非常に長く、GitHubの確認フォームへ送れません。管理担当者にご連絡ください。");
        return;
      }
      window.open(result.url, "_blank", "noopener");
    });
  }

  function injectBlock() {
    if (!selectedIssueId) return;

    const existing = document.getElementById("next-issue-management");
    if (existing) return;

    const item = nextByIssueId.get(selectedIssueId);
    if (!item) return;

    const managementHeading = [...detailContent.querySelectorAll(".detail-section h3")]
      .find((heading) => text(heading.textContent) === "この号の管理");
    const managementSection = managementHeading?.closest(".detail-section");
    if (!managementSection) return;

    const section = document.createElement("section");
    section.className = "detail-section";
    section.id = "next-issue-management";
    managementSection.insertAdjacentElement("afterend", section);
    renderDisplay(section, item);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-detail-id]");
    if (!button) return;
    selectedIssueId = text(button.dataset.detailId);
  });

  const observer = new MutationObserver(() => {
    injectBlock();
  });
  observer.observe(detailContent, { childList: true, subtree: true });

  loadNextIssues()
    .then(() => injectBlock())
    .catch((error) => {
      console.warn("次号予告管理ブロックを準備できませんでした。", error);
    });
})();
