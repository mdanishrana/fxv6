const fs = require('fs');
const path = require('path');

const COMPONENTS_DIR = path.join(__dirname, '../components');

const replacements = [
    // Primary Button Colors
    { from: /bg-blue-600/g, to: 'bg-emerald-600' },
    { from: /hover:bg-blue-700/g, to: 'hover:bg-emerald-700' },
    { from: /bg-blue-500/g, to: 'bg-emerald-500' },
    { from: /hover:bg-blue-600/g, to: 'hover:bg-emerald-600' },
    { from: /text-blue-600/g, to: 'text-emerald-600' },
    { from: /text-blue-500/g, to: 'text-emerald-500' },
    { from: /bg-blue-50/g, to: 'bg-emerald-50' },
    { from: /text-indigo-600/g, to: 'text-emerald-600' },
    { from: /bg-indigo-600/g, to: 'bg-emerald-600' },
    { from: /hover:bg-indigo-700/g, to: 'hover:bg-emerald-700' },
    { from: /text-teal-600/g, to: 'text-emerald-600' },

    // Focus rings
    { from: /focus:ring-blue-500/g, to: 'focus:ring-emerald-500' },
    { from: /focus:border-blue-500/g, to: 'focus:border-emerald-500' },
    { from: /focus:ring-indigo-500/g, to: 'focus:ring-emerald-500' },
    { from: /focus:border-indigo-500/g, to: 'focus:border-emerald-500' },

    // Modals and Cards Backgrounds (Eliminate grays/semi-transparents for crisp white)
    { from: /bg-white\/50/g, to: 'bg-white' },
    { from: /bg-white\/80/g, to: 'bg-white' },
    { from: /bg-slate-50\/80/g, to: 'bg-white' },
    { from: /bg-slate-50\/50/g, to: 'bg-white' },
    { from: /bg-gray-50/g, to: 'bg-white' },
    { from: /bg-gray-100/g, to: 'bg-slate-50' }, // Soften gray-100s to slate-50 if any

    // Complex pairs
    { from: /bg-slate-50 dark:bg-slate-900\/50/g, to: 'bg-white dark:bg-slate-900/50' },
    { from: /bg-slate-50 dark:bg-slate-800/g, to: 'bg-white dark:bg-slate-800' },
    { from: /bg-slate-100 dark:bg-slate-800/g, to: 'bg-white dark:bg-slate-800' },
    { from: /bg-slate-100 dark:bg-slate-700/g, to: 'bg-white dark:bg-slate-700' }
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

        // Extra safe plain replacements without regex where possible, or global regex
        replacements.forEach(rule => {
            content = content.replace(rule.from, rule.to);
        });

        // Special specific fixes for just loose bg-slate-50 spaces
        content = content.replace(/bg-slate-50 /g, 'bg-white ');
        content = content.replace(/bg-slate-50`/g, 'bg-white`');
        content = content.replace(/bg-slate-50"/g, 'bg-white"');

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
