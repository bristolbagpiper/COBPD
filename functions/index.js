const {initializeApp} = require("firebase-admin/app");
const {
  FieldValue,
  getFirestore,
} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {Resend} = require("resend");

initializeApp();

const db = getFirestore();
const MEMBERS_PORTAL_URL =
  process.env.MEMBERS_PORTAL_URL || "https://www.bristolpipeband.org/members.html";
const EMAIL_FROM =
  process.env.EMAIL_FROM || "City of Bristol Pipes and Drums <hello@bristolpipeband.org>";

function normaliseQueueStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function toMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function isQueueRequested(beforeData, afterData, prefix) {
  const afterStatus = normaliseQueueStatus(afterData[`${prefix}Status`]);

  if (afterStatus !== "queued") {
    return false;
  }

  const beforeStatus = normaliseQueueStatus(beforeData?.[`${prefix}Status`]);
  const beforeRequestedAt = toMillis(beforeData?.[`${prefix}RequestedAt`]);
  const afterRequestedAt = toMillis(afterData[`${prefix}RequestedAt`]);

  return beforeStatus !== "queued" || beforeRequestedAt !== afterRequestedAt;
}

async function getActiveMembers() {
  const snapshot = await db.collection("members").where("active", "==", true).get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter((member) => String(member.email || "").trim());
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>\"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };

    return entities[character] || character;
  });
}

function buildGigFacts(gig) {
  return [
    gig.date ? `Date: ${gig.date}` : "",
    gig.time ? `Time: ${gig.time}` : "",
    gig.location ? `Location: ${gig.location}` : "",
    gig.status ? `Status: ${gig.status}` : "",
  ].filter(Boolean);
}

function buildNotificationEmail(member, gig) {
  const facts = buildGigFacts(gig);
  const greetingName = member.name || "band member";
  const subject = `Gig update: ${gig.name || "Band gig"}`;
  const notesBlock = gig.notes
    ? `<p><strong>Notes:</strong><br>${escapeHtml(gig.notes).replace(/\n/g, "<br>")}</p>`
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0b1633; line-height: 1.5;">
      <p>Hello ${escapeHtml(greetingName)},</p>
      <p>A gig has been added to the members portal and is ready for responses.</p>
      <p><strong>${escapeHtml(gig.name || "Band gig")}</strong></p>
      <p>${facts.map((fact) => escapeHtml(fact)).join("<br>")}</p>
      ${notesBlock}
      <p>Please sign in and reply yes, no, or maybe.</p>
      <p><a href="${escapeHtml(MEMBERS_PORTAL_URL)}">Open the members portal</a></p>
    </div>
  `;

  const text = [
    `Hello ${greetingName},`,
    "",
    "A gig has been added to the members portal and is ready for responses.",
    gig.name || "Band gig",
    ...facts,
    gig.notes ? "" : "",
    gig.notes ? `Notes: ${gig.notes}` : "",
    "",
    `Open the members portal: ${MEMBERS_PORTAL_URL}`,
  ]
    .filter((line, index, array) => !(line === "" && array[index - 1] === ""))
    .join("\n");

  return {subject, html, text};
}

function buildReminderEmail(member, gig) {
  const base = buildNotificationEmail(member, gig);

  return {
    subject: `Reminder: ${gig.name || "Band gig"} reply needed`,
    html: base.html.replace(
      "A gig has been added to the members portal and is ready for responses.",
      "This is a reminder to reply to the gig in the members portal.",
    ),
    text: base.text.replace(
      "A gig has been added to the members portal and is ready for responses.",
      "This is a reminder to reply to the gig in the members portal.",
    ),
  };
}

async function claimQueuedSend(gigId, prefix, expectedRequestedAt) {
  const gigRef = db.collection("gigs").doc(gigId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(gigRef);

    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() || {};
    const currentStatus = normaliseQueueStatus(data[`${prefix}Status`]);
    const currentRequestedAt = toMillis(data[`${prefix}RequestedAt`]);

    if (currentStatus !== "queued" || currentRequestedAt !== expectedRequestedAt) {
      return null;
    }

    transaction.set(
      gigRef,
      {
        [`${prefix}Status`]: "sending",
        [`${prefix}SendingAt`]: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    return {id: snapshot.id, ...data};
  });
}

async function markQueueResult(gigId, prefix, status, errorMessage) {
  const update = {
    [`${prefix}Status`]: status,
    [`${prefix}Error`]: errorMessage || "",
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (status === "sent") {
    update[`${prefix}SentAt`] = FieldValue.serverTimestamp();
  }

  await db.collection("gigs").doc(gigId).set(update, {merge: true});
}

async function sendEmailsForQueue(gigId, gig, prefix) {
  const members = await getActiveMembers();

  if (!members.length) {
    await markQueueResult(gigId, prefix, "failed", "No active members with email addresses.");
    return;
  }

  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY secret is missing.");
  }

  const resend = new Resend(resendApiKey);
  const buildEmail = prefix === "notification" ? buildNotificationEmail : buildReminderEmail;

  const results = await Promise.allSettled(
    members.map((member) => {
      const email = buildEmail(member, gig);

      return resend.emails.send({
        from: EMAIL_FROM,
        to: member.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    }),
  );

  const failures = results
    .map((result, index) => {
      if (result.status === "fulfilled") {
        return null;
      }

      const member = members[index];
      const reason = result.reason?.message || String(result.reason || "Unknown email error");
      return `${member.email}: ${reason}`;
    })
    .filter(Boolean);

  if (failures.length) {
    await markQueueResult(gigId, prefix, "failed", failures.join(" | ").slice(0, 4000));
    return;
  }

  await markQueueResult(gigId, prefix, "sent", "");
}

async function processQueueType(gigId, beforeData, afterData, prefix) {
  if (!isQueueRequested(beforeData, afterData, prefix)) {
    return;
  }

  const requestedAt = toMillis(afterData[`${prefix}RequestedAt`]);
  const claimedGig = await claimQueuedSend(gigId, prefix, requestedAt);

  if (!claimedGig) {
    logger.info(`Skipped ${prefix} queue for ${gigId}; another worker already claimed it.`);
    return;
  }

  try {
    await sendEmailsForQueue(gigId, claimedGig, prefix);
    logger.info(`Processed ${prefix} queue for ${gigId}.`);
  } catch (error) {
    logger.error(`Failed processing ${prefix} queue for ${gigId}.`, error);
    await markQueueResult(gigId, prefix, "failed", error.message || String(error));
  }
}

exports.processGigEmailQueue = onDocumentWritten(
  {
    document: "gigs/{gigId}",
    region: "europe-west2",
    secrets: ["RESEND_API_KEY"],
  },
  async (event) => {
    const beforeData = event.data?.before?.data() || null;
    const afterData = event.data?.after?.data() || null;
    const gigId = event.params.gigId;

    if (!afterData) {
      return;
    }

    await processQueueType(gigId, beforeData, afterData, "notification");
    await processQueueType(gigId, beforeData, afterData, "reminder");
  },
);
