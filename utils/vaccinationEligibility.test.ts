import { describe, it, expect } from 'vitest';
import { checkVaccineEligibility, MIN_DAYS_BETWEEN_DOSES } from './vaccinationEligibility';
import { VaccinationRecord } from '../types';

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
};

describe('checkVaccineEligibility', () => {
    it('allows a vaccine with no prior history at all', () => {
        const result = checkVaccineEligibility(undefined, 'FMD', new Date().toISOString());
        expect(result.eligible).toBe(true);
    });

    it('blocks when the same vaccine already has a pending SCHEDULED dose', () => {
        const history: VaccinationRecord[] = [
            { id: '1', date: '2026-08-01', vaccineName: 'FMD', type: 'VACCINE', status: 'SCHEDULED' }
        ];
        const result = checkVaccineEligibility(history, 'FMD', new Date().toISOString());
        expect(result.eligible).toBe(false);
        expect(result.reason).toContain('already scheduled');
    });

    it('blocks a booster less than 21 days after the last completed dose', () => {
        const history: VaccinationRecord[] = [
            { id: '1', date: daysAgo(10), vaccineName: 'FMD', type: 'VACCINE', status: 'COMPLETED' }
        ];
        const result = checkVaccineEligibility(history, 'FMD', new Date().toISOString());
        expect(result.eligible).toBe(false);
        expect(result.reason).toContain('10 days ago');
    });

    it('allows a booster exactly at the 21-day boundary and beyond', () => {
        const atBoundary: VaccinationRecord[] = [
            { id: '1', date: daysAgo(MIN_DAYS_BETWEEN_DOSES), vaccineName: 'FMD', type: 'VACCINE', status: 'COMPLETED' }
        ];
        expect(checkVaccineEligibility(atBoundary, 'FMD', new Date().toISOString()).eligible).toBe(true);

        const wellPast: VaccinationRecord[] = [
            { id: '1', date: daysAgo(200), vaccineName: 'FMD', type: 'VACCINE', status: 'COMPLETED' }
        ];
        expect(checkVaccineEligibility(wellPast, 'FMD', new Date().toISOString()).eligible).toBe(true);
    });

    it('is case/whitespace insensitive when matching vaccine names', () => {
        const history: VaccinationRecord[] = [
            { id: '1', date: daysAgo(5), vaccineName: '  fmd  ', type: 'VACCINE', status: 'COMPLETED' }
        ];
        const result = checkVaccineEligibility(history, 'FMD', new Date().toISOString());
        expect(result.eligible).toBe(false);
    });

    it('does not block a different vaccine', () => {
        const history: VaccinationRecord[] = [
            { id: '1', date: daysAgo(1), vaccineName: 'FMD', type: 'VACCINE', status: 'SCHEDULED' }
        ];
        const result = checkVaccineEligibility(history, 'LSD', new Date().toISOString());
        expect(result.eligible).toBe(true);
    });

    it('ignores non-vaccine entries (e.g. a MEDICINE record) that happen to share a name', () => {
        const history: VaccinationRecord[] = [
            { id: '1', date: daysAgo(1), vaccineName: 'FMD', type: 'MEDICINE', status: 'COMPLETED' }
        ];
        const result = checkVaccineEligibility(history, 'FMD', new Date().toISOString());
        expect(result.eligible).toBe(true);
    });

    it('treats a record with no status field as completed (legacy data)', () => {
        const history: VaccinationRecord[] = [
            { id: '1', date: daysAgo(5), vaccineName: 'FMD' }
        ];
        const result = checkVaccineEligibility(history, 'FMD', new Date().toISOString());
        expect(result.eligible).toBe(false);
    });
});
