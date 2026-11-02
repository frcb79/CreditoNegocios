/** Mexican local and +52/legacy +521 formats identify the same contact. */
export function normalizeProspectPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^52(?:1)?\d{10}$/.test(digits) ? digits.slice(-10) : digits;
}
export const normalizedProspectPhoneSql = `CASE
  WHEN regexp_replace(phone,'[^0-9]','','g') ~ '^52(1)?[0-9]{10}$'
  THEN right(regexp_replace(phone,'[^0-9]','','g'),10)
  ELSE regexp_replace(phone,'[^0-9]','','g') END`;
