import { describe, it, expect } from 'vitest';
import { calculateCattleFinancials } from './financials';
import { Cattle, Tenant, FeedItem, FeedPackage, AnimalType, Breed, Gender, ArrivalType, CattleStatus } from '../types';

const baseCattle: Cattle = {
    id: 'c1',
    tagNumber: 'T-001',
    type: AnimalType.BULL,
    imageUrl: '',
    breed: Breed.SAHIWAL,
    gender: Gender.MALE,
    teeth: 2,
    color: 'Red',
    vaccinationStatus: true,
    vaccinationHistory: [],
    arrivalType: ArrivalType.PURCHASED,
    entryDate: new Date().toISOString(),
    entryWeight: 200,
    purchasePrice: 100000,
    currentWeight: 250,
    targetWeight: 400,
    status: CattleStatus.ACTIVE,
    weightHistory: [],
    transactions: [],
    ownerName: 'Test Owner',
    ownerEmail: 'owner@example.com',
    ownerMobile: '03001234567',
    ownerAddress: '',
    monthlyPackageId: '',
    monthlyCharges: 0,
    notes: ''
};

const baseTenant: Tenant = {
    id: 't1',
    name: 'Test Farm',
    ownerName: 'Test Owner',
    tier: 'BASIC',
    modules: ['CORE'],
    locale: 'en-PK',
    currency: 'PKR',
    users: []
};

