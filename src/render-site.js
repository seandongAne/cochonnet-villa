import { renderNotesTeaser } from "./render-notes.js";

const DEFAULT_SITE_NAME = "Cochonnet Villa";
const DEFAULT_COLOR = "#f8a6ba";

const SIZE_LABELS = {
  regular: "standard size",
  giant: "extra large",
  tiny: "pocket size"
};

const LIVE_EDITOR_URL = "./admin/";
const REPOSITORY_URL = "https://github.com/seandongAne/cochonnet-villa";

const LANGUAGE_TEXT = {
  zh: {
    "meta.title": "猪猪山庄 | 15只快乐小猪的家",
    "meta.description": "欢迎来到猪猪山庄，15只快乐小猪温暖又安全的家：十三只个头差不多，一只温柔的大块头，一只迷你小不点，还有温泉和蘑菇塔。",
    "nav.story": "规矩",
    "nav.porkies": "小猪们",
    "nav.villa": "山庄",
    "brand.name": "猪猪山庄",
    "hero.eyebrow": "又暖和又安全，到处都是快乐的哼哼声",
    "hero.title": "猪猪山庄住着15只小猪，一只比一只会享福。",
    "hero.text": "十三只个头差不多，一只又大又壮，一只小得能揣进口袋。它们每天的正经事只有三件：吃饭、泡温泉、挤成一团睡觉。",
    "hero.primaryCtaLabel": "认识小猪们",
    "hero.secondaryCtaLabel": "逛逛山庄",
    "hero.mapCtaLabel": "走进 3D 山庄地图",
    "hero.sceneNote": "十三只差不多大，一只特别大，一只特别小。再数一遍，还是十五只。",
    "stats.total": "快乐小猪",
    "stats.regular": "个头差不多",
    "stats.giant": "温柔大块头",
    "stats.tiny": "迷你小不点",
    "nameParade.eyebrow": "点名",
    "nameParade.title": "点到名字的，请哼一声。",
    "nameParade.text": "十五个名字，都是照着各自的脾气起的。连起来念快一点，就是一段绕口令。",
    "story.eyebrow": "山庄规矩",
    "story.title": "山庄只有三条规矩，都很好遵守。",
    "story.text": "没人把它们写下来，但十五只小猪都记得清清楚楚，尤其是跟吃有关的那一条。",
    "story.card.0.title": "毯子管够",
    "story.card.0.body": "软毯子、暖灯光，还有晒得蓬蓬的小窝。谁困了就原地躺下，在这里睡午觉不需要理由。",
    "story.card.1.title": "吃饭不落下谁",
    "story.card.1.body": "火锅是全山庄的最爱。锅一开，十五只围成一圈，各涮各的心头好，谁也不许饿着。",
    "story.card.2.title": "点名点满十五",
    "story.card.2.body": "十三只差不多大的，一只特别大的，一只特别小的。每晚数一遍，数对了才熄灯。",
    "porkies.eyebrow": "挨个认识一下",
    "porkies.title": "十五位住户，一只一只介绍。",
    "porkies.text": "名字都不是白叫的：脏脏猪真的脏，懒蛋猪真的懒，至于贪吃猪……看照片就知道了。",
    "size.regular": "标准号",
    "size.giant": "特大号",
    "size.tiny": "迷你号",
    "porky.0.description": "哪里有泥坑，哪里就有它。洗完澡最多干净五分钟，然后又是一身泥点子，还笑得特别开心。",
    "porky.1.description": "圆眼镜、巫师帽，外加一本谁也看不懂的魔法书。山庄里谁遇到难题，都会先去找它想办法。",
    "porky.2.description": "走到哪儿都顶着西瓜帽，又凉快又好看。别的小猪怎么闹她都不急，淡定得像个瓜。",
    "porky.3.description": "耳机一戴，谁也不爱。嘴上说着“打完这把就睡”，这句话今晚已经说了六遍。",
    "porky.4.description": "围着红格子小围巾，说话轻声细气，开饭前会先把蹄子并拢。全票当选山庄最乖。",
    "porky.5.description": "山庄里个头最大、力气也最大的一只，肩上总搭着一条白毛巾。爱举铁，爱吃牛肉，扛着二十斤的水走路都不带喘的，睡觉还要占掉半张毯子。别看一身肌肉，脾气其实最好，谁都可以靠着他打盹。",
    "porky.6.description": "不是在睡觉，就是在去睡觉的路上，星星被子从不离身。能把它叫醒的只有一句话：开饭了。",
    "porky.7.description": "脑门上顶着个“呆”字，金链子配连帽衫，看着很不好惹。其实胆子小、性子急，是火锅十级选手，还特别黏一棵叫白白菜的白菜。",
    "porky.8.description": "麦克风从不离手，话比歌还多。山庄大大小小的新闻，都是它第一个播报的。",
    "porky.9.description": "耳边别着红玫瑰，见谁都抛个媚眼。自封山庄头号万人迷，目前还没有猪出来反对。",
    "porky.10.description": "脸上永远沾着一点酱汁。开饭第一个到，收桌最后一个走，路过厨房还要再“检查”一下。",
    "porky.11.description": "山庄里个头最小、本事最大的一只。寿喜烧是她做的，星星灯是她挂的，小汽车也是她开的。忙完一圈，转眼又窝进最软的垫子里不见了。",
    "porky.12.description": "每次洗澡都带着小黄鸭，洗完却好像更臭了。它管这个叫“有个性”。",
    "porky.13.description": "泡泡浴、小香水、波点蝴蝶结，出门前至少要打扮半小时。平时很在意身材，吃火锅的时候除外。",
    "porky.14.description": "头巾一扎、围裙一系，鸡毛掸子就停不下来。坚持碗要当天洗，三十秒还能洗干净一只小猪。",
    "villa.eyebrow": "山庄生活",
    "villa.title": "有温泉，有蘑菇塔，还有晒不完的太阳。",
    "villa.paragraph.0": "主屋上下两层，一整面玻璃对着草地；旁边的温泉整天冒着热气，草地上还立着一座圆圆的蘑菇塔。这里算不上豪华，但每个角落都软乎乎的，走到哪儿都能躺下睡一觉。",
    "villa.paragraph.1": "蘑菇塔的顶楼是看星星的地方，灯一关，整条银河就亮了。想亲自逛一圈的话，山庄的 3D 地图随时开着门。",
    "villa.rhythm.0.title": "早晨",
    "villa.rhythm.0.body": "勤劳猪第一个起床擦窗户，懒蛋猪翻了个身，把星星被子又裹紧了一点。",
    "villa.rhythm.1.title": "下午",
    "villa.rhythm.1.body": "泡完温泉，去草地上把自己晒干。十三个差不多大的午睡团子，整整齐齐排成一排。",
    "villa.rhythm.2.title": "夜晚",
    "villa.rhythm.2.body": "先吃火锅，再点名，然后爬上蘑菇塔看星星，一直看到有猪开始打呼噜。",
    "nav.notes": "小记",
    "notes.eyebrow": "猪猪小记",
    "notes.title": "山庄的小本子，想到什么记什么。",
    "notes.text": "今天吃了什么，谁又闯了祸，谁在想谁，都写在这里。",
    "notes.readMore": "读全文",
    "notes.viewAll": "看全部小记",
    "footer.text": "猪猪山庄，十五只小猪都在，一只不少。",
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
      const key = ["nav.story", "nav.porkies", "nav.villa", "nav.notes"][index];
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
      label: labels?.regular || "about the same size",
      key: "stats.regular"
    },
    { value: counts.giant, label: labels?.giant || "gentle giant", key: "stats.giant" },
    { value: counts.tiny, label: labels?.tiny || "pocket-size porky", key: "stats.tiny" }
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

export function renderSite(site, notes = []) {
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
                <span${i18nAttribute("hero.secondaryCtaLabel")}>${escapeHtml(hero.secondaryCtaLabel || "Tour the villa")}</span>
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
            <h2${i18nAttribute("nameParade.title")}>Oink when you hear your name.</h2>
            <p${i18nAttribute("nameParade.text")}>
              Fifteen names, each one earned. Read them out fast and you get a
              tongue twister.
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

        ${renderNotesTeaser(notes)}
      </main>

      <footer class="site-footer">
        <p${i18nAttribute("footer.text")}>${escapeHtml(site?.footerText || "")}</p>
        <div class="footer-links">
          <a href="${LIVE_EDITOR_URL}" rel="nofollow"${i18nAttribute("footer.manage")}>Manage content</a>
          <a href="${REPOSITORY_URL}" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>
    </div>
    ${renderLanguageScript()}
  `;
}
