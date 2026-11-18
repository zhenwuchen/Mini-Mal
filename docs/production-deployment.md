# Mini Mal1 Production Deployment

This document describes the supported short-term production architecture:

- Linux Node.js 22 host
- one Next.js application process
- persistent SQLite database
- external HTTPS Cron every minute
- no standalone output, cluster mode, or background worker

Paths and names in the examples are templates. Replace them with values that
match the target server.

## 1. Required Runtime

Production must use Node.js 22.x. The repository pins Node.js 22.19.0 in
`.nvmrc`, and `package.json` requires:

```text
>=22.19.0 <23
```

Build and install dependencies on Linux for the same CPU architecture as the
production host. Prisma includes a native query engine, so a Windows build is
not a portable Linux artifact.

```bash
node --version
npm --version
npm ci
npm run config:check:production
```

`npm run config:check:production` validates names and formats only. It does not
create the SQLite file, execute SQL, or print secret values. A valid
configuration does not require the database file to already exist.

## 2. Filesystem Layout

Keep releases and mutable data separate:

```text
/opt/mini-mall/
  releases/
    20261117T120000Z/
  current -> releases/20261117T120000Z

/var/lib/mini-mall/
  app.db
  app.db-journal        (only when SQLite uses a rollback journal)
  app.db-wal            (only when SQLite uses WAL mode)
  app.db-shm            (only when SQLite uses WAL mode)

/var/backups/mini-mall/
  app-<timestamp>-<id>.db
  app-<timestamp>-<id>.db.sha256

/etc/mini-mall/
  production.env
```

The database directory must be writable by the application user because SQLite
creates journal or WAL sidecar files next to the database.

## 3. Create the Application User and Directories

Run these commands as a privileged administrator, replacing the example user
and group names consistently:

```bash
sudo useradd --system --home /opt/mini-mall --shell /usr/sbin/nologin mini-mall
sudo install -d -o mini-mall -g mini-mall -m 0750 /opt/mini-mall/releases
sudo install -d -o mini-mall -g mini-mall -m 0750 /var/lib/mini-mall
sudo install -d -o mini-mall -g mini-mall -m 0750 /var/backups/mini-mall
sudo install -d -o root -g mini-mall -m 0750 /etc/mini-mall
```

Do not place `app.db` inside `/opt/mini-mall/current`; release replacement or
cleanup must never affect production data.

## 4. Production Environment

Create `/etc/mini-mall/production.env` from
`deploy/env.production.example`. Protect it:

```bash
sudo chown root:mini-mall /etc/mini-mall/production.env
sudo chmod 0640 /etc/mini-mall/production.env
```

Required variables:

```text
NODE_ENV=production
DATABASE_URL=file:/var/lib/mini-mall/app.db
AUTH_SECRET=<strong server-side secret>
AUTH_TRUST_HOST=true
CRON_SECRET=<base64url secret accepted by internal-task-auth>
```

Rules:

- `DATABASE_URL` must be an absolute SQLite `file:` URL.
- It must not point to `prisma/dev.db` or another relative path.
- `AUTH_SECRET` must be stable, non-placeholder, and at least 32 characters.
- `CRON_SECRET` must be base64url and decode to at least 32 bytes.
- The same `CRON_SECRET` must be stored in the external scheduler's secret
  manager.
- Never use `NEXT_PUBLIC_` for any secret.
- Never print `Authorization`, secret values, or the production environment file
  into logs.

Create secrets through the organization's secret-management process. The tools
in this repository do not generate real secrets.

`ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` are only used by the explicit
seed step. They are not normal runtime requirements.

## 5. Prepare and Build a Release

Prepare the release while the current application remains online:

```bash
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_DIR="/opt/mini-mall/releases/$RELEASE_ID"

sudo -u mini-mall mkdir -p "$RELEASE_DIR"
# Copy a clean source archive into $RELEASE_DIR and enter it.

cd "$RELEASE_DIR"
node --version
npm ci
npm run db:generate
npm run build
```

The npm production build script runs Prisma Client generation before
`next build`. Build never runs Migration or Seed.

