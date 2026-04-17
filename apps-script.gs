const RECIPIENT_EMAIL = "aaron.george.smart@gmail.com";
const SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/1Q1S6Ab-GbNCqK74XxjIkwFB1sOJ3va6SlZNnEbBJRGQ/edit?gid=1546190981#gid=1546190981";
const RATE_LIMIT_WINDOW_SECONDS = 120;
const MAX_MESSAGE_LENGTH = 4000;
const STATUS_TTL_SECONDS = 600;
const MEMBER_SESSION_TTL_SECONDS = 21600;
const MEMBERS_SHEET_NAME = "Members";
const MEMBER_GIGS_SHEET_NAME = "Member Gigs";
const MEMBER_RESPONSES_SHEET_NAME = "Member Responses";

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

  if (action === "member_dashboard") {
    return respond_(200, buildMemberDashboardResponse_(params.token || ""), params.callback);
  }

  return respond_(
    200,
    {
      ok: true,
      service: "cobpd-site",
      timestamp: new Date().toISOString(),
    },
    params.callback,
  );
}

function doPost(e) {
  const data = e && e.parameter ? e.parameter : {};
  const action = data.action || "";

  if (action === "member_login") {
    return handleMemberLogin_(data);
  }

  if (action === "member_logout") {
    return handleMemberLogout_(data);
  }

  if (action === "member_response") {
    return handleMemberResponse_(data);
  }

  return handleWebsiteFormSubmission_(data);
}

function handleWebsiteFormSubmission_(data) {
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

function handleMemberLogin_(data) {
  const requestId = data.request_id || Utilities.getUuid();
  storeStatus_(requestId, {
    ok: true,
    received: true,
    request_id: requestId,
    state: "received",
  });

  try {
    const email = normalizeEmail_(data.email || "");
    const password = String(data.password || "");
    const spreadsheet = openSubmissionSpreadsheet_();

    if (!spreadsheet || !email || !password) {
      storeStatus_(requestId, {
        ok: false,
        received: true,
        request_id: requestId,
        state: "member_login_failed",
        error: "invalid_credentials",
      });
      return respond_(200, { ok: false, received: true, request_id: requestId });
    }

    const membersSheet = getMembersSheet_(spreadsheet);
    const memberEntry = findActiveMemberByEmail_(membersSheet, email);

    if (!memberEntry || !verifyMemberPassword_(membersSheet, memberEntry, password)) {
      storeStatus_(requestId, {
        ok: false,
        received: true,
        request_id: requestId,
        state: "member_login_failed",
        error: "invalid_credentials",
      });
      return respond_(200, { ok: false, received: true, request_id: requestId });
    }

    const member = toMemberView_(memberEntry);
    const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, "");

    storeMemberSession_(token, member);
    touchMemberLastLogin_(membersSheet, memberEntry.rowIndex);
    storeStatus_(requestId, {
      ok: true,
      received: true,
      request_id: requestId,
      state: "member_authenticated",
      token: token,
      member: member,
    });

    return respond_(200, {
      ok: true,
      received: true,
      request_id: requestId,
    });
  } catch (error) {
    const message = getErrorMessage_(error);

    safeLogMessage_("member_login failed for request " + requestId + ": " + message);
    storeStatus_(requestId, {
      ok: false,
      received: true,
      request_id: requestId,
      state: "member_login_failed",
      error: "server_error",
      detail: message,
    });

    return respond_(200, {
      ok: false,
      received: true,
      request_id: requestId,
    });
  }
}

function handleMemberLogout_(data) {
  const requestId = data.request_id || Utilities.getUuid();
  const token = String(data.token || "");

  clearMemberSession_(token);
  storeStatus_(requestId, {
    ok: true,
    received: true,
    request_id: requestId,
    state: "member_logged_out",
  });

  return respond_(200, {
    ok: true,
    received: true,
    request_id: requestId,
  });
}

