# Firebase Members Setup

This replaces the members-only Apps Script flow with Firebase Authentication and Firestore. Public contact forms can stay on `apps-script.gs`.

## 1. Create Firebase project

1. Create a Firebase project in the Firebase console.
2. Add a **Web app**.
3. Copy the config object into [firebase-config.js](/abs/path/c:/Users/aaron/Documents/COBPD/firebase-config.js:1).

Firebase web setup docs:
- https://firebase.google.com/docs/web/setup
- https://firebase.google.com/docs/web/alt-setup

## 2. Enable sign-in

1. Open **Authentication**.
2. Enable **Email/Password** sign-in.
3. Create member users manually in the Firebase console, or later via Admin SDK.

Firebase password auth docs:
- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/web/manage-users

## 3. Create Firestore database

1. Create a Firestore database in **production mode**.
2. Apply the rules in [firestore.rules](/abs/path/c:/Users/aaron/Documents/COBPD/firestore.rules:1).

Firestore pricing docs:
- https://firebase.google.com/docs/firestore/pricing

## 4. Firestore collections

Create these collections.

**`members`**

Document ID: Firebase Auth user UID

Fields:
- `name` string
- `email` string
- `section` string
- `instrument` string
- `role` string
- `active` boolean
- `admin` boolean

Example:

```json
{
  "name": "Aaron Smart",
  "email": "aaron.george.smart@gmail.com",
  "section": "Drum Corps",
  "instrument": "Snare / Bass",
  "role": "Drummer",
  "active": true,
  "admin": true
}
```

**`gigs`**

Document ID: any stable slug or auto-ID

Fields:
- `name` string
- `location` string
- `date` timestamp or `dd/mm/yyyy` string
- `time` string
- `status` string
- `public` boolean
- `notes` string
- `archived` boolean
- `notificationStatus` string
- `notificationRequestedAt` timestamp
- `notificationRequestedBy` string
- `notificationSentAt` timestamp
- `reminderStatus` string
- `reminderRequestedAt` timestamp
- `reminderRequestedBy` string
- `reminderSentAt` timestamp
- `createdAt` timestamp
- `createdBy` string
- `updatedAt` timestamp
- `updatedBy` string

**`responses`**

Document ID: `${gigId}__${memberUid}`

Fields:
- `gigId` string
- `memberId` string
- `memberName` string
- `email` string
- `section` string
- `instrument` string
- `answer` string: `yes`, `no`, `maybe`
- `reason` string
- `answeredAt` timestamp
- `updatedAt` timestamp

## 5. Admin workflow

- Members with `admin: true` can create and edit gigs inside the members portal.
- The "Queue notify all" and "Queue reminder" buttons write queue fields into Firestore.
- Actual email delivery can be handled either by:
  - the Apps Script queue worker described in [apps-script-split-setup.md](/abs/path/c:/Users/aaron/Documents/COBPD/apps-script-split-setup.md:1), or
  - the Cloud Function described in [firebase-email-queue-setup.md](/abs/path/c:/Users/aaron/Documents/COBPD/firebase-email-queue-setup.md:1).
- Do not try to send bulk email directly from browser JavaScript. That is the wrong trust boundary.

## 6. Important limitations

- This migration only moves the **members area** to Firebase.
- Public booking and joining forms still use `apps-script.gs`.
- If you use the Apps Script queue worker, you can avoid Blaze.
- If you use the Cloud Function worker, the project must be on the **Blaze** plan.

Deploy and configure one of the workers before expecting queued notifications or reminders to send any email.
