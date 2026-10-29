(() => {
  const images = Array.from(document.querySelectorAll(".legal-image-card img"));
  if (!images.length) return;

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
    enlargedImage.src = image.currentSrc || image.src;
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