function handleMemberResponse_(data) {
  const requestId = data.request_id || Utilities.getUuid();
  storeStatus_(requestId, {
    ok: true,
    received: true,
    request_id: requestId,
    state: "received",
  });

  try {
    const answer = normalizeMemberAnswer_(data.answer || "");
    const reason = String(data.reason || "").trim();
    const token = String(data.token || "");
    const gigId = String(data.gig_id || "").trim();
    const member = readMemberSession_(token);

    if (!member) {
      storeStatus_(requestId, {
        ok: false,
        received: true,
        request_id: requestId,
        state: "member_response_failed",
        error: "invalid_session",
      });
      return respond_(200, { ok: false, received: true, request_id: requestId });
    }

    if (!gigId || !answer) {
      storeStatus_(requestId, {
        ok: false,
        received: true,
        request_id: requestId,
        state: "member_response_failed",
        error: "invalid_answer",
      });
      return respond_(200, { ok: false, received: true, request_id: requestId });
    }

    const spreadsheet = openSubmissionSpreadsheet_();

    if (!spreadsheet) {
      storeStatus_(requestId, {
        ok: false,
        received: true,
        request_id: requestId,
        state: "member_response_failed",
        error: "server_error",
      });
      return respond_(200, { ok: false, received: true, request_id: requestId });
    }

    const gigsSheet = getMemberGigsSheet_(spreadsheet);
    const gigEntry = findMemberGigById_(gigsSheet, gigId);

    if (!gigEntry) {
      storeStatus_(requestId, {
        ok: false,
        received: true,
        request_id: requestId,
        state: "member_response_failed",
        error: "unknown_gig",
      });
      return respond_(200, { ok: false, received: true, request_id: requestId });
    }

    upsertMemberResponse_(spreadsheet, member, gigId, answer, answer === "maybe" ? reason : "");
    storeStatus_(requestId, {
      ok: true,
      received: true,
      request_id: requestId,
      state: "member_response_saved",
    });

    return respond_(200, {
      ok: true,
      received: true,
      request_id: requestId,
    });
  } catch (error) {
    const message = getErrorMessage_(error);

    safeLogMessage_("member_response failed for request " + requestId + ": " + message);
    storeStatus_(requestId, {
      ok: false,
      received: true,
      request_id: requestId,
      state: "member_response_failed",
      error: "server_error",
      detail: message,
    });

    return respond_(200, {
      ok: false,
      received: true,
      request_id: requestId,
    });
  }
}

function buildMemberDashboardResponse_(token) {
  const member = readMemberSession_(token);

  if (!member) {
    return {
      ok: false,
      authenticated: false,
      error: "invalid_session",
    };
  }

  const spreadsheet = openSubmissionSpreadsheet_();

  if (!spreadsheet) {
    return {
      ok: false,
      authenticated: false,
      error: "server_error",
    };
  }

  const members = getActiveMembers_(spreadsheet);
  const gigs = getActiveMemberGigs_(spreadsheet);
  const responses = getMemberResponses_(spreadsheet);
  const responsesByGig = buildResponseIndex_(responses);

  return {
    ok: true,
    authenticated: true,
    member: member,
    gigs: gigs.map(function (gig) {
      return buildGigDashboardItem_(gig, member, members, responsesByGig[gig.id] || {});
    }),
  };
}

