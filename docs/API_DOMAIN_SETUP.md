# `api.laundrylobby.com` Setup Runbook

This is the operational task that unlocks proper cross-subdomain cookie auth.

Without it, the cookie config changes in this PR are inert — `Domain=.laundrylobby.com` cookies set by `laundrylobbybackend.vercel.app` are rejected by browsers because the host is on a different eTLD+1.

After this is done, frontends on `*.laundrylobby.com` and the backend on `api.laundrylobby.com` will share the same cookie domain, and HttpOnly auth will actually work the way it's supposed to.

---

## Prerequisites

- Vercel CLI logged in as `deepakfixl2@gmail.com`
- DNS access for `laundrylobby.com` (third-party registrar — Cloudflare? GoDaddy?)

---

## Step 1 — Add the custom domain in Vercel

In the `laundrylobbybackend` project on Vercel:

1. Go to **Settings → Domains**
2. Click **Add Domain**
3. Enter `api.laundrylobby.com`
4. Vercel will show a CNAME target like `cname.vercel-dns.com`. Note it.
5. Vercel will say "Invalid Configuration" until DNS propagates — that's expected.

CLI alternative:

```powershell
cd path/to/laundry-management-system-backend
vercel domains add api.laundrylobby.com
```

---

## Step 2 — DNS

In your DNS provider (the registrar where `laundrylobby.com` lives):

| Type  | Name | Value                  | TTL   |
|-------|------|------------------------|-------|
| CNAME | api  | cname.vercel-dns.com   | Auto  |

**If your DNS provider doesn't allow CNAME at non-apex:**
Use ALIAS or ANAME instead, with the same target.

**If using Cloudflare:** turn the proxy OFF (gray cloud, not orange) for this record. Vercel needs to terminate SSL itself.

Wait 5-15 minutes for propagation. Verify with:

```powershell
nslookup api.laundrylobby.com
```

Should resolve to a Vercel IP.

---

## Step 3 — Wait for SSL

Vercel auto-provisions a Let's Encrypt cert once DNS is correct. In the Domains screen, the status will flip to "Valid Configuration" and you'll see "SSL Certificate Issued". Usually a few minutes.

Test:

```powershell
curl https://api.laundrylobby.com/api/health
```

Should return the same JSON as `https://laundrylobbybackend.vercel.app/api/health`.

---

## Step 4 — Update production env vars

### Frontend project (`laundry-management-system-frontend`)

Vercel → Settings → Environment Variables → Production:

```
NEXT_PUBLIC_API_URL = https://api.laundrylobby.com/api
```

(was `https://laundrylobbybackend.vercel.app/api`)

### Superadmin project (`laundry-management-system-superadmin`)

Same change to its `NEXT_PUBLIC_API_URL`.

### Marketing project (`laundrylobbyy`)

Only if it calls the backend — check its env vars.

### Backend project (`laundrylobbybackend`)

Add a new env var:

```
COOKIE_DOMAIN = .laundrylobby.com
```

Note the **leading dot** — required for the cookie to be valid for all subdomains.

The existing `FRONTEND_URL`, `SUPERADMIN_URL`, `MARKETING_URL` vars should already point to the right places — verify they're all `*.laundrylobby.com`.

---

## Step 5 — Redeploy in this order

1. **Backend** first — picks up `COOKIE_DOMAIN` and starts setting cookies with the new domain.
2. **All frontends** — pick up the new `NEXT_PUBLIC_API_URL`.

Order matters: if you deploy frontends first, they'll call the new domain before backend serves it.

---

## Step 6 — Force logout existing users

This step is **expected user impact**. Existing cookies were set with no `Domain` field (host-only at `laundrylobbybackend.vercel.app`). After redeploy, new cookies are set with `Domain=.laundrylobby.com`. The old cookies are still valid (until they expire) but live in the wrong scope. Browsers won't replace them.

**Mitigation:** users will be auto-logged-out the moment the JWT in the old cookie expires (24h). Or you can do an explicit forced logout:

```js
// Run once via a deploy script or admin endpoint
// Increments JWT version → all old tokens reject
await User.updateMany({}, { $inc: { tokenVersion: 1 } })
```

(Requires `tokenVersion` field on the User model + a check in the auth middleware. If not implemented, just accept the natural 24h migration.)

---

## Step 7 — Verify

After deploy:

1. Open `https://prakash.laundrylobby.com` (or any tenant subdomain)
2. Log in via the tenant's auth page
3. DevTools → Application → Cookies → `prakash.laundrylobby.com`
4. Find `laundry_access_token`. Verify:
   - `Domain` = `.laundrylobby.com` ✅
   - `HttpOnly` = ✅
   - `Secure` = ✅
   - `SameSite` = `Lax` ✅
5. Navigate to `https://cleanco.laundrylobby.com` — same cookie should be sent (visible in Network tab Request Cookies).
6. Visit `https://tenacy.laundrylobby.com/` — Find Your Laundry should know you're logged in (once we wire that in Phase 3 of the FYL plan).

---

## Rollback

If something breaks:

1. Revert backend env: remove `COOKIE_DOMAIN`, redeploy backend.
2. Revert frontend env: change `NEXT_PUBLIC_API_URL` back to `laundrylobbybackend.vercel.app/api`.
3. Optional: leave `api.laundrylobby.com` configured in Vercel — it's harmless when unused.

The code change in this PR is backwards-compatible: cookies still get set, just without `Domain`. Same behavior as before COOKIE_DOMAIN was introduced.

---

## After this is done

Once stable in prod, track these follow-ups:

- **Frontend auth refactor:** stop persisting Bearer token in localStorage. Use `/api/auth/me` on page load to hydrate auth state from cookie. (Issue #3 in audit)
- **Remove the `Authorization: Bearer` interceptor** in `lib/api.ts` once cookie-only auth is verified working. (Issue #4 in audit)
- **Remove the `localStorage` token fallback** in any remaining API client.

These are larger frontend changes; defer until the cookie infra is verified working under real traffic.
