const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../Modelos Franco 07 2026.xlsx');
const wb = xlsx.readFile(filePath, { cellFormulas: true });

console.log('ALL SHEET NAMES:');
wb.SheetNames.forEach((s, idx) => console.log(`${idx}: ${s}`));

wb.SheetNames.forEach(sheetName => {
  const sheet = wb.Sheets[sheetName];
  const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`\n========================================`);
  console.log(`=== SHEET: ${sheetName} (Rows: ${json.length}) ===`);
  console.log(`========================================`);
  json.slice(0, 70).forEach((row, rowIdx) => {
    if (row && row.some(cell => cell !== null && cell !== '')) {
      const line = row.map((c, colIdx) => {
        if (c === null || c === undefined || c === '') return null;
        const cellRef = xlsx.utils.encode_cell({ r: rowIdx, c: colIdx });
        const cellObj = sheet[cellRef];
        const f = cellObj && cellObj.f ? ` [=${cellObj.f}]` : '';
        return `${cellRef}:${c}${f}`;
      }).filter(Boolean).join(' | ');
      console.log(`L${rowIdx + 1}: ${line}`);
    }
  });
});
