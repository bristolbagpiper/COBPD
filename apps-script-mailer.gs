const GIG_MAIL_LOG_SHEET_NAME = "Gig Mail Log";
const MAILER_SECRET_PROPERTY_NAME = "MAILER_SHARED_SECRET";
const FIRESTORE_PROJECT_PROPERTY_NAME = "FIRESTORE_PROJECT_ID";
const DEFAULT_FIRESTORE_PROJECT_ID = "cobpd-3bf88";
const FIRESTORE_DATABASE_ID = "(default)";
const FIRESTORE_PAGE_SIZE = 200;
const MEMBERS_PAGE_URL = "https://www.bristolpipeband.org/members.html";
const MAILER_SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/1Q1S6Ab-GbNCqK74XxjIkwFB1sOJ3va6SlZNnEbBJRGQ/edit?gid=1546190981#gid=1546190981";

function doPost(e) {
  const payload = parseMailerPayload_(e);
  const callback = payload.callback || "";

  if (!isValidMailerSecret_(payload.secret || "")) {
    return respondMailer_(403, { ok: false, error: "forbidden" }, callback);
  }

  if (payload.action === "send_gig_emails") {
    return handleSendGigEmails_(payload, callback);
  }

  if (payload.action === "process_queue") {
    const summary = processQueuedGigEmails_();
    return respondMailer_(200, { ok: true, summary: summary }, callback);
  }

  return respondMailer_(400, { ok: false, error: "unknown_action" }, callback);
}

function processQueuedGigEmails() {
  return processQueuedGigEmails_();
}

function processQueuedGigEmails_() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    return "Gig mail worker is already running.";
  }

  try {
    const projectId = getFirestoreProjectId_();
    const queuedJobs = getQueuedGigJobs_(projectId);

    if (!queuedJobs.length) {
      return "No queued gig emails found.";
    }

    const recipients = getGigMailRecipients_(projectId);

    if (!recipients.length) {
      return "No active members with email addresses were found.";
    }

    let jobCount = 0;
    let sentCount = 0;
    let failedCount = 0;

    queuedJobs.forEach(function (job) {
      jobCount += 1;
      markGigQueueStarted_(projectId, job.gig, job.kind);

      const gigPayload = Object.assign(
        {
          id: job.gig.id,
        },
        job.gig.data,
      );
      const results = sendGigMailBatch_(job.kind, gigPayload, recipients);
      const failures = results.filter(function (result) {
        return !result.ok;
      });

      sentCount += results.length - failures.length;
      failedCount += failures.length;

      logGigMailBatch_(job.kind, gigPayload, results);

      if (failures.length) {
        markGigQueueFinished_(projectId, job.gig, job.kind, {
          status: "failed",
          error: failures.length + " recipient(s) failed",
        });
        return;
      }

      markGigQueueFinished_(projectId, job.gig, job.kind, {
        status: "sent",
        error: "",
      });
    });

    return (
      "Processed " +
      jobCount +
      " queued job(s); sent " +
      sentCount +
      " email(s); " +
      failedCount +
      " failure(s)."
    );
  } finally {
    lock.releaseLock();
  }
}

function handleSendGigEmails_(payload, callback) {
  const kind = normalizeGigMailKind_(payload.kind || "notification");
  const gig = payload.gig || {};
  const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];

  if (!gig.name || !recipients.length) {
    return respondMailer_(400, { ok: false, error: "invalid_payload" }, callback);
  }

  const validRecipients = recipients
    .map(function (recipient) {
      return {
        email: normalizeMailerEmail_(recipient.email || ""),
        name: String(recipient.name || "").trim(),
      };
    })
    .filter(function (recipient) {
      return recipient.email;
    });

  if (!validRecipients.length) {
    return respondMailer_(400, { ok: false, error: "no_valid_recipients" }, callback);
  }

  const results = sendGigMailBatch_(kind, gig, validRecipients);
  logGigMailBatch_(kind, gig, results);

  const failures = results.filter(function (result) {
    return !result.ok;
  });

  return respondMailer_(
    failures.length ? 207 : 200,
    {
      ok: failures.length === 0,
      sent: results.length - failures.length,
      failed: failures.length,
      results: results,
    },
    callback,
  );
}