function buildGigDashboardItem_(gig, sessionMember, members, responseMap) {
  const roster = members.map(function (member) {
    const response = responseMap[member.member_id] || null;

    return {
      member_id: member.member_id,
      name: member.name,
      section: member.section,
      instrument: member.instrument,
      role: member.role,
      answer: response ? response.answer : "no_reply",
      reason: response ? response.reason : "",
      answered_at: response ? response.answered_at : "",
    };
  });

  const stats = roster.reduce(
    function (totals, member) {
      if (member.answer === "yes") {
        totals.yes += 1;
      } else if (member.answer === "no") {
        totals.no += 1;
      } else if (member.answer === "maybe") {
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

  const myResponse = responseMap[sessionMember.member_id] || null;

  return {
    id: gig.id,
    name: gig.name,
    location: gig.location,
    date: gig.date,
    time: gig.time,
    status: gig.status,
    public: gig.public,
    notes: gig.notes,
    stats: stats,
    my_response: myResponse
      ? {
          answer: myResponse.answer,
          reason: myResponse.reason,
          answered_at: myResponse.answered_at,
        }
      : {
          answer: "",
          reason: "",
          answered_at: "",
        },
    roster: roster,
  };
}

function getActiveMembers_(spreadsheet) {
  return getSheetRecords_(getMembersSheet_(spreadsheet))
    .filter(function (entry) {
      return isTrueLike_(entry.record.active, true) && normalizeEmail_(entry.record.email);
    })
    .map(function (entry) {
      return toMemberView_(entry);
    })
    .sort(function (firstMember, secondMember) {
      return buildMemberSortKey_(firstMember).localeCompare(buildMemberSortKey_(secondMember));
    });
}

function getActiveMemberGigs_(spreadsheet) {
  return getSheetRecords_(getMemberGigsSheet_(spreadsheet))
    .filter(function (entry) {
      return !isTrueLike_(entry.record.archived, false) && String(entry.record.name || "").trim();
    })
    .map(function (entry) {
      return toMemberGigView_(entry);
    })
    .sort(function (firstGig, secondGig) {
      const firstTime = firstGig.sort_date.getTime();
      const secondTime = secondGig.sort_date.getTime();

      if (firstTime !== secondTime) {
        return firstTime - secondTime;
      }

      return firstGig.sort_minutes - secondGig.sort_minutes;
    });
}

function getMemberResponses_(spreadsheet) {
  return getSheetRecords_(getMemberResponsesSheet_(spreadsheet)).map(function (entry) {
    const record = entry.record;

    return {
      gig_id: String(record.gig_id || "").trim(),
      member_id: String(record.member_id || "").trim(),
      answer: normalizeMemberAnswer_(record.answer || "") || "no_reply",
      reason: String(record.reason || "").trim(),
      answered_at: formatDateTimeValue_(record.answered_at),
      updated_at: formatDateTimeValue_(record.updated_at),
    };
  });
}

function buildResponseIndex_(responses) {
  return responses.reduce(function (index, response) {
    if (!response.gig_id || !response.member_id) {
      return index;
    }

    if (!index[response.gig_id]) {
      index[response.gig_id] = {};
    }

    index[response.gig_id][response.member_id] = response;
    return index;
  }, {});
}

function findActiveMemberByEmail_(sheet, email) {
  return getSheetRecords_(sheet).find(function (entry) {
    return (
      isTrueLike_(entry.record.active, true) &&
      normalizeEmail_(entry.record.email) === email
    );
  });
}

function findMemberGigById_(sheet, gigId) {
  return getSheetRecords_(sheet).find(function (entry) {
    return resolveGigId_(entry.record, entry.rowIndex) === gigId;
  });
}

function toMemberView_(entry) {
  const record = entry.record;

  return {
    member_id: resolveMemberId_(record, entry.rowIndex),
    name: String(record.name || "").trim(),
    email: normalizeEmail_(record.email || ""),
    section: String(record.section || "").trim(),
    instrument: String(record.instrument || "").trim(),
    role: String(record.role || "").trim(),
  };
}

function toMemberGigView_(entry) {
  const record = entry.record;
  const parsedDate = parseSheetDate_(record.date);

  return {
    id: resolveGigId_(record, entry.rowIndex),
    rowIndex: entry.rowIndex,
    name: String(record.name || "").trim(),
    location: String(record.location || "").trim(),
    date: formatDateValue_(parsedDate, record.date),
    time: normalizeTime_(record.time || ""),
    status: String(record.status || "").trim(),
    public: isTrueLike_(record.public, true),
    notes: String(record.notes || "").trim(),
    notify_members: isTrueLike_(record.notify_members, true),
    notify_sent_at: formatDateTimeValue_(record.notify_sent_at),
    archived: isTrueLike_(record.archived, false),
    sort_date: parsedDate || new Date(8640000000000000),
    sort_minutes: parseStartMinutes_(record.time || ""),
  };
}

function verifyMemberPassword_(sheet, entry, password) {
  const record = entry.record;
  const input = String(password || "");
  const inputHash = hashPassword_(input);
  const storedHash = String(record.password_hash || "").trim();
  const storedPassword = String(record.password || "").trim();

  if (storedHash && storedHash === inputHash) {
    return true;
  }

  if (storedPassword && storedPassword === input) {
    migrateMemberPasswordHash_(sheet, entry.rowIndex, inputHash);
    return true;
  }

  return false;
}

function migrateMemberPasswordHash_(sheet, rowIndex, passwordHash) {
  const headerMap = getHeaderIndexMap_(sheet);

  if (headerMap.password) {
    sheet.getRange(rowIndex, headerMap.password).setValue("");
  }

  if (headerMap.password_hash) {
    sheet.getRange(rowIndex, headerMap.password_hash).setValue(passwordHash);
  }
}

function touchMemberLastLogin_(sheet, rowIndex) {
  const headerMap = getHeaderIndexMap_(sheet);

  if (headerMap.last_login_at) {
    sheet.getRange(rowIndex, headerMap.last_login_at).setValue(new Date());
  }
}

function upsertMemberResponse_(spreadsheet, member, gigId, answer, reason) {
  const sheet = getMemberResponsesSheet_(spreadsheet);
  const headers = getNormalizedHeaders_(sheet);
  const existingEntry = getSheetRecords_(sheet).find(function (entry) {
    return (
      String(entry.record.gig_id || "").trim() === gigId &&
      String(entry.record.member_id || "").trim() === member.member_id
    );
  });
  const now = new Date();
  const rowPayload = {
    response_id: existingEntry ? existingEntry.record.response_id : Utilities.getUuid(),
    gig_id: gigId,
    member_id: member.member_id,
    member_name: member.name,
    email: member.email,
    section: member.section,
    instrument: member.instrument,
    answer: answer,
    reason: reason,
    answered_at: now,
    updated_at: now,
  };

  if (existingEntry) {
    sheet
      .getRange(existingEntry.rowIndex, 1, 1, headers.length)
      .setValues([buildRowValues_(headers, rowPayload)]);
    return;
  }

  sheet.appendRow(buildRowValues_(headers, rowPayload));
}

function storeMemberSession_(token, member) {
  if (!token || !member) {
    return;
  }

  CacheService.getScriptCache().put(
    "member_session:" + token,
    JSON.stringify(member),
    MEMBER_SESSION_TTL_SECONDS,
  );
}

function readMemberSession_(token) {
  if (!token) {
    return null;
  }

  const cache = CacheService.getScriptCache();
  const raw = cache.get("member_session:" + token);

  if (!raw) {
    return null;
  }

  cache.put("member_session:" + token, raw, MEMBER_SESSION_TTL_SECONDS);
  return JSON.parse(raw);
}

function clearMemberSession_(token) {
  if (!token) {
    return;
  }

  CacheService.getScriptCache().remove("member_session:" + token);
}

function processPendingGigNotifications() {
  const spreadsheet = openSubmissionSpreadsheet_();

  if (!spreadsheet) {
    return 0;
  }

  const gigsSheet = getMemberGigsSheet_(spreadsheet);
  const pendingGigs = getSheetRecords_(gigsSheet)
    .map(function (entry) {
      return toMemberGigView_(entry);
    })
    .filter(function (gig) {
      return gig.notify_members && !gig.notify_sent_at && !isTrueLike_(gig.archived, false);
    });

  if (!pendingGigs.length) {
    return 0;
  }

  const members = getActiveMembers_(spreadsheet).filter(function (member) {
    return member.email;
  });

  if (!members.length) {
    return 0;
  }

  members.forEach(function (member) {
    MailApp.sendEmail({
      to: member.email,
      subject: buildMemberGigNotificationSubject_(pendingGigs),
      body: buildMemberGigNotificationBody_(member, pendingGigs),
    });
  });

  const headerMap = getHeaderIndexMap_(gigsSheet);
  const sentAt = new Date();

  pendingGigs.forEach(function (gig) {
    if (headerMap.notify_sent_at) {
      gigsSheet.getRange(gig.rowIndex, headerMap.notify_sent_at).setValue(sentAt);
    }
  });

  return pendingGigs.length;
}

function initializeMembersArea() {
  const spreadsheet = openSubmissionSpreadsheet_();

  if (!spreadsheet) {
    throw new Error("Spreadsheet could not be opened.");
  }

  getMembersSheet_(spreadsheet);
  getMemberGigsSheet_(spreadsheet);
  getMemberResponsesSheet_(spreadsheet);
  return "Members area sheets are ready.";
}

function buildMemberGigNotificationSubject_(gigs) {
  if (gigs.length === 1) {
    return "New band gig uploaded: " + gigs[0].name;
  }

  return gigs.length + " new band gigs uploaded";
}

function buildMemberGigNotificationBody_(member, gigs) {
  const lines = [
    "Hello " + (member.name || "band member") + ",",
    "",
    "New gig information has been uploaded to the members area.",
    "",
  ];

  gigs.forEach(function (gig) {
    lines.push("- " + gig.name);
    lines.push("  " + gig.location);
    lines.push("  " + gig.date + (gig.time ? " " + gig.time : ""));

    if (gig.status) {
      lines.push("  Status: " + gig.status);
    }

    lines.push("");
  });

  lines.push("Please log in to the members area to reply yes, no, or maybe.");
  lines.push("Members page: https://www.bristolpipeband.org/members.html");

  return lines.join("\n");
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
  const email = normalizeEmail_(data.email || "");
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
      "Logging failed during " +
        status +
        " for request " +
        requestId +
        ": " +
        getErrorMessage_(error),
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
  return ensureSheetWithHeaders_(spreadsheet, "Submissions", [
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

function getMembersSheet_(spreadsheet) {
  return ensureSheetWithHeaders_(spreadsheet, MEMBERS_SHEET_NAME, [
    "Member ID",
    "Name",
    "Email",
    "Section",
    "Instrument",
    "Role",
    "Password",
    "Password Hash",
    "Active",
    "Provisioned At",
    "Last Login At",
  ]);
}

function getMemberGigsSheet_(spreadsheet) {
  return ensureSheetWithHeaders_(spreadsheet, MEMBER_GIGS_SHEET_NAME, [
    "Gig ID",
    "Name",
    "Location",
    "Date",
    "Time",
    "Status",
    "Public",
    "Notes",
    "Notify Members",
    "Notify Sent At",
    "Archived",
    "Created At",
    "Updated At",
  ]);
}

function getMemberResponsesSheet_(spreadsheet) {
  return ensureSheetWithHeaders_(spreadsheet, MEMBER_RESPONSES_SHEET_NAME, [
    "Response ID",
    "Gig ID",
    "Member ID",
    "Member Name",
    "Email",
    "Section",
    "Instrument",
    "Answer",
    "Reason",
    "Answered At",
    "Updated At",
  ]);
}

function ensureSheetWithHeaders_(spreadsheet, name, headers) {
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

function getSheetRecords_(sheet) {
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(normalizeHeaderName_);

  return values
    .slice(1)
    .map(function (row, index) {
      const record = headers.reduce(function (result, header, columnIndex) {
        result[header] = row[columnIndex];
        return result;
      }, {});

      return {
        rowIndex: index + 2,
        record: record,
      };
    })
    .filter(function (entry) {
      return Object.keys(entry.record).some(function (key) {
        return String(entry.record[key] || "").trim() !== "";
      });
    });
}

function getNormalizedHeaders_(sheet) {
  return sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(normalizeHeaderName_);
}

function getHeaderIndexMap_(sheet) {
  return getNormalizedHeaders_(sheet).reduce(function (result, header, index) {
    result[header] = index + 1;
    return result;
  }, {});
}

function buildRowValues_(headers, payload) {
  return headers.map(function (header) {
    return payload[header] || "";
  });
}

function normalizeHeaderName_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMemberAnswer_(value) {
  const text = String(value || "").trim().toLowerCase();

  if (text === "yes" || text === "no" || text === "maybe") {
    return text;
  }

  return "";
}

function isTrueLike_(value, defaultValue) {
  if (value === "" || value === null || typeof value === "undefined") {
    return defaultValue;
  }

  const text = String(value).trim().toLowerCase();
  return ["n", "no", "false", "0", "inactive"].indexOf(text) === -1;
}

function resolveMemberId_(record, rowIndex) {
  return String(record.member_id || "").trim() || "member_" + rowIndex;
}

function resolveGigId_(record, rowIndex) {
  return String(record.gig_id || "").trim() || "gig_" + rowIndex;
}

function buildMemberSortKey_(member) {
  return [
    String(member.section || "").toLowerCase(),
    String(member.instrument || "").toLowerCase(),
    String(member.name || "").toLowerCase(),
  ].join("|");
}

function parseSheetDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    const copy = new Date(value.getTime());
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const parsed = new Date(year, month, day);

  if (
    isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function formatDateValue_(date, fallbackValue) {
  return date ? Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy") : String(fallbackValue || "");
}

function formatDateTimeValue_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return value.toISOString();
  }

  return String(value || "").trim();
}

function normalizeTime_(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");

  if (!text) {
    return "Time TBC";
  }

  const matches = text.match(/\b\d{1,2}:\d{2}\b/g) || [];

  if (matches.length >= 2) {
    return matches[0] + " - " + matches[1];
  }

  if (matches.length === 1) {
    return matches[0];
  }

  return text.replace(/\s*-\s*/g, " - ");
}

function parseStartMinutes_(value) {
  const match = normalizeTime_(value).match(/(\d{1,2}):(\d{2})/);

  if (!match) {
    return 99999;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function hashPassword_(password) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(password || ""),
    Utilities.Charset.UTF_8,
  );

  return digest
    .map(function (character) {
      const value = (character + 256) % 256;
      return ("0" + value.toString(16)).slice(-2);
    })
    .join("");
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
