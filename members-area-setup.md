# Members Area Setup

> Legacy document: this file describes the old Google Apps Script + Sheets members backend.
> For the current Firebase setup, use [firebase-members-setup.md](/abs/path/c:/Users/aaron/Documents/COBPD/firebase-members-setup.md:1).

The live members system uses the existing Google Apps Script backend and Google Sheets tabs.
Do not use a public CSV file as the live members database unless you want member emails and passwords exposed.

## Sheets

Run `initializeMembersArea()` once in Apps Script. It creates:

- `Members`
- `Member Gigs`
- `Member Responses`

## Provision Members

Use `members-template.csv` as the import shape for the `Members` sheet.

Recommended columns:

- `Member ID`
- `Name`
- `Email`
- `Section`
- `Instrument`
- `Role`
- `Password`
- `Active`

Admins can import rows into the sheet and then distribute temporary passwords.
On successful login, the Apps Script backend migrates plain passwords into `Password Hash`.

## Upload Member Gigs

Use `member-gigs-template.csv` as the import shape for the `Member Gigs` sheet.
This is separate from the public `gigs.csv` so private or draft gigs do not leak into the public schedule or notification emails.

Recommended columns:

- `Gig ID`
- `Name`
- `Location`
- `Date`
- `Time`
- `Status`
- `Public`
- `Notes`
- `Notify Members`
- `Archived`

Set `Notify Members` to `Y` when the gig should trigger member emails.

## Notifications

Create a time-driven Apps Script trigger for `processPendingGigNotifications`.

Suggested schedule:

1. Every hour if gigs are updated frequently.
2. Every day if the admin only uploads gigs occasionally.

The trigger emails all active members for rows in `Member Gigs` where:

- `Notify Members` is not `N`
- `Notify Sent At` is blank

After sending, the script stamps `Notify Sent At` so the same gig is not emailed twice.

## Member Responses

Members log in on `members.html`, reply `Yes`, `No`, or `Maybe`, and may add a reason when selecting `Maybe`.
Every save writes the current response and timestamp into `Member Responses`.
