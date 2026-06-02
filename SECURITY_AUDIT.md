# Security Audit Report — Express/EJS “mobileapp-data-penduduk”

Audit date: 2026-05-26 (Asia/Makassar)  
Scope: Node.js/Express server (`src/`), EJS admin web UI (`src/views/`), API endpoints for mobile (`/api/*`).  
Method: Static code review + local configuration review (no dynamic pentest). Dependency vulnerability scan via `npm audit` could not be completed from this environment (see “Dependencies & Supply Chain”).

## Executive Summary

The application already includes several good baseline controls (Helmet with CSP/HSTS, session store backed by Sequelize, CSRF protection on admin routes, request body size limits, and input sanitization middleware). However, there are multiple **high-impact issues** that should be addressed before production use:

1. **Secrets are present in a tracked `.env` file** (JWT/session secrets are weak and effectively “public” if the repository is shared). This is a **Critical** risk.
2. **Stored/DOM XSS risk in the admin dashboard** due to client-side `innerHTML` rendering of widget titles. CSP currently allows inline scripts, increasing blast radius. This is **High**.
3. **Dynamic database column selection without validation** (`field_name` from the URL is used directly in Sequelize `attributes`). This is at least **Medium–High** (DoS/data exposure risk; injection risk depends on Sequelize/DB quoting behavior).
4. **JWT auth logic mismatch**: token payload does not include `role`, but middleware requires it, which likely breaks API access and can cause inconsistent authorization assumptions. **Medium** (security + reliability).

This report lists findings with evidence pointers, impact, and recommended remediations.

## System Overview (as observed)

- **Server**: Express `5.2.1` (`src/app.js`)
  - `helmet` with CSP + HSTS enabled
  - `express-session` with `connect-session-sequelize` store (MySQL via Sequelize)
  - `cors` enabled at app-level
  - Global rate limit (15 min / 500)
  - Static files served from `src/public`
- **Admin Web UI**: EJS templates + Bootstrap/Chart.js via CDN
- **API**: `/api/login`, `/api/config`, and authenticated CRUD endpoints for `warga` plus analytics endpoints

## Findings (Server + Client)

### [CRITICAL] Secrets committed in `.env` (JWT/Session secrets are exposed)

**Evidence**
- `.env` exists in repository root and contains `JWT_SECRET` + `SESSION_SECRET` values (example values are simple and predictable).
- `.gitignore` already includes `.env`, but the file is still present → indicates it may already be tracked historically.

**Impact**
- Anyone with repository access can mint valid JWTs, forge sessions (depending on session secret usage), and impersonate users.
- If the same secrets were used in deployed environments, compromise extends to production data.

**Recommendations**
- Rotate secrets immediately (new long random values; minimum 32+ bytes).
- Remove `.env` from version control history and current tracking:
  - `git rm --cached .env` (keep local file), then commit.
  - Consider using a secrets manager (or at least environment variables injected by the deployment platform).
- Add additional ignores for sensitive runtime artifacts (`src/public/uploads`, backups, zip files).

---

### [HIGH] Stored/DOM XSS in admin dashboard widget rendering (uses `innerHTML`)

**Evidence**
- `src/views/admin/dashboard.ejs:172` and `src/views/admin/dashboard.ejs:177` render server-provided `widget.title` into `innerHTML`:
  - The widget title originates from admin input via `/admin/api/widgets` (create widget).

**Impact**
- If a malicious payload is stored as widget title (e.g., `<img src=x onerror=...>`), it can execute in any admin’s browser.
- This can lead to session theft (if cookies are compromised via other vectors), CSRF token theft, privilege escalation, or persistent backdoor behavior.

**Recommendations**
- Avoid `innerHTML` for untrusted content:
  - Use `textContent` for title rendering.
  - Construct DOM nodes manually (or use a templating approach that escapes by default).
- Harden CSP (see next finding) so that even if XSS happens it is harder to exploit.

---

### [HIGH] CSP allows inline scripts (`'unsafe-inline'`) which weakens XSS defenses

**Evidence**
- `src/app.js:33-35`:
  - `scriptSrc` contains `'unsafe-inline'`
  - `scriptSrcAttr` contains `'unsafe-inline'`
  - `styleSrc` contains `'unsafe-inline'`

**Impact**
- If any XSS is found, the attacker can usually execute immediately because inline JavaScript is allowed.
- CSP becomes significantly less effective as a mitigation layer.

**Recommendations**
- Remove `'unsafe-inline'` and adopt a nonce-based CSP:
  - Generate a per-request nonce and set it in CSP + inline `<script nonce="...">`.
  - Prefer moving inline scripts to static `.js` files served from your own origin.
- Add `frame-ancestors 'none'` (or a strict allowlist) if the admin UI must not be embedded (clickjacking protection).

---

### [MEDIUM–HIGH] Dynamic column selection without validation (`field_name` used as attribute)

**Evidence**
- Routes:
  - `src/routes/admin.js:25` → `/admin/api/aggregate/:field_name`
  - `src/routes/api.js:21` → `/api/aggregate/:field_name`
- Implementation:
  - `src/controllers/analyticsController.js` uses `attributes: [field_name]` directly from the URL param.

**Impact**
- Attackers (or compromised accounts) can cause:
  - Excessive errors (DoS) by requesting invalid/expensive fields.
  - Unexpected data exposure if non-intended columns become queryable in future schema changes.
  - Potential SQL injection risk depending on ORM quoting behavior and DB dialect edge-cases.

**Recommendations**
- Validate `field_name` against a strict allowlist:
  - Ideally derived from `form-schema.json` plus a curated list of safe core columns.
  - Reject unknown fields with HTTP 400.
- Consider using `Sequelize.col(field)` with quoting + allowlist (do not rely on quoting alone).

