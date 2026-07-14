# FarmXpert Database Backup & Recovery Guide

This guide is for System Administrators to properly backup, restore, and perform disaster recovery drills on the FarmXpert PostgreSQL database running on a Linux production server.

## 1. Taking a Full Database Backup

A full backup captures both the schema (tables, constraints) and the actual data (farms, users, cattle) exactly as it exists at that specific moment in time.

**Run this command on your Linux terminal:**
```bash
sudo -u postgres pg_dump farmxpert_db > /var/www/fxv5/fxv5/scripts/farmxpert_backup_$(date +%Y%m%d).sql
```
*This will create a file named something like `farmxpert_backup_20260303.sql` inside your scripts directory.*

---

## 2. Disaster Recovery Drill (Restoring over an active database)

If you need to restore the database to an exact rollback point (e.g. if a farm or data was accidentally deleted), you **cannot** just dump the SQL file into the existing database, as you will hit hundreds of duplicate constraint errors.

You must wipe the existing database entirely and recreate it from a blank slate.

### Step 1: Stop the Application Server
You must stop the Node.js or PM2 service first, otherwise active database connections will block you from dropping the `farmxpert_db`.

```bash
pm2 stop all  # Or systemctl stop farmxpert
```

### Step 2: Wipe & Recreate the Database
```bash
# Drop the existing database (WARNING: THIS DELETES EVERYTHING!)
sudo -u postgres dropdb farmxpert_db

# Create a fresh, empty database
sudo -u postgres createdb farmxpert_db
```

### Step 3: Restore the Backup
Inject the SQL backup file into the freshly created empty database. Make sure to replace the filename below with your actual backup filename.

```bash
sudo -u postgres psql -d farmxpert_db -f /var/www/fxv5/fxv5/scripts/farmxpert_backup_20260303.sql
```

### Step 4: Restart the Application Server
Once the restore finishes, boot the application back up. The UI will instantly reflect the restored data.

```bash
pm2 restart all  # Or systemctl restart farmxpert
```

---

## 3. Applying New Development Structural Changes (Migrations)

When pulling new code from GitHub that includes database changes (like adding new columns or tables), you **do not** use the `pg_dump` files. 

Instead, simply execute the specific migration script provided by the developer on top of your existing database data:

```bash
sudo -u postgres psql -d farmxpert_db -v ON_ERROR_STOP=1 -f /var/www/fxv5/fxv5/scripts/migration_phase12_branding.sql
```
*Migrations are designed to safely alter existing tables without deleting your live data.*
