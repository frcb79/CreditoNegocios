const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../Modelos Franco 07 2026.xlsx');
const wb = xlsx.readFile(filePath);

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
          items.push(`[Col ${colIdx + 1} / ${xlsx.utils.encode_col(colIdx)}]: ${cell}`);
        }
      });
      if (items.length > 0) {
        console.log(`Row ${rowIdx + 1}: ${items.join('  ||  ')}`);
      }
    }
  });
});