---

### [MEDIUM] JWT auth mismatch: token payload missing `role`, but middleware requires it

**Evidence**
- Token creation: `src/controllers/apiController.js:17`
  - Signs `{ id, username, dusun_id }` (no `role`)
- Verification: `src/middleware/auth.js:34`
  - Rejects if `!user.id || !user.role`

**Impact**
- API authentication may fail unexpectedly for valid logins (availability issue).
- Developers may “work around” by weakening checks later, risking authorization bypass.

**Recommendations**
- Decide on a consistent JWT claim set:
  - Option A: include `role` in token at login and enforce it in middleware.
  - Option B: remove the `role` requirement from the token and fetch role server-side from DB per request (more secure, slightly slower).
- Add `issuer`/`audience` checks if tokens are used across multiple services/apps.

---

### [MEDIUM] CSRF token accepted via query string (token leakage risk)

**Evidence**
- Token extraction: `src/middleware/csrf.js:7-9` includes `req.query['_csrf']`
- Usage in forms:
  - `src/views/admin/settings.ejs:25` and `src/views/admin/settings.ejs:134` include `_csrf` in the URL query.

**Impact**
- CSRF tokens can leak via:
  - Access logs
  - Browser history
  - Referrer headers (to third-party resources)

**Recommendations**
- Stop accepting CSRF token from query string for state-changing requests.
- Pass token via hidden form field (`<input type="hidden" name="_csrf" ...>`) or header for XHR/fetch.

---

### [MEDIUM] Session fixation hardening missing (no session regeneration on login)

**Evidence**
- Admin login: `src/controllers/adminController.js:30` sets `req.session.user = user` without regenerating session ID.

**Impact**
- If an attacker can set/guess a victim’s session ID before login (or via shared devices), the attacker may reuse that session after victim logs in.

**Recommendations**
- On successful login:
  - `req.session.regenerate(...)` then assign user identity.
- On logout:
  - Destroy session with callback and clear cookie reliably.
- Store only minimal user info in session (e.g., `{ id, username, role }`), not full Sequelize model instances.

---

### [MEDIUM] PII and sensitive data may be written to logs (console + audit logs)

**Evidence**
- Debug logging of request bodies:
  - `src/controllers/adminController.js` contains multiple `[DEBUG] req.body` logs for warga create/update.
  - `src/controllers/apiController.js` logs incoming user IDs.
- Audit logs store full old/new data snapshots:
  - `src/utils/logger.js` stores `old_data` / `new_data` as JSON strings.

**Impact**
- Logs can become a secondary sensitive dataset (NIK/KK/names/etc.).
- In case of DB compromise, audit logs significantly increase data exposure.

**Recommendations**
- Remove verbose debug logs in production.
- Redact/highlight-only fields for audit logs (store diffs, not full records; or encrypt sensitive log payloads at rest).
- Implement retention policies (automatic purge after N days) and restrict access tightly.

---

### [LOW–MEDIUM] Public uploads directory under static hosting + repository artifacts

**Evidence**
- Static files: `src/app.js` serves `src/public` via `express.static(...)`.
- Upload destination: `src/config/multer.js` writes into `src/public/uploads/`.
- Repository currently contains an `src/public/uploads/app-...` artifact.
- Repository also contains `we.zip`.

**Impact**
- Uploaded artifacts become publicly retrievable if routes are exposed.
- Risk of accidental sensitive file exposure and repository bloat.

**Recommendations**
- Do not commit runtime uploads to git; add ignores:
  - `src/public/uploads/`
  - `*.zip` (if not needed)
- Consider moving uploads outside of the web root and serving them via controlled download endpoints with authorization checks (especially for APK distribution).
- Add scanning for malware to uploaded APKs if the system is used for distribution.

## Existing Positive Controls (Good Practices Present)

- `app.disable('x-powered-by')` reduces fingerprinting (`src/app.js`).
- Body size limited to `100kb` to reduce payload DoS (`src/app.js`).
- Session cookies set `httpOnly` and `secure` in production (`src/app.js`).
- CSRF middleware applied to admin routes (`src/routes/admin.js` + `src/middleware/csrf.js`).
- File uploads restrict extensions/mimetypes (`src/config/multer.js`).
- Schema sync validates column names with strict regex (`src/config/schema-sync.js`).

## Dependencies & Supply Chain

### Observations

- Local environment uses:
  - Node.js `v22.18.0`
  - npm `10.9.3`
- npm registry is configured to `https://registry.npmmirror.com` (`npm config get registry`).
- `package-lock.json` contains `resolved` URLs pointing to `registry.npmmirror.com`.

### `npm audit` status

From this environment, `npm.cmd audit` failed due to registry/network access and/or inability to write npm logs to the default cache location. This audit therefore **does not include** CVE-level dependency vulnerability results.

### Recommended next steps (run in a normal dev machine/CI with internet)

1. Run:
   - `npm ci`
   - `npm audit --json`
   - `npm audit fix` (evaluate carefully; don’t auto-upgrade major versions without testing)
2. Consider:
   - Pinning to `registry.npmjs.org` (or an internal vetted registry) for production builds.
   - Enabling lockfile integrity checks in CI.

## Quick Remediation Checklist (Prioritized)

1. **Rotate secrets** and remove `.env` from git history/tracking.
2. Fix **dashboard DOM XSS**: eliminate `innerHTML` for widget content.
3. Strengthen **CSP** (remove `'unsafe-inline'`, adopt nonce).
4. Validate `field_name` against an allowlist in analytics endpoints.
5. Fix JWT claim consistency (`role` handling).
6. Add per-route rate limiters for `/admin/login` and `/api/login`.
7. Reduce sensitive logging and implement log retention.

