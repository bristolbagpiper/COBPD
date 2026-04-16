const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const driftTarget = document.querySelector("[data-drift]");
const revealTargets = document.querySelectorAll(".reveal");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const contactForms = document.querySelectorAll("[data-contact-form]");

// Paste your deployed Google Apps Script web app URLs here.
const FORM_ENDPOINTS = {
  booking: "https://script.google.com/macros/s/AKfycbxHJ5jf5onAW02-Ofe2EJkHVebKjw2jYX2Wwb4rq4i7wCtq46CI7sYG960vyiimGCjpMw/exec",
  joining: "https://script.google.com/macros/s/AKfycbxHJ5jf5onAW02-Ofe2EJkHVebKjw2jYX2Wwb4rq4i7wCtq46CI7sYG960vyiimGCjpMw/exec",
};

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

const createRequestId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const wait = (ms) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const requestStatusJsonp = (endpoint, requestId) =>
  new Promise((resolve, reject) => {
    const callbackName = `__cobpdStatus${Date.now()}${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, 6000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("network"));
    };

    const url = new URL(endpoint);
    url.searchParams.set("action", "status");
    url.searchParams.set("request_id", requestId);
    url.searchParams.set("callback", callbackName);
    script.src = url.toString();

    document.body.appendChild(script);
  });

const pollSubmissionStatus = async (endpoint, requestId) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const payload = await requestStatusJsonp(endpoint, requestId);

      if (payload?.received || payload?.ok === false) {
        return payload;
      }
    } catch {
      // Keep polling a few times before giving up.
    }

    await wait(1250);
  }

  return null;
};

const getStatusMessage = (errorCode) => {
  if (errorCode === "rate_limited") {
    return "You have sent a recent enquiry already. Please wait a couple of minutes, or email hello@bristolpipeband.org.";
  }

  if (errorCode === "invalid_email") {
    return "Please check the email address and try again.";
  }

  if (errorCode === "message_too_long") {
    return "Your message is too long. Shorten it slightly and try again.";
  }

  return "There was a problem sending the form. Please try again or email hello@bristolpipeband.org.";
};

contactForms.forEach((form) => {
  const resetButton = form.querySelector("[data-form-reset]");

  resetButton?.addEventListener("click", () => {
    form.reset();
    setFormStatus(form, "");
    setFormSuccessState(form, false);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    const kind = form.getAttribute("data-contact-form");
    const endpoint = kind ? FORM_ENDPOINTS[kind] : "";
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const requestId = createRequestId();

    if (formData.get("website")) {
      form.reset();
      setFormStatus(form, "");
      setFormSuccessState(form, true);
      return;
    }

    if (!endpoint) {
      setFormStatus(
        form,
        "This form is not wired yet. Add the Google Apps Script URL in script.js or email hello@bristolpipeband.org.",
        "is-error",
      );
      return;
    }

    formData.append("request_id", requestId);
    formData.append("form_kind", kind || "general");
    formData.append("page", window.location.pathname);
    formData.append("submitted_at", new Date().toISOString());

    submitButton?.setAttribute("disabled", "true");
    setFormStatus(form, "Sending and confirming...");

    try {
      await fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams(formData).toString(),
      });

      const payload = await pollSubmissionStatus(endpoint, requestId);

      if (!payload) {
        form.reset();
        setFormStatus(form, "");
        setFormSuccessState(form, true);
        return;
      }

      if (payload.ok === false) {
        setFormStatus(form, getStatusMessage(payload.error), "is-error");
        return;
      }

      form.reset();
      setFormStatus(form, "");
      setFormSuccessState(form, true);
    } catch {
      setFormStatus(
        form,
        "There was a problem sending the form. Please try again or email hello@bristolpipeband.org.",
        "is-error",
      );
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  });
});

window.addEventListener("scroll", syncHeader, { passive: true });
window.addEventListener("scroll", syncDrift, { passive: true });
window.addEventListener("resize", closeMenu);

syncHeader();
syncDrift();
