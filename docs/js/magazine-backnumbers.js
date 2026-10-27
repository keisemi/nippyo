(() => {
  "use strict";

  const PAGE_SIZE = 30;
  const MAGAZINES = {
    "1": "法律時報",
    "2": "法学セミナー",
    "3": "経済セミナー",
    "4": "数学セミナー",
    "6": "こころの科学",
    "7": "そだちの科学"
  };

  const els = {
    magazine: document.getElementById("magazineSelect"),
    year: document.getElementById("yearSelect"),
    title: document.getElementById("backnumberTitle"),
    lead: document.getElementById("backnumberLead"),
    loading: document.getElementById("backnumberLoading"),
    error: document.getElementById("backnumberError"),
    content: document.getElementById("backnumberContent"),
    count: document.getElementById("backnumberCount"),
    list: document.getElementById("backnumberList"),
    pagination: document.getElementById("backnumberPagination")
  };

  let allIssues = [];
  let filtered = [];
  let page = 1;

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
      if (!Array.isArray(row) || row.length !== columns.length) {
        throw new Error("雑誌検索データの行長が列定義と一致しません。");
      }
      const item = {};
      columns.forEach((name, index) => { item[name] = row[index]; });
      return item;
    });
  }

  function detailUrl(issue) {
    const params = new URLSearchParams({ mag: String(issue.id || "") });
    return `../../books/?${params.toString()}`;
  }

  function pubKey(issue) {
    const m = String(issue.pub_date || "").match(/^(\d{4})[-/.]?(\d{1,2})?[-/.]?(\d{1,2})?/);
    if (m) return Number(m[1]) * 10000 + Number(m[2] || 0) * 100 + Number(m[3] || 0);
    return Number(issue.pub_year || 0) * 10000;
  }

  function selectedMagazineId() {
    const value = String(els.magazine.value || "");
    return MAGAZINES[value] ? value : "1";
  }

  function rebuildYears() {
    const magazineId = selectedMagazineId();
    const current = String(els.year.value || "");
    const years = [...new Set(
      allIssues
        .filter((issue) => String(issue.magazine_id || "") === magazineId)
        .map((issue) => Number(issue.pub_year))
        .filter((year) => year > 0)
    )].sort((a, b) => b - a);

    els.year.innerHTML = '<option value="">すべて</option>';
    for (const year of years) els.year.add(new Option(String(year), String(year)));
    if (current && years.includes(Number(current))) els.year.value = current;
  }

  function syncUrl() {
    const params = new URLSearchParams();
    params.set("magazine", selectedMagazineId());
    if (els.year.value) params.set("year", els.year.value);
    if (page > 1) params.set("page", String(page));
    try { history.replaceState(null, "", `${location.pathname}?${params.toString()}`); } catch (_) {}
  }

  function restoreUrl() {
    const params = new URLSearchParams(location.search);
    const magazineId = String(params.get("magazine") || "1");
    els.magazine.value = MAGAZINES[magazineId] ? magazineId : "1";
    rebuildYears();
    const year = String(params.get("year") || "");
    if ([...els.year.options].some((option) => option.value === year)) els.year.value = year;
    page = Math.max(1, Number(params.get("page")) || 1);
  }

  function renderPagination() {
    els.pagination.innerHTML = "";
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (totalPages <= 1) return;

    const add = (label, target, current = false, disabled = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "backnumber-page-button";
      button.textContent = label;
      button.disabled = disabled;
      if (current) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => {
        page = target;
        render();
        syncUrl();
        window.scrollTo({ top: document.querySelector(".backnumber-toolbar").offsetTop - 20, behavior: "smooth" });
      });
      els.pagination.appendChild(button);
    };

    add("‹", Math.max(1, page - 1), false, page === 1);
    const first = Math.max(1, Math.min(page - 2, totalPages - 4));
    const last = Math.min(totalPages, first + 4);
    for (let p = first; p <= last; p += 1) add(String(p), p, p === page, false);
    add("›", Math.min(totalPages, page + 1), false, page === totalPages);
  }

  function render() {
    const magazineId = selectedMagazineId();
    const magazineName = MAGAZINES[magazineId];
    const year = Number(els.year.value || 0);

    filtered = allIssues
      .filter((issue) => String(issue.magazine_id || "") === magazineId)
      .filter((issue) => !year || Number(issue.pub_year) === year)
      .sort((a, b) => pubKey(b) - pubKey(a) || String(b.id || "").localeCompare(String(a.id || "")));

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), totalPages);

    els.title.textContent = `${magazineName} バックナンバー`;
    els.lead.textContent = `${magazineName}のバックナンバーを新しい号から掲載しています。`;
    document.title = `${magazineName} バックナンバー｜日本評論社`;
    els.count.innerHTML = `<strong>${filtered.length.toLocaleString("ja-JP")}</strong> 号`;

    const start = (page - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);
    if (!slice.length) {
      els.list.innerHTML = '<li class="backnumber-empty">該当するバックナンバーはありません。</li>';
    } else {
      els.list.innerHTML = slice.map((issue) => {
        const feature = [issue.feature, issue.feature_subtitle].filter(Boolean).join("　");
        const meta = issue.issue_number ? `通巻${issue.issue_number}号` : "";
        const url = detailUrl(issue);
        const coverAlt = [issue.magazine_name, issue.issue].filter(Boolean).join(" ");
        const cover = issue.cover
          ? `<a class="backnumber-cover-link" href="${esc(url)}"><img class="backnumber-cover" src="../../${esc(issue.cover)}" alt="${esc(coverAlt)}"></a>`
          : "";
        return `<li class="backnumber-item${issue.cover ? " has-cover" : ""}">
          <div class="backnumber-entry">
            ${cover}
            <div>
              <h2 class="backnumber-item-title">${esc(issue.issue || "（月号未登録）")}</h2>
              ${feature ? `<p class="backnumber-feature">特集：${esc(feature)}</p>` : ""}
              ${meta ? `<p class="backnumber-meta">${esc(meta)}</p>` : ""}
            </div>
          </div>
          <div class="backnumber-side">
            <a class="backnumber-detail-link" href="${esc(url)}">詳細を見る</a>
          </div>
        </li>`;
      }).join("");
    }

    renderPagination();
    syncUrl();
  }

  async function init() {
    try {
      const stamp = Date.now().toString();
      const versionResponse = await fetch(`../../data/magazine-last-updated.txt?t=${stamp}`, { cache: "no-store" });
      const version = versionResponse.ok ? (await versionResponse.text()).trim() : stamp;
      const response = await fetch(`../../data/magazine-issues-search.json?v=${encodeURIComponent(version || stamp)}`);
      if (!response.ok) throw new Error(`雑誌検索用データを取得できませんでした（HTTP ${response.status}）`);
      const payload = await response.json();
      allIssues = decodeRows(payload);

      rebuildYears();
      restoreUrl();
      els.magazine.addEventListener("change", () => {
        page = 1;
        els.year.value = "";
        rebuildYears();
        render();
      });
      els.year.addEventListener("change", () => {
        page = 1;
        render();
      });

      els.loading.hidden = true;
      els.content.hidden = false;
      render();
    } catch (error) {
      console.error("Failed to load magazine backnumbers.", error);
      els.loading.hidden = true;
      els.error.hidden = false;
    }
  }

  init();
})();
