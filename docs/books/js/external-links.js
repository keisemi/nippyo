(() => {
  "use strict";

  const DATA_URL = `../data/book-external-links.csv?v=${Date.now()}`;
  const linksByBook = new Map();
  let dataLoaded = false;
  let renderQueued = false;

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
        continue;
      }

      if (ch === '"') {
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

  function loadLinks() {
    return fetch(DATA_URL, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        const rows = parseCsv(text);
        if (!rows.length) return;
        const headers = rows[0].map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "") : value);
        const index = Object.fromEntries(headers.map((name, i) => [name, i]));
        for (const required of ["id", "slot", "title", "comment", "url"]) {
          if (!(required in index)) throw new Error(`列 ${required} がありません`);
        }

        for (const values of rows.slice(1)) {
          const id = String(values[index.id] || "").trim();
          const slot = Number.parseInt(String(values[index.slot] || "").trim(), 10);
          const title = String(values[index.title] || "").trim();
          const comment = String(values[index.comment] || "").trim();
          const url = String(values[index.url] || "").trim();
          if (!id || !Number.isInteger(slot) || !/^https?:\/\//i.test(url)) continue;
          if (!linksByBook.has(id)) linksByBook.set(id, []);
          linksByBook.get(id).push({ slot, title, comment, url });
        }

        for (const links of linksByBook.values()) {
          links.sort((a, b) => a.slot - b.slot);
        }
        dataLoaded = true;
      })
      .catch((error) => {
        console.warn("書籍の関連リンクデータを読み込めませんでした。", error);
      });
  }

  function currentBookId() {
    return String(new URLSearchParams(location.search).get("book") || "").trim();
  }

  function renderCurrentBookLinks() {
    renderQueued = false;
    const content = document.getElementById("bookModalContent");
    if (!content) return;

    const bookId = currentBookId();
    const existing = content.querySelector(".book-external-links");
    if (existing && existing.dataset.bookId === bookId) return;
    if (existing) existing.remove();
    if (!dataLoaded || !bookId) return;
    if (!content.querySelector(".book-modal-summary")) return;

    const links = linksByBook.get(bookId) || [];
    if (!links.length) return;

    const section = document.createElement("section");
    section.className = "book-detail-section book-external-links";
    section.dataset.bookId = bookId;

    const heading = document.createElement("h3");
    heading.textContent = "関連リンク";
    section.appendChild(heading);

    const list = document.createElement("ul");
    for (const link of links) {
      const item = document.createElement("li");
      const anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = link.title || link.url;
      item.appendChild(anchor);
      if (link.comment) {
        const comment = document.createElement("span");
        comment.className = "book-external-link-comment";
        comment.textContent = ` — ${link.comment}`;
        item.appendChild(comment);
      }
      list.appendChild(item);
    }
    section.appendChild(list);

    const purchase = content.querySelector(".book-purchase-actions");
    if (purchase) content.insertBefore(section, purchase);
    else content.appendChild(section);
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(renderCurrentBookLinks);
  }

  function init() {
    const content = document.getElementById("bookModalContent");
    if (!content) return;
    const observer = new MutationObserver(queueRender);
    observer.observe(content, { childList: true, subtree: true });
    window.addEventListener("popstate", queueRender);
    loadLinks().then(queueRender);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
