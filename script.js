(() => {
  "use strict";

  const header = document.querySelector("[data-header]");
  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  const form = document.querySelector("[data-form]");
  const statusEl = document.querySelector("[data-form-status]");
  const yearEl = document.querySelector("[data-year]");
  const startedEl = document.querySelector("[data-form-started]");
  const submitBtn = document.querySelector("[data-submit]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const contactUrl = window.VOLTPRO?.contactUrl || "/api/contact";

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  if (startedEl) startedEl.value = String(Date.now());

  const onScroll = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 12);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const setNavOpen = (open) => {
    toggle?.setAttribute("aria-expanded", String(open));
    nav?.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
    if (toggle) {
      const label = toggle.querySelector(".sr-only");
      if (label) label.textContent = open ? "Menü bezárása" : "Menü megnyitása";
    }
  };

  toggle?.addEventListener("click", () => {
    setNavOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  nav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setNavOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setNavOpen(false);
  });

  const reveals = document.querySelectorAll(".reveal");
  if (reduceMotion) {
    reveals.forEach((el) => el.classList.add("is-visible"));
  } else if (reveals.length && "IntersectionObserver" in window) {
    const revealIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealIo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => revealIo.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  if (!form || !statusEl) return;

  const fields = {
    nev: form.querySelector("#nev"),
    email: form.querySelector("#email"),
    telefon: form.querySelector("#telefon"),
    targy: form.querySelector("#targy"),
    uzenet: form.querySelector("#uzenet"),
    gdpr: form.querySelector("#gdpr"),
  };

  const messages = {
    nev: {
      valueMissing: "Adja meg a teljes nevét.",
      tooShort: "A név legalább 2 karakter legyen.",
    },
    email: {
      valueMissing: "Adja meg az e-mail címét.",
      typeMismatch: "Érvényes e-mail címet adjon meg.",
      patternMismatch: "Érvényes e-mail címet adjon meg.",
    },
    telefon: {
      patternMismatch: "Adjon meg érvényes telefonszámot (pl. +36 70 567 0878).",
    },
    targy: {
      valueMissing: "Válasszon tárgyat.",
    },
    uzenet: {
      valueMissing: "Írjon rövid üzenetet a munkáról.",
      tooShort: "Az üzenet legyen legalább 15 karakter.",
    },
    gdpr: {
      valueMissing: "A küldéshez jelölje be a hozzájárulást.",
    },
  };

  const phonePattern = /^[+]?[\d\s()/.-]{8,20}$/;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const setFieldError = (name, message) => {
    const field = fields[name];
    const errorEl = form.querySelector(`[data-error-for="${name}"]`);
    if (!field || !errorEl) return;

    if (message) {
      field.classList.add("is-invalid");
      field.setAttribute("aria-invalid", "true");
      errorEl.hidden = false;
      errorEl.textContent = message;
    } else {
      field.classList.remove("is-invalid");
      field.removeAttribute("aria-invalid");
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
  };

  const getErrorMessage = (name, field) => {
    const map = messages[name] || {};
    if (field.validity.valueMissing) return map.valueMissing || "Kötelező mező.";
    if (field.validity.tooShort) return map.tooShort || "Túl rövid.";
    if (field.validity.typeMismatch) return map.typeMismatch || "Érvénytelen formátum.";
    if (field.validity.patternMismatch) return map.patternMismatch || "Érvénytelen formátum.";
    return "Ellenőrizze a mezőt.";
  };

  const validateField = (name) => {
    const field = fields[name];
    if (!field) return true;

    if (name === "telefon") {
      const value = field.value.trim();
      if (!value) {
        setFieldError(name, "");
        return true;
      }
      const digits = value.replace(/\D/g, "");
      const valid = phonePattern.test(value) && digits.length >= 8 && digits.length <= 15;
      setFieldError(name, valid ? "" : messages.telefon.patternMismatch);
      return valid;
    }

    if (name === "email" && field.value.trim()) {
      const valid = emailPattern.test(field.value.trim());
      if (!valid) {
        setFieldError(name, messages.email.patternMismatch);
        return false;
      }
    }

    if (!field.checkValidity()) {
      setFieldError(name, getErrorMessage(name, field));
      return false;
    }

    setFieldError(name, "");
    return true;
  };

  Object.keys(fields).forEach((name) => {
    const field = fields[name];
    if (!field) return;
    const eventName = field.type === "checkbox" || field.tagName === "SELECT" ? "change" : "blur";
    field.addEventListener(eventName, () => validateField(name));
    field.addEventListener("input", () => {
      if (field.classList.contains("is-invalid")) validateField(name);
    });
  });

  const setStatus = (type, text) => {
    statusEl.classList.remove("is-error", "is-success");
    if (type) statusEl.classList.add(type);
    statusEl.textContent = text;
  };

  let submitting = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;

    setStatus("", "");

    const order = ["nev", "email", "telefon", "targy", "uzenet", "gdpr"];
    let firstInvalid = null;
    order.forEach((name) => {
      if (!validateField(name) && !firstInvalid) firstInvalid = fields[name];
    });

    if (firstInvalid) {
      setStatus("is-error", "Kérjük, javítsa a pirossal jelölt mezőket.");
      firstInvalid.focus();
      return;
    }

    submitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Küldés…";
    }

    const payload = {
      name: fields.nev.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.telefon.value.trim(),
      subject: fields.targy.value.trim(),
      message: fields.uzenet.value.trim(),
      website: form.querySelector("#website")?.value || "",
      formStarted: startedEl?.value || "",
    };

    try {
      const response = await fetch(contactUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || "A küldés nem sikerült. Próbálja meg később, vagy hívjon minket.");
      }

      setStatus("is-success", data.message || "Köszönjük. Az üzenet elment, hamarosan jelentkezünk.");
      form.reset();
      if (startedEl) startedEl.value = String(Date.now());
      order.forEach((name) => setFieldError(name, ""));
    } catch (error) {
      const offline = !navigator.onLine;
      setStatus(
        "is-error",
        offline
          ? "Nincs hálózati kapcsolat. Ellenőrizze az internetet, vagy hívjon minket."
          : error.message || "A küldés nem sikerült. Hívjon minket a +36 70 567 0878 számon."
      );
    } finally {
      submitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Üzenet küldése";
      }
    }
  });
})();
