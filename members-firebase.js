import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  firebaseCollections,
  firebaseConfig,
  firebaseEnabled,
} from "./firebase-config.js";

const membersPage = document.querySelector("[data-members-page]");

if (!membersPage) {
  // Members client only runs on the members page.
} else {
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
  const membersAdmin = document.querySelector("[data-members-admin]");
  const membersAdminForm = document.querySelector("[data-members-admin-form]");
  const membersAdminSubmit = document.querySelector("[data-members-admin-submit]");
  const membersAdminReset = document.querySelector("[data-members-admin-reset]");
  const membersAdminFormStatus = document.querySelector("[data-members-admin-form-status]");
  const membersAdminStatus = document.querySelector("[data-members-admin-status]");
  const membersAdminGigs = document.querySelector("[data-members-admin-gigs]");

  const memberDateFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const memberDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const responseLabels = {
    yes: "Yes",
    no: "No",
    maybe: "Maybe",
    no_reply: "No reply",
  };

  const setMessage = (element, message, tone = "") => {
    if (!element) {
      return;
    }

    element.textContent = message;
    element.classList.remove("is-error", "is-success");

    if (tone) {
      element.classList.add(tone);
    }
  };

  const showAuth = () => {
    membersAuth?.removeAttribute("hidden");
    membersApp?.setAttribute("hidden", "true");
  };

  const showApp = () => {
    membersAuth?.setAttribute("hidden", "true");
    membersApp?.removeAttribute("hidden");
  };

  const toggleAdmin = (isVisible) => {
    if (!membersAdmin) {
      return;
    }

    if (isVisible) {
      membersAdmin.removeAttribute("hidden");
      return;
    }

    membersAdmin.setAttribute("hidden", "true");
  };

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>\"']/g, (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };

      return entities[character] || character;
    });

  const parseUkDate = (value) => {
    const match = String(value || "")
      .trim()
      .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (!match) {
      return null;
    }

    const day = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const year = Number(match[3]);
    const parsed = new Date(year, monthIndex, day);

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== monthIndex ||
      parsed.getDate() !== day
    ) {
      return null;
    }

    parsed.setHours(0, 0, 0, 0);
    return parsed;
  };

  const formatGigDate = (value) => {
    if (!value) {
      return "";
    }

    if (typeof value.toDate === "function") {
      return memberDateFormatter.format(value.toDate());
    }

    if (value instanceof Date) {
      return memberDateFormatter.format(value);
    }

    const parsed = parseUkDate(value);
    return parsed ? memberDateFormatter.format(parsed) : String(value || "");
  };

  const formatAnsweredAt = (value) => {
    if (!value) {
      return "";
    }

    const parsed =
      typeof value.toDate === "function" ? value.toDate() : new Date(String(value || ""));

    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return memberDateTimeFormatter.format(parsed);
  };

  const toDateInputValue = (value) => {
    let parsed = null;

    if (typeof value?.toDate === "function") {
      parsed = value.toDate();
    } else if (value instanceof Date) {
      parsed = value;
    } else {
      parsed = parseUkDate(value);
    }

    if (!parsed || Number.isNaN(parsed.getTime())) {
      return "";
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const fromDateInputValue = (value) => {
    const match = String(value || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return "";
    }

    return `${match[3]}/${match[2]}/${match[1]}`;
  };

  const normaliseTime = (value) => {
    const text = String(value || "")
      .trim()
      .replace(/\s+/g, " ");

    if (!text) {
      return "Time TBC";
    }

    const matches = text.match(/\b\d{1,2}:\d{2}\b/g) || [];

    if (matches.length >= 2) {
      return `${matches[0]} - ${matches[1]}`;
    }

    if (matches.length === 1) {
      return matches[0];
    }

    return text.replace(/\s*-\s*/g, " - ");
  };

  const parseStartMinutes = (value) => {
    const match = normaliseTime(value).match(/(\d{1,2}):(\d{2})/);

    if (!match) {
      return Number.POSITIVE_INFINITY;
    }

    return Number(match[1]) * 60 + Number(match[2]);
  };

  const getMemberLabelLegacy = (member) =>
    [member.instrument, member.role, member.section].filter(Boolean).join(" · ");

  const getMemberLabel = (member) =>
    [member.instrument, member.role, member.section, member.admin ? "Admin" : ""]
      .filter(Boolean)
      .join(" / ");

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
      const existing = groups.find((group) => group.key === key);

      if (existing) {
        existing.members.push(member);
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
    const answeredAt = formatAnsweredAt(member.answered_at);
    const maybeReason =
      member.answer === "maybe" && member.reason
        ? `<p class="members-roster-member__meta">${escapeHtml(member.reason)}</p>`
        : "";
    const metaBits = [member.role]
      .concat(answeredAt ? [`Updated ${answeredAt}`] : [])
      .filter(Boolean)
      .join(" · ");

    return `
      <article class="members-roster-member">
        <div class="members-roster-member__top">
          <span class="members-roster-member__name">${escapeHtml(member.name || "")}</span>
          <span class="${getResponseTagClass(member.answer)}">${escapeHtml(
            responseLabels[member.answer] || "No reply",
          )}</span>
        </div>
        ${metaBits ? `<p class="members-roster-member__role">${escapeHtml(metaBits)}</p>` : ""}
        ${maybeReason}
      </article>
    `;
  };

  const renderRosterGroups = (roster = []) =>
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
    const answeredAt = formatAnsweredAt(response.answered_at);
    const statusCopy = response.answer
      ? `Your current reply is ${responseLabels[response.answer] || response.answer}.`
      : "You have not replied yet.";

    return `
      <article class="members-gig">
        <div class="members-gig__top">
          <div class="members-gig__heading">
            <p class="eyebrow">Gig</p>
            <h3>${escapeHtml(gig.name || "")}</h3>
            <p class="members-gig__meta">
              <span>${escapeHtml(formatGigDate(gig.date))}</span>
              <span>${escapeHtml(normaliseTime(gig.time || ""))}</span>
              <span>${escapeHtml(gig.location || "Location TBC")}</span>
            </p>
          </div>
          <div class="members-gig__flags">
            ${gig.status ? `<span class="members-gig__flag">${escapeHtml(gig.status)}</span>` : ""}
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

        ${gig.notes ? `<p class="members-gig__notes">${escapeHtml(gig.notes)}</p>` : ""}

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

  const updateAnswerState = (form, answer) => {
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

  const sortGigRecords = (gigs = [], includeArchived = false) =>
    gigs
      .filter((gig) => includeArchived || !gig.archived)
      .sort((firstGig, secondGig) => {
        const firstArchived = firstGig.archived === true ? 1 : 0;
        const secondArchived = secondGig.archived === true ? 1 : 0;

        if (firstArchived !== secondArchived) {
          return firstArchived - secondArchived;
        }

        const firstDate =
          typeof firstGig.date?.toDate === "function"
            ? firstGig.date.toDate().getTime()
            : parseUkDate(firstGig.date || "")?.getTime() || Number.POSITIVE_INFINITY;
        const secondDate =
          typeof secondGig.date?.toDate === "function"
            ? secondGig.date.toDate().getTime()
            : parseUkDate(secondGig.date || "")?.getTime() || Number.POSITIVE_INFINITY;

        if (firstDate !== secondDate) {
          return firstDate - secondDate;
        }

        return parseStartMinutes(firstGig.time || "") - parseStartMinutes(secondGig.time || "");
      });

  const mapDashboardGigs = (member, members, gigs, responses) => {
    const responsesByGig = responses.reduce((index, response) => {
      if (!response.gigId || !response.memberId) {
        return index;
      }

      if (!index[response.gigId]) {
        index[response.gigId] = {};
      }

      index[response.gigId][response.memberId] = response;
      return index;
    }, {});

    return sortGigRecords(gigs).map((gig) => {
      const responseMap = responsesByGig[gig.id] || {};
      const roster = members.map((rosterMember) => {
        const response = responseMap[rosterMember.id] || null;

        return {
          member_id: rosterMember.id,
          name: rosterMember.name,
          section: rosterMember.section,
          instrument: rosterMember.instrument,
          role: rosterMember.role,
          answer: response ? response.answer : "no_reply",
          reason: response ? response.reason : "",
          answered_at: response ? response.answeredAt : "",
        };
      });

      const stats = roster.reduce(
        (totals, rosterMember) => {
          if (rosterMember.answer === "yes") {
            totals.yes += 1;
          } else if (rosterMember.answer === "no") {
            totals.no += 1;
          } else if (rosterMember.answer === "maybe") {
            totals.maybe += 1;
          } else {
            totals.no_reply += 1;
          }

          return totals;
        },
        {
          yes: 0,
          no: 0,
          maybe: 0,
          no_reply: 0,
        },
      );

      const myResponse = responseMap[member.id] || null;

      return {
        id: gig.id,
        name: gig.name || "",
        location: gig.location || "",
        date: gig.date || "",
        time: gig.time || "",
        status: gig.status || "",
        public: gig.public !== false,
        notes: gig.notes || "",
        archived: gig.archived === true,
        stats,
        my_response: myResponse
          ? {
              answer: myResponse.answer,
              reason: myResponse.reason,
              answered_at: myResponse.answeredAt,
            }
          : {
              answer: "",
              reason: "",
              answered_at: "",
            },
        roster,
      };
    });
  };

  const getQueueCopy = (label, gig, fieldPrefix) => {
    const status = String(gig[`${fieldPrefix}Status`] || "")
      .trim()
      .toLowerCase();
    const requestedAt = formatAnsweredAt(gig[`${fieldPrefix}RequestedAt`]);
    const sentAt = formatAnsweredAt(gig[`${fieldPrefix}SentAt`]);

    if (sentAt) {
      return `${label} sent ${sentAt}.`;
    }

    if (status === "queued" || requestedAt) {
      return `${label} queued${requestedAt ? ` ${requestedAt}` : ""}.`;
    }

    return `No ${label.toLowerCase()} queued yet.`;
  };

  const renderAdminGigCard = (gig) => {
    const isArchived = gig.archived === true;
    const summaryBits = [
      formatGigDate(gig.date),
      normaliseTime(gig.time || ""),
      gig.location || "Location TBC",
    ].filter(Boolean);

    return `
      <article class="members-admin-card">
        <div class="members-admin-card__top">
          <div class="members-admin-card__heading">
            <h4>${escapeHtml(gig.name || "Untitled gig")}</h4>
            <p class="members-admin-card__summary">${escapeHtml(summaryBits.join(" / "))}</p>
          </div>
          <div class="members-gig__flags">
            ${gig.status ? `<span class="members-gig__flag">${escapeHtml(gig.status)}</span>` : ""}
            <span class="members-gig__flag ${
              gig.public ? "members-gig__flag--public" : "members-gig__flag--internal"
            }">${gig.public ? "Public" : "Members only"}</span>
            ${isArchived ? '<span class="members-gig__flag">Archived</span>' : ""}
          </div>
        </div>

        ${gig.notes ? `<p class="members-admin-card__summary">${escapeHtml(gig.notes)}</p>` : ""}

        <div class="members-admin-card__queue">
          <p>${escapeHtml(getQueueCopy("Notification", gig, "notification"))}</p>
          <p>${escapeHtml(getQueueCopy("Reminder", gig, "reminder"))}</p>
        </div>

        <div class="members-admin-card__actions">
          <button
            class="button button--ghost-dark"
            type="button"
            data-admin-action="edit"
            data-gig-id="${escapeHtml(gig.id)}"
          >
            Edit gig
          </button>
          <button
            class="button button--solid"
            type="button"
            data-admin-action="queue-notification"
            data-gig-id="${escapeHtml(gig.id)}"
            ${isArchived ? "disabled" : ""}
          >
            Queue notify all
          </button>
          <button
            class="button button--ghost-dark"
            type="button"
            data-admin-action="queue-reminder"
            data-gig-id="${escapeHtml(gig.id)}"
            ${isArchived ? "disabled" : ""}
          >
            Queue reminder
          </button>
        </div>
      </article>
    `;
  };

  const resetAdminForm = (clearStatus = true) => {
    if (!membersAdminForm) {
      return;
    }

    membersAdminForm.reset();
    membersAdminForm.querySelector('input[name="gig_id"]').value = "";
    membersAdminForm.querySelector('input[name="public"]').checked = true;
    membersAdminForm.querySelector('input[name="archived"]').checked = false;

    if (membersAdminSubmit) {
      membersAdminSubmit.textContent = "Create gig";
    }

    if (clearStatus) {
      setMessage(membersAdminFormStatus, "");
    }
  };

  const populateAdminForm = (gig) => {
    if (!membersAdminForm || !gig) {
      return;
    }

    membersAdminForm.querySelector('input[name="gig_id"]').value = gig.id || "";
    membersAdminForm.querySelector('input[name="name"]').value = gig.name || "";
    membersAdminForm.querySelector('input[name="date"]').value = toDateInputValue(gig.date);
    membersAdminForm.querySelector('input[name="location"]').value = gig.location || "";
    membersAdminForm.querySelector('input[name="time"]').value = gig.time || "";
    membersAdminForm.querySelector('input[name="status"]').value = gig.status || "";
    membersAdminForm.querySelector('textarea[name="notes"]').value = gig.notes || "";
    membersAdminForm.querySelector('input[name="public"]').checked = gig.public !== false;
    membersAdminForm.querySelector('input[name="archived"]').checked = gig.archived === true;

    if (membersAdminSubmit) {
      membersAdminSubmit.textContent = "Save changes";
    }

    setMessage(
      membersAdminFormStatus,
      `Editing ${gig.name || "gig"}. Save changes when ready.`,
    );
  };

  const renderAdminPanel = (member, gigs) => {
    if (!member?.admin) {
      toggleAdmin(false);

      if (membersAdminGigs) {
        membersAdminGigs.innerHTML = "";
      }

      resetAdminForm();
      setMessage(membersAdminStatus, "");
      return;
    }

    toggleAdmin(true);

    if (membersAdminGigs) {
      const sortedGigs = sortGigRecords(gigs, true);
      membersAdminGigs.innerHTML = sortedGigs.length
        ? sortedGigs.map((gig) => renderAdminGigCard(gig)).join("")
        : '<div class="members-empty">No gigs have been created in Firestore yet.</div>';
    }
  };

  const renderDashboard = (member, gigs, adminGigs) => {
    if (membersName) {
      membersName.textContent = member.name || "Member dashboard";
    }

    if (membersRole) {
      membersRole.textContent = getMemberLabel(member);
    }

    if (membersEmpty) {
      membersEmpty.hidden = gigs.length > 0;
      membersEmpty.textContent = gigs.length
        ? ""
        : "No member gigs are currently available in Firestore.";
    }

    if (membersGigs) {
      membersGigs.innerHTML = gigs.map((gig) => renderGigCard(gig)).join("");
    }

    renderAdminPanel(member, adminGigs);
    showApp();
  };

  const getAuthErrorMessage = (error) => {
    const code = String(error?.code || "");

    if (code === "auth/invalid-email") {
      return "Please enter a valid email address.";
    }

    if (
      code === "auth/invalid-credential" ||
      code === "auth/user-not-found" ||
      code === "auth/wrong-password"
    ) {
      return "Those login details were not accepted.";
    }

    if (code === "auth/user-disabled") {
      return "This member account has been disabled.";
    }

    if (code === "auth/too-many-requests") {
      return "Too many sign-in attempts. Please wait a moment and try again.";
    }

    return "Sign-in failed. Please try again.";
  };

  const getFirebaseErrorMessage = (error, fallbackMessage) => {
    const code = String(error?.code || "").trim();
    const message = String(error?.message || "").trim();

    if (code && message) {
      return `${fallbackMessage} (${code}: ${message})`;
    }

    if (code) {
      return `${fallbackMessage} (${code})`;
    }

    if (message) {
      return `${fallbackMessage} (${message})`;
    }

    return fallbackMessage;
  };

  let auth = null;
  let db = null;
  let currentMember = null;
  let currentMembers = [];
  let currentGigs = [];
  let currentResponses = [];
  let isLoadingDashboard = false;

  const loadDashboard = async (user, statusMessage = "") => {
    if (!auth || !db || !user || isLoadingDashboard) {
      return;
    }

    isLoadingDashboard = true;
    setMessage(membersStatus, statusMessage);

    try {
      const memberSnapshot = await getDoc(doc(db, firebaseCollections.members, user.uid));

      if (!memberSnapshot.exists()) {
        await signOut(auth);
        setMessage(
          membersLoginStatus,
          "Your Firebase account exists, but there is no matching member profile yet.",
          "is-error",
        );
        return;
      }

      const memberData = {
        id: memberSnapshot.id,
        ...memberSnapshot.data(),
      };

      if (memberData.active === false) {
        await signOut(auth);
        setMessage(membersLoginStatus, "This member account is not active.", "is-error");
        return;
      }

      const [membersSnapshot, gigsSnapshot, responsesSnapshot] = await Promise.all([
        getDocs(collection(db, firebaseCollections.members)),
        getDocs(collection(db, firebaseCollections.gigs)),
        getDocs(collection(db, firebaseCollections.responses)),
      ]);

      currentMember = memberData;
      currentMembers = membersSnapshot.docs
        .map((snapshot) => ({
          id: snapshot.id,
          ...snapshot.data(),
        }))
        .filter((member) => member.active !== false)
        .sort((firstMember, secondMember) =>
          [firstMember.section, firstMember.instrument, firstMember.name]
            .map((value) => String(value || "").toLowerCase())
            .join("|")
            .localeCompare(
              [secondMember.section, secondMember.instrument, secondMember.name]
                .map((value) => String(value || "").toLowerCase())
                .join("|"),
            ),
        );

      currentGigs = gigsSnapshot.docs.map((snapshot) => ({
        id: snapshot.id,
        ...snapshot.data(),
      }));

      currentResponses = responsesSnapshot.docs.map((snapshot) => ({
        id: snapshot.id,
        ...snapshot.data(),
      }));

      renderDashboard(
        memberData,
        mapDashboardGigs(memberData, currentMembers, currentGigs, currentResponses),
        currentGigs,
      );
    } catch (error) {
      console.error("Firebase dashboard load failed", error);
      setMessage(
        membersLoginStatus,
        getFirebaseErrorMessage(
          error,
          "We could not load the members dashboard from Firebase. Check the config and Firestore rules.",
        ),
        "is-error",
      );
      showAuth();
    } finally {
      isLoadingDashboard = false;
    }
  };

  const saveGigFromForm = async () => {
    if (!membersAdminForm || !db || !auth?.currentUser || !currentMember?.admin) {
      return;
    }

    if (!membersAdminForm.reportValidity()) {
      return;
    }

    const gigId = membersAdminForm.querySelector('input[name="gig_id"]').value.trim();
    const name = membersAdminForm.querySelector('input[name="name"]').value.trim();
    const date = fromDateInputValue(
      membersAdminForm.querySelector('input[name="date"]').value.trim(),
    );
    const location = membersAdminForm.querySelector('input[name="location"]').value.trim();
    const time = membersAdminForm.querySelector('input[name="time"]').value.trim();
    const status = membersAdminForm.querySelector('input[name="status"]').value.trim();
    const notes = membersAdminForm.querySelector('textarea[name="notes"]').value.trim();
    const isPublic = membersAdminForm.querySelector('input[name="public"]').checked;
    const isArchived = membersAdminForm.querySelector('input[name="archived"]').checked;

    if (!name || !date) {
      setMessage(
        membersAdminFormStatus,
        "Gig name and date are required before saving.",
        "is-error",
      );
      return;
    }

    membersAdminSubmit?.setAttribute("disabled", "true");
    membersAdminReset?.setAttribute("disabled", "true");
    setMessage(membersAdminFormStatus, gigId ? "Saving gig changes." : "Creating gig.");

    const payload = {
      name,
      date,
      location,
      time,
      status,
      public: isPublic,
      notes,
      archived: isArchived,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid,
    };

    try {
      if (gigId) {
        await setDoc(doc(db, firebaseCollections.gigs, gigId), payload, { merge: true });
      } else {
        await addDoc(collection(db, firebaseCollections.gigs), {
          ...payload,
          notificationStatus: "",
          reminderStatus: "",
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser.uid,
        });
      }

      await loadDashboard(auth.currentUser, "Dashboard refreshed.");
      resetAdminForm(false);
      setMessage(
        membersAdminFormStatus,
        gigId ? "Gig updated." : "Gig created.",
        "is-success",
      );
    } catch {
      setMessage(
        membersAdminFormStatus,
        "Gig changes could not be saved. Check your Firestore rules.",
        "is-error",
      );
    } finally {
      membersAdminSubmit?.removeAttribute("disabled");
      membersAdminReset?.removeAttribute("disabled");
    }
  };

  const queueGigAction = async (gigId, actionName) => {
    if (!gigId || !db || !auth?.currentUser || !currentMember?.admin) {
      return;
    }

    const gig = currentGigs.find((candidate) => candidate.id === gigId);

    if (!gig) {
      setMessage(membersAdminStatus, "That gig could not be found.", "is-error");
      return;
    }

    if (gig.archived) {
      setMessage(
        membersAdminStatus,
        "Archived gigs cannot be queued for notifications.",
        "is-error",
      );
      return;
    }

    const label = actionName === "notification" ? "Notification" : "Reminder";
    setMessage(membersAdminStatus, `${label} queue is being updated.`);

    try {
      await setDoc(
        doc(db, firebaseCollections.gigs, gigId),
        {
          [`${actionName}Status`]: "queued",
          [`${actionName}RequestedAt`]: serverTimestamp(),
          [`${actionName}RequestedBy`]: auth.currentUser.uid,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser.uid,
        },
        { merge: true },
      );

      await loadDashboard(auth.currentUser, "Dashboard refreshed.");
      setMessage(
        membersAdminStatus,
        `${label} queued for ${gig.name || "gig"}. A server-side mail job still needs to process it.`,
        "is-success",
      );
    } catch {
      setMessage(
        membersAdminStatus,
        `${label} could not be queued. Check your Firestore rules.`,
        "is-error",
      );
    }
  };

  membersGigs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-answer]");

    if (!button) {
      return;
    }

    const form = button.closest("[data-members-response-form]");
    const answer = button.getAttribute("data-answer") || "";
    updateAnswerState(form, answer);
  });

  membersGigs?.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-members-response-form]");

    if (!form || !db || !auth?.currentUser || !currentMember) {
      return;
    }

    event.preventDefault();

    const gigId = form.getAttribute("data-gig-id") || "";
    const answer = form.querySelector('input[name="answer"]')?.value || "";
    const reason = form.querySelector('textarea[name="reason"]')?.value.trim() || "";
    const submitButton = form.querySelector('button[type="submit"]');
    const statusNode = form.querySelector("[data-members-response-status]");

    if (!answer) {
      setMessage(statusNode, "Pick yes, no, or maybe before saving.", "is-error");
      return;
    }

    submitButton?.setAttribute("disabled", "true");
    setMessage(statusNode, "Saving reply.");

    try {
      await setDoc(
        doc(db, firebaseCollections.responses, `${gigId}__${auth.currentUser.uid}`),
        {
          gigId,
          memberId: auth.currentUser.uid,
          memberName: currentMember.name || auth.currentUser.email || "",
          email: currentMember.email || auth.currentUser.email || "",
          section: currentMember.section || "",
          instrument: currentMember.instrument || "",
          answer,
          reason: answer === "maybe" ? reason : "",
          answeredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setMessage(statusNode, "Reply saved.", "is-success");
      await loadDashboard(auth.currentUser, "Dashboard refreshed.");
    } catch {
      setMessage(statusNode, "Reply could not be saved. Please try again.", "is-error");
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  });

  membersAdminForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveGigFromForm();
  });

  membersAdminReset?.addEventListener("click", () => {
    resetAdminForm();
  });

  membersAdminGigs?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-admin-action]");

    if (!button || !currentMember?.admin) {
      return;
    }

    const action = button.getAttribute("data-admin-action");
    const gigId = button.getAttribute("data-gig-id") || "";

    if (action === "edit") {
      const gig = currentGigs.find((candidate) => candidate.id === gigId);

      if (!gig) {
        setMessage(membersAdminStatus, "That gig could not be found.", "is-error");
        return;
      }

      populateAdminForm(gig);
      setMessage(membersAdminStatus, "");
      return;
    }

    if (action === "queue-notification") {
      await queueGigAction(gigId, "notification");
      return;
    }

    if (action === "queue-reminder") {
      await queueGigAction(gigId, "reminder");
    }
  });

  membersLoginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!firebaseEnabled || !auth || !membersLoginForm.reportValidity()) {
      return;
    }

    const submitButton = membersLoginForm.querySelector('button[type="submit"]');
    const email = membersLoginForm.querySelector('input[name="email"]')?.value.trim() || "";
    const password = membersLoginForm.querySelector('input[name="password"]')?.value || "";

    submitButton?.setAttribute("disabled", "true");
    setMessage(membersLoginStatus, "Signing in.");

    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      membersLoginForm.reset();
      setMessage(membersLoginStatus, "");
    } catch (error) {
      setMessage(membersLoginStatus, getAuthErrorMessage(error), "is-error");
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  });

  membersLogoutButton?.addEventListener("click", async () => {
    if (!auth) {
      return;
    }

    await signOut(auth);
    currentMember = null;
    currentMembers = [];
    currentGigs = [];
    currentResponses = [];
    setMessage(membersStatus, "");
    setMessage(membersAdminStatus, "");
    setMessage(membersLoginStatus, "Signed out.", "is-success");
  });

  if (!firebaseEnabled) {
    showAuth();
    setMessage(
      membersLoginStatus,
      "Firebase is not configured yet. Fill in firebase-config.js before using the members area.",
      "is-error",
    );
  } else {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        currentMember = null;
        currentMembers = [];
        currentGigs = [];
        currentResponses = [];

        if (membersGigs) {
          membersGigs.innerHTML = "";
        }

        if (membersAdminGigs) {
          membersAdminGigs.innerHTML = "";
        }

        if (membersEmpty) {
          membersEmpty.hidden = true;
        }

        resetAdminForm();
        toggleAdmin(false);
        showAuth();
        return;
      }

      setMessage(membersLoginStatus, "");
      await loadDashboard(user, "Signed in.");
      setMessage(membersStatus, "Signed in.", "is-success");
    });
  }
}
