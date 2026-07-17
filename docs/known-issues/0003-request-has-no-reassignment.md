# 0003 — A REQUEST cannot be reassigned; a deactivated assignee dead-ends the build

**Status:** ACCEPTED DEBT — known, deliberate, not fixed.
**Introduced by:** nothing. Pre-existing in §12.3; made *visible* by the progress-log
fix, which removed the accidental admin override that had been papering over it.
**Impact today:** none observed. Sharp the day it bites.

## What

A REQUEST has no takeover or reassignment path. `tickets.assigned_to` is set by
`claimRequest` and cleared only by `releaseRequest`, which is **assignee-locked and
CLAIMED-only** (§12.3). There is no `reassignRequest` action, and nothing in the UI
can move a build to a different member.

That was survivable while `addProgressLog` allowed `isAdmin || (isStaff && isAssignee)`:
an admin could keep an orphaned build's log moving. §12.4 now correctly restricts
progress logging to the assignee (a progress log is a first-person claim, not an
administrative act), so the gap has no cover.

## The dead end

1. An MIS member claims REQ-0xx and starts work → status `IN_PROGRESS`, assigned to them.
2. They leave, are deactivated, or are demoted to USER.
   Note `setUserActive` → `releaseTicketsOfUser` is scoped `eq(tickets.type, "ISSUE")`
   (lib/db/queries.ts) — *"requests have their own claim/assignment model (§12)"* — so
   **deactivation does not release their requests**. The assignment survives the account.
3. Now: nobody can log progress (`canLogProgress` requires `isAssignee`); nobody can
   release it (assignee-locked, and CLAIMED-only anyway — it's `IN_PROGRESS`); and no
   admin can reassign it, because no such action exists.
4. The build can still be **marked complete** — `markComplete` gates on `canBuild`
   (`isAdmin || (isStaff && isAssignee)`), so an admin can push it to IN_TESTING and the
   requester can then accept. That is the only escape, and it requires the build to
   actually be finished.

So a half-finished request whose assignee is gone is stuck in `IN_PROGRESS` with a
frozen progress figure until an admin marks it complete (possibly untruthfully) or
someone edits the database.

## Why it's accepted rather than fixed

Fixing it well means a `reassignRequest` action with its own §12.4 permission row, an
activity type, a notification (the requester was told who was building it — see §12.6's
reversal rule), and a decision about whether reassignment is admin-only or any-staff.
That is a feature, not a patch, and it has never been hit: the team is small and nobody
has been deactivated mid-build.

**Do not "fix" this by loosening `canLogProgress`.** Restoring the admin override would
re-introduce the exact bug it replaced — a non-assignee posting first-person progress on
someone else's build (observed in production on REQ-001: an admin logged "80%" on a build
another member had claimed). The gap is assignment, not logging.

## When to fix it

The first time a member with an in-flight request leaves, changes role, or hands work
over. Watch for: `IN_PROGRESS` requests whose `assigned_to` is an inactive user —

```sql
select t.number, u.email, u.is_active
from tickets t join users u on u.id = t.assigned_to
where t.type = 'REQUEST' and t.status = 'IN_PROGRESS' and u.is_active = false;
```

If that ever returns a row, this card is due.
