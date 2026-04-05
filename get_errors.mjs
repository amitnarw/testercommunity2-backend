import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execPromise = promisify(exec);

async function runTsc() {
  try {
    const { stdout, stderr } = await execPromise('npx tsc --noEmit --pretty false');
    fs.writeFileSync('error_summary.txt', `No errors found.\n${stdout}`);
  } catch (error) {
    if (error.stdout) {
      const lines = error.stdout.split('\n');
      let summaryText = `Total Errors found: ${lines.length}\n`;
      
      const summary = {};
      lines.forEach(line => {
        const match = line.match(/(src\/.*?)\((\d+),(\d+)\): error (TS\d+): (.*)/);
        if (match) {
          const [_, file, lineNum, col, code, msg] = match;
          if (!summary[file]) summary[file] = [];
          summary[file].push({ lineNum, code, msg });
        }
      });

      for (const [file, errors] of Object.entries(summary)) {
        summaryText += `--- ${file} ---\n`;
        errors.forEach(e => {
            summaryText += `  Line ${e.lineNum}: ${e.code} - ${e.msg}\n`;
        });
      }
      fs.writeFileSync('error_summary.txt', summaryText);
      console.log(`Summary written to error_summary.txt. Total errors: ${lines.length}`);
    } else {
      console.error('Error running tsc:', error.message);
    }
  }
}

runTsc();

