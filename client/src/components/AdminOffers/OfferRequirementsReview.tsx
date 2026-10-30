import { getOfferAgePolicy } from "@shared/offerAgePolicy";

const display = (value: unknown): string => value == null || value === "" ? "Pendiente de definición" :
  typeof value === "boolean" ? value ? "Sí" : "No" : typeof value === "object" ? JSON.stringify(value) : String(value);

export default function OfferRequirementsReview({ version }: { version: any }) {
  const c = version?.conditions || {}, r = version?.requirements || {};
  const age = getOfferAgePolicy(c, r);
  const verification = version?.eligibilityEvaluation || c.eligibilityEvaluation;
  const pending = version?.originVerified === false || c.originVerified === false || verification?.verified === false ||
    verification?.originFieldsChecked === false || verification?.originVerified === false || verification?.status === "pending_verification";
  const policies = [
    ["Antigüedad según archivo", age.source], ["Buró: historial exigido", c.bureauRequirement ?? r.bureauPolicySource],
    ["Condiciones adicionales de Buró", r.bureauPolicySource], ["Permite atrasos", r.allowsArrears], ["Tolerancia de atrasos", r.arrearsPolicy],
    ["Garantía", c.guaranteeType ?? r.guarantee], ["Detalle de garantía", r.guarantee], ["Aval", c.avalesType ?? r.guarantorSource],
    ["CIEC", r.requiresCiec], ["Estados financieros", r.requiresFinancialStatements], ["Opinión SAT", r.satOpinion],
    ["Ventas a gobierno", r.governmentSalesLimit], ["Giros excluidos", r.excludedSectors], ["Cobertura geográfica", r.presence],
  ];
  return <section className="space-y-3 text-xs" data-testid="offer-requirements-review">
    <p className="font-semibold">Elegibilidad y documentación</p>
    <p>{pending ? "Política de oferta pendiente de verificación." : "Matching por criterio: se evaluará con los datos de cada cliente."} Los datos faltantes o ambiguos permanecen pendientes.</p>
    {age.needsReview && <p role="alert" className="text-red-700">Antigüedad contradictoria o ambigua: conciliar en Elegibilidad antes de publicar.</p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{age.rows.map(row => {
      const ranges = { ...(r.ranges || {}), ...(r.profileRules?.[row.profile]?.ranges || {}) };
      const rules = [
        ["Antigüedad mínima (meses)", row.effectiveMonths],
        ["Ingreso mensual mínimo (MXN)", Object.prototype.hasOwnProperty.call(c, "minMonthlyRevenue") ? c.minMonthlyRevenue : ranges.ingresoMensualPromedio?.min ?? r.minMonthlyIncome ?? r.minMonthlyIncomeSource],
        ["Ingreso anual mínimo (MXN)", ranges.ingresoAnual?.min ?? r.minAnnualIncome ?? r.minAnnualIncomeSource],
        ...(row.profile === "persona_moral" ? [
          ["Buró empresa mínimo", ranges.buroEmpresa?.min ?? r.minBusinessBureau],
          ["Buró accionista mínimo", ranges.buroAccionistaPrincipal?.min ?? r.minShareholderBureau],
        ] : [["Buró personal mínimo", ranges.buroPersonaFisica?.min ?? r.minPersonalBureau]]),
      ];
      return <div className="border rounded p-2 space-y-1" key={row.profile}><strong>{row.label}</strong>
        {rules.map(([label, value]) => <p key={String(label)}>{label}: {display(value)}</p>)}
      </div>;
    })}</div>
    {age.resolved && <p>Antigüedad conciliada por perfil. Motivo: {age.resolution.reason}</p>}
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">{policies.map(([label, value]) => <div key={String(label)}><dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{display(value)}</dd></div>)}</dl>
    <div><strong>Documentos requeridos</strong>{version?.requiredDocuments?.length ? <ul className="list-disc pl-5">{version.requiredDocuments.map((doc: string, i: number) => <li key={i}>{doc}</li>)}</ul> : <p>Sin documentos especificados; revisar checklist del expediente.</p>}</div>
  </section>;
}
