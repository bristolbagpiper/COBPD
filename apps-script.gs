const RECIPIENT_EMAIL = "aaron.george.smart@gmail.com";
const SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1Q1S6Ab-GbNCqK74XxjIkwFB1sOJ3va6SlZNnEbBJRGQ/edit?gid=1546190981#gid=1546190981";
const RATE_LIMIT_WINDOW_SECONDS = 120;
const MAX_MESSAGE_LENGTH = 4000;
const STATUS_TTL_SECONDS = 600;

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || "health";

  if (action === "status") {
    const requestId = params.request_id || "";
    const status = requestId ? readStatus_(requestId) : null;

    return respond_(
      200,
      status || {
        ok: true,
        received: false,
        request_id: requestId,
      },
      params.callback,
    );
  }

  return respond_(
    200,
    {
      ok: true,
      service: "cobpd-forms",
      timestamp: new Date().toISOString(),
    },
    params.callback,
  );
}

function doPost(e) {
  const data = e && e.parameter ? e.parameter : {};
  const requestId = data.request_id || Utilities.getUuid();
  const kind = data.form_kind || "general";

  if (data.website) {
    safeAppendSubmission_(kind, data, requestId, "spam_blocked", "");
    storeStatus_(requestId, {
      ok: true,
      received: true,
      request_id: requestId,
      state: "spam_blocked",
    });
    return respond_(200, {
      ok: true,
      received: true,
      request_id: requestId,
    });
  }

  const validationError = validateSubmission_(data);

  if (validationError) {
    safeAppendSubmission_(kind, data, requestId, "validation_failed", validationError);
    storeStatus_(requestId, {
      ok: false,
      received: true,
      request_id: requestId,
      state: "validation_failed",
      error: validationError,
    });
    return respond_(400, {
      ok: false,
      error: validationError,
      request_id: requestId,
    });
  }

  if (isRateLimited_(data)) {
    safeAppendSubmission_(kind, data, requestId, "rate_limited", "");
    storeStatus_(requestId, {
      ok: false,
      received: true,
      request_id: requestId,
      state: "rate_limited",
      error: "rate_limited",
    });
    return respond_(429, {
      ok: false,
      error: "rate_limited",
      request_id: requestId,
    });
  }

  storeStatus_(requestId, {
    ok: true,
    received: true,
    request_id: requestId,
    state: "received",
  });

  try {
    MailApp.sendEmail({
      to: RECIPIENT_EMAIL,
      subject: buildSubject_(kind, data),
      body: buildBody_(kind, data, requestId),
      replyTo: data.email || undefined,
    });

    safeAppendSubmission_(kind, data, requestId, "emailed", "");
    storeStatus_(requestId, {
      ok: true,
      received: true,
      request_id: requestId,
      state: "emailed",
    });

    return respond_(200, {
      ok: true,
      received: true,
      request_id: requestId,
    });
  } catch (error) {
    const message = getErrorMessage_(error);

    safeAppendSubmission_(kind, data, requestId, "email_failed", message);
    safeLogMessage_("doPost failed for request " + requestId + ": " + message);
    storeStatus_(requestId, {
      ok: false,
      received: true,
      request_id: requestId,
      state: "email_failed",
      error: message,
    });

    return respond_(500, {
      ok: false,
      error: "server_error",
      request_id: requestId,
    });
  }
}

function validateSubmission_(data) {
  if (!data.name || !data.email || !data.message) {
    return "missing_required_fields";
  }

  if (!/@/.test(data.email)) {
    return "invalid_email";
  }

  if (String(data.message).length > MAX_MESSAGE_LENGTH) {
    return "message_too_long";
  }

  if (data.form_kind === "booking" && !data.booking_type) {
    return "missing_required_fields";
  }

  if (data.form_kind === "joining" && (!data.interest || !data.experience_level)) {
    return "missing_required_fields";
  }

  return "";
}

