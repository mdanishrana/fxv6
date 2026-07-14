const fs = require('fs');
const path = require('path');

const componentsDir = 'd:\\atg\\FX-Rep-V5\\components';
const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx'));

const glassClass = "bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-white/50 dark:border-slate-800/50 shadow-sm";
const glassClassHover = "bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-800/50 shadow-sm hover:shadow-[0_8px_30px_rgb(16,185,129,0.15)] hover:border-emerald-200 dark:hover:border-emerald-900/50 transition-all duration-300 hover:-translate-y-1";

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

    // Search and replace common non-glass classes
    
    // 1. bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm ...
    content = content.replace(/className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-\[.*?\] border border-slate-100 dark:border-slate-700 hover:border-([a-z]+)-100 dark:hover:border-([a-z]+)-900\/50 transition-all duration-300 hover:-translate-y-1 group"/g, 
        (match, color1, color2) => {
            return `className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl shadow-sm border border-white/50 dark:border-slate-800/50 hover:shadow-[0_8px_30px_rgb(16,185,129,0.15)] hover:border-${color1}-200 dark:hover:border-${color2}-900/50 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden"`;
        }
    );

    // 2. Simple background cards without hover
    content = content.replace(/className="bg-white dark:bg-slate-800 p-([0-9]+) rounded-([a-z0-9]+) border border-slate-100 dark:border-slate-700 shadow-sm"/g, 
        'className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-$1 rounded-$2 border border-white/50 dark:border-slate-800/50 shadow-sm"'
    );
    
    content = content.replace(/className="flex flex-col sm:flex-row gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm"/g, 
        'className="flex flex-col sm:flex-row gap-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm"'
    );
    
    content = content.replace(/className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm"/g, 
        'className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm"'
    );
    
    content = content.replace(/className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden mb-6"/g, 
        'className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-white/50 dark:border-slate-800/50 shadow-sm overflow-hidden mb-6"'
    );

    content = content.replace(/className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full/g, 
        'className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full border border-slate-200/60 dark:border-slate-700/60'
    );
    
    // Check tables inside these components
    content = content.replace(/<thead className="bg-slate-50 dark:bg-slate-700\/50">/g, '<thead className="bg-white/20 dark:bg-slate-900/30">');
    content = content.replace(/<tbody className="divide-y divide-slate-100 dark:divide-slate-700">/g, '<tbody className="divide-y divide-white/20 dark:divide-slate-700/50">');
    content = content.replace(/<tr key=\{([a-zA-Z0-9_.]+)\} className="hover:bg-slate-50 dark:hover:bg-slate-700\/30 transition-colors">/g, '<tr key={$1} className="hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors group">');
    content = content.replace(/<tr className="hover:bg-slate-50 dark:hover:bg-slate-700\/30 transition-colors">/g, '<tr className="hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors group">');

    if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file}`);
    } else {
        console.log(`No changes needed in ${file}`);
    }
}
