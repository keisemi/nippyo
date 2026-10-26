(() => {
  const books = Array.isArray(window.NIPPYO_ADMIN_BOOKS) ? window.NIPPYO_ADMIN_BOOKS : [];
  const queryInput = document.getElementById('book-query');
  const searchButton = document.getElementById('search-button');
  const results = document.getElementById('results');
  const count = document.getElementById('result-count');
  const newBookLink = document.getElementById('new-book-link');
  const issueBase = 'https://github.com/keisemi/nippyo/issues/new';

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\-‐‑‒–—―ー]/g, '');
  }

  function editUrl(book) {
    const params = new URLSearchParams();
    params.set('template', 'book_edit.yml');
    params.set('title', `[書誌修正] ${book.title}`);
    params.set('book_id', book.id);
    params.set('current_title', book.title);
    return `${issueBase}?${params.toString()}`;
  }

  function newUrl() {
    const params = new URLSearchParams();
    params.set('template', 'book_new.yml');
    return `${issueBase}?${params.toString()}`;
  }

  function render(items) {
    results.replaceChildren();
    if (!items.length) {
      count.textContent = '該当する書誌がありません。';
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = '検索語を変えてお試しください。';
      results.appendChild(div);
      return;
    }

    count.textContent = `${items.length.toLocaleString()}件表示`;
    items.forEach((book) => {
      const card = document.createElement('article');
      card.className = 'book-result';

      const h2 = document.createElement('h2');
      h2.textContent = book.title || '（書名なし）';
      card.appendChild(h2);

      const meta = document.createElement('div');
      meta.className = 'book-meta';
      const parts = [
        book.author ? `著者：${book.author}` : '',
        book.isbn_new ? `ISBN：${book.isbn_new}` : (book.isbn_old ? `ISBN：${book.isbn_old}` : ''),
        book.pub_month ? `刊行：${book.pub_month}` : '',
        `書籍ID：${book.id}`,
      ].filter(Boolean);
      parts.forEach((part) => {
        const span = document.createElement('span');
        span.textContent = part;
        meta.appendChild(span);
      });
      card.appendChild(meta);

      const a = document.createElement('a');
      a.className = 'admin-btn secondary';
      a.href = editUrl(book);
      a.textContent = 'この書誌を修正';
      card.appendChild(a);

      results.appendChild(card);
    });
  }

  function search() {
    const terms = queryInput.value.trim().split(/\s+/).filter(Boolean).map(normalize);
    if (!terms.length) {
      count.textContent = '検索語を入力してください。';
      results.replaceChildren();
      return;
    }

    const matched = books.filter((book) => {
      const haystack = normalize([
        book.id,
        book.title,
        book.author,
        book.isbn_old,
        book.isbn_new,
      ].filter(Boolean).join(' '));
      return terms.every((term) => haystack.includes(term));
    }).slice(0, 50);

    render(matched);
    if (matched.length === 50) {
      count.textContent += '（上位50件。さらに絞り込んでください）';
    }
  }

  newBookLink.href = newUrl();
  searchButton.addEventListener('click', search);
  queryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') search();
  });
})();