Build may execute server code that reads the database. Provide a valid,
non-destructive `DATABASE_URL` for the build. During CI, use a staging database
copy or the intended production database in read-only practice. Do not run
`db:push`, `db:seed`, or Migration as part of Build.

The current deployment does not use Next.js standalone output. The runtime
requires:

- `.next`
- `public`
- `package.json`
- production `node_modules`
- Prisma native query engine

Ensure `.next/cache` exists and is writable by the application user:

```bash
sudo -u mini-mall mkdir -p "$RELEASE_DIR/.next/cache"
```

## 6. First Deployment

The database file normally does not exist before the first Migration.

1. Create the application user and directories.
2. Prepare and validate `/etc/mini-mall/production.env`.
3. Build one Linux release as described above.
4. Set `DATABASE_URL` to the absolute persistent database path.
5. Run the production configuration check:

   ```bash
   set -a
   . /etc/mini-mall/production.env
   set +a
   npm run config:check:production
   ```

6. If an old database file already exists, stop and create a verified backup
   before continuing.
7. Apply checked-in Migrations:

   ```bash
   npm run db:migrate:deploy
   ```

8. Verify Migration and database integrity:

   ```bash
   npx prisma migrate status --schema prisma/schema.prisma
   sqlite3 /var/lib/mini-mall/app.db "PRAGMA integrity_check;"
   sqlite3 /var/lib/mini-mall/app.db "PRAGMA foreign_key_check;"
   ```

9. Seed only if this is truly the first empty installation and initial catalog
   and administrator data are required:

   ```bash
   npm run db:seed
   ```

   `db:seed` updates seeded products with their original stock level. Never run
   it after sales have modified production inventory.

10. Point `current` to the release:

    ```bash
    ln -sfn "$RELEASE_DIR" /opt/mini-mall/current.new
    mv -Tf /opt/mini-mall/current.new /opt/mini-mall/current
    ```

11. Install and start the systemd service template.

## 7. Subsequent Release Procedure

Use this exact order:

1. Prepare a new release directory.
2. Run `npm ci`.
3. Run `npm run db:generate`.
4. Run `npm run build`.
5. Pause the external Cron scheduler.
6. Stop the application:

   ```bash
   sudo systemctl stop mini-mall.service
   ```

7. Create an online/consistent SQLite backup. Since the application is stopped,
   the backup command is also safe against concurrent writes:

   ```bash
   npm run db:backup -- \
     --database /var/lib/mini-mall/app.db \
     --output-dir /var/backups/mini-mall
   ```

8. Verify that the backup exists, is non-empty, and has a valid SHA-256
   checksum:

   ```bash
   sha256sum -c /var/backups/mini-mall/<backup>.db.sha256
   ```

9. Apply pending Migrations:

   ```bash
   npm run db:migrate:deploy
   ```

10. Verify Migration status and database integrity. If any command fails, stop
    the release immediately.
11. Atomically switch `/opt/mini-mall/current` to the new release.
12. Start exactly one service instance:

    ```bash
    sudo systemctl start mini-mall.service
    ```

13. Run an HTTPS health check against the application.
14. Verify products, order lookup, payment state, inventory, and expired-order
    behavior.
15. Resume the external Cron schedule.

Migration command:

```bash
npm run db:migrate:deploy
```

It maps to:

```bash
prisma migrate deploy --schema prisma/schema.prisma
```

Do not use `npm run db:migrate` in production. That command runs
`prisma migrate dev`. Do not use `npm run db:push`; it bypasses checked-in
Migration history.

### Migration Risk: Order and Payment Rebuild

Migration `20261116135659_add_order_address_snapshots` rebuilds the `Order` and
`Payment` tables. It creates replacement tables, copies data, drops the old
tables, renames the replacements, and recreates indexes.

Treat this Migration as high risk:

- Take and verify a pre-Migration backup.
- Stop application writes.
- Pause Cron.
- Do not continue if Migration returns a non-zero exit code.
- Do not automatically run a rollback Migration.
- Do not delete the production database or its sidecar files during recovery.

## 8. Single-Instance systemd Service

Review and copy:

```text
deploy/systemd/mini-mall.service.example
```

