# Apps Script Split Setup

This repo now assumes two separate Apps Script projects, not one bloated script trying to do everything.

## 1. Public Forms Project

Use [apps-script.gs](/abs/path/c:/Users/aaron/Documents/COBPD/apps-script.gs:1) for:

- website booking form
- website joining form
- generic contact form
- request status polling

This file has been stripped back to public-form handling only. The old members-area spreadsheet code has been removed so the public website endpoint is not carrying legacy member logic around.

## 2. Mail Worker Project

Use [apps-script-mailer.gs](/abs/path/c:/Users/aaron/Documents/COBPD/apps-script-mailer.gs:1) as a separate Apps Script project for gig notifications and reminders.

The important change is this:

- the **primary** path is now a **scheduled Apps Script worker**
- it reads queued gigs directly from **Firestore**
- it sends email with `MailApp`
- it marks each queue item as `sending`, `sent`, or `failed`

This means Firebase stays the source of truth for gigs and queue state, while Apps Script only handles mail delivery.

## Recommended Setup

1. Create a second standalone Apps Script project.
2. Paste in [apps-script-mailer.gs](/abs/path/c:/Users/aaron/Documents/COBPD/apps-script-mailer.gs:1).
3. In **Project Settings**, enable **Show "appsscript.json" manifest file in editor**.
4. Replace the manifest contents with [apps-script-mailer.appsscript.json](/abs/path/c:/Users/aaron/Documents/COBPD/apps-script-mailer.appsscript.json:1).
5. In **Project Settings > Script properties**, set:
   - `FIRESTORE_PROJECT_ID = cobpd-3bf88`
6. Run `processQueuedGigEmails` once manually from the editor.
   - This is important because Apps Script needs to request permission for:
     - Gmail sending
     - spreadsheet access
     - URL fetch
     - Firestore / Datastore API access through your Google account
7. Add a **time-driven trigger** for `processQueuedGigEmails`.
   - every 5 minutes is fine for your use case

## If You Get `ACCESS_TOKEN_SCOPE_INSUFFICIENT`

That means the Apps Script project was created without the Firestore scope.

Fix it like this:

1. Open `appsscript.json` in the Apps Script editor.
2. Replace it with [apps-script-mailer.appsscript.json](/abs/path/c:/Users/aaron/Documents/COBPD/apps-script-mailer.appsscript.json:1).
3. Save.
4. Run `processQueuedGigEmails` again.
5. Re-accept the permissions prompt.

If it still fails after that, the next likely issue is that the **Firestore API** is not enabled on the Google Cloud project attached to the Apps Script project.

## Important Pushback

- You do **not** need a public web app deployment for the scheduled queue worker.
- A separate script project plus a time trigger is enough.
- That is simpler and safer than pretending the browser should call a secret mail endpoint.

## Optional Manual Endpoint

The mailer script still includes `doPost` for manual trusted use.

Supported actions:

- `send_gig_emails`
- `process_queue`

If you insist on using that path, set this Script Property too:

- `MAILER_SHARED_SECRET`

Expected JSON payload for `send_gig_emails`:

```json
{
  "action": "send_gig_emails",
  "secret": "YOUR_SHARED_SECRET",
  "kind": "notification",
  "gig": {
    "id": "abc123",
    "name": "Armistice Parade",
    "date": "11/11/2026",
    "time": "10:00",
    "location": "Bristol",
    "status": "Confirmed",
    "notes": "Meet 30 minutes early."
  },
  "recipients": [
    {
      "name": "Aaron Smart",
      "email": "aaron.george.smart@gmail.com"
    }
  ]
}
```

## Why This Is Better

- Public forms stay lean in [apps-script.gs](/abs/path/c:/Users/aaron/Documents/COBPD/apps-script.gs:1).
- Firebase still owns gigs, replies, and queue status.
- Apps Script handles cheap email sending without forcing Blaze + Cloud Functions.

## What This Does Not Fix

- It does **not** tighten your current Firestore rule that lets any signed-in user write `gigs`.
- It does **not** schedule future reminders by date; it only processes gigs already marked as queued.
- It does **not** make browser-triggered mail secure. If you expose the shared secret in frontend code, you have missed the point.

## Practical Recommendation

For now:

1. redeploy [apps-script.gs](/abs/path/c:/Users/aaron/Documents/COBPD/apps-script.gs:1) as the public forms endpoint
2. create a separate Apps Script project from [apps-script-mailer.gs](/abs/path/c:/Users/aaron/Documents/COBPD/apps-script-mailer.gs:1)
3. run `processQueuedGigEmails` manually once
4. add a time trigger
5. stop thinking in terms of a browser calling a mail secret unless you actually need that later
