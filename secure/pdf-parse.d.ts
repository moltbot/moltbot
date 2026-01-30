declare module "pdf-parse" {
  function pdfParse(dataBuffer: Buffer): Promise<{
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    text: string;
  }>;
  export default pdfParse;
}
