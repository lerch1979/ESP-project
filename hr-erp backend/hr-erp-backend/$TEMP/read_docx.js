const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcFile = path.resolve(__dirname, '..', '..', '..', 'HÁTRALEVŐ FEATURES 2026.02.19.docx');
const tmpDir = path.join(process.env.TEMP, 'docx_extract_' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });

// Copy to temp with simple name
const tmpFile = path.join(tmpDir, 'doc.zip');
fs.copyFileSync(srcFile, tmpFile);

// Extract with PowerShell
const psCmd = `Expand-Archive -LiteralPath '${tmpFile}' -DestinationPath '${tmpDir}' -Force`;
execSync(`powershell -command "${psCmd}"`, { stdio: 'pipe' });

// Read document.xml
const xml = fs.readFileSync(path.join(tmpDir, 'word', 'document.xml'), 'utf8');
const paragraphs = xml.split('</w:p>');
let result = '';
for (const p of paragraphs) {
  const tmatches = p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  if (tmatches.length > 0) {
    result += tmatches.map(m => m.replace(/<[^>]+>/g, '')).join('') + '\n';
  }
}
console.log(result);

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });
