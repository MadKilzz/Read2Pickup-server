declare module "pdfkit" {
    interface PDFDocumentOptions {
        size?: string;
        margin?: number;
    }
    class PDFDocument {
        constructor(options?: PDFDocumentOptions);
        on(event: "data", callback: (chunk: Buffer) => void): this;
        on(event: "end", callback: () => void): this;
        on(event: "error", callback: (err: Error) => void): this;
        font(size?: number | string): this;
        fontSize(size: number): this;
        text(text: string, x?: number, y?: number, options?: { width?: number; align?: string; lineGap?: number }): this;
        moveTo(x: number, y: number): this;
        lineTo(x: number, y: number): this;
        stroke(): this;
        image(src: string | Buffer, x: number, y: number, options?: { width?: number }): this;
        end(): void;
        y: number;
    }
    export = PDFDocument;
}
