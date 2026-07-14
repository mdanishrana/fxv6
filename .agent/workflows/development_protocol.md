# Strict Development & Deployment Protocol

## 1. Local-First Development (Windows)
- **ALL** changes must be implemented and verified on the local Windows machine first.
- **NO** remote edits or direct server changes.

## 2. Database Safety
- **IF** DB changes are required (tables, columns, constraints, enums):
    - Identify the change explicitly.
    - Generate a **FULL SQL migration file**.
    - Ensure SQL is **idempotent** (`IF NOT EXISTS`).
    - Save as `database/migrations/YYYYMMDD_description.sql`.
- **NO** DB changes on production without SQL review.

## 3. Local Validation
- Build success.
- No runtime errors.
- Visual verification of UI.

## 4. Git Source of Truth
- Commit changes locally with clear messages.
- Push to `main` branch.
- **NEVER** push broken code.

## 5. Server Sync (Ubuntu 192.168.0.183)
- **ONLY** after Git push success.
- Sync via `git pull` (or explicit deployment workflow mirroring git).
- **NO** manual file copying.

## 6. Response Format
For **EVERY** task, use this structure:
1. **Summary of intended change**
2. **Files to be modified**
3. **Database impact (YES/NO)** (If YES -> provide SQL)
4. **Local test checklist**
5. **Git commit message**
6. **Deployment confirmation steps**

## Restrictions
- **DO NOT**: Modify `.env`, touch secrets, bypass Git, or break logic.
