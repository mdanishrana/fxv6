const fs = require('fs');
const path = require('path');

const COMPONENTS_DIR = path.join(__dirname, '../components');

const fileReplacements = {
    'MedicalManager.tsx': [
        { from: /bg-rose-600 hover:bg-rose-700/g, to: 'bg-emerald-600 hover:bg-emerald-700' },
        { from: /shadow-rose-500\/20/g, to: 'shadow-emerald-500/20' }
    ],
    'CattleManager.tsx': [
        { from: /bg-red-600/g, to: 'bg-emerald-600' },
        { from: /hover:bg-red-700/g, to: 'hover:bg-emerald-700' },
        { from: /bg-red-500 text-white shadow-lg shadow-red-500\/20/g, to: 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' },
        { from: /hover:bg-red-600/g, to: 'hover:bg-emerald-700' },
        { from: /shadow-red-500\/20/g, to: 'shadow-emerald-500/20' }
    ],
    'SaaSAdmin.tsx': [
        { from: /bg-amber-600/g, to: 'bg-emerald-600' },
        { from: /hover:bg-amber-700/g, to: 'hover:bg-emerald-700' }
    ]
};

try {
    let modifiedFiles = 0;

    for (const [filename, rules] of Object.entries(fileReplacements)) {
        const filePath = path.join(COMPONENTS_DIR, filename);
        if (fs.existsSync(filePath)) {
            let content = fs.readFileSync(filePath, 'utf8');
            let originalContent = content;

            rules.forEach(rule => {
                content = content.replace(rule.from, rule.to);
            });

            if (content !== originalContent) {
                fs.writeFileSync(filePath, content, 'utf8');
                modifiedFiles++;
                console.log(`Updated: ${filename}`);
            }
        }
    }

    console.log(`\nSuccess! Modified ${modifiedFiles} files.`);
} catch (err) {
    console.error('Error during processing:', err);
}
