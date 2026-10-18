/*
 * King's Food — AI ordering assistant (chat + voice).
 *
 * Talks to /api/chat. Voice uses the browser's built-in speech recognition
 * and speech synthesis, so no audio leaves the device except as text.
 */
(function () {
  "use strict";

  var ENDPOINT = "/api/chat";
  var SESSION_KEY = "kf-chat-v1";

  var STRINGS = {
    et: {
      launcher: "Telli vestluses",
      title: "King's Food",
      subtitle: "AI-assistent · kirjuta või räägi",
      greeting: "Tere tulemast King's Foodi! Mida soovite täna tellida? Võite kirjutada või vajutada mikrofoni ja rääkida.",
      placeholder: "Kirjuta sõnum…",
      send: "Saada",
      mic: "Räägi",
      micStop: "Lõpeta kuulamine",
      listening: "Kuulan…",
      close: "Sulge vestlus",
      reset: "Alusta uut vestlust",
      speakOn: "Loe vastused ette: sees",
      speakOff: "Loe vastused ette: väljas",
      handsFreeOn: "Käed-vabad vestlus: sees",
      handsFreeOff: "Käed-vabad vestlus: väljas",
      thinking: "Assistent kirjutab…",
      chips: ["Näita menüüd", "Soovin tellida", "Kus te asute?"],
      orderTitle: "Tellimus vastu võetud",
      orderNumber: "Tellimuse number",
      total: "Kokku",
      takeaway: "Kaasa",
      eat_in: "Kohapeal",
      orderHint: "Näidake numbrit letis.",
      errNotConfigured: "Vestlusega tellimine pole veel aktiveeritud. Palun helistage meile: ",
      errBusy: "Assistent on hetkel hõivatud. Proovige mõne hetke pärast uuesti või helistage: ",
      errFailed: "Midagi läks valesti. Proovige uuesti või helistage: ",
      errNetwork: "Ühendus katkes. Kontrollige internetiühendust ja proovige uuesti.",
      errReset: "Alustasin uue vestluse. Palun korrake oma viimast soovi.",
      errRefused: "Selle küsimusega ma aidata ei saa. Küsige julgelt menüü või tellimuse kohta.",
      errTooLong: "Vestlus läks liiga pikaks. Alustasin uue vestluse, palun jätkake.",
      micBlocked: "Mikrofoni kasutamine on keelatud. Lubage see brauseri seadetes või kirjutage sõnum.",
      micNoSpeech: "Ma ei kuulnud midagi. Proovige uuesti.",
      noVoice: "Teie seadmel pole eestikeelset häält, seega kuvan vastused ainult tekstina.",
      callUs: "Helista"
    },
    en: {
      launcher: "Order by chat",
      title: "King's Food",
      subtitle: "AI assistant · type or talk",
      greeting: "Welcome to King's Food! What would you like to order today? You can type, or tap the microphone and talk.",
      placeholder: "Type a message…",
      send: "Send",
      mic: "Talk",
      micStop: "Stop listening",
      listening: "Listening…",
      close: "Close chat",
      reset: "Start a new conversation",
      speakOn: "Read replies aloud: on",
      speakOff: "Read replies aloud: off",
      handsFreeOn: "Hands-free conversation: on",
      handsFreeOff: "Hands-free conversation: off",
      thinking: "Assistant is typing…",
      chips: ["Show the menu", "I'd like to order", "Where are you?"],
      orderTitle: "Order received",
      orderNumber: "Order number",
      total: "Total",
      takeaway: "Takeaway",
      eat_in: "Eat in",
      orderHint: "Show this number at the counter.",
      errNotConfigured: "Chat ordering is not switched on yet. Please call us: ",
      errBusy: "The assistant is busy right now. Try again in a moment or call: ",
      errFailed: "Something went wrong. Please try again or call: ",
      errNetwork: "Connection lost. Check your internet connection and try again.",
      errReset: "I started a new conversation. Please repeat your last request.",
      errRefused: "I can't help with that. Ask me anything about the menu or your order.",
      errTooLong: "The conversation got too long, so I started a new one. Please continue.",
      micBlocked: "Microphone access is blocked. Allow it in your browser settings, or type your message.",
      micNoSpeech: "I didn't hear anything. Please try again.",
      noVoice: "Your device has no English voice, so replies are shown as text only.",
      callUs: "Call"
    }
  };

  var SPEECH_LANG = { et: "et-EE", en: "en-GB" };
  var PHONE_FALLBACK = "+372 5559 2222";

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var canListen = !!SpeechRecognition;
  var canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  var state = {
    lang: document.documentElement.lang === "en" ? "en" : "et",
    history: [],
    log: [], // what the customer sees: {from, text} or {order}
    busy: false,
    open: false,
    speak: false,
    handsFree: false,
    listening: false,
    lastInputVoice: false,
    noVoiceNoticeShown: {}
  };

  var recognition = null;
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
      mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
      speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
      loop: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M20 4v5h-5M4 20v-5h5"/>',
      reset: '<path d="M4 4v6h6"/><path d="M5 10a8 8 0 1 1-1 5"/>',
      phone: '<path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2z"/>'
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
          '<button type="button" class="kf-icon-btn" data-act="speak" aria-pressed="false">' + icon("speaker") + "</button>" +
          '<button type="button" class="kf-icon-btn" data-act="handsfree" aria-pressed="false">' + icon("loop") + "</button>" +
          '<button type="button" class="kf-icon-btn" data-act="reset">' + icon("reset") + "</button>" +
          '<button type="button" class="kf-icon-btn" data-act="close">' + icon("close") + "</button>" +
        "</div>" +
      "</header>" +
      '<div class="kf-chat-log" role="log" aria-live="polite"></div>' +
      '<div class="kf-chat-chips"></div>' +
      '<form class="kf-chat-form" novalidate>' +
        '<label class="sr-only" for="kf-chat-input"></label>' +
        '<textarea id="kf-chat-input" rows="1" maxlength="1000" autocomplete="off"></textarea>' +
        '<button type="button" class="kf-icon-btn kf-mic" data-act="mic" aria-pressed="false">' + icon("mic") + "</button>" +
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
    els.mic = panel.querySelector('[data-act="mic"]');
    els.speak = panel.querySelector('[data-act="speak"]');
    els.handsFree = panel.querySelector('[data-act="handsfree"]');

    if (!canListen) {
      els.mic.hidden = true;
      els.handsFree.hidden = true;
    }
    if (!canSpeak) els.speak.hidden = true;

    panel.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      if (act === "close") setOpen(false);
      else if (act === "reset") resetConversation();
      else if (act === "mic") toggleListening();
      else if (act === "speak") setSpeak(!state.speak);
      else if (act === "handsfree") setHandsFree(!state.handsFree);
    });

    els.form.addEventListener("submit", function (e) {
      e.preventDefault();
      submit(els.input.value, false);
    });

    els.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit(els.input.value, false);
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
    els.input.placeholder = state.listening ? t("listening") : t("placeholder");
    els.panel.querySelector(".kf-send").setAttribute("aria-label", t("send"));
    els.panel.querySelector('[data-act="close"]').setAttribute("aria-label", t("close"));
    els.panel.querySelector('[data-act="reset"]').setAttribute("aria-label", t("reset"));
    els.mic.setAttribute("aria-label", state.listening ? t("micStop") : t("mic"));
    els.speak.setAttribute("aria-label", state.speak ? t("speakOn") : t("speakOff"));
    els.speak.title = els.speak.getAttribute("aria-label");
    els.handsFree.setAttribute("aria-label", state.handsFree ? t("handsFreeOn") : t("handsFreeOff"));
    els.handsFree.title = els.handsFree.getAttribute("aria-label");
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
      b.addEventListener("click", function () { submit(label, false); });
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
      var msg = el("div", "kf-msg " + (entry.from === "user" ? "kf-msg-user" : entry.from === "error" ? "kf-msg-error" : "kf-msg-bot"));
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
      stopListening();
      if (canSpeak) window.speechSynthesis.cancel();
      els.launcher.focus();
    }
  }

  function setSpeak(on) {
    state.speak = on && canSpeak;
    els.speak.setAttribute("aria-pressed", String(state.speak));
    if (!state.speak && canSpeak) window.speechSynthesis.cancel();
    applyTexts();
  }

  function setHandsFree(on) {
    state.handsFree = on && canListen;
    els.handsFree.setAttribute("aria-pressed", String(state.handsFree));
    if (state.handsFree) {
      setSpeak(true);
      if (!state.busy) startListening();
    } else {
      stopListening();
    }
    applyTexts();
  }

  function resetConversation() {
    if (canSpeak) window.speechSynthesis.cancel();
    stopListening();
    state.history = [];
    state.log = [];
    save();
    renderLog();
    els.input.focus();
  }

  // ---------- talking to the assistant ----------

  function errorEntry(code) {
    var map = {
      not_configured: { text: t("errNotConfigured") + phone(), call: true },
      busy: { text: t("errBusy") + phone(), call: true },
      network: { text: t("errNetwork") }
    };
    return Object.assign({ from: "error" }, map[code] || { text: t("errFailed") + phone(), call: true });
  }

  function submit(raw, viaVoice) {
    var text = String(raw || "").trim();
    if (!text || state.busy) return;
    els.input.value = "";
    autosize();
    stopListening();
    if (canSpeak) window.speechSynthesis.cancel();
    state.lastInputVoice = viaVoice;
    if (viaVoice && !state.speak) setSpeak(true);

    push({ from: "user", text: text });
    setBusy(true);

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        history: state.history,
        text: text,
        lang: state.lang,
        channel: viaVoice ? "voice" : "chat"
      })
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
          return;
        }
        if (r.status === 200) {
          state.history = Array.isArray(data.history) ? data.history : [];
          var reply = data.reply || "";
          if (reply) {
            push({ from: "bot", text: reply });
            say(reply);
          } else {
            push(errorEntry("failed"));
          }
          return;
        }
        if (r.status === 409) {
          state.history = [];
          push({ from: "error", text: t("errReset") });
          return;
        }
        if (r.status === 413) {
          state.history = [];
          push({ from: "error", text: t("errTooLong") });
          return;
        }
        if (r.status === 429) {
          push(errorEntry("busy"));
          return;
        }
        push(errorEntry(data.error));
      })
      .catch(function () {
        push(errorEntry("network"));
      })
      .then(function () {
        setBusy(false);
        save();
        // While a reply is being read aloud, listening resumes when it ends.
        var talking = canSpeak && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
        if (!talking) maybeListenAgain();
      });
  }

  // ---------- voice ----------

  function pickVoice() {
    if (!canSpeak) return null;
    var want = SPEECH_LANG[state.lang].toLowerCase();
    var prefix = want.slice(0, 2);
    var voices = window.speechSynthesis.getVoices();
    return (
      voices.find(function (v) { return v.lang.toLowerCase().replace("_", "-") === want; }) ||
      voices.find(function (v) { return v.lang.toLowerCase().indexOf(prefix) === 0; }) ||
      null
    );
  }

  function say(text) {
    if (!state.speak || !canSpeak) return;
    var voice = pickVoice();
    if (!voice) {
      if (!state.noVoiceNoticeShown[state.lang]) {
        state.noVoiceNoticeShown[state.lang] = true;
        push({ from: "error", text: t("noVoice") });
      }
      maybeListenAgain();
      return;
    }
    var u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 1;
    u.onend = maybeListenAgain;
    u.onerror = maybeListenAgain;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function maybeListenAgain() {
    if (state.handsFree && state.open && !state.busy) startListening();
  }

  function setListening(on) {
    state.listening = on;
    els.mic.classList.toggle("is-listening", on);
    els.mic.setAttribute("aria-pressed", String(on));
    applyTexts();
  }

  function toggleListening() {
    if (state.listening) stopListening();
    else startListening();
  }

  function startListening() {
    if (!canListen || state.listening || state.busy) return;
    if (canSpeak) window.speechSynthesis.cancel();

    recognition = new SpeechRecognition();
    recognition.lang = SPEECH_LANG[state.lang];
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    var finalText = "";
    var heardSomething = false;

    recognition.onresult = function (e) {
      var interim = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      heardSomething = true;
      els.input.value = (finalText + " " + interim).trim();
      autosize();
    };

    recognition.onerror = function (e) {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setHandsFree(false);
        push({ from: "error", text: t("micBlocked") });
      } else if (e.error === "no-speech" && !state.handsFree) {
        push({ from: "error", text: t("micNoSpeech") });
      }
    };

    recognition.onend = function () {
      recognition = null;
      setListening(false);
      var text = (finalText || (heardSomething ? els.input.value : "")).trim();
      if (text) submit(text, true);
      else if (state.handsFree) setHandsFree(false);
    };

    try {
      recognition.start();
      setListening(true);
    } catch (err) {
      recognition = null;
      setListening(false);
    }
  }

  function stopListening() {
    if (recognition) {
      try { recognition.stop(); } catch (e) { /* already stopped */ }
    }
  }

  // ---------- init ----------

  restore();
  build();
  applyTexts();

  document.addEventListener("kf:lang", function (e) {
    state.lang = e.detail.lang === "en" ? "en" : "et";
    applyTexts();
  });

  if (canSpeak) {
    // Voices load asynchronously in some browsers.
    window.speechSynthesis.getVoices();
  }
})();
