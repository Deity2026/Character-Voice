// Text extraction from common ebook / document formats.
//
// Strategy: discriminate on file extension, then run the right parser.
// All parsers return raw plain text — the existing characterEngine
// handles dialogue and character detection from that.

import { EPub } from "epub2";
import * as path from "path";

interface ExtractedBook {
  text: string;
  inferredTitle?: string;
  inferredAuthor?: string;
}

const MAX_CHARS = 800_000; // ~250k words; long enough for most novels.

function clamp(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS);
}

async function extractPdf(buf: Buffer): Promise<ExtractedBook> {
  // pdf-parse exports a default function that takes a Buffer.
  // Dynamic import avoids loading it for non-PDF uploads.
  const mod: any = await import("pdf-parse");
  const pdfParse = mod.default ?? mod;
  const data = await pdfParse(buf);
  return {
    text: clamp(normalize(data.text)),
    inferredTitle: data.info?.Title || undefined,
    inferredAuthor: data.info?.Author || undefined,
  };
}

async function extractDocx(buf: Buffer): Promise<ExtractedBook> {
  const mod: any = await import("mammoth");
  const result = await mod.extractRawText({ buffer: buf });
  return { text: clamp(normalize(result.value)) };
}

async function extractEpub(buf: Buffer): Promise<ExtractedBook> {
  // epub2 expects a file path. Write to a temp file, parse, clean up.
  const fs = await import("fs/promises");
  const os = await import("os");
  const tmp = path.join(os.tmpdir(), `cv-${Date.now()}.epub`);
  await fs.writeFile(tmp, buf);
  try {
    const epub = await EPub.createAsync(tmp);
    const meta = (epub as any).metadata || {};
    let text = "";
    for (const chapter of epub.flow) {
      try {
        const html = await new Promise<string>((resolve, reject) => {
          epub.getChapter(chapter.id, (err: any, t: string) =>
            err ? reject(err) : resolve(t),
          );
        });
        text += "\n\n" + stripHtml(html);
        if (text.length > MAX_CHARS) break;
      } catch {
        // Skip chapters that fail to load — common with malformed EPUBs.
      }
    }
    return {
      text: clamp(normalize(text)),
      inferredTitle: meta.title || undefined,
      inferredAuthor: meta.creator || undefined,
    };
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
}

function extractTxt(buf: Buffer): ExtractedBook {
  return { text: clamp(normalize(buf.toString("utf8"))) };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractTextFromFile(
  buf: Buffer,
  filename: string,
  mimetype: string,
): Promise<ExtractedBook> {
  const ext = path.extname(filename).toLowerCase();
  const mime = (mimetype || "").toLowerCase();

  if (ext === ".pdf" || mime.includes("pdf")) {
    return extractPdf(buf);
  }
  if (ext === ".epub" || mime.includes("epub")) {
    return extractEpub(buf);
  }
  if (ext === ".docx" || mime.includes("officedocument")) {
    return extractDocx(buf);
  }
  if (ext === ".txt" || mime.startsWith("text/")) {
    return extractTxt(buf);
  }
  // .mobi and .azw3 (Kindle) require Calibre-style conversion which
  // adds a heavy dependency. We surface a clear error so the user can
  // convert externally (e.g. Calibre or epub.com) before uploading.
  if (ext === ".mobi" || ext === ".azw3") {
    throw new Error(
      "Kindle files (.mobi/.azw3) aren't supported directly. Convert to EPUB or PDF first using Calibre or a free online converter.",
    );
  }
  throw new Error(
    `Unsupported file type "${ext || mime || "unknown"}". Supported formats: PDF, EPUB, DOCX, TXT.`,
  );
}
