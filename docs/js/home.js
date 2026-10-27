(() => {
  "use strict";

  const books = Array.isArray(window.NIPPYO_HOME_BOOKS) ? window.NIPPYO_HOME_BOOKS : [];
  const list = document.getElementById("newBooksList");
  const note = document.getElementById("newBooksNote");
  const updated = document.getElementById("bookDataUpdated");

  if (updated) updated.textContent = window.NIPPYO_LAST_UPDATED || "—";
  if (!list) return;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const now = new Date();
  const currentYm = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`;

  const pastOrCurrent = books
    .filter((b) => /^\d{4}\.\d{2}$/.test(String(b.pub_month || "")) && String(b.pub_month) <= currentYm)
    .sort((a, b) => String(b.pub_month).localeCompare(String(a.pub_month)) || Number(b.id || 0) - Number(a.id || 0));

  let targetYm = currentYm;
  let selected = pastOrCurrent.filter((b) => b.pub_month === targetYm);
  if (!selected.length && pastOrCurrent.length) {
    targetYm = pastOrCurrent[0].pub_month;
    selected = pastOrCurrent.filter((b) => b.pub_month === targetYm);
  }

  selected = selected.slice(0, 12);

  if (note) {
    note.textContent = targetYm
      ? `${targetYm.replace(".", "年")}月刊行の書籍を自動表示しています。`
      : "刊行年月を確認できる書籍がありません。";
  }

  if (!selected.length) {
    list.innerHTML = '<p class="new-books-empty">現在表示できる新刊情報はありません。</p>';
    return;
  }

  list.innerHTML = selected.map((book) => {
    const author = String(book.author || "").split("|").filter(Boolean).join("／");
    const price = Number(book.price_body || 0);
    const cover = book.cover
      ? `<img class="new-book-cover" src="${esc(book.cover)}" alt="${esc(book.title)} 書影" loading="lazy">`
      : `<div class="new-book-cover-placeholder" aria-hidden="true">NIPPYO</div>`;
    const qs = new URLSearchParams({ book: String(book.id || "") }).toString();
    return `
      <article class="new-book-card">
        <a class="new-book-cover-link" href="books/?${qs}">${cover}</a>
        <div class="new-book-info">
          <p class="new-book-date">${esc(String(book.pub_month || "").replace(".", "年"))}月</p>
          <h3><a href="books/?${qs}">${esc(book.title || "（書名未登録）")}</a></h3>
          ${author ? `<p class="new-book-author">${esc(author)}</p>` : ""}
          ${book.isbn ? `<p class="new-book-meta">ISBN ${esc(book.isbn)}</p>` : ""}
          ${price ? `<p class="new-book-price">本体 ${price.toLocaleString("ja-JP")}円</p>` : ""}
        </div>
      </article>`;
  }).join("");
})();