function isRateLimited_(data) {
  const email = String(data.email || "").trim().toLowerCase();
  const kind = String(data.form_kind || "general").trim().toLowerCase();
  const key = "limit:" + kind + ":" + email;
  const cache = CacheService.getScriptCache();

  if (cache.get(key)) {
    return true;
  }

  cache.put(key, "1", RATE_LIMIT_WINDOW_SECONDS);
  return false;
}

function storeStatus_(requestId, payload) {
  if (!requestId) {
    return;
  }

  CacheService.getScriptCache().put(
    "status:" + requestId,
    JSON.stringify(payload),
    STATUS_TTL_SECONDS,
  );
}

function readStatus_(requestId) {
  const raw = CacheService.getScriptCache().get("status:" + requestId);
  return raw ? JSON.parse(raw) : null;
}

function safeAppendSubmission_(kind, data, requestId, status, errorMessage) {
  try {
    appendSubmission_(kind, data, requestId, status, errorMessage);
  } catch (error) {
    safeLogMessage_(
      "Logging failed during " + status + " for request " + requestId + ": " + getErrorMessage_(error),
    );
  }
}

function appendSubmission_(kind, data, requestId, status, errorMessage) {
  const spreadsheet = openSubmissionSpreadsheet_();

  if (!spreadsheet) {
    return;
  }

  const sheet = getSubmissionSheet_(spreadsheet);

  sheet.appendRow([
    new Date(),
    requestId,
    status || "",
    errorMessage || "",
    kind,
    data.name || "",
    data.email || "",
    data.phone || "",
    data.booking_type || "",
    data.event_date || "",
    data.location || "",
    data.interest || "",
    data.experience_level || "",
    data.age_group || "",
    data.page || "",
    data.submitted_at || "",
    data.message || "",
  ]);
}

function openSubmissionSpreadsheet_() {
  if (!SPREADSHEET_URL) {
    return null;
  }

  return SpreadsheetApp.openByUrl(SPREADSHEET_URL);
}

function getSubmissionSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName("Submissions");

  if (!sheet) {
    sheet = spreadsheet.insertSheet("Submissions");
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Received at",
      "Request ID",
      "Status",
      "Error",
      "Form type",
      "Name",
      "Email",
      "Phone",
      "Booking type",
      "Event date",
      "Location",
      "Interest",
      "Experience level",
      "Age group",
      "Page",
      "Submitted at",
      "Message",
    ]);
  }

  return sheet;
}

function getErrorMessage_(error) {
  if (!error) {
    return "";
  }

  return error && error.message ? String(error.message) : String(error);
}

function safeLogMessage_(message) {
  try {
    Logger.log(message);
  } catch (_unused) {
    // Logging must never fail the request.
  }
}

function buildSubject_(kind, data) {
  if (kind === "booking") {
    return "Website booking enquiry: " + (data.name || "Unknown sender");
  }

  if (kind === "joining") {
    return "Website joining enquiry: " + (data.name || "Unknown sender");
  }

  return "Website enquiry";
}

function buildBody_(kind, data, requestId) {
  const lines = [
    "Request ID: " + requestId,
    "Form type: " + (kind || ""),
    "Name: " + (data.name || ""),
    "Email: " + (data.email || ""),
    "Phone: " + (data.phone || ""),
    "Page: " + (data.page || ""),
    "Submitted at: " + (data.submitted_at || ""),
  ];

  if (kind === "booking") {
    lines.push("Booking type: " + (data.booking_type || ""));
    lines.push("Event date: " + (data.event_date || ""));
    lines.push("Location: " + (data.location || ""));
  }

  if (kind === "joining") {
    lines.push("Interested in: " + (data.interest || ""));
    lines.push("Experience level: " + (data.experience_level || ""));
    lines.push("Age group: " + (data.age_group || ""));
  }

  lines.push("");
  lines.push("Message:");
  lines.push(data.message || "");

  return lines.join("\n");
}

function respond_(status, payload, callback) {
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
