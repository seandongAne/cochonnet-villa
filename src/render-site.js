const DEFAULT_SITE_NAME = "Cochonnet Villa";
const DEFAULT_COLOR = "#f8a6ba";

const SIZE_LABELS = {
  regular: "regular porky",
  giant: "extra-big porky",
  tiny: "tiny porky"
};

const LIVE_EDITOR_URL = "./admin/";
const REPOSITORY_URL = "https://github.com/seandongAne/cochonnet-villa";

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function sanitizeHref(value) {
  const href = String(value ?? "").trim();

  if (
    href.startsWith("#") ||
    href.startsWith("/") ||
    href.startsWith("http://") ||
    href.startsWith("https://")
  ) {
    return href;
  }

  return "#";
}

function sanitizeColor(value) {
  const color = String(value ?? "").trim();
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(color) ? color : DEFAULT_COLOR;
}

function sanitizeImageSrc(value) {
  const src = String(value ?? "").trim();

  if (
    src.startsWith("/") ||
    src.startsWith("./") ||
    src.startsWith("../") ||
    src.startsWith("http://") ||
    src.startsWith("https://")
  ) {
    return src;
  }

  return "";
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSize(value) {
  if (value === "giant" || value === "tiny") {
    return value;
  }

  return "regular";
}

function countPorkiesBySize(porkies) {
  return porkies.reduce(
    (counts, porky) => {
      counts[normalizeSize(porky?.size)] += 1;
      return counts;
    },
    { regular: 0, giant: 0, tiny: 0 }
  );
}

function renderNavigation(items) {
  return normalizeList(items)
    .map((item) => {
      const label = escapeHtml(item?.label || "");
      const href = escapeHtml(sanitizeHref(item?.href));
      return `<a href="${href}">${label}</a>`;
    })
    .join("");
}

function renderStats(porkies, labels) {
  const counts = countPorkiesBySize(porkies);
  const statItems = [
    { value: porkies.length, label: labels?.total || "happy porkies" },
    {
      value: counts.regular,
      label: labels?.regular || "similarly sized snugglers"
    },
    { value: counts.giant, label: labels?.giant || "gentle giant" },
    { value: counts.tiny, label: labels?.tiny || "tiny treasure" }
  ];

  return statItems
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.value)}</strong>
          <span>${escapeHtml(item.label)}</span>
        </li>
      `
    )
    .join("");
}

function renderHerd(porkies) {
  return porkies
    .map((porky) => {
      const size = normalizeSize(porky?.size);
      return `
        <span class="herd-porky ${size}">
          <svg viewBox="0 0 120 120"><use href="#icon-piglet"></use></svg>
        </span>
      `;
    })
    .join("");
}

function renderStoryCards(cards) {
  return normalizeList(cards)
    .map(
      (card) => `
        <article class="promise-card">
          <div class="promise-icon">
            <svg viewBox="0 0 120 120"><use href="#icon-heart"></use></svg>
          </div>
          <h3>${escapeHtml(card?.title || "")}</h3>
          <p>${escapeHtml(card?.body || "")}</p>
        </article>
      `
    )
    .join("");
}

function renderNameParade(porkies) {
  return porkies
    .map((porky) => {
      const size = normalizeSize(porky?.size);
      return `
        <li class="name-chip ${size}" style="--accent: ${escapeHtml(sanitizeColor(porky?.accent))};">
          <span>${escapeHtml(porky?.name || "")}</span>
        </li>
      `;
    })
    .join("");
}

function renderPorkyCards(porkies) {
  return porkies
    .map((porky) => {
      const size = normalizeSize(porky?.size);
      const accent = escapeHtml(sanitizeColor(porky?.accent));
      const sizeClass = size === "regular" ? "" : ` ${size}`;
      const sizeLabel = escapeHtml(SIZE_LABELS[size]);
      const name = escapeHtml(porky?.name || "");
      const imageSrc = sanitizeImageSrc(porky?.image || porky?.photo);
      const media = imageSrc
        ? `
          <div class="porky-photo-frame">
            <img
              class="porky-photo"
              src="${escapeHtml(imageSrc)}"
              alt="${name}"
              loading="lazy"
              decoding="async"
            />
          </div>
        `
        : `
          <div class="porky-icon">
            <svg viewBox="0 0 120 120"><use href="#icon-piglet"></use></svg>
          </div>
        `;

      return `
        <article class="porky-card${sizeClass}" style="--accent: ${accent};">
          <span class="size-tag">${sizeLabel}</span>
          ${media}
          <h3>${name}</h3>
          <p>${escapeHtml(porky?.description || "")}</p>
        </article>
      `;
    })
    .join("");
}

function renderParagraphs(items) {
  return normalizeList(items)
    .map((item) => `<p>${escapeHtml(item)}</p>`)
    .join("");
}

function renderRhythmCards(items) {
  return normalizeList(items)
    .map(
      (item) => `
        <article class="rhythm-card">
          <h3>${escapeHtml(item?.title || "")}</h3>
          <p>${escapeHtml(item?.body || "")}</p>
        </article>
      `
    )
    .join("");
}

function renderSprite() {
  return `
    <svg class="sr-only" aria-hidden="true" focusable="false">
      <symbol id="icon-piglet" viewBox="0 0 120 120">
        <path d="M27 31c5-14 21-18 33-7l-7 18-26-11Z" fill="currentColor" opacity="0.92"></path>
        <path d="M93 31c-5-14-21-18-33-7l7 18 26-11Z" fill="currentColor" opacity="0.92"></path>
        <circle cx="60" cy="62" r="34" fill="currentColor"></circle>
        <ellipse cx="60" cy="74" rx="18" ry="14" fill="#ffd7de"></ellipse>
        <ellipse cx="53" cy="74" rx="3.5" ry="5" fill="#b34f72"></ellipse>
        <ellipse cx="67" cy="74" rx="3.5" ry="5" fill="#b34f72"></ellipse>
        <circle cx="48" cy="60" r="3.5" fill="#4f2a2d"></circle>
        <circle cx="72" cy="60" r="3.5" fill="#4f2a2d"></circle>
        <circle cx="38" cy="71" r="4.8" fill="#ffb7c8" opacity="0.9"></circle>
        <circle cx="82" cy="71" r="4.8" fill="#ffb7c8" opacity="0.9"></circle>
      </symbol>
      <symbol id="icon-heart" viewBox="0 0 120 120">
        <path d="M60 101 20 63c-11-11-11-29 0-40 11-11 28-11 39 0l1 1 1-1c11-11 28-11 39 0 11 11 11 29 0 40L60 101Z" fill="currentColor"></path>
      </symbol>
    </svg>
  `;
}

export function renderSite(site) {
  const siteName = escapeHtml(site?.siteName || DEFAULT_SITE_NAME);
  const hero = site?.hero || {};
  const story = site?.story || {};
  const porkiesSection = site?.porkiesSection || {};
  const villaSection = site?.villaSection || {};
  const porkies = normalizeList(site?.porkies);

  return `
    ${renderSprite()}
    <div class="page-shell">
      <header class="site-header">
        <a class="brand" href="#top">${siteName}</a>
        <nav class="site-nav" aria-label="Primary">
          ${renderNavigation(site?.navigation)}
        </nav>
      </header>

      <main id="top">
        <section class="hero">
          <div class="hero-copy">
            <p class="eyebrow">${escapeHtml(hero.eyebrow || "")}</p>
            <h1>${escapeHtml(hero.title || "")}</h1>
            <p class="hero-text">${escapeHtml(hero.text || "")}</p>
            <div class="hero-actions">
              <a class="button button-primary" href="${escapeHtml(sanitizeHref(hero.primaryCtaHref))}">
                ${escapeHtml(hero.primaryCtaLabel || "Meet the porkies")}
              </a>
              <a class="button button-secondary" href="${escapeHtml(sanitizeHref(hero.secondaryCtaHref))}">
                ${escapeHtml(hero.secondaryCtaLabel || "See the villa")}
              </a>
            </div>
            <ul class="hero-stats" aria-label="Porky summary">
              ${renderStats(porkies, site?.summaryLabels)}
            </ul>
          </div>

          <aside class="scene-card" aria-label="Illustration of ${siteName}">
            <div class="scene-sign">${siteName}</div>
            <div class="scene-house" aria-hidden="true">
              <div class="roof"></div>
              <div class="house-body">
                <div class="window"></div>
                <div class="door"></div>
                <div class="window"></div>
              </div>
              <div class="house-shadow"></div>
            </div>
            <div class="scene-herd">
              ${renderHerd(porkies)}
            </div>
            <p class="scene-note">${escapeHtml(hero.sceneNote || "")}</p>
          </aside>
        </section>

        <section class="name-parade" aria-label="Porky roll call">
          <div class="section-heading compact">
            <p class="eyebrow">Roll call</p>
            <h2>The porkies now have names of their own.</h2>
            <p>
              The herd feels more personal with every little nickname, especially
              with one big character and one tiny standout among the group.
            </p>
          </div>
          <ul class="name-chip-list">
            ${renderNameParade(porkies)}
          </ul>
        </section>

        <section class="promise" id="story">
          <div class="section-heading">
            <p class="eyebrow">${escapeHtml(story.eyebrow || "")}</p>
            <h2>${escapeHtml(story.title || "")}</h2>
            <p>${escapeHtml(story.text || "")}</p>
          </div>
          <div class="promise-grid">
            ${renderStoryCards(story.cards)}
          </div>
        </section>

        <section class="porkies" id="porkies">
          <div class="section-heading">
            <p class="eyebrow">${escapeHtml(porkiesSection.eyebrow || "")}</p>
            <h2>${escapeHtml(porkiesSection.title || "")}</h2>
            <p>${escapeHtml(porkiesSection.text || "")}</p>
          </div>
          <div class="porky-grid">
            ${renderPorkyCards(porkies)}
          </div>
        </section>

        <section class="villa" id="villa">
          <div class="villa-layout">
            <div class="villa-copy">
              <p class="eyebrow">${escapeHtml(villaSection.eyebrow || "")}</p>
              <h2>${escapeHtml(villaSection.title || "")}</h2>
              ${renderParagraphs(villaSection.paragraphs)}
            </div>
            <div class="rhythm">
              ${renderRhythmCards(villaSection.rhythm)}
            </div>
          </div>
        </section>
      </main>

      <footer class="site-footer">
        <p>${escapeHtml(site?.footerText || "")}</p>
        <div class="footer-links">
          <a href="${LIVE_EDITOR_URL}">Manage content</a>
          <a href="${REPOSITORY_URL}" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>
    </div>
  `;
}
