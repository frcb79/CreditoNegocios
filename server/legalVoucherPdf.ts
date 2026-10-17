import PDFDocument from "pdfkit";

/**
 * Display-only rendering of historical, immutable legal acceptance evidence.
 * Never recompose it from current personal data, rates, or legal templates.
 */
export function renderLegalVoucherPdf(voucherText: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 48, right: 45, bottom: 48, left: 45 },
      info: {
        Title: "Comprobante de formalización y aceptación legal",
        Author: "Crédito Negocios",
        Subject: "Representación PDF de aceptación histórica",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    // PDFKit paginates lengthy legal agreements without truncating them.
    for (const line of voucherText.replace(/\r\n/g, "\n").split("\n")) {
      if (!line.trim()) {
        doc.moveDown(0.3);
        continue;
      }
      const heading = line.includes("COMPROBANTE OFICIAL") ||
        line.includes("CRÉDITO NEGOCIOS") ||
        /^\[[^\]]+\]$/.test(line.trim());
      doc.font(heading ? "Courier-Bold" : "Courier")
        .fontSize(heading ? 9 : 8.4)
        .fillColor("#202b38")
        .text(line, { lineGap: 1.5 });
    }
    doc.end();
  });
}
