(function () {
  "use strict";

  var MENU = null;
  var CONFIG = null;
  var STORAGE_KEY = "kf-lang";
  var LANGS = ["et", "en"];

  var STRINGS = {
    et: {
      skip: "Liigu sisu juurde",
      "nav.menu": "Menüü",
      "nav.opening": "Avamine",
      "nav.about": "Meist",
      "nav.visit": "Asukoht",
      "nav.toggle": "Ava menüü",
      "nav.close": "Sulge menüü",
      service: "Avatud siin & kaasa",
      "hero.eyebrow": "Premium kiirtoit · Nõmme, Tallinn",
      "hero.tagline": "Koge premium-kiirtoidu kuninglikku maitset",
      "hero.cta_menu": "Vaata menüüd",
      "hero.cta_order": "Telli kohe",
      "hero.cta_ask": "Küsi assistendilt",
      "menu.add": "Lisa",
      "hero.call": "Või helista",
      "hero.cta_directions": "Juhised kohale",
      "menu.eyebrow": "Meie menüü",
      "menu.title": "Kuninglik valik",
      "menu.note": "Hinnad eurodes, sisaldavad käibemaksu.",
      "menu.featured": "Lemmik",
      "menu.choice": "valikus",
      "menu.error": "Menüüd ei õnnestunud laadida. Palun värskendage lehte.",
      "opening.eyebrow": "Suur avamine",
      "opening.title": "Olete südamest oodatud suurejoonelisele avapeole",
      "opening.venue": "Toimumiskoht",
      "opening.welcome": "Ootame teid rõõmuga!",
      "opening.alt": "King's Foodi suure avamise kutse",
      "about.eyebrow": "Meist",
      "about.title": "Kiirtoit, mis on valmistatud nagu kuningale",
      "about.lead": "King's Food toob Nõmmele premium-kiirtoidu: mahlane kana kintsuliha kebab, krõbe kana, kuldne fish & chips ja magus lõpp. Söö kohapeal või võta kaasa.",
      "about.f1_title": "Shaurma & kebab",
      "about.f1_text": "Kana kintsuliha kebab tortillas või boxis, värske salati ja kastmega.",
      "about.f2_title": "Boxid & burgerid",
      "about.f2_text": "Vali lisandiks frii või riis. Burger või kebabburger — sinu otsus.",
      "about.f3_title": "Magus lõpp",
      "about.f3_text": "Pahlava ja jäätisekokteil vaniljejäätisest ploomi või mangoga.",
      "visit.eyebrow": "Külasta meid",
      "visit.title": "Asukoht & lahtiolekuajad",
      "visit.address": "Aadress",
      "visit.hours": "Lahtiolekuajad",
      "visit.hours_soon": "Lahtiolekuajad avaldame peagi.",
      "visit.closed": "Suletud",
      "visit.contact": "Kontakt",
      "visit.delivery": "Kojuvedu",
      "footer.rights": "Kõik õigused kaitstud.",
      days: { mon: "Esmaspäev", tue: "Teisipäev", wed: "Kolmapäev", thu: "Neljapäev", fri: "Reede", sat: "Laupäev", sun: "Pühapäev" }
    },
    en: {
      skip: "Skip to content",
      "nav.menu": "Menu",
      "nav.opening": "Opening",
      "nav.about": "About",
      "nav.visit": "Visit",
      "nav.toggle": "Open menu",
      "nav.close": "Close menu",
      service: "Eat in & takeaway",
      "hero.eyebrow": "Premium fast food · Nõmme, Tallinn",
      "hero.tagline": "Experience the Royal taste of Premium Fast Food",
      "hero.cta_menu": "View menu",
      "hero.cta_order": "Order now",
      "hero.cta_ask": "Ask the assistant",
      "menu.add": "Add",
      "hero.call": "Or call",
      "hero.cta_directions": "Get directions",
      "menu.eyebrow": "Our menu",
      "menu.title": "The Royal Selection",
      "menu.note": "Prices in euros, VAT included.",
      "menu.featured": "Favourite",
      "menu.choice": "choice of",
      "menu.error": "The menu could not be loaded. Please refresh the page.",
      "opening.eyebrow": "Grand opening",
      "opening.title": "You are cordially invited to the Grand Celebration",
      "opening.venue": "Venue",
      "opening.welcome": "We look forward to welcoming you!",
      "opening.alt": "King's Food grand opening invitation",
      "about.eyebrow": "About us",
      "about.title": "Fast food, made fit for a king",
      "about.lead": "King's Food brings premium fast food to Nõmme: juicy chicken thigh kebab, crispy chicken, golden fish & chips and a sweet finish. Eat in or take away.",
      "about.f1_title": "Shaurma & kebab",
      "about.f1_text": "Chicken thigh kebab in a tortilla or a box, with fresh salad and sauce.",
      "about.f2_title": "Boxes & burgers",
      "about.f2_text": "Choose fries or rice on the side. Burger or kebab burger — your call.",
      "about.f3_title": "A sweet finish",
      "about.f3_text": "Baklava and an ice cream shake: vanilla ice cream with plum or mango.",
      "visit.eyebrow": "Visit us",
      "visit.title": "Location & opening hours",
      "visit.address": "Address",
      "visit.hours": "Opening hours",
      "visit.hours_soon": "Opening hours will be announced soon.",
      "visit.closed": "Closed",
      "visit.contact": "Contact",
      "visit.delivery": "Delivery",
      "footer.rights": "All rights reserved.",
      days: { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" }
    }
  };

  var LOCALES = { et: "et-EE", en: "en-IE" };
  var DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  var currentLang = "et";

  // ---------- helpers ----------

  function t(key) {
    var s = STRINGS[currentLang][key];
    return s === undefined ? STRINGS.et[key] : s;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function local(field) {
    if (!field) return "";
    return field[currentLang] || field.et || "";
  }

  function formatPrice(cents) {
    return new Intl.NumberFormat(LOCALES[currentLang], {
      style: "currency",
      currency: MENU.currency,
      minimumFractionDigits: 2
    }).format(cents / 100);
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  // ---------- menu ----------

  // One price when all variants cost the same, otherwise "7,00 € / 9,00 €".
  function priceLabel(item) {
    var prices = item.variants.map(function (v) { return v.price; });
    var unique = prices.filter(function (p, i) { return prices.indexOf(p) === i; });
    return unique.map(formatPrice).join(" / ");
  }

  function renderItem(item) {
    var li = el("li", "menu-item" + (item.featured ? " is-featured" : ""));
    li.id = "item-" + item.id;

    var row = el("div", "menu-item-row");
    var name = el("h4", "menu-item-name", local(item.name));
    if (item.featured) name.appendChild(el("span", "menu-tag", t("menu.featured")));
    row.appendChild(name);
    row.appendChild(el("span", "menu-leader"));
    row.appendChild(el("span", "menu-price", priceLabel(item)));
    var add = el("button", "menu-add");
    add.type = "button";
    add.innerHTML = '<span aria-hidden="true">+</span>';
    add.appendChild(el("span", "menu-add-text", " " + t("menu.add")));
    add.setAttribute("data-add", item.id);
    add.setAttribute("aria-label", t("menu.add") + ": " + local(item.name));
    row.appendChild(add);
    li.appendChild(row);

    if (item.description) {
      li.appendChild(el("p", "menu-desc", local(item.description)));
    }

    var prices = item.variants.map(function (v) { return v.price; });
    var mixedPrices = prices.some(function (p) { return p !== prices[0]; });
    var describedVariants = item.variants.some(function (v) { return v.description; });

    if (describedVariants) {
      // e.g. Burger / Kebab burger: each variant has its own contents.
      var ul = el("ul", "menu-variants");
      item.variants.forEach(function (v) {
        var vli = el("li");
        vli.appendChild(el("strong", null, local(v.name)));
        vli.appendChild(document.createTextNode(" — " + local(v.description)));
        ul.appendChild(vli);
      });
      li.appendChild(ul);
    } else if (item.variants.length > 1) {
      // e.g. Small / Large with prices, or flavours at one price.
      var parts = item.variants.map(function (v) {
        return mixedPrices ? local(v.name) + " " + formatPrice(v.price) : local(v.name);
      });
      var prefix = mixedPrices ? "" : t("menu.choice") + ": ";
      li.appendChild(el("p", "menu-variant-line", prefix + parts.join(" · ")));
    }

    return li;
  }

  function renderMenu() {
    var root = document.getElementById("menu-list");
    if (!root || !MENU) return;
    root.textContent = "";

    MENU.categories.forEach(function (cat) {
      var items = MENU.items.filter(function (i) { return i.category === cat.id && i.available !== false; });
      if (!items.length) return;

      var section = el("section", "menu-group");
      section.setAttribute("aria-labelledby", "cat-" + cat.id);
      var h = el("h3", "menu-group-title", local(cat.name));
      h.id = "cat-" + cat.id;
      section.appendChild(h);

      var list = el("ul", "menu-items");
      items.forEach(function (item) { list.appendChild(renderItem(item)); });
      section.appendChild(list);
      root.appendChild(section);
    });
  }

  // ---------- business details ----------

  function renderHours() {
    var root = document.getElementById("hours");
    if (!root || !CONFIG) return;
    root.textContent = "";
    var hours = CONFIG.hours || {};
    var days = DAY_ORDER.filter(function (d) { return hours[d]; });

    if (!days.length) {
      root.appendChild(el("p", "muted", t("visit.hours_soon")));
      return;
    }

    var dl = el("dl", "hours-list");
    days.forEach(function (d) {
      var v = hours[d];
      dl.appendChild(el("dt", null, STRINGS[currentLang].days[d]));
      dl.appendChild(el("dd", null, v === "closed" ? t("visit.closed") : v[0] + "–" + v[1]));
    });
    root.appendChild(dl);
  }

  function renderContact() {
    var list = document.getElementById("contact-list");
    var block = document.getElementById("contact-block");
    if (!list || !block) return;
    list.textContent = "";

    if (CONFIG.phone) {
      var a = el("a", null, CONFIG.phone);
      a.href = "tel:" + CONFIG.phone.replace(/[^\d+]/g, "");
      list.appendChild(el("li")).appendChild(a);
    }
    if (CONFIG.email) {
      var m = el("a", null, CONFIG.email);
      m.href = "mailto:" + CONFIG.email;
      list.appendChild(el("li")).appendChild(m);
    }
    block.hidden = !list.children.length;
  }

  function renderLinks(rootId, links, blockId, className) {
    var root = document.getElementById(rootId);
    if (!root) return;
    root.textContent = "";
    Object.keys(links).forEach(function (key) {
      var link = links[key];
      if (!link.url) return;
      var a = el("a", className, link.label);
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener";
      if (root.tagName === "UL") {
        root.appendChild(el("li")).appendChild(a);
      } else {
        root.appendChild(a);
      }
    });
    var target = document.getElementById(blockId || rootId);
    target.hidden = !root.children.length;
  }

  function renderSocialAndDelivery() {
    var s = CONFIG.social || {};
    renderLinks("social-links", {
      instagram: { url: s.instagram, label: "Instagram" },
      facebook: { url: s.facebook, label: "Facebook" },
      tiktok: { url: s.tiktok, label: "TikTok" }
    });

    var d = CONFIG.delivery || {};
    renderLinks("delivery-links", {
      wolt: { url: d.wolt, label: "Wolt" },
      bolt: { url: d.bolt, label: "Bolt Food" }
    }, "delivery-block", "btn btn-gold btn-small");
  }

  // ---------- language ----------

  function applyLanguage(lang) {
    if (LANGS.indexOf(lang) === -1) lang = "et";
    currentLang = lang;
    document.documentElement.lang = lang;

    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      node.textContent = t(node.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (node) {
      node.alt = t(node.getAttribute("data-i18n-alt"));
    });
    document.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-lang") === lang));
    });

    renderMenu();
    renderHours();
    syncNavToggleLabel();
    document.dispatchEvent(new CustomEvent("kf:lang", { detail: { lang: lang } }));
  }

  function initialLanguage() {
    var saved = storageGet(STORAGE_KEY);
    if (LANGS.indexOf(saved) !== -1) return saved;
    var browser = (navigator.language || "et").slice(0, 2).toLowerCase();
    return browser === "et" ? "et" : "en";
  }

  // ---------- navigation ----------

  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");

  function syncNavToggleLabel() {
    if (!toggle) return;
    var open = header.classList.contains("nav-open");
    toggle.querySelector(".sr-only").textContent = t(open ? "nav.close" : "nav.toggle");
  }

  function setNav(open) {
    header.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    syncNavToggleLabel();
  }

  function initNav() {
    if (!toggle) return;
    toggle.addEventListener("click", function () {
      setNav(!header.classList.contains("nav-open"));
    });
    document.querySelectorAll("#site-nav a").forEach(function (a) {
      a.addEventListener("click", function () { setNav(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && header.classList.contains("nav-open")) {
        setNav(false);
        toggle.focus();
      }
    });

    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // ---------- init ----------

  document.querySelectorAll("[data-lang]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var lang = btn.getAttribute("data-lang");
      storageSet(STORAGE_KEY, lang);
      applyLanguage(lang);
    });
  });

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  initNav();
  applyLanguage(initialLanguage());

  function loadJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error(url + " " + res.status);
      return res.json();
    });
  }

  Promise.all([loadJSON("assets/data/menu.json"), loadJSON("assets/data/site.json")])
    .then(function (data) {
      MENU = data[0];
      CONFIG = data[1];
      window.KF_MENU = MENU;
      window.KF_CONFIG = CONFIG;
      renderContact();
      renderSocialAndDelivery();
      applyLanguage(currentLang);
      document.dispatchEvent(new CustomEvent("kf:ready"));
    })
    .catch(function (err) {
      console.error("Could not load menu", err);
      var root = document.getElementById("menu-list");
      if (root) root.textContent = t("menu.error");
    });
})();
