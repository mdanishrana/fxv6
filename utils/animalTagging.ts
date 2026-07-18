import { AnimalType, Gender } from '../types';

// Species + prefix + gender for every type offered to new-scheme tenants (see
// server/utils/animalTagging.js for the backend mirror - kept in sync manually,
// duplicated rather than shared across the frontend/backend module boundary).
export const NEW_SCHEME_TYPE_META: Partial<Record<AnimalType, { prefix: string; species: 'Cattle' | 'Goat' | 'Sheep'; gender: Gender }>> = {
    [AnimalType.BULL]: { prefix: 'B', species: 'Cattle', gender: Gender.MALE },
    [AnimalType.COW]: { prefix: 'C', species: 'Cattle', gender: Gender.FEMALE },
    [AnimalType.MALE_CALF]: { prefix: 'CM', species: 'Cattle', gender: Gender.MALE },
    [AnimalType.FEMALE_CALF]: { prefix: 'CF', species: 'Cattle', gender: Gender.FEMALE },
    [AnimalType.HEIFER]: { prefix: 'HF', species: 'Cattle', gender: Gender.FEMALE },
    [AnimalType.BUCK]: { prefix: 'BK', species: 'Goat', gender: Gender.MALE },
    [AnimalType.DOE]: { prefix: 'D', species: 'Goat', gender: Gender.FEMALE },
    [AnimalType.MALE_KID]: { prefix: 'KM', species: 'Goat', gender: Gender.MALE },
    [AnimalType.FEMALE_KID]: { prefix: 'KF', species: 'Goat', gender: Gender.FEMALE },
    [AnimalType.RAM]: { prefix: 'R', species: 'Sheep', gender: Gender.MALE },
    [AnimalType.EWE]: { prefix: 'E', species: 'Sheep', gender: Gender.FEMALE },
    [AnimalType.MALE_LAMB]: { prefix: 'LM', species: 'Sheep', gender: Gender.MALE },
    [AnimalType.FEMALE_LAMB]: { prefix: 'LF', species: 'Sheep', gender: Gender.FEMALE },
};

export const NEW_SCHEME_TYPES_BY_SPECIES: { species: string; types: AnimalType[] }[] = [
    { species: 'Cattle', types: [AnimalType.BULL, AnimalType.COW, AnimalType.HEIFER, AnimalType.MALE_CALF, AnimalType.FEMALE_CALF] },
    { species: 'Goats', types: [AnimalType.BUCK, AnimalType.DOE, AnimalType.MALE_KID, AnimalType.FEMALE_KID] },
    { species: 'Sheep', types: [AnimalType.RAM, AnimalType.EWE, AnimalType.MALE_LAMB, AnimalType.FEMALE_LAMB] },
];

// Types offered to legacy-scheme tenants (unchanged from before the global
// sequential tagging rollout) - new-scheme tenants get NEW_SCHEME_TYPES_BY_SPECIES instead.
export const LEGACY_ANIMAL_TYPES: AnimalType[] = [AnimalType.COW, AnimalType.BULL, AnimalType.HEIFER, AnimalType.GOAT, AnimalType.CALF, AnimalType.KID];

export function formatNewSchemeTag(type: AnimalType, seq: number): string {
    const meta = NEW_SCHEME_TYPE_META[type];
    const prefix = meta ? meta.prefix : '';
    return `${prefix}${String(seq).padStart(4, '0')}`;
}
