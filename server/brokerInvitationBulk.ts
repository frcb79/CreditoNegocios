import * as XLSX from "xlsx";

export type BulkBrokerInvite = {
  row: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  message: string;
  role: "broker" | "master_broker";
  masterEmail: string;
};
export type BulkInviteIssue = { row: number; field: string; message: string };
export const MAX_INVITATIONS_PER_FILE = 100;
export const INVITATION_EXCEL_HEADERS = [
  "nombre","apellido","correo","rol","correo_master_asignado","telefono","mensaje_personal",
] as const;

/** Read only the input columns; status and send-history columns are informational. */
export function parseBrokerInvitationExcel(buffer: Buffer): {
  rows: BulkBrokerInvite[]; errors: BulkInviteIssue[];
  total: number; masters: number; brokers: number;
} {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["Invitaciones"];
  if (!sheet) throw new Error('La plantilla debe incluir la hoja "Invitaciones".');
  const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headers = ((values[0] || []) as unknown[]).map(v => String(v || "").trim().toLowerCase());
  if (INVITATION_EXCEL_HEADERS.some(h => !headers.includes(h))) {
    throw new Error("La plantilla no contiene todas las columnas requeridas.");
  }
  const data = values.slice(1)
    .map((cells, idx) => ({ cells: cells as unknown[], excelRow: idx + 2 }))
    .filter(({ cells }) => INVITATION_EXCEL_HEADERS.some(h => String(cells[headers.indexOf(h)] ?? "").trim()));
  if (data.length === 0) throw new Error("La hoja de invitaciones está vacía.");
  if (data.length > MAX_INVITATIONS_PER_FILE) {
    throw new Error(`Máximo ${MAX_INVITATIONS_PER_FILE} invitaciones por envío. Divide el archivo en lotes.`);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const errors: BulkInviteIssue[] = [];
  const rows: BulkBrokerInvite[] = [];
  const used = new Set<string>();
  for (const { cells, excelRow } of data) {
    const cell = (h: string) => String(cells[headers.indexOf(h)] ?? "").trim();
    const email = cell("correo").toLowerCase();
    const firstName = cell("nombre");
    const lastName = cell("apellido");
    const phone = cell("telefono");
    const message = cell("mensaje_personal");
    const masterEmail = cell("correo_master_asignado").toLowerCase();
    const originalRole = cell("rol").toLowerCase().replace(/\s+/g," ").trim();
    const role = originalRole === "broker" ? "broker" :
      originalRole === "master broker" || originalRole === "master_broker" ? "master_broker" : null;
    const issue = (field:string,message:string) => errors.push({row:excelRow,field,message});
    if (!emailRegex.test(email) || email.length>320) issue("correo","Correo inválido");
    if (!firstName || firstName.length>120) issue("nombre","Nombre requerido (máximo 120 caracteres)");
    if (!lastName || lastName.length>120) issue("apellido","Apellido requerido (máximo 120 caracteres)");
    if (!role) issue("rol","Rol debe ser Broker o Master Broker");
    if (phone.length>35) issue("telefono","Teléfono de más de 35 caracteres");
    if (message.length>500) issue("mensaje_personal","Mensaje de más de 500 caracteres");
    if (masterEmail && !emailRegex.test(masterEmail)) issue("correo_master_asignado","Correo Master inválido");
    if (role === "master_broker" && masterEmail) issue("correo_master_asignado","Un Master no puede depender de otro Master");
    if (used.has(email)) issue("correo","Correo duplicado en el archivo");
    used.add(email);
    if (role) rows.push({row:excelRow,email,firstName,lastName,phone,message,role,masterEmail});
  }
  const mastersInFile = new Set(rows.filter(r=>r.role==="master_broker").map(r=>r.email));
  for(const row of rows) {
    if(row.masterEmail === row.email) errors.push({
      row:row.row,field:"correo_master_asignado",message:"No puedes asignar un broker a sí mismo",
    });
    // External existing Master can be resolved from DB when sending.
    if(row.role==="broker" && row.masterEmail && !mastersInFile.has(row.masterEmail)) {
      // Preview leaves this explicit: server must verify external Master exists.
    }
  }
  return {rows,errors,total:rows.length,
    masters:rows.filter(r=>r.role==="master_broker").length,
    brokers:rows.filter(r=>r.role==="broker").length};
}
