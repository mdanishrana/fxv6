// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { authenticator } from 'otplib';
import app from '../app.js';
import db from '../db.js';

let tenant;

async function registerTenant() {
    const res = await request(app).post('/api/auth/register').send({
        name: 'MFA Test User',
        email: `mfa-test-${Date.now()}@example.com`,
        password: 'testpass123',
        farmName: 'MFA Test Farm'
    });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id, email: res.body.user.email };
}

beforeAll(async () => {
    tenant = await registerTenant();
});

afterAll(async () => {
    await db.query('DELETE FROM mfa_pending_logins WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [tenant.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
    await db.pool.end();
});

describe('MFA setup and enable', () => {
    it('rejects setup without auth', async () => {
        const res = await request(app).post('/api/auth/mfa/setup');
        expect(res.status).toBe(401);
    });

    it('generates a secret and QR code', async () => {
        const res = await request(app)
            .post('/api/auth/mfa/setup')
            .set('Authorization', `Bearer ${tenant.token}`);
        expect(res.status).toBe(200);
        expect(res.body.secret).toBeTruthy();
        expect(res.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('rejects enabling with a wrong code', async () => {
        const setupRes = await request(app)
            .post('/api/auth/mfa/setup')
            .set('Authorization', `Bearer ${tenant.token}`);
        const res = await request(app)
            .post('/api/auth/mfa/enable')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ secret: setupRes.body.secret, code: '000000' });
        expect(res.status).toBe(400);
    });

    let secret;
    let backupCodes;

    it('enables MFA with a valid code and returns backup codes', async () => {
        const setupRes = await request(app)
            .post('/api/auth/mfa/setup')
            .set('Authorization', `Bearer ${tenant.token}`);
        secret = setupRes.body.secret;
        const code = authenticator.generate(secret);

        const res = await request(app)
            .post('/api/auth/mfa/enable')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ secret, code });
        expect(res.status).toBe(200);
        expect(res.body.backupCodes).toHaveLength(8);
        backupCodes = res.body.backupCodes;
    });

    it('login now returns mfaRequired instead of a session', async () => {
        const res = await request(app).post('/api/auth/login').send({
            email: tenant.email,
            password: 'testpass123'
        });
        expect(res.status).toBe(200);
        expect(res.body.mfaRequired).toBe(true);
        expect(res.body.mfaToken).toBeTruthy();
        expect(res.body.token).toBeUndefined();
    });

    it('rejects a wrong TOTP code at the challenge step', async () => {
        const loginRes = await request(app).post('/api/auth/login').send({
            email: tenant.email,
            password: 'testpass123'
        });
        const res = await request(app).post('/api/auth/mfa/challenge').send({
            mfaToken: loginRes.body.mfaToken,
            code: '000000'
        });
        expect(res.status).toBe(401);
    });

    it('completes login with a correct TOTP code', async () => {
        const loginRes = await request(app).post('/api/auth/login').send({
            email: tenant.email,
            password: 'testpass123'
        });
        const code = authenticator.generate(secret);
        const res = await request(app).post('/api/auth/mfa/challenge').send({
            mfaToken: loginRes.body.mfaToken,
            code
        });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(res.body.user.email).toBe(tenant.email);
    });

    it('completes login with a backup code, single-use', async () => {
        const loginRes = await request(app).post('/api/auth/login').send({
            email: tenant.email,
            password: 'testpass123'
        });
        const usedCode = backupCodes[0];

        const res = await request(app).post('/api/auth/mfa/challenge').send({
            mfaToken: loginRes.body.mfaToken,
            backupCode: usedCode
        });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();

        const loginRes2 = await request(app).post('/api/auth/login').send({
            email: tenant.email,
            password: 'testpass123'
        });
        const reuseRes = await request(app).post('/api/auth/mfa/challenge').send({
            mfaToken: loginRes2.body.mfaToken,
            backupCode: usedCode
        });
        expect(reuseRes.status).toBe(401);
    });

    it('disables MFA with correct password, restoring normal login', async () => {
        const res = await request(app)
            .post('/api/auth/mfa/disable')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ password: 'testpass123' });
        expect(res.status).toBe(200);

        const loginRes = await request(app).post('/api/auth/login').send({
            email: tenant.email,
            password: 'testpass123'
        });
        expect(loginRes.status).toBe(200);
        expect(loginRes.body.mfaRequired).toBeUndefined();
        expect(loginRes.body.token).toBeTruthy();
    });
});
