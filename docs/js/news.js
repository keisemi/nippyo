(() => {
  "use strict";

  const news = Array.isArray(window.NIPPYO_NEWS) ? window.NIPPYO_NEWS : [];

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const formatDate = (value) => {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[1]}.${Number(m[2])}.${Number(m[3])}` : String(value || "");
  };

  const safeUrl = (value) => {
    const url = String(value || "").trim();
    if (!url) return "";
    if (url.startsWith("./") || url.startsWith("../") || url.startsWith("/")) return url;
    if (/^https?:\/\//i.test(url)) return url;
    return "";
  };

  const renderNewsText = (value) => {
    const text = String(value ?? "");
    const linkPattern = /\[([^\]\r\n]+)\]\(([^)\r\n]+)\)/g;
    let html = "";
    let lastIndex = 0;

    for (const match of text.matchAll(linkPattern)) {
      const full = match[0];
      const label = match[1];
      const url = safeUrl(match[2]);
      const index = match.index ?? 0;

      html += esc(text.slice(lastIndex, index));
      if (!url) {
        html += esc(full);
      } else {
        const external = /^https?:\/\//i.test(url);
        html += `<a href="${esc(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(label)}</a>`;
      }
      lastIndex = index + full.length;
    }

    html += esc(text.slice(lastIndex));
    return html;
  };

  document.querySelectorAll("[data-news-list]").forEach((container) => {
    const limit = Number(container.dataset.limit || 0);
    const items = limit > 0 ? news.slice(0, limit) : news;

    if (!items.length) {
      container.innerHTML = '<p class="news-empty">現在掲載中のお知らせはありません。</p>';
      return;
    }

    container.innerHTML = items.map((item) => {
      const url = safeUrl(item.url);
      const external = /^https?:\/\//i.test(url);
      const title = url
        ? `<a href="${esc(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(item.title)}</a>`
        : esc(item.title);
      return `
        <article class="news-item${item.pinned ? " is-pinned" : ""}">
          <div class="news-meta">
            <time datetime="${esc(item.date)}">${esc(formatDate(item.date))}</time>
            <span class="news-category">${esc(item.category || "お知らせ")}</span>
            ${item.pinned ? '<span class="news-pin">重要</span>' : ""}
          </div>
          <h3 class="news-title">${title}</h3>
          ${item.text ? `<p class="news-text">${renderNewsText(item.text)}</p>` : ""}
        </article>`;
    }).join("");
  });
})();
