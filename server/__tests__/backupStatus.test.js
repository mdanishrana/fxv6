// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

let admin;
let owner;
let tmpDir;

async function registerTenant(farmName, email) {
    const res = await request(app).post('/api/auth/register').send({
        name: 'Backup Status Test',
        email,
        password: 'testpass123',
        farmName
    });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

beforeAll(async () => {
    admin = await registerTenant('Backup Status Admin Farm', `backup-status-admin-${Date.now()}@example.com`);
    await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [admin.userId]);
    owner = await registerTenant('Backup Status Owner Farm', `backup-status-owner-${Date.now()}@example.com`);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fxv6-backup-test-'));
});

afterAll(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const u of [admin, owner]) {
        await db.query('DELETE FROM sessions WHERE user_id = $1', [u.userId]);
        await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [u.userId]);
        await db.query('DELETE FROM users WHERE id = $1', [u.userId]);
        await db.query('DELETE FROM tenants WHERE id = $1', [u.tenantId]);
    }
    await db.pool.end();
});

describe('GET /api/tenants/backup-status', () => {
    it('rejects non-admin callers', async () => {
        const res = await request(app)
            .get('/api/tenants/backup-status')
            .set('Authorization', `Bearer ${owner.token}`);
        expect(res.status).toBe(403);
    });

    it('reports not configured when the backup directory does not exist', async () => {
        const prev = process.env.BACKUP_DIR;
        process.env.BACKUP_DIR = path.join(tmpDir, 'does-not-exist');
        const res = await request(app)
            .get('/api/tenants/backup-status')
            .set('Authorization', `Bearer ${admin.token}`);
        process.env.BACKUP_DIR = prev;
        expect(res.status).toBe(200);
        expect(res.body.configured).toBe(false);
    });

    it('reports backup files, sorted newest first, with a fresh last-backup as not stale', async () => {
        const prev = process.env.BACKUP_DIR;
        process.env.BACKUP_DIR = tmpDir;

        const older = path.join(tmpDir, 'farmxpert_db_2020-01-01_03-00.backup');
        const newer = path.join(tmpDir, 'farmxpert_db_2020-01-02_03-00.backup');
        fs.writeFileSync(older, Buffer.alloc(1000));
        fs.writeFileSync(newer, Buffer.alloc(2000));
        const oldTime = new Date('2020-01-01T03:00:00Z');
        const newTime = new Date();
        fs.utimesSync(older, oldTime, oldTime);
        fs.utimesSync(newer, newTime, newTime);

        const res = await request(app)
            .get('/api/tenants/backup-status')
            .set('Authorization', `Bearer ${admin.token}`);
        process.env.BACKUP_DIR = prev;

        expect(res.status).toBe(200);
        expect(res.body.configured).toBe(true);
        expect(res.body.count).toBe(2);
        expect(res.body.backups[0].filename).toBe('farmxpert_db_2020-01-02_03-00.backup');
        expect(res.body.totalSizeBytes).toBe(3000);
        expect(res.body.isStale).toBe(false);
    });

    it('rejects backup-run for non-admin callers', async () => {
        const res = await request(app)
            .post('/api/tenants/backup-run')
            .set('Authorization', `Bearer ${owner.token}`);
        expect(res.status).toBe(403);
    });

    it('reports backup-run unavailable when the script does not exist', async () => {
        // No BACKUP_CMD override and the VPS script path doesn't exist here.
        delete process.env.BACKUP_CMD;
        const res = await request(app)
            .post('/api/tenants/backup-run')
            .set('Authorization', `Bearer ${admin.token}`);
        expect(res.status).toBe(400);
    });

    it('runs the backup command and reports the newest backup file', async () => {
        const prevDir = process.env.BACKUP_DIR;
        const prevCmd = process.env.BACKUP_CMD;
        process.env.BACKUP_DIR = tmpDir;

        // Stand-in for the real pg_dump script: drops a .backup file into BACKUP_DIR.
        const scriptPath = path.join(tmpDir, 'fake-backup.cjs');
        fs.writeFileSync(scriptPath, `
            const fs = require('fs');
            const path = require('path');
            fs.writeFileSync(path.join(process.env.BACKUP_DIR, 'farmxpert_db_manual-run.backup'), 'dump');
        `);
        process.env.BACKUP_CMD = `node "${scriptPath}"`;

        const res = await request(app)
            .post('/api/tenants/backup-run')
            .set('Authorization', `Bearer ${admin.token}`);

        process.env.BACKUP_DIR = prevDir;
        if (prevCmd === undefined) delete process.env.BACKUP_CMD; else process.env.BACKUP_CMD = prevCmd;

        expect(res.status).toBe(200);
        expect(res.body.lastBackup.filename).toBe('farmxpert_db_manual-run.backup');
        expect(fs.existsSync(path.join(tmpDir, 'farmxpert_db_manual-run.backup'))).toBe(true);
    });

    it('fails cleanly when the backup command errors', async () => {
        const prevCmd = process.env.BACKUP_CMD;
        process.env.BACKUP_CMD = 'node -e "process.exit(1)"';

        const res = await request(app)
            .post('/api/tenants/backup-run')
            .set('Authorization', `Bearer ${admin.token}`);

        if (prevCmd === undefined) delete process.env.BACKUP_CMD; else process.env.BACKUP_CMD = prevCmd;
        expect(res.status).toBe(500);
    });

    it('flags as stale when the newest backup is more than 30 hours old', async () => {
        const prev = process.env.BACKUP_DIR;
        const staleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fxv6-backup-stale-'));
        process.env.BACKUP_DIR = staleDir;

        const file = path.join(staleDir, 'farmxpert_db_2020-01-01_03-00.backup');
        fs.writeFileSync(file, Buffer.alloc(500));
        const oldTime = new Date(Date.now() - 40 * 60 * 60 * 1000);
        fs.utimesSync(file, oldTime, oldTime);

        const res = await request(app)
            .get('/api/tenants/backup-status')
            .set('Authorization', `Bearer ${admin.token}`);
        process.env.BACKUP_DIR = prev;
        fs.rmSync(staleDir, { recursive: true, force: true });

        expect(res.status).toBe(200);
        expect(res.body.isStale).toBe(true);
    });
});
