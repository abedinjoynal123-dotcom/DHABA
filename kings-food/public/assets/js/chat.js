/*
 * King's Food — AI assistant chat (text only).
 *
 * Talks to /api/chat. Customers can ask questions or order by chat; the
 * order form on the page is the other way to order.
 */
(function () {
  "use strict";

  var ENDPOINT = "/api/chat";
  var SESSION_KEY = "kf-chat-v1";
  var PHONE_FALLBACK = "+372 5559 2222";

  var STRINGS = {
    et: {
      launcher: "Küsi assistendilt",
      title: "King's Food",
      subtitle: "AI-assistent · küsimused ja tellimused",
      greeting: "Tere tulemast King's Foodi! Küsige menüü kohta või kirjutage, mida soovite tellida.",
      placeholder: "Kirjuta sõnum…",
      send: "Saada",
      close: "Sulge vestlus",
      reset: "Alusta uut vestlust",
      thinking: "Assistent kirjutab…",
      chips: ["Näita menüüd", "Soovin tellida", "Kus te asute?"],
      orderTitle: "Tellimus vastu võetud",
      orderNumber: "Tellimuse number",
      total: "Kokku",
      takeaway: "Kaasa",
      eat_in: "Kohapeal",
      orderHint: "Näidake numbrit letis.",
      errNotConfigured: "Assistent pole hetkel saadaval. Tellige menüüst või helistage meile.",
      errBusy: "Assistent on hetkel hõivatud. Proovige mõne hetke pärast uuesti või helistage meile.",
      errFailed: "Midagi läks valesti. Proovige uuesti või helistage meile.",
      errNetwork: "Ühendus katkes. Kontrollige internetiühendust ja proovige uuesti.",
      errReset: "Alustasin uue vestluse. Palun korrake oma viimast soovi.",
      errRefused: "Selle küsimusega ma aidata ei saa. Küsige julgelt menüü või tellimuse kohta.",
      errTooLong: "Vestlus läks liiga pikaks. Alustasin uue vestluse, palun jätkake.",
      callUs: "Helista"
    },
    en: {
      launcher: "Ask the assistant",
      title: "King's Food",
      subtitle: "AI assistant · questions and orders",
      greeting: "Welcome to King's Food! Ask about the menu, or tell me what you'd like to order.",
      placeholder: "Type a message…",
      send: "Send",
      close: "Close chat",
      reset: "Start a new conversation",
      thinking: "Assistant is typing…",
      chips: ["Show the menu", "I'd like to order", "Where are you?"],
      orderTitle: "Order received",
      orderNumber: "Order number",
      total: "Total",
      takeaway: "Takeaway",
      eat_in: "Eat in",
      orderHint: "Show this number at the counter.",
      errNotConfigured: "The assistant isn't available right now. Order from the menu or give us a call.",
      errBusy: "The assistant is busy right now. Try again in a moment or give us a call.",
      errFailed: "Something went wrong. Please try again or give us a call.",
      errNetwork: "Connection lost. Check your internet connection and try again.",
      errReset: "I started a new conversation. Please repeat your last request.",
      errRefused: "I can't help with that. Ask me anything about the menu or your order.",
      errTooLong: "The conversation got too long, so I started a new one. Please continue.",
      callUs: "Call"
    }
  };

  var state = {
    lang: document.documentElement.lang === "en" ? "en" : "et",
    history: [],
    log: [], // what the customer sees: {from, text, call} or {order}
    busy: false,
    open: false
  };

  var els = {};

  // ---------- helpers ----------

  function t(key) {
    return STRINGS[state.lang][key];
  }

  function phone() {
    return (window.KF_CONFIG && window.KF_CONFIG.phone) || PHONE_FALLBACK;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function euro(cents) {
    return new Intl.NumberFormat(state.lang === "et" ? "et-EE" : "en-IE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2
    }).format(cents / 100);
  }

  function save() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ history: state.history, log: state.log }));
    } catch (e) { /* storage unavailable */ }
  }

  function restore() {
    try {
      var data = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      if (data && Array.isArray(data.history) && Array.isArray(data.log)) {
        state.history = data.history;
        state.log = data.log;
      }
    } catch (e) { /* storage unavailable */ }
  }

  function icon(name) {
    var paths = {
      chat: '<path d="M4 5h16v11H8l-4 4z"/>',
      close: '<path d="M6 6l12 12M18 6L6 18"/>',
      send: '<path d="M4 12l16-8-6 16-2-7z"/>',
      reset: '<path d="M4 4v6h6"/><path d="M5 10a8 8 0 1 1-1 5"/>'
    };
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + paths[name] + "</svg>";
  }

  // ---------- rendering ----------

  function build() {
    var launcher = el("button", "kf-chat-launcher");
    launcher.type = "button";
    launcher.setAttribute("aria-controls", "kf-chat");
    launcher.setAttribute("aria-expanded", "false");
    launcher.innerHTML = icon("chat") + '<span class="kf-chat-launcher-label"></span>';
    launcher.addEventListener("click", function () { setOpen(true); });

    var panel = el("section", "kf-chat");
    panel.id = "kf-chat";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "kf-chat-title");
    panel.innerHTML =
      '<header class="kf-chat-head">' +
        '<img src="assets/img/logo-256.webp" alt="" width="40" height="40">' +
        '<div class="kf-chat-titles"><h2 id="kf-chat-title"></h2><p class="kf-chat-sub"></p></div>' +
        '<div class="kf-chat-tools">' +
          '<button type="button" class="kf-icon-btn" data-act="reset">' + icon("reset") + "</button>" +
          '<button type="button" class="kf-icon-btn" data-act="close">' + icon("close") + "</button>" +
        "</div>" +
      "</header>" +
      '<div class="kf-chat-log" role="log" aria-live="polite"></div>' +
      '<div class="kf-chat-chips"></div>' +
      '<form class="kf-chat-form" novalidate>' +
        '<label class="sr-only" for="kf-chat-input"></label>' +
        '<textarea id="kf-chat-input" rows="1" maxlength="1000" autocomplete="off"></textarea>' +
        '<button type="submit" class="kf-icon-btn kf-send">' + icon("send") + "</button>" +
      "</form>";

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    els.launcher = launcher;
    els.panel = panel;
    els.log = panel.querySelector(".kf-chat-log");
    els.chips = panel.querySelector(".kf-chat-chips");
    els.form = panel.querySelector(".kf-chat-form");
    els.input = panel.querySelector("#kf-chat-input");

    panel.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      if (act === "close") setOpen(false);
      else if (act === "reset") resetConversation();
    });

    els.form.addEventListener("submit", function (e) {
      e.preventDefault();
      submit(els.input.value);
    });

    els.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit(els.input.value);
      }
    });
    els.input.addEventListener("input", autosize);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.open) setOpen(false);
    });

    document.querySelectorAll("[data-open-chat]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        setOpen(true);
      });
    });
  }

  function autosize() {
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 120) + "px";
  }

  function applyTexts() {
    els.launcher.querySelector(".kf-chat-launcher-label").textContent = t("launcher");
    els.launcher.setAttribute("aria-label", t("launcher"));
    els.panel.querySelector("#kf-chat-title").textContent = t("title");
    els.panel.querySelector(".kf-chat-sub").textContent = t("subtitle");
    els.panel.querySelector('label[for="kf-chat-input"]').textContent = t("placeholder");
    els.input.placeholder = t("placeholder");
    els.panel.querySelector(".kf-send").setAttribute("aria-label", t("send"));
    els.panel.querySelector('[data-act="close"]').setAttribute("aria-label", t("close"));
    els.panel.querySelector('[data-act="reset"]').setAttribute("aria-label", t("reset"));
    els.panel.querySelector('[data-act="reset"]').title = t("reset");
    renderLog();
  }

  function renderChips() {
    els.chips.textContent = "";
    var hasCustomerMessage = state.log.some(function (m) { return m.from === "user"; });
    els.chips.hidden = hasCustomerMessage;
    if (hasCustomerMessage) return;
    t("chips").forEach(function (label) {
      var b = el("button", "kf-chip", label);
      b.type = "button";
      b.addEventListener("click", function () { submit(label); });
      els.chips.appendChild(b);
    });
  }

  function orderCard(order) {
    var card = el("div", "kf-order");
    card.appendChild(el("p", "kf-order-title", t("orderTitle")));
    var num = el("p", "kf-order-number");
    num.appendChild(el("span", null, t("orderNumber")));
    num.appendChild(el("strong", null, order.number));
    card.appendChild(num);
    var ul = el("ul", "kf-order-lines");
    order.lines.forEach(function (l) {
      var li = el("li");
      var label = l.quantity + " × " + l.name + (l.variant ? " (" + l.variant + ")" : "") + (l.side ? ", " + l.side : "");
      li.appendChild(el("span", null, label));
      li.appendChild(el("span", null, euro(l.lineTotal)));
      ul.appendChild(li);
    });
    card.appendChild(ul);
    var total = el("p", "kf-order-total");
    total.appendChild(el("span", null, t("total") + " · " + t(order.service)));
    total.appendChild(el("strong", null, euro(order.total)));
    card.appendChild(total);
    card.appendChild(el("p", "kf-order-hint", t("orderHint")));
    return card;
  }

  function renderLog() {
    els.log.textContent = "";
    var greet = el("div", "kf-msg kf-msg-bot");
    greet.appendChild(el("p", null, t("greeting")));
    els.log.appendChild(greet);

    state.log.forEach(function (entry) {
      if (entry.order) {
        els.log.appendChild(orderCard(entry.order));
        return;
      }
      var cls = entry.from === "user" ? "kf-msg-user" : entry.from === "error" ? "kf-msg-error" : "kf-msg-bot";
      var msg = el("div", "kf-msg " + cls);
      msg.appendChild(el("p", null, entry.text));
      if (entry.call) {
        var a = el("a", "kf-call", t("callUs") + " " + phone());
        a.href = "tel:" + phone().replace(/[^\d+]/g, "");
        msg.appendChild(a);
      }
      els.log.appendChild(msg);
    });

    if (state.busy) {
      var typing = el("div", "kf-msg kf-msg-bot kf-typing");
      typing.setAttribute("aria-label", t("thinking"));
      typing.innerHTML = "<span></span><span></span><span></span>";
      els.log.appendChild(typing);
    }

    renderChips();
    els.log.scrollTop = els.log.scrollHeight;
  }

  function push(entry) {
    state.log.push(entry);
    save();
    renderLog();
  }

  function setBusy(busy) {
    state.busy = busy;
    els.form.querySelector(".kf-send").disabled = busy;
    els.panel.setAttribute("aria-busy", String(busy));
    renderLog();
  }

  function setOpen(open) {
    state.open = open;
    els.panel.hidden = !open;
    els.launcher.hidden = open;
    els.launcher.setAttribute("aria-expanded", String(open));
    document.documentElement.classList.toggle("kf-chat-open", open);
    if (open) {
      renderLog();
      setTimeout(function () { els.input.focus(); }, 30);
    } else {
      els.launcher.focus();
    }
  }

  function resetConversation() {
    state.history = [];
    state.log = [];
    save();
    renderLog();
    els.input.focus();
  }

  // ---------- talking to the assistant ----------

  function errorEntry(code) {
    var map = {
      not_configured: { text: t("errNotConfigured"), call: true },
      busy: { text: t("errBusy"), call: true },
      network: { text: t("errNetwork") }
    };
    return Object.assign({ from: "error" }, map[code] || { text: t("errFailed"), call: true });
  }

  function submit(raw) {
    var text = String(raw || "").trim();
    if (!text || state.busy) return;
    els.input.value = "";
    autosize();

    push({ from: "user", text: text });
    setBusy(true);

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history: state.history, text: text, lang: state.lang, channel: "chat" })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (r) {
        var data = r.data || {};
        if (data.order) push({ order: data.order });

        if (r.status === 200 && data.notice === "refused") {
          state.history = [];
          push({ from: "bot", text: t("errRefused") });
        } else if (r.status === 200) {
          state.history = Array.isArray(data.history) ? data.history : [];
          push(data.reply ? { from: "bot", text: data.reply } : errorEntry("failed"));
        } else if (r.status === 409) {
          state.history = [];
          push({ from: "error", text: t("errReset") });
        } else if (r.status === 413) {
          state.history = [];
          push({ from: "error", text: t("errTooLong") });
        } else if (r.status === 429) {
          push(errorEntry("busy"));
        } else {
          push(errorEntry(data.error));
        }
      })
      .catch(function () {
        push(errorEntry("network"));
      })
      .then(function () {
        setBusy(false);
        save();
      });
  }

  // ---------- init ----------

  restore();
  build();
  applyTexts();

  document.addEventListener("kf:lang", function (e) {
    state.lang = e.detail.lang === "en" ? "en" : "et";
    applyTexts();
  });
})();
