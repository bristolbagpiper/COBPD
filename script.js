const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const driftTarget = document.querySelector("[data-drift]");
const revealTargets = document.querySelectorAll(".reveal");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const contactForms = document.querySelectorAll("[data-contact-form]");
const upcomingSchedule = document.querySelector("[data-upcoming-schedule]");
const liveLegacy = document.querySelector("[data-live-legacy]");
const nextGigName = document.querySelector("[data-next-gig-name]");
const nextGigDate = document.querySelector("[data-next-gig-date]");
const nextGigLocation = document.querySelector("[data-next-gig-location]");
const nextGigTime = document.querySelector("[data-next-gig-time]");
const staticLegacyYears = new Set(
  Array.from(document.querySelectorAll("#legacy .legacy-grid > .legacy-year h3"))
    .map((heading) => heading.textContent.trim())
    .filter(Boolean),
);
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

const fullDateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const monthYearFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});

const monthShortFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "short",
});

const weekdayShortFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
});

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character] || character;
  });

const countLabel = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const parseCsvRecords = (csvText) => {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(value);
      value = "";

      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    value += character;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);

    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  if (rows.length < 2) {
    return [];
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => header.trim().toLowerCase());

  return dataRows.map((cells) =>
    headers.reduce((record, header, columnIndex) => {
      record[header] = (cells[columnIndex] || "").trim();
      return record;
    }, {}),
  );
};

