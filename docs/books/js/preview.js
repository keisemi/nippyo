(() => {
  "use strict";

  const modalContent = document.getElementById("bookModalContent");
  if (!modalContent) return;

  let previewIndex = { books: {}, magazines: {} };
  let indexReady = false;
  let scheduled = false;

  function addStyles() {
    if (document.getElementById("previewReadingStyles")) return;
    const style = document.createElement("style");
    style.id = "previewReadingStyles";
    style.textContent = `
      .preview-cover-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
      }
      .preview-reading-link {
        display: inline-block;
        margin-top: 9px;
        color: var(--accent);
        font-size: 13px;
        font-weight: 700;
        line-height: 1.5;
        text-decoration: none;
        white-space: nowrap;
      }
      .preview-reading-link:hover,
      .preview-reading-link:focus-visible {
        color: var(--accent-dark);
        text-decoration: underline;
        text-underline-offset: .18em;
      }
      .preview-reading-link:focus-visible {
        outline: 2px solid rgba(37, 94, 23, .35);
        outline-offset: 3px;
      }
    `;
    document.head.appendChild(style);
  }

  function currentTarget() {
    const params = new URLSearchParams(location.search);
    const bookId = String(params.get("book") || "").trim();
    if (bookId) return { type: "book", id: bookId };
    const magazineId = String(params.get("mag") || "").trim();
    if (magazineId) return { type: "magazine", id: magazineId };
    return null;
  }

  function previewPath(target) {
    if (!target || !indexReady) return "";
    const entries = target.type === "book" ? previewIndex.books : previewIndex.magazines;
    return entries && typeof entries === "object" ? String(entries[target.id] || "") : "";
  }

  function applyPreviewLink() {
    scheduled = false;
    if (!indexReady) return;
    if (modalContent.querySelector(".preview-reading-link")) return;

    const target = currentTarget();
    const path = previewPath(target);
    if (!target || !path) return;

    const summary = target.type === "book"
      ? modalContent.querySelector(".book-modal-summary.has-cover")
      : modalContent.querySelector(".magazine-modal-summary.has-cover");
    if (!summary) return;

    const coverButton = summary.querySelector(":scope > .cover-zoom-button");
    if (!coverButton) return;

    const wrapper = document.createElement("div");
    wrapper.className = "preview-cover-stack";
    coverButton.replaceWith(wrapper);
    wrapper.appendChild(coverButton);

    const link = document.createElement("a");
    link.className = "preview-reading-link";
    link.href = `../${path}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "【立ち読み】";
    link.setAttribute("aria-label", "立ち読みPDFを開く");
    wrapper.appendChild(link);
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(applyPreviewLink);
  }

  async function loadIndex() {
    const stamp = Date.now().toString();
    try {
      const response = await fetch(`../data/preview-index.json?t=${stamp}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      previewIndex = {
        books: payload && typeof payload.books === "object" && payload.books ? payload.books : {},
        magazines: payload && typeof payload.magazines === "object" && payload.magazines ? payload.magazines : {}
      };
    } catch (error) {
      console.warn("立ち読みPDF情報を読み込めませんでした。", error);
      previewIndex = { books: {}, magazines: {} };
    } finally {
      indexReady = true;
      scheduleApply();
    }
  }

  addStyles();
  const observer = new MutationObserver(scheduleApply);
  observer.observe(modalContent, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleApply);
  void loadIndex();
})();
