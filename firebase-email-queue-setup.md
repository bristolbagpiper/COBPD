# Firebase Email Queue Setup

This is the **Cloud Functions** version of the queue worker. It watches queued gig notifications and reminders, then sends the emails with Resend.

If you want to avoid Blaze pricing, use the Apps Script worker in [apps-script-split-setup.md](/abs/path/c:/Users/aaron/Documents/COBPD/apps-script-split-setup.md:1) instead.

## What It Does

- Watches `gigs/{gigId}` for queue requests.
- Sends one email per active member with an email address.
- Marks the queue as `sent` or `failed`.
- Uses Firestore as the queue source of truth.

The trigger expects the members portal to write these fields on a gig document:

- `notificationStatus`
- `notificationRequestedAt`
- `notificationRequestedBy`
- `reminderStatus`
- `reminderRequestedAt`
- `reminderRequestedBy`

## Prerequisites

1. Upgrade the Firebase project to the **Blaze** plan.
2. Install the Firebase CLI.
3. Create a Resend account and API key.
4. Verify the sending domain you want to use, ideally for `hello@bristolpipeband.org`.

Firebase docs:
- https://firebase.google.com/docs/functions
- https://firebase.google.com/docs/functions/get-started
- https://firebase.google.com/docs/functions/config-env

Resend docs:
- https://resend.com/docs/send-with-nodejs

## Install Dependencies

From the repo root:

```bash
cd functions
npm install
```

## Set Secrets

From the repo root:

```bash
firebase functions:secrets:set RESEND_API_KEY
```

Enter the Resend API key when prompted.

## Optional Environment Values

The function uses these defaults:

- `EMAIL_FROM = "City of Bristol Pipes and Drums <hello@bristolpipeband.org>"`
- `MEMBERS_PORTAL_URL = "https://www.bristolpipeband.org/members.html"`

If those are wrong, edit [functions/index.js](/abs/path/c:/Users/aaron/Documents/COBPD/functions/index.js:1) before deployment.

## Deploy

From the repo root:

```bash
firebase deploy --only functions
```

If you only want the queue worker:

```bash
firebase deploy --only functions:processGigEmailQueue
```

## How To Test

1. Make sure there are at least two active members with email addresses in Firestore.
2. Create a gig in the members portal.
3. Click **Queue notify all**.
4. Confirm the gig document moves from:
   - `notificationStatus = queued`
   - to `notificationStatus = sent`
5. Repeat with **Queue reminder** and check:
   - `reminderStatus = sent`

If a send fails, the function writes:

- `notificationStatus = failed` or `reminderStatus = failed`
- `notificationError` or `reminderError`

## Important Caveats

- This worker sends one email per member. That is fine for your size.
- It does not currently rate-limit reminders.
- It does not yet support custom reminder copy or scheduled future sends.
- The current Firestore rules still allow any signed-in user to edit gigs. That is separate from the email worker and still needs tightening later.