function getQueuedGigJobs_(projectId) {
  return listFirestoreCollectionDocuments_(projectId, "gigs")
    .map(toFirestoreDocumentView_)
    .filter(function (gig) {
      return gig.data.archived !== true;
    })
    .reduce(function (jobs, gig) {
      ["notification", "reminder"].forEach(function (kind) {
        const status = String(gig.data[kind + "Status"] || "")
          .trim()
          .toLowerCase();

        if (status === "queued") {
          jobs.push({
            kind: kind,
            gig: gig,
          });
        }
      });

      return jobs;
    }, []);
}

function getGigMailRecipients_(projectId) {
  return listFirestoreCollectionDocuments_(projectId, "members")
    .map(toFirestoreDocumentView_)
    .filter(function (member) {
      return member.data.active !== false && normalizeMailerEmail_(member.data.email || "");
    })
    .map(function (member) {
      return {
        email: normalizeMailerEmail_(member.data.email || ""),
        name: String(member.data.name || "").trim(),
      };
    });
}

function sendGigMailBatch_(kind, gig, recipients) {
  return recipients.map(function (recipient) {
    try {
      MailApp.sendEmail({
        to: recipient.email,
        subject: buildGigMailSubject_(kind, gig),
        body: buildGigMailBody_(kind, recipient, gig),
      });

      return {
        email: recipient.email,
        ok: true,
      };
    } catch (error) {
      return {
        email: recipient.email,
        ok: false,
        error: getMailerErrorMessage_(error),
      };
    }
  });
}

function markGigQueueStarted_(projectId, gig, kind) {
  updateFirestoreDocument_(
    projectId,
    gig.name,
    buildGigQueuePatch_(kind, {
      status: "sending",
      startedAt: new Date().toISOString(),
      error: "",
    }),
  );
}

function markGigQueueFinished_(projectId, gig, kind, result) {
  updateFirestoreDocument_(
    projectId,
    gig.name,
    buildGigQueuePatch_(kind, {
      status: result.status || "",
      sentAt: result.status === "sent" ? new Date().toISOString() : null,
      error: result.error || "",
    }),
  );
}

function buildGigQueuePatch_(kind, values) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(values, "status")) {
    patch[kind + "Status"] = values.status;
  }

  if (Object.prototype.hasOwnProperty.call(values, "startedAt")) {
    patch[kind + "StartedAt"] = values.startedAt;
  }

  if (Object.prototype.hasOwnProperty.call(values, "sentAt")) {
    patch[kind + "SentAt"] = values.sentAt;
  }

  if (Object.prototype.hasOwnProperty.call(values, "error")) {
    patch[kind + "Error"] = values.error;
  }

  patch.updatedAt = new Date().toISOString();
  return patch;
}

function listFirestoreCollectionDocuments_(projectId, collectionId) {
  const documents = [];
  let pageToken = "";

  while (true) {
    const baseUrl =
      buildFirestoreApiBaseUrl_(projectId) +
      "/documents/" +
      encodeURIComponent(collectionId) +
      "?pageSize=" +
      FIRESTORE_PAGE_SIZE;
    const url = pageToken
      ? baseUrl + "&pageToken=" + encodeURIComponent(pageToken)
      : baseUrl;
    const response = fetchFirestoreJson_(url, {
      method: "get",
    });
    const payload = response && typeof response === "object" ? response : {};

    (payload.documents || []).forEach(function (documentRecord) {
      documents.push(documentRecord);
    });

    if (!payload.nextPageToken) {
      break;
    }

    pageToken = payload.nextPageToken;
  }

  return documents;
}

