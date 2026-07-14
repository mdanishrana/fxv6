const text = `Tag Number,Name,Type (Cow/Bull/Goat),Breed (Sahiwal/Cholistani/Dhanni/Red Sindhi/Friesian Cross/Brahman Cross/Desi (Non-Descript)),Gender (Male/Female),Age (Months),Teeth,Color,Pregnant (Yes/No),Expected Calving Date (YYYY-MM-DD),Entry Date (YYYY-MM-DD),Entry Weight (kg),Target Weight (kg),Purchase Price,Owner Name,Owner Email,Owner Mobile
A1001,Bessie,Cow,Sahiwal,Female,24,2,Red,Yes,2026-10-15,2026-01-01,350,450,250000,John Doe,john@example.com,1234567890`;

const lines = text.split('\n').filter(l => l.trim() !== '');
const dataLines = lines.slice(1);
let success = 0; let failed = 0;

for (let idx = 0; idx < dataLines.length; idx++) {
    const line = dataLines[idx];
    const cols = line.split(',').map(c => c.trim());
    if (cols.length < 2) continue;

    console.log("Raw cols:", cols);

    const tag = cols[0];
    const name = cols[1];
    const typeStr = cols[2]?.toLowerCase() || 'bull';
    const breedStr = cols[3]?.toLowerCase() || 'desi (non-descript)';
    const genderStr = cols[4]?.toLowerCase() || 'male';
    const ageMonths = parseInt(cols[5]) || 0;
    const teeth = parseInt(cols[6]) || 0;
    const color = cols[7] || 'Unknown';
    const isPregnant = cols[8]?.toLowerCase() === 'yes';
    const expectedCalving = cols[9] || '';
    const entryDate = cols[10] || new Date().toISOString().split('T')[0];
    const entryWeight = parseFloat(cols[11]) || 200;
    const targetWeight = parseFloat(cols[12]) || 450;
    const purchasePrice = parseFloat(cols[13]) || 0;
    const ownerName = cols[14] || 'Farm Owned';
    const ownerEmail = cols[15] || '';
    const ownerMobile = cols[16] || '';

    // Simulate mapping
    let type = 'Bull';
    if (typeStr.includes('cow')) type = 'Cow';
    if (typeStr.includes('goat')) type = 'Goat';

    console.log({
        tagNumber: tag, name, type, breedStr, gender: genderStr, ageMonths, teeth, color,
        isPregnant, expectedCalvingDate: isPregnant && expectedCalving ? expectedCalving : undefined,
        entryDate, entryWeight: entryWeight, purchasePrice, targetWeight
    });
}