const parseUkDate = (value) => {
  const match = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) {
    return null;
  }

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const monthIndex = Number(monthText) - 1;
  const year = Number(yearText);
  const date = new Date(year, monthIndex, day);

  date.setHours(0, 0, 0, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

const normaliseTime = (value) => {
  const trimmed = String(value || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!trimmed) {
    return "Time TBC";
  }

  const matches = trimmed.match(/\b\d{1,2}:\d{2}\b/g) || [];

  if (matches.length >= 2) {
    return `${matches[0]} - ${matches[1]}`;
  }

  if (matches.length === 1) {
    return matches[0];
  }

  return trimmed.replace(/\s*-\s*/g, " - ");
};

const parseStartMinutes = (value) => {
  const match = normaliseTime(value).match(/(\d{1,2}):(\d{2})/);

  if (!match) {
    return Number.POSITIVE_INFINITY;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return hours * 60 + minutes;
};

const normaliseGigRecord = (record) => {
  const name = record.name || "";
  const location = record.location || "";
  const date = parseUkDate(record.date);

  if (!name || !date) {
    return null;
  }

  return {
    name,
    location: location || "Location TBC",
    date,
    time: normaliseTime(record.time),
    sortMinutes: parseStartMinutes(record.time),
  };
};

const getToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const updateNextGigSummary = (gig) => {
  if (!nextGigName || !nextGigDate || !nextGigLocation || !nextGigTime) {
    return;
  }

  if (!gig) {
    nextGigName.textContent = "New dates will appear here soon";
    nextGigDate.textContent = "Schedule updating";
    nextGigLocation.textContent = "Check back shortly";
    nextGigTime.textContent = "Time TBC";
    return;
  }

  nextGigName.textContent = gig.name;
  nextGigDate.textContent = fullDateFormatter.format(gig.date);
  nextGigLocation.textContent = gig.location;
  nextGigTime.textContent = gig.time;
};

const renderScheduleItem = (gig, isNext) => `
  <article class="schedule-item${isNext ? " schedule-item--next" : ""}">
    <div class="schedule-date" aria-hidden="true">
      <span class="schedule-date__day">${gig.date.getDate()}</span>
      <span class="schedule-date__month">${escapeHtml(monthShortFormatter.format(gig.date))}</span>
      <span class="schedule-date__weekday">${escapeHtml(weekdayShortFormatter.format(gig.date))}</span>
    </div>
    <div class="schedule-main">
      <div class="schedule-main__top">
        <p class="schedule-title">${escapeHtml(gig.name)}</p>
        ${isNext ? '<span class="schedule-badge">Next up</span>' : ""}
      </div>
      <p class="schedule-meta">
        <span>${escapeHtml(gig.location)}</span>
        <span>${escapeHtml(fullDateFormatter.format(gig.date))}</span>
      </p>
    </div>
    <p class="schedule-time">${escapeHtml(gig.time)}</p>
  </article>
`;

const renderUpcomingSchedule = (gigs) => {
  if (!upcomingSchedule) {
    return;
  }

  if (!gigs.length) {
    upcomingSchedule.innerHTML =
      '<p class="schedule-empty">No upcoming gigs are listed right now. Please check back soon.</p>';
    updateNextGigSummary(null);
    return;
  }

  const groups = [];

  gigs.forEach((gig) => {
    const key = `${gig.date.getFullYear()}-${gig.date.getMonth()}`;
    const existingGroup = groups.find((group) => group.key === key);

    if (existingGroup) {
      existingGroup.gigs.push(gig);
      return;
    }

    groups.push({
      key,
      label: monthYearFormatter.format(gig.date),
      gigs: [gig],
    });
  });

  let isFirstGig = true;

  upcomingSchedule.innerHTML = groups
    .map(
      (group) => `
        <article class="schedule-group">
          <div class="schedule-group__label">
            <h3 class="schedule-group__month">${escapeHtml(group.label)}</h3>
            <p class="schedule-group__count">${countLabel(group.gigs.length, "appearance")}</p>
          </div>
          <div class="schedule-list">
            ${group.gigs
              .map((gig) => {
                const markup = renderScheduleItem(gig, isFirstGig);
                isFirstGig = false;
                return markup;
              })
              .join("")}
          </div>
        </article>
      `,
    )
    .join("");

  updateNextGigSummary(gigs[0]);
};

const renderLiveLegacy = (gigs) => {
  if (!liveLegacy) {
    return;
  }

  if (!gigs.length) {
    liveLegacy.hidden = true;
    liveLegacy.innerHTML = "";
    return;
  }

  const years = [];

  gigs.forEach((gig) => {
    const key = String(gig.date.getFullYear());
    const existingYear = years.find((year) => year.key === key);

    if (existingYear) {
      existingYear.gigs.push(gig);
      return;
    }

    years.push({
      key,
      gigs: [gig],
    });
  });

  liveLegacy.innerHTML = `
    <div class="events-section-heading">
      <p class="eyebrow">Recent archive</p>
      <h2>This season so far.</h2>
      <p class="events-section-copy">
        Completed gigs from the live schedule move here automatically.
      </p>
    </div>
    <div class="legacy-grid">
      ${years
        .map(
          (year) => `
            <article class="legacy-year legacy-year--live">
              <div class="legacy-year__header">
                <h3>${escapeHtml(year.key)}</h3>
                <p class="legacy-year__count">${countLabel(year.gigs.length, "completed gig", "completed gigs")}</p>
              </div>
              <div class="legacy-year__entries">
                ${year.gigs
                  .map(
                    (gig) => `
                      <div class="legacy-entry">
                        <p class="legacy-entry__name">${escapeHtml(gig.name)}</p>
                        <p class="legacy-entry__location">${escapeHtml(gig.location)} · ${escapeHtml(fullDateFormatter.format(gig.date))}</p>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
  liveLegacy.hidden = false;
};

const loadGigsFromCsv = async () => {
  if (!upcomingSchedule && !liveLegacy && !nextGigName) {
    return;
  }

  try {
    const response = await fetch("gigs.csv", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Could not load gigs.csv");
    }

    const csvText = await response.text();
    const gigs = parseCsvRecords(csvText)
      .map(normaliseGigRecord)
      .filter(Boolean)
      .sort((firstGig, secondGig) => {
        const dateDifference = firstGig.date.getTime() - secondGig.date.getTime();

        if (dateDifference !== 0) {
          return dateDifference;
        }

        return firstGig.sortMinutes - secondGig.sortMinutes;
      });

    const today = getToday();
    const upcomingGigs = gigs.filter((gig) => gig.date >= today);
    const completedGigs = gigs
      .filter(
        (gig) =>
          gig.date < today && !staticLegacyYears.has(String(gig.date.getFullYear())),
      )
      .sort((firstGig, secondGig) => secondGig.date.getTime() - firstGig.date.getTime());

    renderUpcomingSchedule(upcomingGigs);
    renderLiveLegacy(completedGigs);
  } catch {
    if (nextGigName && !nextGigName.textContent.trim()) {
      updateNextGigSummary(null);
    }
  }
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
loadGigsFromCsv();
