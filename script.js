const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const driftTarget = document.querySelector("[data-drift]");
const revealTargets = document.querySelectorAll(".reveal");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const contactForms = document.querySelectorAll("[data-contact-form]");

const syncHeader = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
};

const closeMenu = () => {
  if (!menuToggle || !nav) {
    return;
  }

  menuToggle.setAttribute("aria-expanded", "false");
  nav.classList.remove("is-open");
};

if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => {
    const nextState = menuToggle.getAttribute("aria-expanded") !== "true";
    menuToggle.setAttribute("aria-expanded", String(nextState));
    nav.classList.toggle("is-open", nextState);
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });
}

if (!reducedMotion.matches && "IntersectionObserver" in window) {
  document.body.classList.add("has-motion");

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    {
      threshold: 0.16,
      rootMargin: "0px 0px -5% 0px",
    },
  );

  revealTargets.forEach((target) => revealObserver.observe(target));
} else {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
}

const syncDrift = () => {
  if (!driftTarget || reducedMotion.matches) {
    return;
  }

  const offset = Math.min(window.scrollY * 0.12, 42);
  driftTarget.style.setProperty("--hero-drift", `${offset}px`);
};

const setFormStatus = (form, message, tone = "") => {
  const status = form.querySelector("[data-form-status]");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.remove("is-error", "is-success");

  if (tone) {
    status.classList.add(tone);
  }
};

const setFormSuccessState = (form, isSuccess) => {
  const content = form.querySelector("[data-form-content]");
  const success = form.querySelector("[data-form-success]");

  if (!content || !success) {
    return;
  }

  content.hidden = isSuccess;
  success.hidden = !isSuccess;
};

contactForms.forEach((form) => {
  const resetButton = form.querySelector("[data-form-reset]");
  const targetName = form.getAttribute("target") || "";
  const targetFrame = targetName ? document.getElementsByName(targetName)[0] : null;
  let submitTimeoutId = 0;

  resetButton?.addEventListener("click", () => {
    window.clearTimeout(submitTimeoutId);
    form.dataset.submitting = "false";
    form.reset();
    setFormStatus(form, "");
    setFormSuccessState(form, false);
  });

  if (targetFrame) {
    targetFrame.addEventListener("load", () => {
      if (form.dataset.submitting !== "true") {
        return;
      }

      window.clearTimeout(submitTimeoutId);
      form.dataset.submitting = "false";
      form.reset();
      setFormStatus(form, "");
      setFormSuccessState(form, true);
    });
  }

  form.addEventListener("submit", (event) => {
    if (!form.reportValidity()) {
      event.preventDefault();
      return;
    }

    const endpoint = form.getAttribute("action") || "";
    const pageField = form.querySelector("[data-page-field]");
    const submittedAtField = form.querySelector("[data-submitted-at]");
    const honeypot = form.querySelector('input[name="website"]');

    if (honeypot?.value) {
      event.preventDefault();
      form.reset();
      setFormStatus(form, "");
      setFormSuccessState(form, true);
      return;
    }

    if (!endpoint) {
      event.preventDefault();
      setFormStatus(
        form,
        "This form is not wired yet. Add the Google Apps Script URL to the form action or email hello@bristolpipeband.org.",
        "is-error",
      );
      return;
    }

    if (pageField) {
      pageField.value = window.location.pathname;
    }

    if (submittedAtField) {
      submittedAtField.value = new Date().toISOString();
    }

    setFormStatus(form, "Sending...");

    if (!targetFrame) {
      event.preventDefault();
      setFormStatus(
        form,
        "This form has no submission target. Add the hidden iframe target or email hello@bristolpipeband.org.",
        "is-error",
      );
      return;
    }

    form.dataset.submitting = "true";
    window.clearTimeout(submitTimeoutId);
    submitTimeoutId = window.setTimeout(() => {
      if (form.dataset.submitting !== "true") {
        return;
      }

      form.dataset.submitting = "false";
      setFormStatus(
        form,
        "The form did not get a response in time. Try again or email hello@bristolpipeband.org.",
        "is-error",
      );
    }, 12000);
  });
});

window.addEventListener("scroll", syncHeader, { passive: true });
window.addEventListener("scroll", syncDrift, { passive: true });
window.addEventListener("resize", closeMenu);

syncHeader();
syncDrift();