describe('calculateCattleFinancials', () => {
    it('returns zero ROI (not NaN/Infinity) when there are no operating expenses at all', () => {
        // Regression test: git history shows a real prior bug ("ROI math flaw for 0 gain")
        // caused by dividing by zero operating expenses.
        const cattle: Cattle = { ...baseCattle, purchasePrice: 0, monthlyCharges: 0, entryDate: new Date().toISOString() };
        const result = calculateCattleFinancials(cattle, baseTenant, [], []);

        expect(result.feedCost + result.medicalCost).toBe(0);
        expect(result.roiPercent).toBe(0);
        expect(Number.isFinite(result.roiPercent)).toBe(true);
    });

    it('computes positive ROI when income exceeds operating expenses', () => {
        const cattle: Cattle = {
            ...baseCattle,
            // monthlyCharges alone doesn't create feed cost - it only kicks in as a
            // fallback once monthlyPackageId is set (even to an id that resolves to no package)
            monthlyPackageId: 'no-such-package',
            monthlyCharges: 3000,
            entryDate: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(), // 10 days ago
            transactions: [
                { id: 'tx1', date: new Date().toISOString(), type: 'SALE', amount: 50000, description: 'Sold' }
            ]
        };
        const result = calculateCattleFinancials(cattle, baseTenant, [], []);

        const dailyFeedCost = 3000 / 30;
        const expectedOperatingExpenses = result.daysOnFarm * dailyFeedCost; // no medical costs in this case
        // Pro-rated boarding income uses the same monthlyCharges/30 rate as the feed-cost
        // fallback, so it exactly offsets the feed cost here - net profit is just the sale.
        const expectedBoardingIncome = result.daysOnFarm * dailyFeedCost;
        const expectedNetProfit = (50000 + expectedBoardingIncome) - expectedOperatingExpenses;
        const expectedRoi = (expectedNetProfit / expectedOperatingExpenses) * 100;

        expect(result.dailyFeedCost).toBeCloseTo(dailyFeedCost, 5);
        expect(result.netProfit).toBeCloseTo(expectedNetProfit, 2);
        expect(result.roiPercent).toBeCloseTo(expectedRoi, 2);
        expect(result.roiPercent).toBeGreaterThan(0);
    });

    it('sums medical costs from both MEDICAL/EXPENSE transaction types and legacy costType fields', () => {
        const cattle: Cattle = {
            ...baseCattle,
            transactions: [
                { id: 'tx1', date: new Date().toISOString(), type: 'MEDICAL', amount: -500, description: 'Vet visit' },
                { id: 'tx2', date: new Date().toISOString(), type: 'EXPENSE', amount: -200, description: 'Misc' },
                // legacy shape some records use (costType instead of type)
                { id: 'tx3', date: new Date().toISOString(), type: 'MEDICAL', amount: -100, description: 'Vaccine', costType: 'VACCINATION' } as any
            ]
        };
        const result = calculateCattleFinancials(cattle, baseTenant, [], []);
        // amounts are stored negative (cost) but summed as absolute values
        expect(result.medicalCost).toBe(500 + 200 + 100);
    });

    it('falls back to monthlyCharges / 30 as daily feed cost when no package is found', () => {
        const cattle: Cattle = { ...baseCattle, monthlyPackageId: 'missing-package', monthlyCharges: 3000 };
        const result = calculateCattleFinancials(cattle, baseTenant, [], []);

        expect(result.dailyFeedCost).toBeCloseTo(3000 / 30, 5);
    });

    it('calculates ratio-based concentrate mix cost using body weight and package intake percent', () => {
        const feed: FeedItem[] = [
            { id: 'f1', name: 'Wanda', quantityKg: 1000, costPerKg: 60, proteinPercent: 18, energyMcal: 2, lowStockThreshold: 50 },
            { id: 'f2', name: 'Silage', quantityKg: 1000, costPerKg: 20, proteinPercent: 8, energyMcal: 1.5, lowStockThreshold: 50 }
        ];
        const pkg: FeedPackage = {
            id: 'pkg1',
            name: 'Gold',
            dailyIntakePercent: 2, // 2% of body weight
            items: [
                { feedItemId: 'f1', ratioPercent: 70 },
                { feedItemId: 'f2', ratioPercent: 30 }
            ]
        };
        const cattle: Cattle = { ...baseCattle, currentWeight: 300, monthlyPackageId: 'pkg1' };
        const result = calculateCattleFinancials(cattle, baseTenant, [pkg], feed);

        // intake = 300 * 2% = 6kg/day; blended cost/kg = 0.7*60 + 0.3*20 = 48
        const expectedDailyCost = 6 * (0.7 * 60 + 0.3 * 20);
        expect(result.dailyFeedCost).toBeCloseTo(expectedDailyCost, 5);
        expect(result.feedBreakdown.length).toBe(2);
    });

    it('adds a fixed roughage item cost independent of body weight', () => {
        const feed: FeedItem[] = [
            { id: 'f1', name: 'Toori (Straw)', quantityKg: 1000, costPerKg: 15, proteinPercent: 3, energyMcal: 1, lowStockThreshold: 50 }
        ];
        const pkg: FeedPackage = {
            id: 'pkg1',
            name: 'Roughage Only',
            dailyIntakePercent: 0,
            items: [
                { feedItemId: 'f1', ratioPercent: 0, type: 'ROUGHAGE', manualKgPerFeeding: 4, manualFeedings: 2 }
            ]
        };
        const cattle: Cattle = { ...baseCattle, monthlyPackageId: 'pkg1' };
        const result = calculateCattleFinancials(cattle, baseTenant, [pkg], feed);

        // 4kg * 2 feedings * Rs.15/kg = Rs.120/day, regardless of body weight
        expect(result.dailyFeedCost).toBeCloseTo(4 * 2 * 15, 5);
    });

    it('uses the tenant herd value rate for current asset value, defaulting to 1100 if unset', () => {
        const cattle: Cattle = { ...baseCattle, currentWeight: 300 };
        const withRate = calculateCattleFinancials(cattle, { ...baseTenant, herdValueRate: 900 }, [], []);
        const withoutRate = calculateCattleFinancials(cattle, { ...baseTenant, herdValueRate: undefined }, [], []);

        expect(withRate.currentValue).toBe(300 * 900);
        expect(withoutRate.currentValue).toBe(300 * 1100);
    });
});
