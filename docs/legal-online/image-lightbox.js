(() => {
  const images = Array.from(document.querySelectorAll(".legal-image-card img"));
  if (!images.length) return;

  // Keep the lightbox independent from an older cached stylesheet.
  // The normal thumbnail layout remains controlled by service-links.css.
  const style = document.createElement("style");
  style.setAttribute("data-legal-lightbox-style", "");
  style.textContent = `
    .legal-lightbox-trigger { cursor: zoom-in; }
    .legal-lightbox-trigger:focus-visible {
      outline: 3px solid var(--green, #2f6f2f);
      outline-offset: 3px;
    }
    body.legal-lightbox-open { overflow: hidden !important; }
    .legal-lightbox[hidden] { display: none !important; }
    .legal-lightbox {
      position: fixed !important;
      z-index: 2147483647 !important;
      inset: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
      width: 100vw !important;
      height: 100vh !important;
      margin: 0 !important;
      padding: 54px 32px 32px !important;
      background: rgba(0, 0, 0, .86) !important;
    }
    .legal-lightbox-content {
      display: flex !important;
      max-width: 94vw !important;
      max-height: 90vh !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 12px !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
    }
    .legal-lightbox-image {
      display: block !important;
      width: auto !important;
      height: auto !important;
      min-width: min(720px, 90vw) !important;
      max-width: 90vw !important;
      max-height: 80vh !important;
      object-fit: contain !important;
      background: #fff !important;
      box-shadow: 0 12px 50px rgba(0, 0, 0, .45) !important;
    }
    .legal-lightbox-caption {
      margin: 0 !important;
      color: #fff !important;
      font-size: .92rem !important;
      line-height: 1.5 !important;
      text-align: center !important;
    }
    .legal-lightbox-close {
      position: fixed !important;
      z-index: 2147483647 !important;
      top: 14px !important;
      right: 18px !important;
      display: grid !important;
      place-items: center !important;
      width: 46px !important;
      height: 46px !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 1px solid rgba(255, 255, 255, .85) !important;
      border-radius: 50% !important;
      background: rgba(0, 0, 0, .55) !important;
      color: #fff !important;
      font: 400 32px/1 Arial, sans-serif !important;
      cursor: pointer !important;
    }
    .legal-lightbox-close:hover,
    .legal-lightbox-close:focus-visible {
      background: rgba(255, 255, 255, .18) !important;
      outline: 2px solid #fff !important;
      outline-offset: 2px !important;
    }
    @media (max-width: 700px) {
      .legal-lightbox { padding: 58px 14px 24px !important; }
      .legal-lightbox-image {
        min-width: 0 !important;
        max-width: 94vw !important;
        max-height: 76vh !important;
      }
      .legal-lightbox-close {
        top: 9px !important;
        right: 11px !important;
      }
    }
  `;
  document.head.appendChild(style);

  const lightbox = document.createElement("div");
  lightbox.className = "legal-lightbox";
  lightbox.hidden = true;
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-label", "画像拡大表示");
  lightbox.innerHTML = `
    <button class="legal-lightbox-close" type="button" aria-label="拡大画像を閉じる">×</button>
    <div class="legal-lightbox-content">
      <img class="legal-lightbox-image" alt="">
      <p class="legal-lightbox-caption"></p>
    </div>
  `;
  document.body.appendChild(lightbox);

  const enlargedImage = lightbox.querySelector(".legal-lightbox-image");
  const caption = lightbox.querySelector(".legal-lightbox-caption");
  const closeButton = lightbox.querySelector(".legal-lightbox-close");
  let opener = null;

  const close = () => {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove("legal-lightbox-open");
    enlargedImage.removeAttribute("src");
    caption.textContent = "";
    if (opener) opener.focus();
    opener = null;
  };

  const open = (image) => {
    opener = image;
    enlargedImage.src = image.dataset.fullSrc || image.currentSrc || image.src;
    enlargedImage.alt = image.alt || "拡大画像";
    const figcaption = image.closest("figure")?.querySelector("figcaption");
    caption.textContent = figcaption?.textContent?.trim() || image.alt || "";
    caption.hidden = !caption.textContent;
    lightbox.hidden = false;
    document.body.classList.add("legal-lightbox-open");
    closeButton.focus();
  };

  images.forEach((image) => {
    image.classList.add("legal-lightbox-trigger");
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute("aria-haspopup", "dialog");
    image.setAttribute("aria-label", `${image.alt || "画像"}を拡大表示`);
    image.title = "クリックして拡大";

    image.addEventListener("click", () => open(image));
    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open(image);
      }
    });
  });

  closeButton.addEventListener("click", close);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) close();
  });
  document.addEventListener("keydown", (event) => {
    if (!lightbox.hidden && event.key === "Escape") close();
  });
})();