function updateFirestoreDocument_(projectId, documentName, payload) {
  const fieldPaths = Object.keys(payload);

  if (!fieldPaths.length) {
    return;
  }

  const query = fieldPaths
    .map(function (fieldPath) {
      return "updateMask.fieldPaths=" + encodeURIComponent(fieldPath);
    })
    .join("&");
  const url =
    buildFirestoreApiBaseUrl_(projectId) +
    "/documents/" +
    getFirestoreDocumentPath_(documentName) +
    "?" +
    query +
    "&currentDocument.exists=true";

  fetchFirestoreJson_(url, {
    method: "patch",
    payload: JSON.stringify({
      fields: encodeFirestoreMap_(payload),
    }),
    contentType: "application/json",
  });
}

function fetchFirestoreJson_(url, options) {
  const response = UrlFetchApp.fetch(
    url,
    Object.assign(
      {
        muteHttpExceptions: true,
        headers: {
          Authorization: "Bearer " + ScriptApp.getOAuthToken(),
        },
      },
      options || {},
    ),
  );
  const statusCode = response.getResponseCode();
  const body = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error("Firestore API failed (" + statusCode + "): " + body);
  }

  return body ? JSON.parse(body) : {};
}

function buildFirestoreApiBaseUrl_(projectId) {
  return (
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(projectId) +
    "/databases/" +
    encodeURIComponent(FIRESTORE_DATABASE_ID)
  );
}

function toFirestoreDocumentView_(documentRecord) {
  return {
    id: String(documentRecord.name || "").split("/").pop(),
    name: String(documentRecord.name || ""),
    data: decodeFirestoreMap_(documentRecord.fields || {}),
  };
}

function getFirestoreProjectId_() {
  return String(
    PropertiesService.getScriptProperties().getProperty(FIRESTORE_PROJECT_PROPERTY_NAME) ||
      DEFAULT_FIRESTORE_PROJECT_ID,
  ).trim();
}

function getFirestoreDocumentPath_(documentName) {
  const marker = "/documents/";
  const index = String(documentName || "").indexOf(marker);

  if (index === -1) {
    throw new Error("Invalid Firestore document name: " + documentName);
  }

  return documentName.slice(index + marker.length);
}

function decodeFirestoreMap_(fields) {
  return Object.keys(fields || {}).reduce(function (result, key) {
    result[key] = decodeFirestoreValue_(fields[key]);
    return result;
  }, {});
}

function decodeFirestoreValue_(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) {
    return value.stringValue;
  }

  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) {
    return value.booleanValue;
  }

  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) {
    return Number(value.integerValue);
  }

  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) {
    return Number(value.doubleValue);
  }

  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) {
    return value.timestampValue;
  }

  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(value, "arrayValue")) {
    return (value.arrayValue.values || []).map(function (entry) {
      return decodeFirestoreValue_(entry);
    });
  }

  if (Object.prototype.hasOwnProperty.call(value, "mapValue")) {
    return decodeFirestoreMap_(value.mapValue.fields || {});
  }

  return null;
}

function encodeFirestoreMap_(payload) {
  return Object.keys(payload || {}).reduce(function (result, key) {
    result[key] = encodeFirestoreValue_(payload[key]);
    return result;
  }, {});
}

function encodeFirestoreValue_(value) {
  if (value === null) {
    return {
      nullValue: null,
    };
  }

  if (value instanceof Date) {
    return {
      timestampValue: value.toISOString(),
    };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(function (entry) {
          return encodeFirestoreValue_(entry);
        }),
      },
    };
  }

  if (typeof value === "boolean") {
    return {
      booleanValue: value,
    };
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? {
          integerValue: String(value),
        }
      : {
          doubleValue: value,
        };
  }

  if (typeof value === "object") {
    return {
      mapValue: {
        fields: encodeFirestoreMap_(value),
      },
    };
  }

  const text = String(value || "");

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text)) {
    return {
      timestampValue: text,
    };
  }

  return {
    stringValue: text,
  };
}

