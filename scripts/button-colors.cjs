const fs = require('fs');
const path = require('path');

const COMPONENTS_DIR = path.join(__dirname, '../components');

const replacements = [
    // Standardize all dark/slate action buttons in light mode to emerald
    // For example "bg-slate-800 hover:bg-slate-700 text-white" -> "bg-emerald-600 hover:bg-emerald-700 text-white"
    { from: /bg-slate-800 hover:bg-slate-700 text-white/g, to: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    { from: /bg-slate-900 hover:bg-slate-800 text-white/g, to: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    { from: /bg-gray-800 hover:bg-gray-700 text-white/g, to: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    { from: /bg-black hover:bg-gray-900 text-white/g, to: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    { from: /bg-slate-800 text-white/g, to: 'bg-emerald-600 text-white' },

    // Convert secondary light buttons that have text-white
    { from: /bg-gray-900 text-white/g, to: 'bg-emerald-600 text-white' },

    // Fix Cancel/Secondary buttons to be white with slate text, NOT slate-800 or generic gray
    { from: /bg-gray-100 hover:bg-gray-200 text-gray-800/g, to: 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700' },
    { from: /bg-slate-100 hover:bg-slate-200 text-slate-800/g, to: 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700' },
    { from: /bg-slate-200 hover:bg-slate-300 text-slate-800/g, to: 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700' },
    { from: /bg-gray-200 hover:bg-gray-300 text-gray-800/g, to: 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700' },

    // Explicit secondary cancel buttons from earlier versions
    { from: /bg-slate-50 hover:bg-slate-100 text-slate-700/g, to: 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700' },
];

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

try {
    const files = walkDir(COMPONENTS_DIR);
    console.log(`Found ${files.length} TSX/TS files to process.`);

    let modifiedFiles = 0;

    files.forEach(file => {
        let content = fs.readFileSync(file, 'utf8');
        let originalContent = content;

        replacements.forEach(rule => {
            content = content.replace(rule.from, rule.to);
        });

        if (content !== originalContent) {
            fs.writeFileSync(file, content, 'utf8');
            modifiedFiles++;
            console.log(`Updated: ${path.basename(file)}`);
        }
    });

    console.log(`\nSuccess! Modified ${modifiedFiles} files.`);
} catch (err) {
    console.error('Error during processing:', err);
}
