(() => {
  "use strict";

  const body = document.body;
  const imageModal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");
  const licenseModal = document.getElementById("licenseModal");
  const agreeDownload = document.getElementById("agreeDownload");
  let lastFocused = null;

  const openModal = (modal) => {
    lastFocused = document.activeElement;
    modal.hidden = false;
    body.classList.add("modal-open");
    const focusTarget = modal.querySelector(".modal-close, a, button");
    if (focusTarget) focusTarget.focus();
  };

  const closeModal = (modal) => {
    modal.hidden = true;
    body.classList.remove("modal-open");
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  };

  document.querySelectorAll(".image-modal-button").forEach((button) => {
    button.addEventListener("click", () => {
      modalImage.src = button.dataset.image || "";
      modalImage.alt = button.dataset.alt || "拡大画像";
      openModal(imageModal);
    });
  });

  document.querySelectorAll(".modal-close, .modal-close-action").forEach((button) => {
    button.addEventListener("click", () => {
      const modal = button.closest(".modal");
      if (modal) closeModal(modal);
    });
  });

  [imageModal, licenseModal].forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!imageModal.hidden) closeModal(imageModal);
    if (!licenseModal.hidden) closeModal(licenseModal);
  });

  agreeDownload.addEventListener("click", () => {
    closeModal(licenseModal);
  });

  const markAvailable = (button) => {
    button.disabled = false;
    button.classList.remove("is-pending");
    const status = button.querySelector("small");
    if (status) status.textContent = "ダウンロードできます";
    button.addEventListener("click", () => {
      agreeDownload.href = button.dataset.file;
      openModal(licenseModal);
    });
  };

  const markPending = (button) => {
    button.disabled = true;
    button.classList.add("is-pending");
    const status = button.querySelector("small");
    if (status) status.textContent = "準備中";
  };

  const checkFile = async (button) => {
    const url = button.dataset.file;
    if (!url || location.protocol === "file:") {
      markPending(button);
      return;
    }

    try {
      const response = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (response.ok) {
        markAvailable(button);
      } else {
        markPending(button);
      }
    } catch (_) {
      markPending(button);
    }
  };

  const downloadButtons = [...document.querySelectorAll(".download-button[data-file]")];
  const downloadSummary = document.getElementById("downloadStatusSummary");

  Promise.all(downloadButtons.map(checkFile)).then(() => {
    if (!downloadSummary) return;
    const available = downloadButtons.filter((button) => !button.disabled).length;
    if (available === 0) {
      downloadSummary.textContent = "本書中で紹介されている作品の展開図データ（PDF、SVG、DXF形式）は現在準備中です。";
    } else if (available === downloadButtons.length) {
      downloadSummary.textContent = "本書中で紹介されている作品の展開図データ（PDF、SVG、DXF形式）がダウンロードできます。";
    } else {
      downloadSummary.textContent = `本書中で紹介されている作品の展開図データ（PDF、SVG、DXF形式）は、準備が整った章からダウンロードできます（${available}/${downloadButtons.length}章）。`;
    }
  });
})();
