const DEFAULT_SITE_NAME = "Cochonnet Villa";
const DEFAULT_COLOR = "#f8a6ba";

const SIZE_LABELS = {
  regular: "regular porky",
  giant: "extra-big porky",
  tiny: "tiny porky"
};

const LIVE_EDITOR_URL = "./admin/";
const REPOSITORY_URL = "https://github.com/seandongAne/cochonnet-villa";

const LANGUAGE_TEXT = {
  zh: {
    "meta.title": "猪猪山庄 | 15只快乐小猪的家",
    "meta.description": "欢迎来到猪猪山庄，这里是15只快乐小猪温暖又安全的家：13只舒服的小猪、1只超大的抱抱队长，还有1只小小宝贝。",
    "nav.story": "故事",
    "nav.porkies": "小猪们",
    "nav.villa": "猪猪山庄",
    "brand.name": "猪猪山庄",
    "hero.eyebrow": "温暖、安全，满是小小的快乐哼哼声",
    "hero.title": "15只小猪在猪猪山庄过着最舒服的日子。",
    "hero.text": "其中13只是粉嫩又舒服的一小群，一只特别大，一只特别小。它们聚在一起，就是网上最可爱的小猪家族。",
    "hero.primaryCtaLabel": "认识小猪们",
    "hero.secondaryCtaLabel": "看看别墅",
    "hero.sceneNote": "13只大小相近的小猪，1只大大的抱抱队长，还有1只小小甜心。",
    "stats.total": "快乐小猪",
    "stats.regular": "大小相近的小伙伴",
    "stats.giant": "温柔的大个子",
    "stats.tiny": "小小宝贝",
    "nameParade.eyebrow": "点名",
    "nameParade.title": "小猪们现在都有自己的名字了。",
    "nameParade.text": "每一个小昵称都让这个家族更有个性，尤其是那只大大的小猪和那只特别小的小猪。",
    "story.eyebrow": "最重要的事",
    "story.title": "一个温柔、好记，而且几秒钟就能明白的故事。",
    "story.text": "这个网站围绕三件事展开：小猪的数量、它们温暖安全的家，以及那只大猪和那只小猪各自独特的可爱。",
    "story.card.0.title": "温暖的设定",
    "story.card.0.body": "柔软的毯子、金色的光、稻草小窝和午后的懒觉，让这里看起来被好好照顾着。",
    "story.card.1.title": "安全又安静",
    "story.card.1.body": "猪猪山庄是一个平静的小天地，每只小猪都能自在地走动、休息，也能靠近伙伴。",
    "story.card.2.title": "容易记住",
    "story.card.2.body": "13只普通大小的小猪、1只特别大的小猪和1只特别小的小猪，让这个网站有了很鲜明的记忆点。",
    "porkies.eyebrow": "认识这个家族",
    "porkies.title": "猪猪山庄的15只小猪。",
    "porkies.text": "大部分小猪体型差不多，所以大呆猪显得更大，小猪也显得更小。每一只都有自己的小性格。",
    "size.regular": "普通小猪",
    "size.giant": "超大小猪",
    "size.tiny": "迷你小猪",
    "porky.0.description": "专业钻毯子选手，也是清晨第一批哼哼找东西的小猪。",
    "porky.1.description": "总能第一个找到院子里最暖的阳光。",
    "porky.2.description": "开朗、脸蛋红红，并且坚信每一份零食都应该属于她。",
    "porky.3.description": "特别喜欢新鲜青草，也喜欢跟着微风到处走。",
    "porky.4.description": "性格温柔、有耐心，总是在抱抱堆附近。",
    "porky.5.description": "别墅里的温柔大个子。它占的毯子最多，却总能让整个房间更安静。",
    "porky.6.description": "圆圆的、懒懒的，并且非常认真地对待午饭后的睡觉时间。",
    "porky.7.description": "总是在到处闻，好像一只正在训练的小小寻宝家。",
    "porky.8.description": "眼睛亮亮的，特别好奇，尤其是出现新稻草的时候。",
    "porky.9.description": "粉粉的小耳朵、桃子一样的光泽，还有用不完的快乐能量。",
    "porky.10.description": "软乎乎又稳稳当当，最开心的时候就是大家都靠在一起。",
    "porky.11.description": "家族里最小的一只。小小的脚、小小的午睡，还特别擅长钻进最蓬松的角落。",
    "porky.12.description": "阳光、活泼，通常到中午身上就会沾满一点稻草。",
    "porky.13.description": "安静又亲人，几乎不会离温暖的肩膀太远。",
    "porky.14.description": "粉粉的、爱玩的小猪，总是准备好开启下一轮软乎乎的小跑。",
    "villa.eyebrow": "别墅生活",
    "villa.title": "一个温暖又安全的地方，就像你描述的那样。",
    "villa.paragraph.0": "猪猪山庄被想象成一个明亮的小庇护所，有舒服的垫料、温柔的日常，也有足够的空间让每只小猪都放松自在。它不需要复杂华丽，重点是舒适、平静，以及被好好照顾。",
    "villa.paragraph.1": "正是这样的氛围，让这15只小猪显得可信又讨人喜欢。这个家和这群小猪一样重要。",
    "villa.rhythm.0.title": "早晨",
    "villa.rhythm.0.body": "阳光落在稻草上，早餐前的哼哼声，还有温柔的小点名。",
    "villa.rhythm.1.title": "下午",
    "villa.rhythm.1.body": "慢慢散步、一起乘凉，13个差不多大小的午睡姿势排成一排。",
    "villa.rhythm.2.title": "夜晚",
    "villa.rhythm.2.body": "温暖的毯子、困困的哼声、一只摊开的大家伙，还有一只窝在角落的小小睡猪。",
    "footer.text": "15只快乐小猪，安全又舒服地住在猪猪山庄。",
    "footer.manage": "管理内容"
  }
};

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

