import { Cattle, FeedItem, FeedPackage, Tenant, TransactionType } from '../types';

export interface FeedCostItem {
    name: string;
    quantity: number; // Daily Kg
    unit: string;
    costPerKg: number;
    dailyCost: number;
    type: 'CONCENTRATE' | 'ROUGHAGE' | 'CONCENTRATE_FIXED';
}

export interface FinancialSnapshot {
    purchaseCost: number;
    feedCost: number;
    medicalCost: number;
    totalCost: number;
    currentValue: number;
    netProfit: number;
    roiPercent: number;
    daysOnFarm: number;
    dailyFeedCost: number;
    feedBreakdown: FeedCostItem[];
}

const safeNum = (val: any): number => {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
};

export const calculateCattleFinancials = (
    cattle: Cattle,
    tenant: Tenant,
    feedPackages: FeedPackage[],
    feed: FeedItem[]
): FinancialSnapshot => {
    // 1. Purchase Cost
    const purchaseCost = safeNum(cattle.purchasePrice);

    // 2. Medical & Other Expenses (from Transactions and cattle_costs)
    const medicalCost = cattle.transactions
        ? cattle.transactions
            .filter(t => t.type === 'MEDICAL' || t.type === 'EXPENSE' || ['MEDICAL', 'VACCINATION', 'LABOR', 'OTHER'].includes((t as any).costType))
            .reduce((sum, t) => sum + Math.abs(safeNum(t.amount)), 0)
        : 0;

    // 3. Feed Cost Estimation
    const entryDate = new Date(cattle.entryDate);
    const today = new Date();
    const timeDiff = Math.abs(today.getTime() - entryDate.getTime());
    // Guard against invalid dates
    const daysOnFarm = isNaN(timeDiff) ? 0 : Math.ceil(timeDiff / (1000 * 3600 * 24));

    let dailyFeedCost = 0;
    const feedBreakdown: FeedCostItem[] = [];

    if (cattle.monthlyPackageId) {
        // 1. Always attempt to calculate Ingredient Cost Breakdown (User Requirement)
        const pkg = feedPackages.find(p => p.id === cattle.monthlyPackageId);
        let ingredientDailyCost = 0;

        if (pkg) {
            let totalMixCost = 0;
            let totalMixRatio = 0;
            const mixItems: { f: FeedItem, ratio: number }[] = [];

            // Calculate Roughage & Fixed Concentrate Items
            pkg.items.forEach(item => {
                const f = feed.find(fi => fi.id === item.feedItemId);
                if (f) {
                    if (item.type === 'ROUGHAGE' || item.type === 'CONCENTRATE_FIXED') {
                        // Fixed Daily Amount
                        const dailyQty = (item.manualKgPerFeeding || 0) * (item.manualFeedings || 1);
                        const itemCost = dailyQty * safeNum(f.costPerKg);

                        ingredientDailyCost += itemCost;

                        feedBreakdown.push({
                            name: f.name,
                            quantity: dailyQty,
                            unit: 'kg',
                            costPerKg: safeNum(f.costPerKg),
                            dailyCost: itemCost,
                            type: (item.type || 'CONCENTRATE')
                        });
                    } else {
                        // Gather Concentrate Mix Items (Ratio based)
                        mixItems.push({ f, ratio: safeNum(item.ratioPercent) });
                        totalMixRatio += safeNum(item.ratioPercent);
                        totalMixCost += safeNum(f.costPerKg) * safeNum(item.ratioPercent);
                    }
                }
            });

            // Calculate Concentrate Mix Cost & Breakdown
            if (totalMixRatio > 0 && mixItems.length > 0) {
                const mixCostPerKg = totalMixCost / totalMixRatio;
                // Intake = BodyWeight * (Intake% / 100)
                const currentWeight = safeNum(cattle.currentWeight);
                const intakeKg = currentWeight * (safeNum(pkg.dailyIntakePercent) / 100);
                const dailyMixCost = intakeKg * mixCostPerKg;

                ingredientDailyCost += dailyMixCost;

                // Expanded Breakdown: List each ingredient
                mixItems.forEach(m => {
                    const ratioShare = m.ratio / totalMixRatio;
                    const itemQty = intakeKg * ratioShare;
                    const itemCost = itemQty * safeNum(m.f.costPerKg);

                    feedBreakdown.push({
                        name: `${m.f.name} (${Math.round(ratioShare * 100)}%)`,
                        quantity: itemQty,
                        unit: 'kg',
                        costPerKg: safeNum(m.f.costPerKg),
                        dailyCost: itemCost,
                        type: 'CONCENTRATE'
                    });
                });
            }
        }

        // 2. Determine which cost to use for the Total Calculation
        // If monthlyCharges is set, that is the billing amount, but the user requested to see "Feed Item Cost" also.
        // Usually, financial "Cost" usually means input cost. 
        // If we use Ingredient Cost as the "Daily Feed Cost", it reflects actual expense.
        // If we use Monthly Charge, it reflects Billing.
        // Given the user wants to see "Cost of each ingredient", we will use the calculated ingredient cost as the primary "Daily Feed Cost"
        // provided the package was found. If no package found but monthlyCharges exists, fall back to it.

        if (ingredientDailyCost > 0) {
            dailyFeedCost = ingredientDailyCost;
        } else if (cattle.monthlyCharges) {
            // Fallback if no package ingredients found
            dailyFeedCost = safeNum(cattle.monthlyCharges) / 30;
            feedBreakdown.push({
                name: 'Monthly Flat Rate (No Package Details)',
                quantity: 1,
                unit: 'Month',
                costPerKg: safeNum(cattle.monthlyCharges),
                dailyCost: dailyFeedCost,
                type: 'CONCENTRATE'
            });
        }
    }

    // --- NEW HISTORICAL TIMELINE CALCULATION ---
    let feedCost = 0;

    if (cattle.historicalFeedCost !== undefined) {
        // We have historical logs
        feedCost += cattle.historicalFeedCost;

        // Calculate how many unlogged days there are (from lastFeedLogDate until today)
        let unloggedDays = daysOnFarm;
        if (cattle.lastFeedLogDate) {
            const lastLog = new Date(cattle.lastFeedLogDate);
            const todayD = new Date();
            todayD.setHours(0, 0, 0, 0);
            const diffTime = todayD.getTime() - lastLog.getTime();
            unloggedDays = Math.max(0, Math.floor(diffTime / (1000 * 3600 * 24)));
        }

        feedCost += (unloggedDays * dailyFeedCost);
    } else {
        // Fallback for older data or if no logs exist yet
        feedCost = daysOnFarm * dailyFeedCost;
    }

    // 4. Operating Costs (Farm Expenses)
    const operatingExpenses = feedCost + medicalCost;

    // 5. Total Investment / Cost of Animal (for display reference)
    const totalCost = purchaseCost + operatingExpenses;

    // 6. Income Calculation
    const transactionIncome = cattle.transactions
        ? cattle.transactions
            .filter(t => (t.type as any) === 'SALE' || (t.type as any) === 'INCOME' || ['INCOME', 'SALE'].includes((t as any).costType))
            .reduce((sum, t) => sum + Math.abs(safeNum(t.amount)), 0)
        : 0;
        
    // Expected Boarding Income (pro-rated by days on farm)
    const expectedBoardingIncome = daysOnFarm * (safeNum(cattle.monthlyCharges) / 30);
    const totalIncome = transactionIncome + expectedBoardingIncome;

    // 7. Current Asset Value (Hardware Value)
    const herdRate = safeNum(tenant.herdValueRate) || 1100;
    const currentValue = safeNum(cattle.currentWeight) * herdRate;

    // 8. Profit & ROI (Income - Operating Expenses)
    // As per user request: "Calculate the profit expanse - income." excluding purchase price.
    const netProfit = totalIncome - operatingExpenses;
    const roiPercent = operatingExpenses > 0 ? (netProfit / operatingExpenses) * 100 : 0;

    return {
        purchaseCost,
        feedCost,
        medicalCost,
        totalCost,
        currentValue,
        netProfit,
        roiPercent,
        daysOnFarm,
        dailyFeedCost,
        feedBreakdown
    };
};
