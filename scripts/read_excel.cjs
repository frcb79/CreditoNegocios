const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../Modelos Franco 07 2026.xlsx');
const wb = xlsx.readFile(filePath, { cellFormulas: true, cellStyles: true });

console.log('=== WORKBOOK SHEETS ===');
console.log(wb.SheetNames);

wb.SheetNames.forEach(sheetName => {
  console.log(`\n========================================`);
  console.log(`=== SHEET: ${sheetName} ===`);
  console.log(`========================================`);
  const sheet = wb.Sheets[sheetName];
  const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  json.forEach((row, rowIdx) => {
    if (row && row.length > 0) {
      const items = [];
      row.forEach((cell, colIdx) => {
        if (cell !== undefined && cell !== null && cell !== '') {
          const cellRef = xlsx.utils.encode_cell({ r: rowIdx, c: colIdx });
          const cellObj = sheet[cellRef];
          let formulaStr = '';
          if (cellObj && cellObj.f) {
            formulaStr = ` (Formula: =${cellObj.f})`;
          }
          items.push(`[${cellRef}]: ${cell}${formulaStr}`);
        }
      });
      if (items.length > 0) {
        console.log(`Row ${rowIdx + 1}: ${items.join('  ||  ')}`);
      }
    }
  });
});
