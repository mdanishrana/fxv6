// Species + prefix + gender for every type offered to new-scheme tenants (see
// utils/animalTagging.ts for the frontend mirror - kept in sync manually,
// duplicated rather than shared across the frontend/backend module boundary).
const NEW_SCHEME_TYPE_META = {
    'Bull': { prefix: 'B', species: 'Cattle', gender: 'Male' },
    'Cow': { prefix: 'C', species: 'Cattle', gender: 'Female' },
    'Male Calf': { prefix: 'CM', species: 'Cattle', gender: 'Male' },
    'Female Calf': { prefix: 'CF', species: 'Cattle', gender: 'Female' },
    'Heifer': { prefix: 'HF', species: 'Cattle', gender: 'Female' },
    'Buck': { prefix: 'BK', species: 'Goat', gender: 'Male' },
    'Doe': { prefix: 'D', species: 'Goat', gender: 'Female' },
    'Male Kid': { prefix: 'KM', species: 'Goat', gender: 'Male' },
    'Female Kid': { prefix: 'KF', species: 'Goat', gender: 'Female' },
    'Ram': { prefix: 'R', species: 'Sheep', gender: 'Male' },
    'Ewe': { prefix: 'E', species: 'Sheep', gender: 'Female' },
    'Male Lamb': { prefix: 'LM', species: 'Sheep', gender: 'Male' },
    'Female Lamb': { prefix: 'LF', species: 'Sheep', gender: 'Female' },
};

function formatNewSchemeTag(type, seq) {
    const meta = NEW_SCHEME_TYPE_META[type];
    const prefix = meta ? meta.prefix : '';
    return `${prefix}${String(seq).padStart(4, '0')}`;
}

module.exports = { NEW_SCHEME_TYPE_META, formatNewSchemeTag };
