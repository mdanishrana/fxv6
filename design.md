# FarmXpert Breeding, reproduction, and health tracking modules Design Document

This document describes the design, architecture, database schemas, and workflows of the **Breeding, Reproduction, Dairy, and Medical** modules of FarmXpert (FX-Rep-V5).

---

## 🏗️ 1. Architecture Overview

FarmXpert uses a 3-layer architecture:
1. **Frontend (React + Vite + Tailwind CSS):** A responsive dashboard (`CattleManager.tsx`, `BreedingManager.tsx`, `BreedingTimeline.tsx`) providing deep profile views, interactive pedigree graphs, lactation data, and medical timelines.
2. **Backend (Express.js):** REST API endpoints handling auth checks, role-based gates, and atomic transaction blocks.
3. **Database (PostgreSQL):** Relational tables storing cattle profiles, genetic items, pregnancy tracking cycles, daily milking records, and general transactions.

---

## 🗄️ 2. Database Schema Design

### `cattle`
Stores the individual profiles of each animal in the herd.
* `id` (UUID, Primary Key)
* `tenant_id` (UUID, Foreign Key)
* `tag_number` (VARCHAR, Unique per tenant)
* `name` (VARCHAR)
* `type` (VARCHAR) - e.g., `'COW'`, `'HEIFER'`, `'BULL'`
* `breed` (VARCHAR)
* `gender` (VARCHAR) - `'MALE'` or `'FEMALE'`
* `status` (VARCHAR) - `'ACTIVE'`, `'SOLD'`, `'DEAD'`, `'DECEASED'`, `'SICK'`
* `arrival_type` (VARCHAR) - `'BORN'`, `'PURCHASED'`
* `entry_date` (TIMESTAMP)
* `entry_weight` (DECIMAL)
* `current_weight` (DECIMAL)
* `mother_tag` (VARCHAR) - Reference to parent cow tag
* `father_tag` (VARCHAR) - Reference to parent bull tag

### `breeding_events`
Chronological log of reproductive actions taken on animals.
* `id` (UUID, Primary Key)
* `tenant_id` (UUID, Foreign Key)
* `animal_id` (UUID, Foreign Key → `cattle.id`)
* `cycle_id` (UUID, Foreign Key → `pregnancy_cycles.id`, Nullable)
* `event_type` (VARCHAR) - `'HEAT'`, `'SERVICE_AI'`, `'SERVICE_NATURAL'`, `'EMBRYO_TRANSFER'`, `'PREG_CHECK'`, `'CALVING'`, `'ABORTION'`, `'LACTATION_START'`, `'DRY_OFF'`
* `event_date` (TIMESTAMP)
* `details` (JSONB) - Stores dynamic metadata (e.g. technician name, semen codes, pregnancy confirmation methods, and `calfDetails` containing birth weight, breed, gender, and tags)

### `pregnancy_cycles`
Logical grouping of breeding events representing a single pregnancy attempt/gestation.
* `id` (UUID, Primary Key)
* `tenant_id` (UUID, Foreign Key)
* `animal_id` (UUID, Foreign Key → `cattle.id`)
* `status` (VARCHAR) - `'OPEN'`, `'CONFIRMED_PREGNANT'`, `'CALVED'`, `'ABORTED'`
* `cycle_start_date` (TIMESTAMP)
* `expected_calving_date` (TIMESTAMP)
* `actual_calving_date` (TIMESTAMP)

### `lactations`
Lactation tracking for milking cows.
* `id` (UUID, Primary Key)
* `tenant_id` (UUID, Foreign Key)
* `animal_id` (UUID, Foreign Key → `cattle.id`)
* `lactation_number` (INTEGER)
* `start_date` (TIMESTAMP)
* `end_date` (TIMESTAMP, Nullable)
* `expected_breeding_date` (TIMESTAMP) - Calving Date + Voluntarily Waiting Period (VWP, 60 days)
* `status` (VARCHAR) - `'ACTIVE'`, `'ENDED'`
* `end_reason` (VARCHAR) - e.g. `'CALVING / NEW CYCLE'`, `'MANUAL DRY OFF'`

---

## 🔄 3. Core Workflows & Cascading Triggers

### A. Calving (Birth) Creation Flow
When a `'CALVING'` event is posted via `/api/breeding/events`:
```
[User Form Submit]
      │
      ▼
Check duplicate events -> Abort if conflict
      │
      ▼
Update pregnancy cycle status to 'CALVED' & set actual_calving_date
      │
      ▼
Close previous active lactation (status = 'ENDED', reason = 'CALVING / NEW CYCLE')
      │
      ▼
Start new active lactation (Lactation Number = Previous + 1, start_date = eventDate)
      │
      ▼
Create new Cattle record for calf (arrival_type = 'BORN', entry_weight, mother_tag)
      │
      ▼
Link pregnancy cycle ID to the CALVING event (cycle_id = cycle.id)
      │
      ▼
Merge calfDetails into breeding_events.details JSONB column for audit trail
```

---

### B. Calving (Birth) Deletion & Cascade Flow
When a `'CALVING'` event is deleted via `DELETE /api/breeding/events/:id`:
```
Retrieve calving event & details
      │
      ▼
Locate calf by event details (details.calfDetails.tagNumber) 
or fallback (mother_tag + event_date + arrival_type = 'BORN')
      │
      ▼
[Cascade Delete Calf Profile]
   1. Delete breeding events of the calf
   2. Delete pregnancy cycles of the calf
   3. Delete recorded cattle costs of the calf
   4. Delete milk records of the calf (if applicable)
   5. Delete the main cattle profile of the calf
      │
      ▼
[Restore Mother Lactation]
   1. Delete the active lactation record started on this eventDate
   2. Find the last ended lactation (ended via 'CALVING / NEW CYCLE') 
      and restore it (status = 'ACTIVE', end_date = null, end_reason = null)
      │
      ▼
[Re-Sync Pregnancy Status]
   Query remaining events in the pregnancy cycle:
   - If other events exist: Re-evaluate cycle status ('CONFIRMED_PREGNANT' / 'OPEN')
   - If no events left: Delete the pregnancy cycle completely
```

---

## 🔐 4. Role-based Access Control (RBAC)

Mutating endpoints (`POST`, `PUT`, `DELETE`) on the breeding module are protected by the backend security middleware. 

```javascript
router.use(authMiddleware);
router.use(requireTenant);

router.use((req, res, next) => {
    if (req.method !== 'GET') {
        if (!req.user || (req.user.role !== 'OWNER' && req.user.role !== 'MANAGER' && req.user.role !== 'SAAS_ADMIN')) {
            return res.status(403).json({ error: 'Permission denied: Only farm admins can modify breeding records' });
        }
    }
    next();
});
```

* **Read Privileges (`GET`):** Accessible to all logged-in farm staff (`OWNER`, `MANAGER`, `LABOR`, `SAAS_ADMIN`).
* **Write Privileges (`POST`, `PUT`, `DELETE`):** Gated exclusively for farm administrators (`OWNER`, `MANAGER`, `SAAS_ADMIN`). Attempts by `LABOR` or lower roles reject with a `403 Forbidden` error.
