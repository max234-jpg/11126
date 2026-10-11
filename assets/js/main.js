(function () {
  document.documentElement.classList.add("js");

  // Menu mobile
  var toggle = document.getElementById("nav-toggle");
  var nav = document.getElementById("nav");
  if (toggle && nav) {
    var setOpen = function (open) {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };
    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  // Formulaire de devis.
  // Pour un envoi réel, renseigner data-endpoint sur le <form> (Formspree, Basin, API maison…).
  var form = document.getElementById("quote-form");
  var status = document.getElementById("form-status");
  if (!form || !status) return;

  var rules = [
    { id: "f-nom", test: function (v) { return v.trim().length > 1; }, msg: "Indiquez votre nom." },
    { id: "f-tel", test: function (v) { return v.replace(/[^\d+]/g, "").length >= 10; }, msg: "Indiquez un numéro à 10 chiffres pour qu'on puisse vous rappeler." },
    { id: "f-mail", test: function (v) { return v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }, msg: "Cette adresse e-mail semble incomplète." }
  ];

  function showError(input, msg) {
    var errId = input.id + "-err";
    var err = document.getElementById(errId);
    if (msg) {
      if (!err) {
        err = document.createElement("p");
        err.id = errId;
        err.className = "field-error";
        input.insertAdjacentElement("afterend", err);
      }
      err.textContent = msg;
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", errId);
    } else {
      if (err) err.remove();
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }

  rules.forEach(function (r) {
    var input = document.getElementById(r.id);
    input.addEventListener("blur", function () {
      if (input.value !== "") showError(input, r.test(input.value) ? "" : r.msg);
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var firstBad = null;
    rules.forEach(function (r) {
      var input = document.getElementById(r.id);
      var ok = r.test(input.value);
      showError(input, ok ? "" : r.msg);
      if (!ok && !firstBad) firstBad = input;
    });
    status.className = "form-status";
    if (firstBad) {
      status.textContent = "Vérifiez les champs signalés.";
      status.classList.add("is-error");
      firstBad.focus();
      return;
    }

    var endpoint = form.getAttribute("data-endpoint");
    if (!endpoint) {
      status.textContent = "Formulaire de démonstration : la demande n'a pas été envoyée. Branchez un service d'envoi pour l'activer.";
      status.classList.add("is-error");
      return;
    }

    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    status.textContent = "Envoi en cours…";
    fetch(endpoint, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        form.reset();
        status.textContent = "Demande envoyée. Nous vous rappelons pour fixer une visite.";
        status.classList.add("is-ok");
      })
      .catch(function () {
        status.textContent = "L'envoi a échoué. Réessayez ou appelez-nous directement.";
        status.classList.add("is-error");
      })
      .then(function () { btn.disabled = false; });
  });
})();
