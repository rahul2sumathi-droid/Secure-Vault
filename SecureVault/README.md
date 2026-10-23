# SecureVault - Secure Document Sharing Platform with Access Control

Full-stack MERN project (React + Vite, Node/Express, MongoDB/GridFS) built from the 0th and 1st review decks:
fine-grained RBAC + per-file ACLs, AES-256-GCM encryption, automatic versioning, MFA, and a tamper-evident audit trail.

## 1. Prerequisites (Windows)
| Tool | Version | Notes |
|---|---|---|
| Node.js | 18 or newer (20 LTS recommended) | https://nodejs.org |
| MongoDB | Community Server 6+ **or** a free MongoDB Atlas cluster | Local install runs as a Windows service on `mongodb://127.0.0.1:27017` |
| VS Code | any | Open the `SecureVault` folder |

Using Atlas instead of local MongoDB? Put your connection string in `server/.env` as `MONGO_URI=...` after step 2.

## 2. First-time setup (VS Code terminal, project root)
```bash
npm install          # installs concurrently (root)
npm run setup        # installs server + client deps, creates server/.env with fresh random secrets
npm run seed         # creates 4 demo accounts (development only)
```
## 3. Run
```bash
npm run dev          # API on http://localhost:5000, web app on http://localhost:5173
```
Open **http://localhost:5173**.

Demo accounts (password for all: `SecureVault#2026`):

| Email | Role |
|---|---|
| admin@securevault.local | Admin |
| owner@securevault.local | File Owner |
| collab@securevault.local | Collaborator |
| auditor@securevault.local | Auditor |

Run the security unit tests: `npm test`.

## 4. Suggested demo walk-through
1. Sign in as **owner** -> *My Files* -> Upload a PDF. Open it -> *Versions* -> upload a new version, compare, restore the old one.
2. *Sharing* -> share with `collab@securevault.local` (View + Download, expires in 7 days).
3. Sign in as **collab** in a private window -> *Shared with Me* -> view/download; try the Edit-only actions (denied). The denial is audited.
4. Owner -> *Activity* tab shows every access to that file. Revoke the share; collab loses access instantly.
5. Sign in as **auditor** -> *Audit Log*: filter, **Verify integrity**, **Export CSV**. Auditor cannot open any document.
6. Sign in as **admin** -> *Users & Access*: change roles, deactivate users, review/revoke grants. Admin gets "File not found" on documents (no content access by role).
7. *Security* page: enable MFA (QR + recovery codes), view/revoke sessions.

## 5. Architecture (matches the review decks)
```
Client (React, Axios)  ->  Express: helmet / rate-limit / sanitize -> authenticate (JWT + live session check)
   -> fileAccess (RBAC + ACL, per route) -> controller -> AES-256-GCM encrypt/decrypt -> GridFS (ciphertext only)
   -> every action -> audit service (append-only, SHA-256 hash chain)
MongoDB collections: users, sessions, files, fileversions, permissions, auditlogs (+ GridFS bucket encrypted_files)
```
```
server/src  config.js  app.js  server.js  seed.js
  models/       User Session File FileVersion Permission AuditLog
  middleware/   auth fileAccess validate sanitize rateLimit errors
  services/     crypto storage audit access mailer
  controllers/  auth file permission audit admin misc
  routes/index.js
client/src  App.jsx  AuthContext.jsx  api.js  components/  pages/
```

## 6. How the key requirements are met
* **Encryption at rest** - each file has its own random 256-bit data key, wrapped by `MASTER_KEY` (kept in `.env`, *not* in the database). Each version is encrypted with AES-256-GCM using a fresh IV; the file id + version number are bound as authenticated data so blobs can't be swapped. Only ciphertext goes to GridFS, under random names. Downloads verify the GCM tag and the stored SHA-256.
* **Encryption in transit** - TLS is required in production (terminate HTTPS at a reverse proxy, or set `SSL_KEY_PATH`/`SSL_CERT_PATH` to run HTTPS directly; `mkcert` makes local certs). Local dev uses plain HTTP.
* **RBAC + ACL** - roles: admin, owner, collaborator, auditor. Every route checks role; every `/files/:id/*` route runs `fileAccess(permission)`. Permissions per user per file: view, download, edit (new versions), reshare, plus expiry. Re-sharing can never exceed the grantor's rights or expiry, and revoking someone cascades to what they re-shared.
* **Admin/Auditor never see content** - `resolveAccess` returns no access for those roles and they cannot be granted any. Admin can review and revoke grants (metadata only).
* **Versioning** - every upload of a new version creates `FileVersion` n+1; restore creates a *new* version from the old content, so history is never rewritten.
* **Audit** - append-only collection (update/delete blocked at the model layer), each record hashed with the previous one. *Verify integrity* recomputes the chain. Includes logins, MFA, sharing, downloads, denials, role changes, exports.
* **Auth** - bcrypt (cost 12); 15-minute access JWT held in memory only; refresh token in an httpOnly SameSite=Strict cookie, stored hashed, rotated on every use with replay detection; account lock after 5 failures (15 min); TOTP MFA with once-only codes and 10 bcrypt-hashed single-use recovery codes; password reset via 30-minute single-use hashed token; changing/resetting a password signs out other sessions.
* **Hardening** - helmet, CORS allow-list, rate limits, express-validator, NoSQL-operator stripping, upload size/type limits, safe inline-preview allow-list (no HTML/SVG), `nosniff`, generic error responses, CSV-injection-safe exports.

## 7. Email: what works and what doesn't
Password-reset and share-notification emails are sent through SMTP **only if** `SMTP_HOST` (and credentials) are set in `server/.env`. Without it **no email is sent**: in development the message (including the reset link) is printed in the server terminal, so you can still test the flow by copying that link. There is no in-app notification centre yet.

## 8. Known limitations (be upfront about these in your viva)
* Uploads are buffered in memory (max `MAX_FILE_MB`, default 25) because AES-GCM must authenticate the whole file; chunked encryption would be the next step for very large files.
* "Expiring links" are implemented as expiring per-user grants (the recipient must sign in). Anonymous public links are intentionally not provided.
* The audit chain is **tamper-evident, not tamper-proof**: someone with full DB access could delete the newest entries undetected. Record the "head hash" from *Verify integrity* externally to detect that. The hash chain is serialized per server process (fine for a single instance).
* `MASTER_KEY` loss = encrypted files are unrecoverable; there is no key rotation tool yet.
* Previews only work for PDF, images (png/jpg/gif/webp) and .txt; other types are download-only.
* Not load-tested; the "<2 s file actions" target holds for typical document sizes on a local machine.
* The seed accounts and `.env` secrets are for development only.

## 9. API summary
`POST /api/auth/login|register|refresh|logout|mfa/verify|forgot|reset` · `GET/POST /api/auth/mfa/*, /sessions`
`GET/POST /api/files` · `GET /api/files/:id` (metadata) · `GET /api/files/:id/download[?version=&inline=1]` (decrypt)
`GET/POST /api/files/:id/versions` · `POST /api/files/:id/versions/:no/restore` · `GET/POST /api/files/:id/share|permissions`
`GET /api/audit[/export|/verify]` · `GET/PATCH /api/admin/users` · `GET/DELETE /api/admin/grants`
