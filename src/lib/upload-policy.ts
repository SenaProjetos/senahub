import "server-only";

/** Extensões aceitas para anexos gerais. SVG/HTML e executáveis não são anexos válidos. */
export const ATTACHMENT_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp",
  "pdf",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
  "txt", "csv", "rtf",
  "zip", "rar", "7z",
  "dwg", "dxf", "ifc", "rvt", "skp", "dwf",
  "mp4", "mp3", "webm", "ogg", "oga", "opus", "m4a", "wav", "aac",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation",
  txt: "text/plain", csv: "text/csv", rtf: "application/rtf",
  zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed",
  dwg: "application/acad", dxf: "application/dxf", ifc: "application/x-step", rvt: "application/octet-stream", skp: "application/octet-stream", dwf: "application/octet-stream",
  mp4: "video/mp4", mp3: "audio/mpeg", webm: "video/webm", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", wav: "audio/wav", aac: "audio/aac",
};

type ValidationResult = { ok: true; extension: string; mime: string } | { ok: false; error: string };

function extensionOf(name: string): string {
  const point = name.lastIndexOf(".");
  return point >= 0 ? name.slice(point + 1).toLowerCase() : "";
}

function startsWith(buffer: Buffer, value: number[]) {
  return value.every((byte, index) => buffer[index] === byte);
}

function isZip(buffer: Buffer) {
  return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]);
}

function hasExpectedSignature(extension: string, buffer: Buffer): boolean | null {
  switch (extension) {
    case "jpg": case "jpeg": return startsWith(buffer, [0xff, 0xd8, 0xff]);
    case "png": return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "gif": return buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a";
    case "webp": return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    case "pdf": return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    case "zip": case "docx": case "xlsx": case "pptx": case "odt": case "ods": case "odp": return isZip(buffer);
    case "doc": case "xls": case "ppt": return startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "rar": return startsWith(buffer, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]);
    case "7z": return startsWith(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    case "dwg": return /^AC10\d{2}/.test(buffer.subarray(0, 6).toString("ascii"));
    case "dxf": return buffer.subarray(0, 16).toString("ascii").replace(/\r\n/g, "\n").replace(/^\s+/, "").startsWith("0\nSECTION") || buffer.subarray(0, 18).toString("ascii") === "AutoCAD Binary DXF";
    case "ifc": return buffer.subarray(0, 64).toString("utf8").replace(/^\uFEFF?\s*/, "").startsWith("ISO-10303-21;");
    case "mp4": case "m4a": return buffer.subarray(4, 8).toString("ascii") === "ftyp";
    case "webm": return startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
    case "ogg": case "oga": case "opus": return buffer.subarray(0, 4).toString("ascii") === "OggS";
    case "wav": return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
    case "mp3": return buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    case "aac": return buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;
    // Estes formatos não têm uma assinatura simples/estável útil aqui. Continuam permitidos,
    // mas são sempre entregues como download para não executar na origem da aplicação.
    case "txt": case "csv": case "rtf": case "rvt": case "skp": case "dwf": return null;
    default: return false;
  }
}

/**
 * Valida uma allowlist e, onde houver assinatura confiável, confere os bytes reais.
 * O MIME retornado é derivado da extensão validada, nunca do cabeçalho enviado pelo navegador.
 */
export function validateGeneralAttachment(name: string, buffer: Buffer): ValidationResult {
  const extension = extensionOf(name);
  if (!ATTACHMENT_EXTENSIONS.has(extension)) {
    return { ok: false, error: "Tipo de arquivo não permitido." };
  }
  const signature = hasExpectedSignature(extension, buffer);
  if (signature === false) {
    return { ok: false, error: "O conteúdo não corresponde ao tipo do arquivo enviado." };
  }
  return { ok: true, extension, mime: MIME_BY_EXTENSION[extension] ?? "application/octet-stream" };
}
