// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { computeMissingInvoices } from '../jobs/billingProcessor.js';

describe('computeMissingInvoices', () => {
    it('prorates the first invoice for a mid-month registration', () => {
        const result = computeMissingInvoices('2026-07-15', 15000, [], new Date('2026-07-18T12:00:00'));
        expect(result).toHaveLength(1);
        expect(result[0].billingPeriodStart).toBe('2026-07-15');
        expect(result[0].billingPeriodEnd).toBe('2026-07-31');
        expect(result[0].amount).toBeCloseTo(15000 * (17 / 31), 1);
        expect(result[0].dueDate).toBe('2026-08-01');
    });

    it('charges a full month with no proration when registered on the 1st', () => {
        const result = computeMissingInvoices('2026-07-01', 15000, [], new Date('2026-07-18T12:00:00'));
        expect(result).toHaveLength(1);
        expect(result[0].amount).toBe(15000);
        expect(result[0].notes).toBe('Initial Registration Month');
    });

    it('generates a prorated first month plus every full month up to the current one on first catch-up', () => {
        const result = computeMissingInvoices('2026-05-15', 15000, [], new Date('2026-08-02T09:00:00'));
        expect(result.map(r => r.billingPeriodStart)).toEqual(['2026-05-15', '2026-06-01', '2026-07-01', '2026-08-01']);
        expect(result[0].amount).toBeLessThan(15000);
        expect(result[1].amount).toBe(15000);
        expect(result[2].amount).toBe(15000);
        expect(result[3].amount).toBe(15000);
    });

    it('never generates an invoice for a future month', () => {
        const result = computeMissingInvoices('2026-07-01', 15000, [], new Date('2026-07-18T12:00:00'));
        expect(result.every(r => new Date(r.billingPeriodStart) <= new Date('2026-07-18'))).toBe(true);
        expect(result.find(r => r.billingPeriodStart === '2026-08-01')).toBeUndefined();
    });

    it('is idempotent: returns nothing new when already caught up to the current month', () => {
        const first = computeMissingInvoices('2026-07-01', 15000, [], new Date('2026-07-18T12:00:00'));
        const existing = first.map(i => ({ due_date: i.dueDate, billing_period_start: i.billingPeriodStart, billing_period_end: i.billingPeriodEnd }));
        const second = computeMissingInvoices('2026-07-01', 15000, existing, new Date('2026-07-25T12:00:00'));
        expect(second).toHaveLength(0);
    });

    it('picks up legacy (pre-billing_period) invoices from the month after their due date', () => {
        const legacy = [{ due_date: '2026-06-20', billing_period_start: null, billing_period_end: null }];
        const result = computeMissingInvoices('2026-05-20', 15000, legacy, new Date('2026-08-02T09:00:00'));
        expect(result.map(r => r.billingPeriodStart)).toEqual(['2026-07-01', '2026-08-01']);
        expect(result.every(r => r.amount === 15000)).toBe(true);
    });
});
