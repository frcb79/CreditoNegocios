import * as XLSX from "xlsx";
import { generateBrokerInvitationExcelTemplate, parseBrokerInvitationExcel } from "../../server/brokerInvitationBulk";

const columns=["nombre","apellido","correo","rol","correo_master_asignado","telefono","mensaje_personal","estado_envio","fecha_envio","fecha_activacion"];
function file(rows:unknown[][]):Buffer{
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([columns,...rows]),"Invitaciones");
  return XLSX.write(wb,{type:"buffer",bookType:"xlsx"}) as Buffer;
}
describe("SEC-INVITES: Excel onboarding preview is strict and side-effect free",()=>{
  it("generates the official compatible workbook",()=>{
    const parsed=parseBrokerInvitationExcel(file([["Nombre","Apellido","broker@test.example","Broker","","","","Pendiente"]]));
    expect(parsed.total).toBe(1);
    const wb=XLSX.read(generateBrokerInvitationExcelTemplate(),{type:"buffer"});
    expect(wb.SheetNames).toContain("Invitaciones");
    expect(wb.SheetNames).toContain("Guia");
    expect((XLSX.utils.sheet_to_json(wb.Sheets.Invitaciones,{header:1}) as any[][])[0]).toEqual(columns);
  });
  it("accepts Master and Broker with normalized master reference",()=>{
    const parsed=parseBrokerInvitationExcel(file([
      ["M","A","master@demo.example","Master Broker"],
      ["B","A","BROKER@DEMO.EXAMPLE","Broker","MASTER@demo.example"],
    ]));
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.total).toBe(2);
    expect(parsed.masters).toBe(1);
    expect(parsed.brokers).toBe(1);
    expect(parsed.rows[1].masterEmail).toBe("master@demo.example");
  });
  it("rejects duplicate addresses, invalid role and self-reference",()=>{
    const parsed=parseBrokerInvitationExcel(file([
      ["A","B","repeat@demo.example","Broker"],
      ["A","B","REPEAT@demo.example","Broker"],
      ["A","B","who@demo.example","Admin"],
      ["A","B","self@demo.example","Broker","self@demo.example"],
    ]));
    expect(parsed.errors.map(e=>e.message).join(" ")).toMatch(/duplicado|Rol debe|sí mismo/);
  });
  it("rejects empty names and invalid email",()=>{
    const parsed=parseBrokerInvitationExcel(file([["","","bad-email","Broker"]]));
    expect(parsed.errors.map(x=>x.field)).toEqual(expect.arrayContaining(["correo","nombre","apellido"]));
  });
  it("requires master rows not to be affiliated and rejects malicious oversized messages",()=>{
    const parsed=parseBrokerInvitationExcel(file([
      ["Master","Name","mb@example.com","Master Broker","a@example.com"],
      ["Broker","Name","b@example.com","Broker","","","X".repeat(501)],
    ]));
    expect(parsed.errors.map(x=>x.field)).toEqual(expect.arrayContaining(["correo_master_asignado","mensaje_personal"]));
  });
  it("ignores only blank template rows with status Pendiente",()=>{
    const parsed=parseBrokerInvitationExcel(file([
      ["","","","","","","","Pendiente"],
      ["B","C","broker@demo.example","Broker"],
    ]));
    expect(parsed.total).toBe(1);
  });
  it("does not allow more than 100 recipients per batch",()=>{
    expect(()=>parseBrokerInvitationExcel(file(Array.from({length:101},(_,i)=>[
      "A","B",`broker${i}@demo.example`,"Broker"]))))
      .toThrow(/Máximo 100/);
  });
  it("never interprets formula status columns as instructions",()=>{
    const parsed=parseBrokerInvitationExcel(file([
      ["A","B","safe@demo.example","Broker","","","","=SUM(1,2)"],
    ]));
    expect(parsed.rows[0].email).toBe("safe@demo.example");
    expect(parsed.errors).toHaveLength(0);
  });
});
