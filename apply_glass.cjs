const fs = require('fs');
const path = require('path');

const componentsDir = 'd:\\atg\\FX-Rep-V5\\components';
const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx'));

const targetPages = [
    'LabourManager.tsx',
    'SupplierManager.tsx',
    'FinanceManager.tsx',
    'QurbaniManager.tsx',
    'PaymentManager.tsx'
];

for (const file of targetPages) {
    const filePath = path.join(componentsDir, file);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Replace all remaining top-level or general card backgrounds with glassmorphism, 
    // EXCEPT inside inputs, selects, or buttons which we don't want to make too transparent.
    // However, the user might want EVERYTHING to look glassmorphic.

    // "bg-white dark:bg-slate-800 p-X rounded-X border border-slate-100 dark:border-slate-700"
    content = content.replace(/bg-white dark:bg-slate-800([^"']*?)border border-slate-100 dark:border-slate-700/g, 'bg-white/40 dark:bg-slate-900/40 backdrop-blur-md$1border border-white/50 dark:border-slate-800/50');
    content = content.replace(/bg-white dark:bg-slate-800([^"']*?)border border-slate-200 dark:border-slate-700/g, 'bg-white/40 dark:bg-slate-900/40 backdrop-blur-md$1border border-white/50 dark:border-slate-800/50');
    
    // Also change hover states for these
    content = content.replace(/hover:bg-white dark:hover:bg-slate-800/g, 'hover:bg-white/60 dark:hover:bg-slate-800/60');
    
    // Also "bg-white/50 dark:bg-slate-800/50" might already be there, leave it or upgrade it.
    
    // Update KPI card inner icon backgrounds
    content = content.replace(/bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm/g, 'bg-white/60 dark:bg-slate-800/60 border border-white/20 dark:border-slate-700/50 shadow-sm');

    // Make inputs premium: "bg-white dark:bg-slate-800" in inputs
    // "bg-white dark:bg-slate-800 text-slate-900 dark:text-white" -> "bg-white/50 dark:bg-slate-900/50 text-slate-900 dark:text-white backdrop-blur-sm"
    content = content.replace(/bg-white dark:bg-slate-800 text-slate-900 dark:text-white/g, 'bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white');

    if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file}`);
    } else {
        console.log(`No changes needed in ${file}`);
    }
}
