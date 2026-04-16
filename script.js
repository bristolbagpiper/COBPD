const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const driftTarget = document.querySelector("[data-drift]");
const revealTargets = document.querySelectorAll(".reveal");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const contactForms = document.querySelectorAll("[data-contact-form]");
const STATUS_POLL_TIMEOUT_MS = 12000;
const STATUS_POLL_INTERVAL_MS = 700;

const FORM_ENDPOINTS = {
  booking: "https://script.google.com/macros/s/AKfycbxKYfHEFpIVj2TpUlaqeNJShS6gND_XUshja4Jq-vBoVCoWMqUlSg4WT25ii6krvdH9Vw/exec",
  joining: "https://script.google.com/macros/s/AKfycbxKYfHEFpIVj2TpUlaqeNJShS6gND_XUshja4Jq-vBoVCoWMqUlSg4WT25ii6krvdH9Vw/exec",
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

const createRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const wait = (ms) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const requestStatusJsonp = (endpoint, requestId) =>
  new Promise((resolve) => {
    const callbackName = `cobpdStatus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const separator = endpoint.includes("?") ? "&" : "?";
    const script = document.createElement("script");

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, 3500);

    window[callbackName] = (payload) => {
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(payload || null);
    };

    script.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(null);
    };

    script.src =
      `${endpoint}${separator}action=status&request_id=${encodeURIComponent(requestId)}` +
      `&callback=${encodeURIComponent(callbackName)}`;

    document.body.appendChild(script);
  });

const pollSubmissionStatus = async (endpoint, requestId, onProgress) => {
  const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS;
  let lastKnownStatus = null;

  while (Date.now() < deadline) {
    const payload = await requestStatusJsonp(endpoint, requestId);

    if (payload?.received && payload.state === "received") {
      lastKnownStatus = payload;
      onProgress?.(payload);
      await wait(STATUS_POLL_INTERVAL_MS);
      continue;
    }

    if (payload && payload.received) {
      return payload;
    }

    await wait(STATUS_POLL_INTERVAL_MS);
  }

  return lastKnownStatus;
};

const getStatusMessage = (payload) => {
  if (!payload) {
    return "We could not verify that your form reached us. Please try again or email hello@bristolpipeband.org.";
  }

  if (payload.error === "rate_limited") {
    return "This email address was used very recently. Please wait a couple of minutes and try again.";
  }

  if (payload.error === "invalid_email") {
    return "Please enter a valid email address.";
  }

  if (payload.error === "message_too_long") {
    return "Your message is too long. Please shorten it and try again.";
  }

  if (payload.error === "missing_required_fields") {
    return "Please complete the required fields and try again.";
  }

  if (payload.state === "email_failed") {
    return "We received your form but could not finish processing it. Please email hello@bristolpipeband.org.";
  }

  if (payload.state === "received") {
    return "Your form reached our Google handler, but we could not confirm completion yet. Please wait a minute, then email hello@bristolpipeband.org if needed.";
  }

  return "We could not verify that your form reached us. Please try again or email hello@bristolpipeband.org.";
};

contactForms.forEach((form) => {
  const resetButton = form.querySelector("[data-form-reset]");
  const submitButton = form.querySelector('button[type="submit"]');
  const defaultButtonLabel = submitButton?.dataset.label || submitButton?.textContent || "";

  resetButton?.addEventListener("click", () => {
    form.reset();
    form.removeAttribute("aria-busy");
    setFormStatus(form, "");
    setFormSuccessState(form, false);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    const kind = form.getAttribute("data-contact-form") || "";
    const endpoint = FORM_ENDPOINTS[kind] || "";
    const honeypot = form.querySelector('input[name="website"]');

    if (honeypot?.value) {
      form.reset();
      form.removeAttribute("aria-busy");
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

    const formData = new FormData(form);
    const requestId = createRequestId();
    formData.append("form_kind", kind || "general");
    formData.append("page", window.location.pathname);
    formData.append("submitted_at", new Date().toISOString());
    formData.append("request_id", requestId);

    submitButton?.setAttribute("disabled", "true");
    form.setAttribute("aria-busy", "true");
    setFormStatus(form, "Sending. Waiting for confirmation from our form handler.");

    try {
      await fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams(formData).toString(),
      });

      const status = await pollSubmissionStatus(endpoint, requestId, () => {
        setFormStatus(form, "Received by our form handler. Finishing processing now.");
      });

      form.removeAttribute("aria-busy");

      if (status?.ok && status.state === "emailed") {
        form.reset();
        setFormStatus(form, "");
        setFormSuccessState(form, true);
        return;
      }

      setFormStatus(form, getStatusMessage(status), "is-error");
    } catch {
      form.removeAttribute("aria-busy");
      setFormStatus(
        form,
        "The form could not be sent from your browser. Please try again or email hello@bristolpipeband.org.",
        "is-error",
      );
    } finally {
      if (submitButton) {
        submitButton.textContent = defaultButtonLabel;
      }
      submitButton?.removeAttribute("disabled");
    }
  });
});

window.addEventListener("scroll", syncHeader, { passive: true });
window.addEventListener("scroll", syncDrift, { passive: true });
window.addEventListener("resize", closeMenu);

syncHeader();
syncDrift();
