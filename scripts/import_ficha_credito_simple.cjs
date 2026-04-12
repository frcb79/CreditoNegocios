const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const wb = XLSX.readFile('attached_assets/Ficha_Crédito_Simple(1)_1771025937023.xlsx');
const ws = wb.Sheets['Crédito Simple'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

const ROW = {
  INSTITUTION: 1,
  CREDIT_TYPE: 2,
  DESTINOS: 4,
  PERFILES: 5,
  FIN_MIN: 6,
  FIN_MAX: 7,
  GIROS_APROBACION: 8,
  PLAZO: 9,
  COMISION_APERTURA: 10,
  TASA_INTERES: 11,
  PRESENCIA: 13,
  GIROS_PROHIBIDOS: 14,
  GARANTIA: 15,
  TIEMPO_RESPUESTA: 16,
  EDAD: 17,
  ANTIGUEDAD: 18,
  INGRESOS: 19,
  BURO: 20,
  OBSERVACIONES: 21,
};

function getVal(row, col) {
  const r = data[row];
  if (!r) return null;
  const v = r[col];
  if (v === undefined || v === null) return null;
  return String(v).trim();
}

function parseAmount(text) {
  if (!text) return null;
  text = text.replace(/,/g, '').replace(/\$/g, '').trim();
  const mdpMatch = text.match(/([\d.]+)\s*(?:MDP|mdp|millones?|millon)/i);
  if (mdpMatch) return parseFloat(mdpMatch[1]) * 1000000;
  const milMatch = text.match(/([\d.]+)\s*(?:mil|Mil)/i);
  if (milMatch) return parseFloat(milMatch[1]) * 1000;
  const numMatch = text.match(/([\d.]+)/);
  if (numMatch) return parseFloat(numMatch[1]);
  return null;
}

function parseAge(text) {
  if (!text) return { min: null, max: null };
  const match = text.match(/(\d+)\s*(?:a|hasta|y)\s*(\d+)/i);
  if (match) return { min: parseInt(match[1]), max: parseInt(match[2]) };
  const minMatch = text.match(/(?:mínima?|desde)\s*(\d+)/i);
  const maxMatch = text.match(/(?:máxima?|hasta)\s*(\d+)/i);
  return {
    min: minMatch ? parseInt(minMatch[1]) : null,
    max: maxMatch ? parseInt(maxMatch[1]) : null
  };
}

function parseAntiguedad(text) {
  if (!text) return null;
  const yearMatch = text.match(/(\d+)\s*años?/i);
  if (yearMatch) return parseInt(yearMatch[1]) * 12;
  const monthMatch = text.match(/(\d+)\s*meses?/i);
  if (monthMatch) return parseInt(monthMatch[1]);
  return null;
}

function parseIngresoMin(text) {
  if (!text) return null;
  return parseAmount(text);
}

function buildInstitutionColumns() {
  const instRow = data[ROW.INSTITUTION];
  const typeRow = data[ROW.CREDIT_TYPE];
  const institutions = [];
  let currentInst = null;
  
  for (let col = 1; col < (instRow ? instRow.length : 0); col++) {
    const instName = instRow[col];
    if (instName && typeof instName === 'string' && instName.trim()) {
      currentInst = instName.trim();
    }
    const productType = typeRow && typeRow[col] ? String(typeRow[col]).trim() : null;
    if (productType && currentInst) {
      institutions.push({ col, name: currentInst, productType });
    }
  }
  return institutions;
}

function buildRequirements(col, productType) {
  const destinos = getVal(ROW.DESTINOS, col) || '';
  const finMinRaw = getVal(ROW.FIN_MIN, col) || '';
  const finMaxRaw = getVal(ROW.FIN_MAX, col) || '';
  const girosAprobacion = getVal(ROW.GIROS_APROBACION, col) || '';
  const plazo = getVal(ROW.PLAZO, col) || '';
  const comisionApertura = getVal(ROW.COMISION_APERTURA, col) || '';
  const tasaInteres = getVal(ROW.TASA_INTERES, col) || '';
  const presencia = getVal(ROW.PRESENCIA, col) || '';
  const girosProhibidos = getVal(ROW.GIROS_PROHIBIDOS, col) || '';
  const garantia = getVal(ROW.GARANTIA, col) || '';
  const tiempoRespuesta = getVal(ROW.TIEMPO_RESPUESTA, col) || '';
  const edadRaw = getVal(ROW.EDAD, col) || '';
  const antiguedadRaw = getVal(ROW.ANTIGUEDAD, col) || '';
  const ingresosRaw = getVal(ROW.INGRESOS, col) || '';
  const buroRaw = getVal(ROW.BURO, col) || '';
  const observaciones = getVal(ROW.OBSERVACIONES, col) || '';

  const finMin = parseAmount(finMinRaw);
  const finMax = parseAmount(finMaxRaw);
  const edad = parseAge(edadRaw);
  const antiguedadMeses = parseAntiguedad(antiguedadRaw);
  const ingresoMin = parseIngresoMin(ingresosRaw);

  const notes = [
    girosProhibidos ? `Giros prohibidos: ${girosProhibidos}` : '',
    presencia ? `Presencia: ${presencia}` : '',
    observaciones ? `Observaciones: ${observaciones}` : '',
    tiempoRespuesta ? `Tiempo de respuesta: ${tiempoRespuesta}` : '',
    girosAprobacion ? `Giros con mayor aprobación: ${girosAprobacion}` : '',
  ].filter(Boolean).join(' | ');

  const ranges = {};
  if (finMin !== null || finMax !== null) {
    ranges.monto = {};
    if (finMin !== null) ranges.monto.min = finMin;
    if (finMax !== null) ranges.monto.max = finMax;
  }
  if (edad.min !== null || edad.max !== null) {
    ranges.edadCliente = {};
    if (edad.min !== null) ranges.edadCliente.min = edad.min;
    if (edad.max !== null) ranges.edadCliente.max = edad.max;
  }
  if (antiguedadMeses !== null) {
    ranges.tiempoActividad = { min: antiguedadMeses };
  }
  if (ingresoMin !== null) {
    ranges.ingresoMensualPromedio = { min: ingresoMin };
  }

  ranges.opinionCumplimiento = { acceptanceMode: 'solo-positiva' };

  const selected = [
    'opinionCumplimiento',
    'buroAccionistaPrincipal',
    'garantia',
    'ingresoMensualPromedio',
  ];
  if (ranges.monto) selected.push('monto');
  if (ranges.edadCliente) selected.push('edadCliente');
  if (ranges.tiempoActividad) selected.push('tiempoActividad');

  const profile = {
    ranges,
    selected,
    notes,
    additionalNotes: [
      destinos ? `Destinos: ${destinos}` : '',
      plazo ? `Plazo: ${plazo}` : '',
      comisionApertura ? `Comisión por apertura: ${comisionApertura}` : '',
      tasaInteres ? `Tasa de interés: ${tasaInteres}` : '',
      garantia ? `Garantía: ${garantia}` : '',
      buroRaw ? `Buró: ${buroRaw}` : '',
    ].filter(Boolean).join('\n'),
  };

  return {
    persona_moral: profile,
    fisica_empresarial: { ...profile, ranges: { ...profile.ranges } },
  };
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const columns = buildInstitutionColumns();
    console.log(`Found ${columns.length} product entries across institutions`);

    const grouped = {};
    for (const entry of columns) {
      if (!grouped[entry.name]) grouped[entry.name] = [];
      grouped[entry.name].push(entry);
    }

    const existingInst = await client.query('SELECT id, name FROM financial_institutions');
    const existingMap = {};
    existingInst.rows.forEach(r => { existingMap[r.name.toLowerCase()] = r; });

    const templateRes = await client.query("SELECT id, name FROM product_templates WHERE name = 'Crédito Simple' OR name ILIKE '%simple%' LIMIT 1");
    let templateId;
    if (templateRes.rows.length > 0) {
      templateId = templateRes.rows[0].id;
    } else {
      templateId = uuidv4();
      await client.query(
        `INSERT INTO product_templates (id, name, description, category, is_active, target_profiles) 
         VALUES ($1, $2, $3, $4, true, $5)`,
        [templateId, 'Crédito Simple', 'Crédito simple para empresas y personas con actividad empresarial', 'credito_simple', '{persona_moral,fisica_empresarial}']
      );
      console.log('Created product template: Crédito Simple');
    }

    let created = 0, updated = 0, productsCreated = 0;

    for (const [instName, products] of Object.entries(grouped)) {
      const firstProduct = products[0];
      const requirements = buildRequirements(firstProduct.col, firstProduct.productType);

      let instId;
      const existing = existingMap[instName.toLowerCase()];

      if (existing) {
        instId = existing.id;
        const existingReq = await client.query('SELECT requirements FROM financial_institutions WHERE id = $1', [instId]);
        const currentReq = existingReq.rows[0]?.requirements || {};
        const mergedReq = { ...currentReq };
        for (const [profile, data] of Object.entries(requirements)) {
          if (!mergedReq[profile]) {
            mergedReq[profile] = data;
          } else {
            mergedReq[profile] = {
              ...mergedReq[profile],
              notes: data.notes || mergedReq[profile].notes,
              additionalNotes: data.additionalNotes || mergedReq[profile].additionalNotes,
            };
          }
        }
        await client.query(
          'UPDATE financial_institutions SET requirements = $1, is_active = true, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(mergedReq), instId]
        );
        updated++;
        console.log(`Updated: ${instName}`);
      } else {
        instId = uuidv4();
        await client.query(
          `INSERT INTO financial_institutions (id, name, description, is_active, requirements, accepted_profiles, created_by_admin, created_at, updated_at)
           VALUES ($1, $2, $3, true, $4, $5, true, NOW(), NOW())`,
          [
            instId,
            instName,
            `Financiera: ${instName} - Crédito Simple`,
            JSON.stringify(requirements),
            '{persona_moral,fisica_empresarial}'
          ]
        );
        created++;
        console.log(`Created: ${instName}`);
      }

      for (const product of products) {
        const customName = `${instName} - ${product.productType}`;
        const checkExisting = await client.query(
          'SELECT id FROM institution_products WHERE institution_id = $1 AND custom_name = $2',
          [instId, customName]
        );
        
        if (checkExisting.rows.length === 0) {
          const productReq = buildRequirements(product.col, product.productType);
          const ipId = uuidv4();
          await client.query(
            `INSERT INTO institution_products (id, template_id, institution_id, custom_name, configuration, is_active, target_profiles, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, true, $6, $7, NOW(), NOW())`,
            [
              ipId,
              templateId,
              instId,
              customName,
              JSON.stringify({
                destinos: getVal(ROW.DESTINOS, product.col) || '',
                plazo: getVal(ROW.PLAZO, product.col) || '',
                comisionApertura: getVal(ROW.COMISION_APERTURA, product.col) || '',
                tasaInteres: getVal(ROW.TASA_INTERES, product.col) || '',
                financiamientoMin: getVal(ROW.FIN_MIN, product.col) || '',
                financiamientoMax: getVal(ROW.FIN_MAX, product.col) || '',
                garantia: getVal(ROW.GARANTIA, product.col) || '',
                buro: getVal(ROW.BURO, product.col) || '',
                tiempoRespuesta: getVal(ROW.TIEMPO_RESPUESTA, product.col) || '',
              }),
              '{persona_moral,fisica_empresarial}',
              'a6d90ab2-803d-4640-b006-5d2c96a21316'
            ]
          );
          productsCreated++;
          console.log(`  Product created: ${customName}`);
        } else {
          console.log(`  Product already exists: ${customName}`);
        }
      }
    }

    await client.query('COMMIT');
    console.log(`\nDone! Created: ${created}, Updated: ${updated}, Products created: ${productsCreated}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
