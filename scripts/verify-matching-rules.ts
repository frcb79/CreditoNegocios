import { evaluateBuroScore, evaluateGovSales, formatGovThresholdRequirement } from '../client/src/components/MatchingAnalysis/matchingRules';

console.log('=== TEST SUITE: ETAPA 1 MATCHING RULES ===\n');

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, details?: any) {
  if (condition) {
    console.log(`✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${description}`, details);
    failed++;
  }
}

// Buró tests
console.log('--- 1. BURÓ SCORE TESTS ---');
const b1 = evaluateBuroScore('buroPersonaFisica', 'alto-694-760', 700);
assert('Buró: cliente "alto-694-760" con mínimo 700 debe resultar en "pass" (Cumple)', b1.status === 'pass', b1);

const b2 = evaluateBuroScore('buroPersonaFisica', 'bueno-592-693', 700);
assert('Buró: cliente "bueno-592-693" con mínimo 700 debe resultar en "fail" (No cumple)', b2.status === 'fail', b2);

const b3 = evaluateBuroScore('buroPersonaFisica', 'bueno-592-693', 600);
assert('Buró: cliente "bueno-592-693" con mínimo 600 debe resultar en "pass" (Cumple)', b3.status === 'pass', b3);

const b4 = evaluateBuroScore('buroPersonaFisica', null, 700);
assert('Buró: cliente sin dato con mínimo 700 debe resultar en "warning" (No proporcionado)', b4.status === 'warning', b4);

const b5 = evaluateBuroScore('buroEmpresa', 'alto-310-400', 300);
assert('Buró Empresa: cliente "alto-310-400" con mínimo 300 debe resultar en "pass" (Cumple)', b5.status === 'pass', b5);

// Participación Ventas Gobierno tests
console.log('\n--- 2. PARTICIPACIÓN VENTAS GOBIERNO TESTS ---');
const g1 = evaluateGovSales('0', 'menor-20');
assert('Gobierno: cliente con "0" y financiera con "menor-20" debe resultar en "pass" (Cumple)', g1.status === 'pass', g1);

const g2 = evaluateGovSales('0%', 'menor-20');
assert('Gobierno: cliente con "0%" y financiera con "menor-20" debe resultar en "pass" (Cumple)', g2.status === 'pass', g2);

const g3 = evaluateGovSales('11-20', 'menor-20');
assert('Gobierno: cliente con "11-20" y financiera con "menor-20" debe resultar en "pass" (Cumple)', g3.status === 'pass', g3);

const g4 = evaluateGovSales('21-40', 'menor-20');
assert('Gobierno: cliente con "21-40" y financiera con "menor-20" debe resultar en "fail" (No cumple)', g4.status === 'fail', g4);

const g5 = evaluateGovSales(null, 'menor-20');
assert('Gobierno: cliente sin dato debe resultar en "warning" (No proporcionado)', g5.status === 'warning', g5);

// Label tests
console.log('\n--- 3. LABELS TESTS ---');
const l1 = formatGovThresholdRequirement('menor-20');
assert('Label "menor-20" debe ser "Menor a 20%" (no "Máximo Menor a 20%")', l1 === 'Menor a 20%', { actual: l1 });

const l2 = formatGovThresholdRequirement('0');
assert('Label "0" debe ser limpio', l2.includes('0%'), { actual: l2 });

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
