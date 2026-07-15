import { VaccinationRecord } from '../types';

// Minimum days required between two doses of the same vaccine, regardless of the
// disease-specific booster schedule (FMD every 6 months, HS pre-monsoon, etc). This is a
// biological safety floor, not the recommended re-vaccination interval - the two are
// separate concerns and both apply.
export const MIN_DAYS_BETWEEN_DOSES = 21;

export interface VaccineEligibility {
    eligible: boolean;
    reason?: string;
}

const normalize = (name: string) => name.trim().toLowerCase();

const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

/**
 * Checks whether a given vaccine can be recorded (as SCHEDULED or COMPLETED) for an
 * animal on a given date, based on its existing vaccination history:
 *  - blocked if the same vaccine already has a pending SCHEDULED dose
 *  - blocked if the same vaccine's last COMPLETED dose was less than
 *    MIN_DAYS_BETWEEN_DOSES days before the target date
 */
export function checkVaccineEligibility(
    history: VaccinationRecord[] | undefined,
    vaccineName: string,
    asOfDate: string
): VaccineEligibility {
    if (!vaccineName || !history || history.length === 0) {
        return { eligible: true };
    }

    const target = normalize(vaccineName);
    const matching = history.filter(v => v.vaccineName && normalize(v.vaccineName) === target && (!v.type || v.type === 'VACCINE'));

    const pendingSchedule = matching.find(v => v.status === 'SCHEDULED');
    if (pendingSchedule) {
        return {
            eligible: false,
            reason: `${vaccineName} is already scheduled for ${new Date(pendingSchedule.date).toLocaleDateString()}.`
        };
    }

    const completedDoses = matching.filter(v => v.status === 'COMPLETED' || !v.status);
    if (completedDoses.length > 0) {
        const lastDose = completedDoses.reduce((latest, v) => (new Date(v.date) > new Date(latest.date) ? v : latest));
        const lastDate = new Date(lastDose.date);
        const targetDate = new Date(asOfDate);
        const gap = daysBetween(lastDate, targetDate);

        if (gap < MIN_DAYS_BETWEEN_DOSES) {
            const eligibleFrom = new Date(lastDate);
            eligibleFrom.setDate(eligibleFrom.getDate() + MIN_DAYS_BETWEEN_DOSES);
            return {
                eligible: false,
                reason: `${vaccineName} was last given on ${lastDate.toLocaleDateString()} (${gap} day${gap === 1 ? '' : 's'} ago). Eligible again from ${eligibleFrom.toLocaleDateString()}.`
            };
        }
    }

    return { eligible: true };
}
