import path from "path";
import fs from "fs";
import Service from "./Service";
import config from "@/config";
import PDFDocument from "pdfkit";

// Werkt vanuit server/ (ts-node of dist): assets naast src/
const LOGO_PATH = path.join(__dirname, "..", "..", "assets", "R2P_logo.jpg");
const LOGO_WIDTH = 80;

type BookingForInvoice = {
    id: string;
    startAddress: string;
    endAddress: string;
    bookingTime: Date;
    price: number;
    companyName: string | null;
    vatNumber: string | null;
    billingAddress: string | null;
    CarType: { name: string } | null;
};

type UserForInvoice = {
    firstname: string;
    lastname: string;
    email: string;
};

const VAT_RATE = 0.09; // 9%

export default class InvoiceService extends Service {
    /**
     * Builds invoice or betaalbewijs PDF. With business profile: full invoice (company, billing address).
     * Without: betaalbewijs with customer name and email only.
     */
    public async buildInvoicePdf(booking: BookingForInvoice, user: UserForInvoice): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: "A4", margin: 50 });
            const chunks: Buffer[] = [];
            doc.on("data", (chunk: Buffer) => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", reject);

            const now = new Date();
            const invoiceDateStr = this.formatDate(now);
            const invoiceNumber = `${now.getFullYear()}-${booking.id.slice(-8)}`;

            const basePrice = booking.price / (1 + VAT_RATE);
            const vatAmount = booking.price - basePrice;

            // ----- Company block (rechtsboven) -----
            const company = config.invoice;
            doc.fontSize(10).font("Helvetica-Bold").text(company.companyName, 350, 50, { width: 200, align: "right" });
            doc.font("Helvetica").fontSize(9);
            doc.text(company.address, 350, 65, { width: 200, align: "right" });
            doc.text(company.email, 350, 80, { width: 200, align: "right" });
            doc.text(`Reg. no.: ${company.kvk}`, 350, 95, { width: 200, align: "right" });
            doc.text(`VAT: ${company.btw}`, 350, 110, { width: 200, align: "right" });

            // ----- Logo (linksboven): server/assets/R2P_logo.jpg -----
            let customerBlockY = 50;
            if (fs.existsSync(LOGO_PATH)) {
                doc.image(LOGO_PATH, 50, 50, { width: LOGO_WIDTH });
                customerBlockY = 50 + LOGO_WIDTH + 52;
            } else {
                doc.fontSize(16).font("Helvetica-Bold").text("Ready2Pickup", 50, 50);
                customerBlockY = 100;
            }

            // ----- Klantgegevens (links, onder logo) – factuur (zakelijk) of betaalbewijs (particulier) -----
            const isBusiness = Boolean(booking.companyName?.trim() && booking.billingAddress?.trim());
            let customerBlock: string;
            let docTitle: string;
            let dateLabel: string;

            if (isBusiness) {
                docTitle = "Invoice";
                dateLabel = "Invoice date";
                const customerName = booking.companyName!.trim();
                const attn = [user.firstname, user.lastname].filter(Boolean).join(" ");
                const addressParts = booking.billingAddress!.split(",").map((s) => s.trim()).filter(Boolean);
                const lines = [customerName, ...(attn ? [`Attn. ${attn}`] : []), ...addressParts];
                customerBlock = lines.join("\n");
            } else {
                docTitle = "Payment confirmation";
                dateLabel = "Date";
                const fullName = [user.firstname, user.lastname].filter(Boolean).join(" ").trim() || "Customer";
                customerBlock = [`Payment confirmation for: ${fullName}`, user.email].filter(Boolean).join("\n");
            }

            doc.font("Helvetica").fontSize(10);
            doc.y = customerBlockY;
            doc.text(customerBlock, 50, doc.y, { lineGap: 0 });

            // ----- Documenttitel (Invoice of Betaalbewijs) en datum -----
            const headerY = doc.y + 24;
            doc.font("Helvetica-Bold").fontSize(14).text(`${docTitle} ${invoiceNumber}`, 50, headerY);
            doc.font("Helvetica").fontSize(9);
            doc.text(`${dateLabel}: ${invoiceDateStr}`, 50, headerY + 20);

            // ----- Table -----
            const tableTop = headerY + 50;
            doc.font("Helvetica-Bold").fontSize(9);
            doc.text("Description", 50, tableTop);
            doc.text("Amount", 280, tableTop);
            doc.text("Total", 350, tableTop);
            doc.text("VAT", 420, tableTop);
            doc.moveTo(50, tableTop + 12).lineTo(500, tableTop + 12).stroke();

            doc.font("Helvetica").fontSize(9);
            doc.text("Transport Services", 50, tableTop + 20, { width: 220 });
            doc.text(`€ ${basePrice.toFixed(2)}`, 280, tableTop + 20);
            doc.text(`€ ${basePrice.toFixed(2)}`, 350, tableTop + 20);
            doc.text("9%", 420, tableTop + 20);
            doc.moveTo(50, tableTop + 38).lineTo(500, tableTop + 38).stroke();

            // ----- Totals -----
            const totalsTop = tableTop + 55;
            doc.font("Helvetica").fontSize(9);
            doc.text("Subtotal:", 350, totalsTop);
            doc.text(`€ ${basePrice.toFixed(2)}`, 420, totalsTop);
            doc.text("9% VAT:", 350, totalsTop + 14);
            doc.text(`€ ${vatAmount.toFixed(2)}`, 420, totalsTop + 14);
            doc.font("Helvetica-Bold");
            doc.text("Total:", 350, totalsTop + 32);
            doc.text(`€ ${booking.price.toFixed(2)}`, 420, totalsTop + 32);

            doc.end();
        });
    }

    private formatDate(d: Date): string {
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    }
}
