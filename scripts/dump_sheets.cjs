const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const filePath = path.join(__dirname, '../Modelos Franco 07 2026.xlsx');
const wb = xlsx.readFile(filePath, { cellFormulas: true });

console.log('SHEET NAMES:', wb.SheetNames);

wb.SheetNames.forEach(sheetName => {
  const sheet = wb.Sheets[sheetName];
  const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  let out = `========================================\nSHEET: ${sheetName} (Total Rows: ${json.length})\n========================================\n`;
  
  json.forEach((row, rIdx) => {
    if (row && row.some(c => c !== null && c !== undefined && c !== '')) {
      const rowStr = row.map((cell, cIdx) => {
        if (cell === null || cell === undefined || cell === '') return null;
        const cellRef = xlsx.utils.encode_cell({ r: rIdx, c: cIdx });
        const cellObj = sheet[cellRef];
        const f = cellObj && cellObj.f ? ` [=${cellObj.f}]` : '';
        return `[${cellRef}]: ${cell}${f}`;
      }).filter(Boolean).join('  |  ');
      out += `Row ${rIdx + 1}: ${rowStr}\n`;
    }
  });

  const safeName = sheetName.replace(/[^a-zA-Z0-9_-]/g, '_');
  fs.writeFileSync(path.join(__dirname, `sheet_${safeName}.txt`), out, 'utf8');
  console.log(`Saved sheet_${safeName}.txt`);
});
