import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import unzipper from 'unzipper';
import { columnIndex, decodeXml, xmlText } from './document-text.js';

const execFileAsync = promisify(execFile);
const MAX_EXTRACTED_BYTES = 20 * 1024 * 1024;

export interface DocumentRow { id: string; extension: string; object_relative_path: string; sha256: string; size_bytes: number; }

function pathInside(parent: string, candidate: string): boolean {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
async function readEntry(entry: { path: string; stream(): AsyncIterable<Buffer | Uint8Array> }, maxBytes = MAX_EXTRACTED_BYTES, signal?: AbortSignal): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const raw of entry.stream()) {
    signal?.throwIfAborted();
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.length;
    if (size > maxBytes) throw new Error('Extracted document text exceeds the configured 20 MB limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}
function hashFile(filePath: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => { hash.update(chunk); });
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}
function validateArchive(archive: { files: Array<{ path: string; uncompressedSize?: number | string; vars?: { uncompressedSize?: number | string } }> }): void {
  if (archive.files.length > 10_000) throw new Error('The document archive contains too many entries.');
  let total = 0;
  for (const entry of archive.files) {
    if (entry.path.startsWith('/') || entry.path.split('/').some((part) => part === '..')) throw new Error('The document archive contains an unsafe path.');
    const entrySize = entry.vars?.uncompressedSize ?? entry.uncompressedSize ?? 0;
    total += Number(entrySize);
    if (!Number.isFinite(total) || total > 150 * 1024 * 1024) throw new Error('The expanded document archive exceeds 150 MB.');
  }
}

async function extractDocx(filePath: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const archive = await unzipper.Open.file(filePath);
  validateArchive(archive);
  const document = archive.files.find((entry) => entry.path === 'word/document.xml');
  if (!document) throw new Error('The DOCX archive does not contain word/document.xml.');
  const xml = (await readEntry(document, MAX_EXTRACTED_BYTES, signal)).toString('utf8');
  const text = xmlText(xml);
  if (!text) throw new Error('No extractable text was found in this Word document.');
  return text;
}
async function extractXlsx(filePath: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const archive = await unzipper.Open.file(filePath);
  validateArchive(archive);
  const sharedEntry = archive.files.find((entry) => entry.path === 'xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sharedEntry) {
    const xml = (await readEntry(sharedEntry, MAX_EXTRACTED_BYTES, signal)).toString('utf8');
    for (const item of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      shared.push(decodeXml([...item[1]!.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]!).join('')));
    }
  }
  const sheets = archive.files.filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.path)).sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  if (!sheets.length) throw new Error('No worksheets were found in this spreadsheet.');
  const output: string[] = [];
  for (const sheet of sheets) {
    signal?.throwIfAborted();
    const xml = (await readEntry(sheet, MAX_EXTRACTED_BYTES, signal)).toString('utf8');
    const rows: string[] = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = new Map<number, string>();
      for (const cellMatch of rowMatch[1]!.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const ref = /\br="([A-Z]+\d+)"/i.exec(cellMatch[1]!)?.[1] ?? 'A1';
        const type = /\bt="([^"]+)"/.exec(cellMatch[1]!)?.[1] ?? '';
        const value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellMatch[2]!)?.[1];
        const inline = [...cellMatch[2]!.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]!).join('');
        let cell = inline;
        if (value !== undefined) cell = type === 's' ? (shared[Number(value)] ?? '') : decodeXml(value);
        cells.set(columnIndex(ref), cell);
      }
      if (cells.size) {
        const max = Math.max(...cells.keys());
        rows.push(Array.from({ length: max + 1 }, (_, index) => cells.get(index) ?? '').join('\t'));
      }
    }
    output.push(`${sheet.path.split('/').at(-1)}\n${rows.join('\n')}`);
  }
  const text = output.join('\n\n');
  if (Buffer.byteLength(text, 'utf8') > MAX_EXTRACTED_BYTES) throw new Error('Extracted spreadsheet text exceeds the configured 20 MB limit.');
  if (!text.trim()) throw new Error('The workbook contains no extractable cell values.');
  return text;
}
const MAX_OCR_PAGES = 30;

async function extractScannedPdfWithOcr(filePath: string, signal?: AbortSignal): Promise<string> {
  let pageCount: number;
  try {
    const info = await execFileAsync('pdfinfo', [filePath], { timeout: 15_000, maxBuffer: 1024 * 1024, signal });
    const pageMatch = /^Pages:\s+(\d+)/m.exec(info.stdout);
    pageCount = pageMatch ? Number(pageMatch[1]) : 0;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error('OCR required: install Poppler (pdfinfo and pdftoppm) and Tesseract to extract scanned PDFs locally.');
    }
    throw new Error('OCR required: PDF page metadata could not be read safely.');
  }
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('OCR required: the PDF page count could not be determined.');
  if (pageCount > MAX_OCR_PAGES) throw new Error(`OCR required: this scan has ${pageCount} pages; the automatic local OCR limit is ${MAX_OCR_PAGES} pages. Split the PDF and import the smaller parts.`);
  const temporary = await mkdtemp(join(tmpdir(), 'devledger-ocr-'));
  try {
    const pages: string[] = [];
    let totalBytes = 0;
    for (let page = 1; page <= pageCount; page += 1) {
      signal?.throwIfAborted();
      const prefix = join(temporary, `page-${String(page).padStart(3, '0')}`);
      const imagePath = `${prefix}.png`;
      try {
        await execFileAsync('pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-r', '180', '-png', filePath, prefix], { timeout: 45_000, maxBuffer: 1024 * 1024, signal });
        const ocr = await execFileAsync('tesseract', [imagePath, 'stdout', '-l', 'eng'], { timeout: 90_000, maxBuffer: MAX_EXTRACTED_BYTES, signal });
        const text = ocr.stdout.trim();
        const pageText = `--- Page ${page} ---\n${text}`;
        totalBytes += Buffer.byteLength(pageText, 'utf8');
        if (totalBytes > MAX_EXTRACTED_BYTES) throw new Error('OCR output exceeds the configured 20 MB indexing limit.');
        pages.push(pageText);
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          throw new Error('OCR required: install Tesseract OCR and Poppler (pdftoppm) to process scanned PDFs locally.');
        }
        throw new Error(`OCR failed on PDF page ${page}: ${error instanceof Error ? error.message.slice(0, 400) : 'Unknown OCR error'}`);
      }
    }
    const output = pages.join('\n\n');
    if (output.replace(/--- Page \d+ ---/g, '').trim().length < 20) throw new Error('OCR required: no readable text was detected in this scanned PDF.');
    return output;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function extractPdf(filePath: string, signal?: AbortSignal): Promise<string> {
  try {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', filePath, '-'], { timeout: 90_000, maxBuffer: MAX_EXTRACTED_BYTES, signal });
    const text = stdout.trim();
    if (text.length >= 20) return text;
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      const message = error instanceof Error ? error.message : 'PDF text extraction failed.';
      if (!/no extractable text|empty|syntax error/i.test(message)) throw new Error(message.slice(0, 1_000));
    }
  }
  signal?.throwIfAborted();
  return extractScannedPdfWithOcr(filePath, signal);
}
export async function extractDocument(row: DocumentRow, dataDirectory: string, signal?: AbortSignal): Promise<{ text: string; status: 'indexed' | 'ocr_required' }> {
  signal?.throwIfAborted();
  const objectPath = resolve(dataDirectory, row.object_relative_path);
  if (!pathInside(resolve(dataDirectory, 'objects'), objectPath)) throw new Error('The document object path failed safety validation.');
  const extension = row.extension.toLowerCase();
  const objectStats = await stat(objectPath);
  if (objectStats.size !== row.size_bytes || await hashFile(objectPath) !== row.sha256) throw new Error('The stored document object failed its size or SHA-256 integrity check.');
  if (extension === '.txt' || extension === '.md' || extension === '.csv') {
    if (row.size_bytes > MAX_EXTRACTED_BYTES) throw new Error('The text document exceeds the configured 20 MB indexing limit.');
    const buffer = await readFile(objectPath);
    signal?.throwIfAborted();
    if (buffer.length > MAX_EXTRACTED_BYTES) throw new Error('The text document exceeds the configured 20 MB indexing limit.');
    if (buffer.includes(0)) throw new Error('The file appears to contain binary data, not plain text.');
    const text = buffer.toString('utf8');
    if (!text.trim()) throw new Error('No text was found in this document.');
    return { text, status: 'indexed' };
  }
  if (extension === '.docx') return { text: await extractDocx(objectPath, signal), status: 'indexed' };
  if (extension === '.xlsx') return { text: await extractXlsx(objectPath, signal), status: 'indexed' };
  if (extension === '.pdf') return { text: await extractPdf(objectPath, signal), status: 'indexed' };
  throw new Error(`No extraction adapter is registered for ${extension}.`);
}