function i18nAttribute(key) {
  return key ? ` data-i18n="${escapeHtml(key)}"` : "";
}

function safeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
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
    .map((item, index) => {
      const label = escapeHtml(item?.label || "");
      const href = escapeHtml(sanitizeHref(item?.href));
      const key = ["nav.story", "nav.porkies", "nav.villa"][index];
      return `<a href="${href}"${i18nAttribute(key)}>${label}</a>`;
    })
    .join("");
}

function renderStats(porkies, labels) {
  const counts = countPorkiesBySize(porkies);
  const statItems = [
    { value: porkies.length, label: labels?.total || "happy porkies", key: "stats.total" },
    {
      value: counts.regular,
      label: labels?.regular || "similarly sized snugglers",
      key: "stats.regular"
    },
    { value: counts.giant, label: labels?.giant || "gentle giant", key: "stats.giant" },
    { value: counts.tiny, label: labels?.tiny || "tiny treasure", key: "stats.tiny" }
  ];

  return statItems
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.value)}</strong>
          <span${i18nAttribute(item.key)}>${escapeHtml(item.label)}</span>
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

function renderFeaturedPortraits(porkies) {
  const featured = [porkies[4], porkies[8], porkies[11]].filter(Boolean);

  return featured
    .map((porky) => {
      const name = escapeHtml(porky?.name || "");
      const src = escapeHtml(sanitizeImageSrc(porky?.image || porky?.photo));

      if (!src) {
        return "";
      }

      return `
        <figure class="scene-portrait">
          <img src="${src}" alt="${name}" loading="lazy" decoding="async" />
        </figure>
      `;
    })
    .join("");
}

function renderStoryCards(cards) {
  return normalizeList(cards)
    .map(
      (card, index) => `
        <article class="promise-card">
          <div class="promise-icon">
            <svg viewBox="0 0 120 120"><use href="#icon-heart"></use></svg>
          </div>
          <h3${i18nAttribute(`story.card.${index}.title`)}>${escapeHtml(card?.title || "")}</h3>
          <p${i18nAttribute(`story.card.${index}.body`)}>${escapeHtml(card?.body || "")}</p>
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
    .map((porky, index) => {
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
          <span class="size-tag"${i18nAttribute(`size.${size}`)}>${sizeLabel}</span>
          ${media}
          <h3>${name}</h3>
          <p${i18nAttribute(`porky.${index}.description`)}>${escapeHtml(porky?.description || "")}</p>
        </article>
      `;
    })
    .join("");
}

