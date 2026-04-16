const RECIPIENT_EMAIL = "aaron.george.smart@gmail.com";
const SPREADSHEET_ID = "";
const RATE_LIMIT_WINDOW_SECONDS = 120;
const MAX_MESSAGE_LENGTH = 4000;

function doPost(e) {
  const data = e && e.parameter ? e.parameter : {};
  const requestId = data.request_id || Utilities.getUuid();

  if (data.website) {
    return respond_(200, {
      ok: true,
      received: true,
      request_id: requestId,
    });
  }

  const validationError = validateSubmission_(data);

  if (validationError) {
    return respond_(400, {
      ok: false,
      error: validationError,
      request_id: requestId,
    });
  }

  if (isRateLimited_(data)) {
    return respond_(429, {
      ok: false,
      error: "rate_limited",
      request_id: requestId,
    });
  }

  const kind = data.form_kind || "general";
  const subject = buildSubject_(kind, data);
  const body = buildBody_(kind, data, requestId);

  MailApp.sendEmail({
    to: RECIPIENT_EMAIL,
    subject: subject,
    body: body,
    replyTo: data.email || undefined,
  });

  appendSubmissionToSheet_(kind, data, requestId);

  return respond_(200, {
    ok: true,
    received: true,
    request_id: requestId,
  });
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

function appendSubmissionToSheet_(kind, data, requestId) {
  if (!SPREADSHEET_ID) {
    return;
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName("Submissions");

  if (!sheet) {
    sheet = spreadsheet.insertSheet("Submissions");
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Timestamp",
      "Request ID",
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
      "Message",
    ]);
  }

  sheet.appendRow([
    new Date(),
    requestId,
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
    data.message || "",
  ]);
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

function respond_(status, payload) {
  const body = JSON.stringify(Object.assign({
    status: status,
  }, payload || {}));

  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
