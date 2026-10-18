/*
 * King's Food — order form: add from the menu, cart, checkout.
 *
 * Sends orders to /api/checkout. The server prices every order from
 * menu.json, so totals shown here are for display only.
 */
(function () {
  "use strict";

  var ENDPOINT = "/api/checkout";
  var CART_KEY = "kf-cart-v1";
  var PHONE_FALLBACK = "+372 5559 2222";

  var STRINGS = {
    et: {
      add: "Lisa",
      addTo: "Lisa tellimusse",
      size: "Suurus",
      choose: "Vali",
      side: "Lisand",
      quantity: "Kogus",
      less: "Vähem",
      more: "Rohkem",
      lineNote: "Soov (valikuline)",
      lineNotePh: "nt ilma sibulata",
      added: "Lisatud tellimusse",
      cart: "Teie tellimus",
      items: function (n) { return n === 1 ? "1 toode" : n + " toodet"; },
      checkout: "Vormista tellimus",
      remove: "Eemalda",
      empty: "Tellimus on tühi. Lisage tooteid menüüst.",
      total: "Kokku",
      name: "Nimi",
      phone: "Telefon",
      phoneHint: "Helistame ainult siis, kui tellimusega on küsimusi.",
      service: "Kuidas soovite?",
      takeaway: "Kaasa",
      eat_in: "Kohapeal",
      note: "Märkus tellimusele (valikuline)",
      send: "Saada tellimus",
      sending: "Saadan…",
      close: "Sulge",
      back: "Tagasi menüüsse",
      doneTitle: "Tellimus vastu võetud!",
      doneNumber: "Tellimuse number",
      doneHint: "Näidake numbrit letis.",
      payment: "Tasumine toimub tellimuse kättesaamisel.",
      newOrder: "Uus tellimus",
      errName: "Palun sisestage oma nimi.",
      errPhone: "Palun sisestage korrektne telefoninumber.",
      errService: "Palun valige, kas kaasa või kohapeal.",
      errClosed: "Hetkel tellimusi vastu ei võeta. ",
      errInvalid: "Tellimuses on viga. Palun kontrollige tooteid ja proovige uuesti.",
      errBusy: "Liiga palju katseid. Oodake minut ja proovige uuesti.",
      errFailed: "Tellimust ei õnnestunud saata. Proovige uuesti või helistage ",
      errNetwork: "Ühendus puudub. Kontrollige internetiühendust ja proovige uuesti."
    },
    en: {
      add: "Add",
      addTo: "Add to order",
      size: "Size",
      choose: "Choose",
      side: "Side",
      quantity: "Quantity",
      less: "Fewer",
      more: "More",
      lineNote: "Request (optional)",
      lineNotePh: "e.g. no onion",
      added: "Added to your order",
      cart: "Your order",
      items: function (n) { return n === 1 ? "1 item" : n + " items"; },
      checkout: "Check out",
      remove: "Remove",
      empty: "Your order is empty. Add items from the menu.",
      total: "Total",
      name: "Name",
      phone: "Phone",
      phoneHint: "We only call if there is a question about your order.",
      service: "How would you like it?",
      takeaway: "Takeaway",
      eat_in: "Eat in",
      note: "Note for the order (optional)",
      send: "Send order",
      sending: "Sending…",
      close: "Close",
      back: "Back to the menu",
      doneTitle: "Order received!",
      doneNumber: "Order number",
      doneHint: "Show this number at the counter.",
      payment: "Payment is made when you collect your order.",
      newOrder: "New order",
      errName: "Please enter your name.",
      errPhone: "Please enter a valid phone number.",
      errService: "Please choose takeaway or eat in.",
      errClosed: "We are not taking orders right now. ",
      errInvalid: "Something in the order is not right. Please check the items and try again.",
      errBusy: "Too many attempts. Please wait a minute and try again.",
      errFailed: "The order could not be sent. Please try again or call ",
      errNetwork: "No connection. Check your internet connection and try again."
    }
  };

  var lang = document.documentElement.lang === "en" ? "en" : "et";
  var MENU = null;
  var cart = loadCart();
  var choosing = null; // { item, variantId, side, quantity, note }
  var sending = false;
  var els = {};

  // ---------- helpers ----------

  function t(key) { return STRINGS[lang][key]; }
  function local(field) { return field ? field[lang] || field.et || "" : ""; }
  function phone() { return (window.KF_CONFIG && window.KF_CONFIG.phone) || PHONE_FALLBACK; }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function euro(cents) {
    return new Intl.NumberFormat(lang === "et" ? "et-EE" : "en-IE", {
      style: "currency", currency: "EUR", minimumFractionDigits: 2
    }).format(cents / 100);
  }

  function loadCart() {
    try {
      var data = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }

  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* storage unavailable */ }
  }

  function findItem(id) {
    return MENU && MENU.items.find(function (i) { return i.id === id && i.available !== false; });
  }

  function needsSide(item) { return !!(item.options && item.options.indexOf("side") !== -1); }

  function sideName(id) {
    var c = MENU.options.side.choices.find(function (x) { return x.id === id; });
    return c ? local(c.name) : "";
  }

  // Drops lines whose item or price no longer exists on the menu.
  function validLines() {
    return cart.filter(function (l) {
      var item = findItem(l.item_id);
      return item && item.variants.some(function (v) { return v.id === l.variant_id; });
    });
  }

  function linePrice(l) {
    var item = findItem(l.item_id);
    var v = item.variants.find(function (x) { return x.id === l.variant_id; });
    return v.price * l.quantity;
  }

  function lineLabel(l) {
    var item = findItem(l.item_id);
    var v = item.variants.find(function (x) { return x.id === l.variant_id; });
    var parts = [local(item.name)];
    if (item.variants.length > 1 && v.name) parts[0] += " (" + local(v.name) + ")";
    if (l.side) parts.push(sideName(l.side));
    return parts.join(", ");
  }

  function count() { return validLines().reduce(function (n, l) { return n + l.quantity; }, 0); }
  function total() { return validLines().reduce(function (s, l) { return s + linePrice(l); }, 0); }

  function addLine(line) {
    var same = cart.find(function (l) {
      return l.item_id === line.item_id && l.variant_id === line.variant_id && l.side === line.side && (l.note || "") === (line.note || "");
    });
    if (same) same.quantity = Math.min(20, same.quantity + line.quantity);
    else cart.push(line);
    saveCart();
    renderBar();
    toast(t("added") + ": " + lineLabel(line));
  }

  // ---------- building the UI ----------

  function build() {
    // Cart bar
    var bar = el("div", "kf-cartbar");
    bar.hidden = true;
    bar.innerHTML =
      '<div class="kf-cartbar-inner">' +
        '<span class="kf-cartbar-count"><span class="kf-cartbar-label"></span><span class="kf-cartbar-n"></span></span>' +
        '<strong class="kf-cartbar-total"></strong>' +
        '<button type="button" class="btn btn-gold kf-cartbar-btn"></button>' +
      "</div>";
    bar.querySelector("button").addEventListener("click", openCheckout);
    document.body.appendChild(bar);
    els.bar = bar;

    // Toast
    var toastEl = el("div", "kf-toast");
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    document.body.appendChild(toastEl);
    els.toast = toastEl;

    // Item chooser
    var chooser = el("dialog", "kf-dialog kf-chooser");
    chooser.setAttribute("aria-labelledby", "kf-chooser-title");
    chooser.innerHTML =
      '<form method="dialog" class="kf-dialog-body" id="kf-chooser-form" novalidate>' +
        '<header class="kf-dialog-head"><h2 id="kf-chooser-title"></h2>' +
        '<button type="button" class="kf-x" data-close aria-label=""><span aria-hidden="true">×</span></button></header>' +
        '<p class="kf-chooser-desc"></p>' +
        '<div class="kf-chooser-fields"></div>' +
        '<footer class="kf-dialog-foot"><button type="submit" class="btn btn-gold kf-chooser-add"></button></footer>' +
      "</form>";
    document.body.appendChild(chooser);
    els.chooser = chooser;
    chooser.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!choosing) return;
      addLine({
        item_id: choosing.item.id,
        variant_id: choosing.variantId,
        side: choosing.side,
        quantity: choosing.quantity,
        note: choosing.note.trim() || null
      });
      chooser.close();
    });

    // Checkout
    var checkout = el("dialog", "kf-dialog kf-checkout");
    checkout.setAttribute("aria-labelledby", "kf-checkout-title");
    checkout.innerHTML =
      '<div class="kf-dialog-body">' +
        '<header class="kf-dialog-head"><h2 id="kf-checkout-title"></h2>' +
        '<button type="button" class="kf-x" data-close aria-label=""><span aria-hidden="true">×</span></button></header>' +
        '<div class="kf-checkout-content"></div>' +
      "</div>";
    document.body.appendChild(checkout);
    els.checkout = checkout;

    [chooser, checkout].forEach(function (d) {
      d.addEventListener("click", function (e) {
        if (e.target === d || e.target.closest("[data-close]")) d.close();
      });
    });

    // Menu "Add" buttons are re-rendered with the menu, so listen on the list.
    var list = document.getElementById("menu-list");
    if (list) {
      list.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-add]");
        if (btn) onAdd(btn.getAttribute("data-add"));
      });
    }

    document.querySelectorAll("[data-open-cart]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        if (count()) { e.preventDefault(); openCheckout(); }
      });
    });
  }

  var toastTimer = null;
  function toast(text) {
    els.toast.textContent = text;
    els.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove("is-visible"); }, 2200);
  }

  function renderBar() {
    var n = count();
    els.bar.hidden = n === 0;
    document.documentElement.classList.toggle("kf-has-cart", n > 0);
    if (!n) return;
    els.bar.querySelector(".kf-cartbar-label").textContent = t("cart") + " · ";
    els.bar.querySelector(".kf-cartbar-n").textContent = t("items")(n);
    els.bar.querySelector(".kf-cartbar-total").textContent = euro(total());
    els.bar.querySelector(".kf-cartbar-btn").textContent = t("checkout");
  }

  // ---------- chooser ----------

  function onAdd(id) {
    var item = findItem(id);
    if (!item) return;
    if (item.variants.length === 1 && !needsSide(item)) {
      addLine({ item_id: item.id, variant_id: item.variants[0].id, side: null, quantity: 1, note: null });
      return;
    }
    choosing = { item: item, variantId: item.variants.length === 1 ? item.variants[0].id : null, side: null, quantity: 1, note: "" };
    renderChooser();
    els.chooser.showModal();
  }

  function radioGroup(name, legend, options, selected, onChange) {
    var fs = el("fieldset", "kf-choice");
    fs.appendChild(el("legend", null, legend));
    options.forEach(function (o) {
      var id = "kf-" + name + "-" + o.id;
      var label = el("label", "kf-choice-opt");
      label.setAttribute("for", id);
      var input = el("input");
      input.type = "radio";
      input.name = name;
      input.id = id;
      input.value = o.id;
      input.required = true;
      input.checked = o.id === selected;
      input.addEventListener("change", function () { onChange(o.id); });
      label.appendChild(input);
      label.appendChild(el("span", "kf-choice-name", o.label));
      if (o.extra) label.appendChild(el("span", "kf-choice-extra", o.extra));
      fs.appendChild(label);
    });
    return fs;
  }

  function renderChooser() {
    var c = choosing;
    var item = c.item;
    els.chooser.querySelector("#kf-chooser-title").textContent = local(item.name);
    els.chooser.querySelector("[data-close]").setAttribute("aria-label", t("close"));
    els.chooser.querySelector(".kf-chooser-desc").textContent = local(item.description);
    var fields = els.chooser.querySelector(".kf-chooser-fields");
    fields.textContent = "";

    if (item.variants.length > 1) {
      var samePrice = item.variants.every(function (v) { return v.price === item.variants[0].price; });
      fields.appendChild(radioGroup("variant", samePrice ? t("choose") : t("size"), item.variants.map(function (v) {
        return { id: v.id, label: local(v.name), extra: v.description ? local(v.description) : samePrice ? null : euro(v.price) };
      }), c.variantId, function (id) { c.variantId = id; updateChooserButton(); }));
    }

    if (needsSide(item)) {
      fields.appendChild(radioGroup("side", t("side"), MENU.options.side.choices.map(function (s) {
        return { id: s.id, label: local(s.name) };
      }), c.side, function (id) { c.side = id; updateChooserButton(); }));
    }

    var qty = el("div", "kf-qty-row");
    qty.appendChild(el("span", "kf-qty-label", t("quantity")));
    qty.appendChild(stepper(c.quantity, function (q) { c.quantity = q; updateChooserButton(); }));
    fields.appendChild(qty);

    var noteLabel = el("label", "kf-field");
    noteLabel.appendChild(el("span", null, t("lineNote")));
    var note = el("input");
    note.type = "text";
    note.maxLength = 200;
    note.placeholder = t("lineNotePh");
    note.addEventListener("input", function () { c.note = note.value; });
    noteLabel.appendChild(note);
    fields.appendChild(noteLabel);

    updateChooserButton();
  }

  function updateChooserButton() {
    var c = choosing;
    var btn = els.chooser.querySelector(".kf-chooser-add");
    var ready = !!c.variantId && (!needsSide(c.item) || !!c.side);
    btn.disabled = !ready;
    var price = c.variantId ? c.item.variants.find(function (v) { return v.id === c.variantId; }).price * c.quantity : null;
    btn.textContent = t("addTo") + (price !== null ? " · " + euro(price) : "");
  }

  function stepper(value, onChange) {
    var wrap = el("div", "kf-stepper");
    var minus = el("button", null, "−");
    var plus = el("button", null, "+");
    var out = el("output", null, String(value));
    minus.type = plus.type = "button";
    minus.setAttribute("aria-label", t("less"));
    plus.setAttribute("aria-label", t("more"));
    function set(v) {
      value = Math.max(1, Math.min(20, v));
      out.textContent = String(value);
      minus.disabled = value <= 1;
      plus.disabled = value >= 20;
      onChange(value);
    }
    minus.addEventListener("click", function () { set(value - 1); });
    plus.addEventListener("click", function () { set(value + 1); });
    minus.disabled = value <= 1;
    wrap.appendChild(minus);
    wrap.appendChild(out);
    wrap.appendChild(plus);
    return wrap;
  }

  // ---------- checkout ----------

  var form = { name: "", phone: "", service: null, note: "" };
  var formError = "";

  function openCheckout() {
    formError = "";
    renderCheckout();
    if (!els.checkout.open) els.checkout.showModal();
  }

  function renderCheckout() {
    var box = els.checkout.querySelector(".kf-checkout-content");
    els.checkout.querySelector("#kf-checkout-title").textContent = t("cart");
    els.checkout.querySelector("[data-close]").setAttribute("aria-label", t("close"));
    box.textContent = "";

    var lines = validLines();
    if (!lines.length) {
      box.appendChild(el("p", "kf-empty", t("empty")));
      var back = el("button", "btn btn-outline-dark", t("back"));
      back.type = "button";
      back.addEventListener("click", function () { els.checkout.close(); document.getElementById("menu").scrollIntoView(); });
      box.appendChild(back);
      return;
    }

    var ul = el("ul", "kf-lines");
    lines.forEach(function (l) {
      var li = el("li", "kf-line");
      var info = el("div", "kf-line-info");
      info.appendChild(el("strong", null, lineLabel(l)));
      if (l.note) info.appendChild(el("small", null, l.note));
      li.appendChild(info);
      li.appendChild(stepper(l.quantity, function (q) {
        l.quantity = q;
        saveCart();
        renderBar();
        box.querySelector(".kf-total strong").textContent = euro(total());
        li.querySelector(".kf-line-price").textContent = euro(linePrice(l));
      }));
      li.appendChild(el("span", "kf-line-price", euro(linePrice(l))));
      var rm = el("button", "kf-remove", t("remove"));
      rm.type = "button";
      rm.addEventListener("click", function () {
        cart = cart.filter(function (x) { return x !== l; });
        saveCart();
        renderBar();
        renderCheckout();
      });
      li.appendChild(rm);
      ul.appendChild(li);
    });
    box.appendChild(ul);

    var tot = el("p", "kf-total");
    tot.appendChild(el("span", null, t("total")));
    tot.appendChild(el("strong", null, euro(total())));
    box.appendChild(tot);

    var f = el("form", "kf-checkout-form");
    f.noValidate = true;

    function field(key, type, autocomplete, hint) {
      var label = el("label", "kf-field");
      label.appendChild(el("span", null, t(key)));
      var input = el("input");
      input.type = type;
      input.id = "kf-" + key;
      input.name = key;
      input.autocomplete = autocomplete;
      input.required = true;
      input.maxLength = key === "phone" ? 24 : 80;
      input.value = form[key];
      if (type === "tel") input.inputMode = "tel";
      input.addEventListener("input", function () { form[key] = input.value; clearError(); });
      label.appendChild(input);
      if (hint) label.appendChild(el("small", null, hint));
      return label;
    }

    f.appendChild(field("name", "text", "name"));
    f.appendChild(field("phone", "tel", "tel", t("phoneHint")));
    f.appendChild(radioGroup("service", t("service"), [
      { id: "takeaway", label: t("takeaway") },
      { id: "eat_in", label: t("eat_in") }
    ], form.service, function (id) { form.service = id; clearError(); }));

    var noteLabel = el("label", "kf-field");
    noteLabel.appendChild(el("span", null, t("note")));
    var note = el("textarea");
    note.id = "kf-order-note";
    note.rows = 2;
    note.maxLength = 300;
    note.value = form.note;
    note.addEventListener("input", function () { form.note = note.value; });
    noteLabel.appendChild(note);
    f.appendChild(noteLabel);

    var err = el("p", "kf-form-error");
    err.setAttribute("role", "alert");
    err.textContent = formError;
    f.appendChild(err);

    f.appendChild(el("p", "kf-pay-note", (window.KF_CONFIG && window.KF_CONFIG.ordering && local(window.KF_CONFIG.ordering.payment)) || t("payment")));

    var submit = el("button", "btn btn-gold kf-send-order", sending ? t("sending") : t("send") + " · " + euro(total()));
    submit.type = "submit";
    submit.disabled = sending;
    f.appendChild(submit);

    f.addEventListener("submit", function (e) {
      e.preventDefault();
      sendOrder();
    });
    box.appendChild(f);
  }

  function clearError() {
    if (!formError) return;
    formError = "";
    var node = els.checkout.querySelector(".kf-form-error");
    if (node) node.textContent = "";
  }

  function showError(message, focusId) {
    formError = message;
    renderCheckout();
    var node = focusId && document.getElementById(focusId);
    if (node) node.focus();
  }

  function sendOrder() {
    if (sending) return;
    if (!form.name.trim()) return showError(t("errName"), "kf-name");
    var digits = form.phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15 || !/^\+?[\d\s()-]+$/.test(form.phone.trim())) return showError(t("errPhone"), "kf-phone");
    if (!form.service) return showError(t("errService"));

    sending = true;
    formError = "";
    renderCheckout();

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer: { name: form.name.trim(), phone: form.phone.trim() },
        service: form.service,
        note: form.note.trim() || null,
        lang: lang,
        lines: validLines().map(function (l) {
          return { item_id: l.item_id, variant_id: l.variant_id, quantity: l.quantity, side: l.side || null, note: l.note || null };
        })
      })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data }; });
      })
      .then(function (r) {
        sending = false;
        if (r.status === 200 && r.data.order) return showDone(r.data.order);
        var e = r.data.error;
        if (e === "name_required") return showError(t("errName"), "kf-name");
        if (e === "phone_invalid") return showError(t("errPhone"), "kf-phone");
        if (e === "service_required") return showError(t("errService"));
        if (e === "closed") return showError(t("errClosed") + (r.data.message || ""));
        if (e === "invalid_order") return showError(t("errInvalid"));
        if (r.status === 429) return showError(t("errBusy"));
        showError(t("errFailed") + phone() + ".");
      })
      .catch(function () {
        sending = false;
        showError(t("errNetwork"));
      });
  }

  function showDone(order) {
    cart = [];
    saveCart();
    renderBar();
    form.note = "";
    form.service = null;

    var box = els.checkout.querySelector(".kf-checkout-content");
    els.checkout.querySelector("#kf-checkout-title").textContent = t("doneTitle");
    box.textContent = "";

    var card = el("div", "kf-done");
    var num = el("p", "kf-done-number");
    num.appendChild(el("span", null, t("doneNumber")));
    num.appendChild(el("strong", null, order.number));
    card.appendChild(num);
    var ul = el("ul", "kf-done-lines");
    order.lines.forEach(function (l) {
      var li = el("li");
      li.appendChild(el("span", null, l.quantity + " × " + l.name + (l.variant ? " (" + l.variant + ")" : "") + (l.side ? ", " + l.side : "")));
      li.appendChild(el("span", null, euro(l.lineTotal)));
      ul.appendChild(li);
    });
    card.appendChild(ul);
    var tot = el("p", "kf-total");
    tot.appendChild(el("span", null, t("total") + " · " + t(order.service)));
    tot.appendChild(el("strong", null, euro(order.total)));
    card.appendChild(tot);
    card.appendChild(el("p", "kf-done-hint", t("doneHint")));
    card.appendChild(el("p", "kf-pay-note", (window.KF_CONFIG && window.KF_CONFIG.ordering && local(window.KF_CONFIG.ordering.payment)) || t("payment")));
    box.appendChild(card);

    var again = el("button", "btn btn-gold", t("newOrder"));
    again.type = "button";
    again.addEventListener("click", function () { els.checkout.close(); document.getElementById("menu").scrollIntoView(); });
    box.appendChild(again);
  }

  // ---------- init ----------

  build();

  function onReady() {
    MENU = window.KF_MENU;
    cart = validLines();
    saveCart();
    renderBar();
  }
  if (window.KF_MENU) onReady();
  document.addEventListener("kf:ready", onReady);

  document.addEventListener("kf:lang", function (e) {
    lang = e.detail.lang === "en" ? "en" : "et";
    if (!MENU) return;
    renderBar();
    if (els.chooser.open && choosing) renderChooser();
    if (els.checkout.open && !els.checkout.querySelector(".kf-done")) renderCheckout();
  });
})();