function parseMailerPayload_(e) {
  const params = e && e.parameter ? e.parameter : {};
  const rawBody = e && e.postData && e.postData.contents ? String(e.postData.contents) : "";

  if (!rawBody) {
    return params;
  }

  try {
    const parsed = JSON.parse(rawBody);
    return parsed && typeof parsed === "object" ? parsed : params;
  } catch (_unused) {
    return params;
  }
}

function isValidMailerSecret_(secret) {
  const expected = String(
    PropertiesService.getScriptProperties().getProperty(MAILER_SECRET_PROPERTY_NAME) || "",
  );
  return Boolean(expected) && String(secret || "") === expected;
}

function normalizeGigMailKind_(value) {
  return String(value || "").trim().toLowerCase() === "reminder" ? "reminder" : "notification";
}

function buildGigMailSubject_(kind, gig) {
  const name = String(gig.name || "Band gig").trim();

  if (kind === "reminder") {
    return "Reminder: " + name;
  }

  return "New gig uploaded: " + name;
}

function buildGigMailBody_(kind, recipient, gig) {
  const lines = [
    "Hello " + (recipient.name || "band member") + ",",
    "",
    kind === "reminder"
      ? "This is a reminder to reply to the following gig in the members portal."
      : "A new gig has been uploaded to the members portal.",
    "",
    "Gig: " + String(gig.name || ""),
  ];

  if (gig.date) {
    lines.push("Date: " + String(gig.date || ""));
  }

  if (gig.time) {
    lines.push("Time: " + String(gig.time || ""));
  }

  if (gig.location) {
    lines.push("Location: " + String(gig.location || ""));
  }

  if (gig.status) {
    lines.push("Status: " + String(gig.status || ""));
  }

  if (gig.notes) {
    lines.push("");
    lines.push("Notes:");
    lines.push(String(gig.notes || ""));
  }

  lines.push("");
  lines.push("Members page: " + MEMBERS_PAGE_URL);

  return lines.join("\n");
}

function logGigMailBatch_(kind, gig, results) {
  const spreadsheet = openMailerSpreadsheet_();

  if (!spreadsheet) {
    return;
  }

  const sheet = ensureMailerLogSheet_(spreadsheet);

  results.forEach(function (result) {
    sheet.appendRow([
      new Date(),
      kind,
      String(gig.id || ""),
      String(gig.name || ""),
      result.email,
      result.ok ? "sent" : "failed",
      result.error || "",
    ]);
  });
}

function openMailerSpreadsheet_() {
  if (!MAILER_SPREADSHEET_URL) {
    return null;
  }

  return SpreadsheetApp.openByUrl(MAILER_SPREADSHEET_URL);
}

function ensureMailerLogSheet_(spreadsheet) {
  return ensureMailerSheetWithHeaders_(spreadsheet, GIG_MAIL_LOG_SHEET_NAME, [
    "Sent at",
    "Mail kind",
    "Gig ID",
    "Gig name",
    "Recipient",
    "Status",
    "Error",
  ]);
}

function ensureMailerSheetWithHeaders_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return sheet;
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
    .getValues()[0];

  headers.forEach(function (header, index) {
    if (String(currentHeaders[index] || "").trim() !== header) {
      sheet.getRange(1, index + 1).setValue(header);
    }
  });

  return sheet;
}

function normalizeMailerEmail_(value) {
  const email = String(value || "").trim().toLowerCase();
  return /@/.test(email) ? email : "";
}

function getMailerErrorMessage_(error) {
  if (!error) {
    return "";
  }

  return error && error.message ? String(error.message) : String(error);
}

function respondMailer_(status, payload, callback) {
  const body = JSON.stringify(
    Object.assign(
      {
        status: status,
      },
      payload || {},
    ),
  );

  if (callback) {
    return ContentService.createTextOutput(callback + "(" + body + ");").setMimeType(
      ContentService.MimeType.JAVASCRIPT,
    );
  }

  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
