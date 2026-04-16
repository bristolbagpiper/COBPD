const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const driftTarget = document.querySelector("[data-drift]");
const revealTargets = document.querySelectorAll(".reveal");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const contactForms = document.querySelectorAll("[data-contact-form]");
const faqItems = document.querySelectorAll(".faq-item");
const membersPage = document.querySelector("[data-members-page]");
const membersAuth = document.querySelector("[data-members-auth]");
const membersApp = document.querySelector("[data-members-app]");
const membersLoginForm = document.querySelector("[data-members-login-form]");
const membersLoginStatus = document.querySelector("[data-members-login-status]");
const membersLogoutButton = document.querySelector("[data-members-logout]");
const membersName = document.querySelector("[data-members-name]");
const membersRole = document.querySelector("[data-members-role]");
const membersStatus = document.querySelector("[data-members-status]");
const membersEmpty = document.querySelector("[data-members-empty]");
const membersGigs = document.querySelector("[data-members-gigs]");
const upcomingSchedule = document.querySelector("[data-upcoming-schedule]");
const liveLegacy = document.querySelector("[data-live-legacy]");
const nextGigBanner = document.querySelector("[data-next-gig-banner]");
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
const MEMBERS_ENDPOINT = FORM_ENDPOINTS.booking;
const MEMBER_SESSION_KEY = "cobpd_members_session";

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

if (faqItems.length) {
  faqItems.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) {
        return;
      }

      faqItems.forEach((otherItem) => {
        if (otherItem !== item) {
          otherItem.removeAttribute("open");
        }
      });
    });
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
  const publicFlag = String(record.public || record.is_public || "")
    .trim()
    .toUpperCase();

  if (!name || !date) {
    return null;
  }

  return {
    name,
    location: location || "Location TBC",
    date,
    time: normaliseTime(record.time),
    isPublic: publicFlag !== "N",
    sortMinutes: parseStartMinutes(record.time),
  };
};

const getToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const updateNextGigBanner = (gig) => {
  if (!nextGigBanner) {
    return;
  }

  if (!gig) {
    nextGigBanner.textContent =
      "Upcoming gig details are loading. Visit the events page for the latest schedule.";
    return;
  }

  const timeSuffix = gig.time && gig.time !== "Time TBC" ? `, ${gig.time}` : "";
  nextGigBanner.textContent =
    `Next public appearance: ${gig.name}, ${gig.location} on ${fullDateFormatter.format(gig.date)}${timeSuffix}.`;
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
  if (!upcomingSchedule && !liveLegacy && !nextGigBanner) {
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
    const nextPublicGig = upcomingGigs.find((gig) => gig.isPublic) || null;
    const completedGigs = gigs
      .filter(
        (gig) =>
          gig.date < today && !staticLegacyYears.has(String(gig.date.getFullYear())),
      )
      .sort((firstGig, secondGig) => secondGig.date.getTime() - firstGig.date.getTime());

    updateNextGigBanner(nextPublicGig);
    renderUpcomingSchedule(upcomingGigs);
    renderLiveLegacy(completedGigs);
  } catch {
    updateNextGigBanner(null);
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

const requestJsonp = (endpoint, params = {}) =>
  new Promise((resolve) => {
    const callbackName = `cobpdJsonp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const separator = endpoint.includes("?") ? "&" : "?";
    const script = document.createElement("script");
    const query = new URLSearchParams({
      ...params,
      callback: callbackName,
    });

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, 5000);

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

    script.src = `${endpoint}${separator}${query.toString()}`;
    document.body.appendChild(script);
  });

const memberDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const membersResponseLabels = {
  yes: "Yes",
  no: "No",
  maybe: "Maybe",
  no_reply: "No reply",
};

const setMembersMessage = (element, message, tone = "") => {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove("is-error", "is-success");

  if (tone) {
    element.classList.add(tone);
  }
};

const getStoredMemberSessionToken = () => {
  try {
    return window.localStorage.getItem(MEMBER_SESSION_KEY) || "";
  } catch {
    return "";
  }
};

const storeMemberSessionToken = (token) => {
  try {
    if (!token) {
      window.localStorage.removeItem(MEMBER_SESSION_KEY);
      return;
    }

    window.localStorage.setItem(MEMBER_SESSION_KEY, token);
  } catch {
    // Ignore storage failures.
  }
};

const formatMemberAnsweredAt = (value) => {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return memberDateTimeFormatter.format(parsed);
};

const formatMemberDate = (value) => {
  const parsed = parseUkDate(value);
  return parsed ? fullDateFormatter.format(parsed) : String(value || "");
};

const getMembersRoleLabel = (member) =>
  [member.instrument, member.section].filter(Boolean).join(" · ");

const getResponseTagClass = (answer) => {
  if (answer === "yes") {
    return "members-response-tag members-response-tag--yes";
  }

  if (answer === "no") {
    return "members-response-tag members-response-tag--no";
  }

  if (answer === "maybe") {
    return "members-response-tag members-response-tag--maybe";
  }

  return "members-response-tag";
};

const groupRosterByInstrument = (roster = []) => {
  const groups = [];

  roster.forEach((member) => {
    const key = member.instrument || member.section || "Unassigned";
    const existingGroup = groups.find((group) => group.key === key);

    if (existingGroup) {
      existingGroup.members.push(member);
      return;
    }

    groups.push({
      key,
      label: key,
      members: [member],
    });
  });

  groups.forEach((group) => {
    group.members.sort((firstMember, secondMember) =>
      String(firstMember.name || "").localeCompare(String(secondMember.name || "")),
    );
  });

  return groups;
};

const renderRosterMember = (member) => {
  const answeredAt = formatMemberAnsweredAt(member.answered_at);
  const maybeReason =
    member.answer === "maybe" && member.reason
      ? `<p class="members-roster-member__meta">${escapeHtml(member.reason)}</p>`
      : "";
  const metaBits = answeredAt ? `Updated ${answeredAt}` : "";

  return `
    <article class="members-roster-member">
      <div class="members-roster-member__top">
        <span class="members-roster-member__name">${escapeHtml(member.name || "")}</span>
        <span class="${getResponseTagClass(member.answer)}">${escapeHtml(
          membersResponseLabels[member.answer] || "No reply",
        )}</span>
      </div>
      ${metaBits ? `<p class="members-roster-member__role">${escapeHtml(metaBits)}</p>` : ""}
      ${maybeReason}
    </article>
  `;
};

const renderRosterGroups = (roster) =>
  groupRosterByInstrument(roster)
    .map(
      (group) => `
        <section class="members-roster-group">
          <div class="members-roster-header">
            <h4>${escapeHtml(group.label)}</h4>
            <span class="members-roster-count">${group.members.length} members</span>
          </div>
          <div class="members-roster-list">
            ${group.members.map((member) => renderRosterMember(member)).join("")}
          </div>
        </section>
      `,
    )
    .join("");

const renderGigCard = (gig) => {
  const response = gig.my_response || {};
  const selectedAnswer = response.answer || "";
  const maybeReason = response.reason || "";
  const answeredAt = formatMemberAnsweredAt(response.answered_at);
  const statusCopy = response.answer
    ? `Your current reply is ${membersResponseLabels[response.answer] || response.answer}.`
    : "You have not replied yet.";

  return `
    <article class="members-gig">
      <div class="members-gig__top">
        <div class="members-gig__heading">
          <p class="eyebrow">Gig</p>
          <h3>${escapeHtml(gig.name || "")}</h3>
          <p class="members-gig__meta">
            <span>${escapeHtml(formatMemberDate(gig.date || ""))}</span>
            <span>${escapeHtml(gig.time || "Time TBC")}</span>
            <span>${escapeHtml(gig.location || "Location TBC")}</span>
          </p>
        </div>
        <div class="members-gig__flags">
          ${
            gig.status
              ? `<span class="members-gig__flag">${escapeHtml(gig.status)}</span>`
              : ""
          }
          <span class="members-gig__flag ${
            gig.public ? "members-gig__flag--public" : "members-gig__flag--internal"
          }">${gig.public ? "Public" : "Members only"}</span>
        </div>
      </div>

      <div class="members-stats" aria-label="Gig response totals">
        <div class="members-stat">
          <span class="members-stat__value">${gig.stats?.yes || 0}</span>
          <span class="members-stat__label">Yes</span>
        </div>
        <div class="members-stat">
          <span class="members-stat__value">${gig.stats?.no || 0}</span>
          <span class="members-stat__label">No</span>
        </div>
        <div class="members-stat">
          <span class="members-stat__value">${gig.stats?.maybe || 0}</span>
          <span class="members-stat__label">Maybe</span>
        </div>
        <div class="members-stat">
          <span class="members-stat__value">${gig.stats?.no_reply || 0}</span>
          <span class="members-stat__label">No reply</span>
        </div>
      </div>

      <form class="members-response" data-members-response-form data-gig-id="${escapeHtml(
        gig.id || "",
      )}">
        <input type="hidden" name="answer" value="${escapeHtml(selectedAnswer)}" />
        <div class="members-response__choices" role="group" aria-label="Select your reply">
          <button class="members-choice ${
            selectedAnswer === "yes" ? "is-selected" : ""
          }" type="button" data-answer="yes">Yes</button>
          <button class="members-choice ${
            selectedAnswer === "no" ? "is-selected" : ""
          }" type="button" data-answer="no">No</button>
          <button class="members-choice ${
            selectedAnswer === "maybe" ? "is-selected" : ""
          }" type="button" data-answer="maybe">Maybe</button>
        </div>

        <label class="members-response__reason" ${
          selectedAnswer === "maybe" ? "" : "hidden"
        }>
          <span class="members-response__reason-label">Maybe reason</span>
          <textarea
            class="field__control field__control--textarea"
            name="reason"
            rows="3"
          >${escapeHtml(maybeReason)}</textarea>
        </label>

        <div class="members-response__footer">
          <button class="button button--solid" type="submit">Save reply</button>
          <p class="members-response__meta">${
            answeredAt ? `${statusCopy} Saved ${answeredAt}.` : statusCopy
          }</p>
        </div>
        <p class="members-status" data-members-response-status aria-live="polite"></p>
      </form>

      <div class="members-roster">
        ${renderRosterGroups(gig.roster || [])}
      </div>
    </article>
  `;
};

const showMembersAuth = () => {
  membersAuth?.removeAttribute("hidden");
  membersApp?.setAttribute("hidden", "true");
};

const showMembersApp = () => {
  membersAuth?.setAttribute("hidden", "true");
  membersApp?.removeAttribute("hidden");
};

const renderMembersDashboard = (payload) => {
  const member = payload?.member || {};
  const gigs = Array.isArray(payload?.gigs) ? payload.gigs : [];

  if (membersName) {
    membersName.textContent = member.name || "Member dashboard";
  }

  if (membersRole) {
    membersRole.textContent = getMembersRoleLabel(member);
  }

  if (membersEmpty) {
    membersEmpty.hidden = gigs.length > 0;
    membersEmpty.textContent = gigs.length
      ? ""
      : "No member gigs are currently available.";
  }

  if (membersGigs) {
    membersGigs.innerHTML = gigs.map((gig) => renderGigCard(gig)).join("");
  }

  showMembersApp();
};

const postMembersAction = async (action, payload, onProgress) => {
  const requestId = createRequestId();
  const formData = new URLSearchParams({
    ...payload,
    action,
    request_id: requestId,
  });

  await fetch(MEMBERS_ENDPOINT, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: formData.toString(),
  });

  return pollSubmissionStatus(MEMBERS_ENDPOINT, requestId, onProgress);
};

const loadMembersDashboard = async (token, statusMessage = "") => {
  if (!token) {
    storeMemberSessionToken("");
    showMembersAuth();
    return;
  }

  setMembersMessage(membersStatus, statusMessage);
  const payload = await requestJsonp(MEMBERS_ENDPOINT, {
    action: "member_dashboard",
    token,
  });

  if (!payload?.ok || !payload?.authenticated) {
    storeMemberSessionToken("");
    showMembersAuth();
    setMembersMessage(
      membersLoginStatus,
      "Your members session is no longer valid. Please sign in again.",
      "is-error",
    );
    return;
  }

  renderMembersDashboard(payload);
};

const updateMembersAnswerState = (form, answer) => {
  if (!form) {
    return;
  }

  const answerInput = form.querySelector('input[name="answer"]');
  const reasonField = form.querySelector(".members-response__reason");

  if (answerInput) {
    answerInput.value = answer;
  }

  form.querySelectorAll("[data-answer]").forEach((button) => {
    button.classList.toggle("is-selected", button.getAttribute("data-answer") === answer);
  });

  if (reasonField) {
    reasonField.hidden = answer !== "maybe";
  }
};

if (membersLoginForm) {
  membersLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!membersLoginForm.reportValidity()) {
      return;
    }

    const submitButton = membersLoginForm.querySelector('button[type="submit"]');
    const email = membersLoginForm.querySelector('input[name="email"]')?.value.trim() || "";
    const password = membersLoginForm.querySelector('input[name="password"]')?.value || "";

    submitButton?.setAttribute("disabled", "true");
    setMembersMessage(membersLoginStatus, "Signing in.");

    try {
      const status = await postMembersAction(
        "member_login",
        {
          email,
          password,
        },
        () => {
          setMembersMessage(membersLoginStatus, "Login request received. Finishing sign-in.");
        },
      );

      if (status?.ok && status.token) {
        storeMemberSessionToken(status.token);
        membersLoginForm.reset();
        setMembersMessage(membersLoginStatus, "");
        await loadMembersDashboard(status.token, "Signed in.");
        setMembersMessage(membersStatus, "Signed in.", "is-success");
        return;
      }

      setMembersMessage(
        membersLoginStatus,
        status?.error === "invalid_credentials"
          ? "Those login details were not accepted."
          : "Sign-in failed. Please try again.",
        "is-error",
      );
    } catch {
      setMembersMessage(
        membersLoginStatus,
        "Sign-in could not be completed from your browser. Please try again.",
        "is-error",
      );
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  });
}

membersLogoutButton?.addEventListener("click", async () => {
  const token = getStoredMemberSessionToken();

  try {
    if (token) {
      await postMembersAction("member_logout", { token });
    }
  } catch {
    // Ignore logout failures and clear local state anyway.
  }

  storeMemberSessionToken("");
  showMembersAuth();
  setMembersMessage(membersStatus, "");
  setMembersMessage(membersLoginStatus, "Signed out.", "is-success");
});

membersGigs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-answer]");

  if (!button) {
    return;
  }

  const form = button.closest("[data-members-response-form]");
  const answer = button.getAttribute("data-answer") || "";
  updateMembersAnswerState(form, answer);
});

membersGigs?.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-members-response-form]");

  if (!form) {
    return;
  }

  event.preventDefault();

  const token = getStoredMemberSessionToken();
  const gigId = form.getAttribute("data-gig-id") || "";
  const answer = form.querySelector('input[name="answer"]')?.value || "";
  const reason = form.querySelector('textarea[name="reason"]')?.value.trim() || "";
  const submitButton = form.querySelector('button[type="submit"]');
  const statusNode = form.querySelector("[data-members-response-status]");

  if (!answer) {
    setMembersMessage(statusNode, "Pick yes, no, or maybe before saving.", "is-error");
    return;
  }

  if (!token) {
    storeMemberSessionToken("");
    showMembersAuth();
    setMembersMessage(
      membersLoginStatus,
      "Your members session has expired. Please sign in again.",
      "is-error",
    );
    return;
  }

  submitButton?.setAttribute("disabled", "true");
  setMembersMessage(statusNode, "Saving reply.");

  try {
    const status = await postMembersAction(
      "member_response",
      {
        token,
        gig_id: gigId,
        answer,
        reason,
      },
      () => {
        setMembersMessage(statusNode, "Reply received. Updating the dashboard.");
      },
    );

    if (status?.ok) {
      setMembersMessage(statusNode, "Reply saved.", "is-success");
      await loadMembersDashboard(token, "Dashboard refreshed.");
      return;
    }

    if (status?.error === "invalid_session") {
      storeMemberSessionToken("");
      showMembersAuth();
      setMembersMessage(
        membersLoginStatus,
        "Your members session has expired. Please sign in again.",
        "is-error",
      );
      return;
    }

    setMembersMessage(statusNode, "Reply could not be saved. Please try again.", "is-error");
  } catch {
    setMembersMessage(statusNode, "Reply could not be saved. Please try again.", "is-error");
  } finally {
    submitButton?.removeAttribute("disabled");
  }
});

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

if (membersPage) {
  const storedToken = getStoredMemberSessionToken();

  if (storedToken) {
    loadMembersDashboard(storedToken);
  } else {
    showMembersAuth();
  }
}
