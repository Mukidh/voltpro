(() => {
  "use strict";

  const header = document.querySelector("[data-header]");
  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  const form = document.querySelector("[data-form]");
  const statusEl = document.querySelector("[data-form-status]");
  const yearEl = document.querySelector("[data-year]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* —— Sticky header state —— */
  const onScroll = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 12);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* —— Mobile navigation —— */
  const setNavOpen = (open) => {
    toggle?.setAttribute("aria-expanded", String(open));
    nav?.classList.toggle("is-open", open);
    if (toggle) {
      const label = toggle.querySelector(".sr-only");
      if (label) label.textContent = open ? "Menü bezárása" : "Menü megnyitása";
    }
  };

  toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    setNavOpen(!open);
  });

  nav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setNavOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setNavOpen(false);
  });

  /* —— Scroll reveal —— */
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

  /* —— Stat counters —— */
  const counters = document.querySelectorAll("[data-count]");
  const animateCount = (el) => {
    if (reduceMotion) {
      el.textContent = el.dataset.count;
      return;
    }
    const target = Number(el.dataset.count);
    const duration = 1100;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (counters.length && "IntersectionObserver" in window) {
    const countIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            countIo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((el) => countIo.observe(el));
  } else {
    counters.forEach((el) => {
      el.textContent = el.dataset.count;
    });
  }

  /* —— Form validation (frontend demo only) —— */
  if (!form || !statusEl) return;

  const fields = {
    nev: form.querySelector("#nev"),
    email: form.querySelector("#email"),
    telefon: form.querySelector("#telefon"),
    szolgaltatas: form.querySelector("#szolgaltatas"),
    uzenet: form.querySelector("#uzenet"),
    gdpr: form.querySelector("#gdpr"),
  };

  const messages = {
    nev: {
      valueMissing: "Adja meg a nevét.",
      tooShort: "A név legalább 2 karakter legyen.",
    },
    email: {
      valueMissing: "Adja meg az e-mail címét.",
      typeMismatch: "Érvényes e-mail címet adjon meg.",
      patternMismatch: "Érvényes e-mail címet adjon meg.",
    },
    telefon: {
      valueMissing: "Adja meg a telefonszámát.",
      patternMismatch: "Adjon meg érvényes telefonszámot (pl. +36 52 123 4567).",
    },
    szolgaltatas: {
      valueMissing: "Válasszon érdeklődési kört.",
    },
    uzenet: {
      valueMissing: "Írjon rövid üzenetet a munkáról.",
      tooShort: "Az üzenet legyen legalább 15 karakter.",
    },
    gdpr: {
      valueMissing: "A folytatáshoz jelölje be a megértést igazoló mezőt.",
    },
  };

  const phonePattern = /^[+]?[\d\s()-]{8,20}$/;
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

    let valid = field.checkValidity();

    if (name === "email" && field.value.trim()) {
      valid = emailPattern.test(field.value.trim());
      if (!valid) {
        setFieldError(name, messages.email.patternMismatch);
        return false;
      }
    }

    if (name === "telefon" && field.value.trim()) {
      const digits = field.value.replace(/\D/g, "");
      valid = phonePattern.test(field.value.trim()) && digits.length >= 8;
      if (!valid) {
        setFieldError(name, messages.telefon.patternMismatch);
        return false;
      }
    }

    if (!valid) {
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    statusEl.classList.remove("is-error", "is-success");
    statusEl.textContent = "";

    const order = ["nev", "email", "telefon", "szolgaltatas", "uzenet", "gdpr"];
    let firstInvalid = null;

    order.forEach((name) => {
      const ok = validateField(name);
      if (!ok && !firstInvalid) firstInvalid = fields[name];
    });

    if (firstInvalid) {
      statusEl.textContent = "Kérjük, javítsa a pirossal jelölt mezőket.";
      statusEl.classList.add("is-error");
      firstInvalid.focus();
      return;
    }

    statusEl.textContent =
      "Validáció sikeres. Ez egy frontend bemutató — az üzenet nem került elküldésre.";
    statusEl.classList.add("is-success");
    form.reset();
    order.forEach((name) => setFieldError(name, ""));
  });
})();