function renderParagraphs(items, keyPrefix = "") {
  return normalizeList(items)
    .map((item, index) => `<p${i18nAttribute(keyPrefix ? `${keyPrefix}.${index}` : "")}>${escapeHtml(item)}</p>`)
    .join("");
}

function renderRhythmCards(items) {
  return normalizeList(items)
    .map(
      (item, index) => `
        <article class="rhythm-card">
          <h3${i18nAttribute(`villa.rhythm.${index}.title`)}>${escapeHtml(item?.title || "")}</h3>
          <p${i18nAttribute(`villa.rhythm.${index}.body`)}>${escapeHtml(item?.body || "")}</p>
        </article>
      `
    )
    .join("");
}

function renderLanguageScript() {
  return `
    <script>
      (() => {
        const translations = ${safeScriptJson(LANGUAGE_TEXT)};
        translations.zh = translations.zh || {};
        translations.zh["hero.mapCtaLabel"] = "\\u8fdb\\u5165\\u732a\\u732a\\u5c71\\u5e84\\u5730\\u56fe";
        const storageKey = "cochonnet-villa-language";
        const options = ["en", "zh"];
        const initialTitle = document.title;
        const initialDescription = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";

        function getInitialLanguage() {
          const saved = localStorage.getItem(storageKey);
          return options.includes(saved) ? saved : "en";
        }

        function updateMeta(language) {
          const text = translations[language] || {};
          const title = language === "zh" ? text["meta.title"] : initialTitle;
          const description = language === "zh" ? text["meta.description"] : initialDescription;
          document.title = title;

          document
            .querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')
            .forEach((meta) => meta.setAttribute("content", description));
          document
            .querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]')
            .forEach((meta) => meta.setAttribute("content", title));
        }

        function setLanguage(language) {
          const text = translations[language] || {};
          document.documentElement.lang = language === "zh" ? "zh-Hans" : "en";
          localStorage.setItem(storageKey, language);

          document.querySelectorAll("[data-i18n]").forEach((element) => {
            if (!element.dataset.i18nEn) {
              element.dataset.i18nEn = element.textContent;
            }

            const key = element.dataset.i18n;
            element.textContent = language === "zh" && text[key] ? text[key] : element.dataset.i18nEn;
          });

          document.querySelectorAll("[data-lang-option]").forEach((button) => {
            const isActive = button.dataset.langOption === language;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
          });

          updateMeta(language);
        }

        document.querySelectorAll("[data-lang-option]").forEach((button) => {
          button.addEventListener("click", () => setLanguage(button.dataset.langOption));
        });

        setLanguage(getInitialLanguage());
      })();
    </script>
  `;
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
        <a class="brand" href="#top"${i18nAttribute("brand.name")}>${siteName}</a>
        <div class="header-actions">
          <nav class="site-nav" aria-label="Primary">
            ${renderNavigation(site?.navigation)}
          </nav>
          <div class="language-toggle" role="group" aria-label="Language">
            <button class="language-option is-active" type="button" data-lang-option="en" aria-pressed="true">EN</button>
            <button class="language-option" type="button" data-lang-option="zh" aria-pressed="false">中</button>
          </div>
        </div>
      </header>

      <main id="top">
        <section class="hero">
          <div class="hero-copy">
            <p class="eyebrow"${i18nAttribute("hero.eyebrow")}>${escapeHtml(hero.eyebrow || "")}</p>
            <h1${i18nAttribute("hero.title")}>${escapeHtml(hero.title || "")}</h1>
            <p class="hero-text"${i18nAttribute("hero.text")}>${escapeHtml(hero.text || "")}</p>
            <div class="hero-actions">
              <a class="button button-primary" href="${escapeHtml(sanitizeHref(hero.primaryCtaHref))}">
                <span${i18nAttribute("hero.primaryCtaLabel")}>${escapeHtml(hero.primaryCtaLabel || "Meet the porkies")}</span>
              </a>
              <a class="button button-secondary" href="${escapeHtml(sanitizeHref(hero.secondaryCtaHref))}">
                <span${i18nAttribute("hero.secondaryCtaLabel")}>${escapeHtml(hero.secondaryCtaLabel || "See the villa")}</span>
              </a>
              <a class="button button-map" href="/villa-map/">
                <span${i18nAttribute("hero.mapCtaLabel")}>Explore the Villa Map</span>
              </a>
            </div>
            <ul class="hero-stats" aria-label="Porky summary">
              ${renderStats(porkies, site?.summaryLabels)}
            </ul>
          </div>

          <aside class="scene-card" aria-label="Illustration of ${siteName}">
            <div class="scene-sign"${i18nAttribute("brand.name")}>${siteName}</div>
            <div class="scene-portraits" aria-label="Featured porkies">
              ${renderFeaturedPortraits(porkies)}
            </div>
            <a class="scene-house scene-house-link" href="/villa-map/" aria-label="Explore the Villa Map">
              <div class="roof"></div>
              <div class="house-body">
                <div class="window"></div>
                <div class="door"></div>
                <div class="window"></div>
              </div>
              <div class="house-shadow"></div>
              <span class="scene-house-cta"${i18nAttribute("hero.mapCtaLabel")}>Explore the Villa Map</span>
            </a>
            <div class="scene-herd">
              ${renderHerd(porkies)}
            </div>
            <p class="scene-note"${i18nAttribute("hero.sceneNote")}>${escapeHtml(hero.sceneNote || "")}</p>
          </aside>
        </section>

        <section class="name-parade" aria-label="Porky roll call">
          <div class="section-heading compact">
            <p class="eyebrow"${i18nAttribute("nameParade.eyebrow")}>Roll call</p>
            <h2${i18nAttribute("nameParade.title")}>The porkies now have names of their own.</h2>
            <p${i18nAttribute("nameParade.text")}>
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
            <p class="eyebrow"${i18nAttribute("story.eyebrow")}>${escapeHtml(story.eyebrow || "")}</p>
            <h2${i18nAttribute("story.title")}>${escapeHtml(story.title || "")}</h2>
            <p${i18nAttribute("story.text")}>${escapeHtml(story.text || "")}</p>
          </div>
          <div class="promise-grid">
            ${renderStoryCards(story.cards)}
          </div>
        </section>

        <section class="porkies" id="porkies">
          <div class="section-heading">
            <p class="eyebrow"${i18nAttribute("porkies.eyebrow")}>${escapeHtml(porkiesSection.eyebrow || "")}</p>
            <h2${i18nAttribute("porkies.title")}>${escapeHtml(porkiesSection.title || "")}</h2>
            <p${i18nAttribute("porkies.text")}>${escapeHtml(porkiesSection.text || "")}</p>
          </div>
          <div class="porky-grid">
            ${renderPorkyCards(porkies)}
          </div>
        </section>

        <section class="villa" id="villa">
          <div class="villa-layout">
            <div class="villa-copy">
              <p class="eyebrow"${i18nAttribute("villa.eyebrow")}>${escapeHtml(villaSection.eyebrow || "")}</p>
              <h2${i18nAttribute("villa.title")}>${escapeHtml(villaSection.title || "")}</h2>
              ${renderParagraphs(villaSection.paragraphs, "villa.paragraph")}
            </div>
            <div class="rhythm">
              ${renderRhythmCards(villaSection.rhythm)}
            </div>
          </div>
        </section>
      </main>

      <footer class="site-footer">
        <p${i18nAttribute("footer.text")}>${escapeHtml(site?.footerText || "")}</p>
        <div class="footer-links">
          <a href="${LIVE_EDITOR_URL}"${i18nAttribute("footer.manage")}>Manage content</a>
          <a href="${REPOSITORY_URL}" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>
    </div>
    ${renderLanguageScript()}
  `;
}
