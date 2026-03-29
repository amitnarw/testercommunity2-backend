import fs from 'fs';
import path from 'path';

function replaceInFile(filePath, importPath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    if (content.includes('console.log') || content.includes('console.error') || content.includes('console.warn')) {
        content = content.replace(/console\.log\(/g, 'logger.info(');
        content = content.replace(/console\.error\(/g, 'logger.error(');
        content = content.replace(/console\.warn\(/g, 'logger.warn(');
        // Add import at the top if not present
        if (!content.includes('logger from')) {
            content = `import logger from "${importPath}";\n` + content;
        }
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${filePath}`);
    }
}

const controllers = [
    'src/controllers/payment.controller.ts',
    'src/controllers/billing.controller.ts',
    'src/controllers/admin.controller.ts'
];
controllers.forEach(c => replaceInFile(c, '../utils/logger'));

const seedsLevel1 = [
    'prisma/seed/index.ts',
    'prisma/seed/seedTester.ts',
    'prisma/seed/seedAdmin.ts',
    'prisma/seed/seedPlans.ts',
    'prisma/seed/seedPermissions.ts',
    'prisma/seed/seedControlRoom.ts',
    'prisma/seed/seedAppCategories.ts',
    'prisma/seed/seedPromoCodes.ts'
];
seedsLevel1.forEach(s => replaceInFile(s, '../../src/utils/logger'));