to an appropriate systemd unit path, then replace the example user, paths, node
binary, bind address, and port.

The unit:

- runs `next start` once
- uses `NODE_ENV=production`
- loads `/etc/mini-mall/production.env`
- restarts after abnormal exit
- does not run Migration or Seed
- does not use PM2, cluster mode, or multiple replicas

Useful commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mini-mall.service
sudo systemctl stop mini-mall.service
sudo systemctl start mini-mall.service
sudo systemctl restart mini-mall.service
sudo systemctl status mini-mall.service
sudo journalctl -u mini-mall.service -f
```

Only one service instance may use SQLite for writes. If the host process manager
supports replicas, set replicas to exactly one.

## 9. External Cron

Configure the scheduler in its own platform after production is healthy:

- Method: `POST`
- URL: `https://<production-host>/api/internal/orders/expire`
- Authorization: `Bearer <CRON_SECRET>`
- Body: empty or `{}`
- Frequency: every minute
- Client timeout: 20-30 seconds
- Overlap: forbidden

Use the existing internal task authentication and order expiration Handler. Do
not give the scheduler database access and do not recreate order cancellation,
stock restoration, or payment checks in the scheduler.

Treat responses as follows:

- Network errors and HTTP 500/503: limited retry with alerting.
- HTTP 400: do not retry; fix the request contract.
- HTTP 401: do not retry; rotate/align the secret.
- HTTP 405: do not retry; the scheduler must use POST.
- HTTP 200: inspect `cancelled`, `failed`, `inconsistent`, `deferred`, and
  `budgetExhausted`.

Do not invoke the production endpoint as part of this infrastructure change.

## 10. Backup Policy

Recommended starting policy:

- every 15 minutes: retain 24 hours
- every hour: retain 7 days
- every day: retain 30 days
- one long-lived backup before every production Migration
- copy at least one generation off-host

Use the SQLite online Backup API through the CLI:

```bash
sqlite3 /var/lib/mini-mall/app.db \
  ".backup '/var/backups/mini-mall/app-<timestamp>.db'"
```

The repository wrapper validates paths, requires `sqlite3`, refuses output
inside the database directory, creates unique filenames, verifies the backup is
non-empty, and writes a SHA-256 checksum:

```bash
npm run db:backup -- \
  --database /var/lib/mini-mall/app.db \
  --output-dir /var/backups/mini-mall
```

Do not copy a live SQLite database with `cp`, especially when journal or WAL
files exist. Use `.backup` or stop the application before copying.

The backup tool does not install `sqlite3`. Install the operating system package
through the normal host provisioning process.

## 11. Failure Recovery

If Migration or application upgrade fails:

1. Keep Cron paused.
2. Stop the application.
3. Preserve the failed database and all `-journal`, `-wal`, and `-shm` sidecar
   files for investigation.
4. Do not switch back to older code and continue writing against a newer Schema.
5. Do not restore until the selected backup's SHA-256 checksum has been
   verified.
6. Restore only after all application writes have stopped.
7. Replace the database and sidecar state from the verified snapshot.
8. Run:

   ```bash
   sqlite3 /var/lib/mini-mall/app.db "PRAGMA integrity_check;"
   sqlite3 /var/lib/mini-mall/app.db "PRAGMA foreign_key_check;"
   ```

9. Validate users, products, carts, orders, order items, payments, and stock.
10. Start one application instance.
11. Run smoke tests.
12. Resume Cron only after database and application checks pass.

Restore validation should include:

- product stock is never negative
- order totals equal item subtotals
- paid orders have consistent successful payments
- cancelled orders were not returned to an invalid state
- an expired pending order can be scanned by the next Cron run
- login, catalog, cart, and order lookup work

## 12. Staging and Restore Drills

Before relying on a new Migration:

1. Copy a recent production snapshot to an isolated staging host.
2. Run `npm run db:migrate:deploy` against that isolated copy.
3. Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check`.
4. Run the complete application test and smoke sequence.
5. Restore another copy from backup and verify the recovery procedure.

Never test Migration on the original production database or `prisma/dev.db`.
