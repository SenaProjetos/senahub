/**
 * Reader BCF 2.1 — PURO: sem I/O, sem zip, sem DOM. Faz o inverso do `writer.ts`:
 * recebe as STRINGS XML de `markup.bcf` e `viewpoint.bcfv` (a descompactação do
 * `.bcfzip` com fflate fica no cliente, F2) e devolve um tópico estruturado pronto
 * pra virar Apontamento. Parser tolerante por regex (mesma filosofia hand-rolled do
 * writer): extrai só o subconjunto que usamos e ignora o resto — sobrevive a XML de
 * Navisworks/Solibri/BIMcollab (namespaces, atributos extras, ordem diferente).
 *
 * Eixos: a câmera do BCF já está em espaço IFC (Z-up). O writer derivou
 * direction/up de position+target; aqui reconstruímos o target a partir de
 * position+direction (o Apontamento persiste {position, target} em IFC).
 */
export type Vec3 = [number, number, number];

/** Distância (m) usada para reconstruir o target a partir de position+direction. */
const DISTANCIA_ALVO = 10;

/** BCF TopicStatus → status interno (inverso de statusParaBcf do writer). */
const STATUS_INTERNO: Record<string, string> = {
  open: "aberta",
  "in progress": "aberta",
  active: "aberta",
  resolved: "resolvida",
  closed: "fechada",
};

export function statusDeBcf(bcfStatus: string | null): string {
  if (!bcfStatus) return "aberta";
  return STATUS_INTERNO[bcfStatus.trim().toLowerCase()] ?? "aberta";
}

export type TopicoImportado = {
  guid: string;
  title: string;
  description: string;
  status: string; // interno (aberta|resolvida|fechada)
  creationAuthor: string;
  creationDate: string;
  guids: string[]; // IfcGuids selecionados no viewpoint
  camera: { position: Vec3; target: Vec3 } | null;
  /** Nome do arquivo de snapshot referenciado no markup (F2 lê os bytes do zip). */
  snapshotFile: string | null;
};

// ── Helpers de parsing tolerante ────────────────────────────────

/** Reverte o escape de XML (inverso de escaparXml do writer). */
function desescaparXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // por último, senão reintroduz entidades
}

/** Conteúdo textual da PRIMEIRA ocorrência de `<tag ...>...</tag>` (aceita prefixo de namespace). */
function conteudo(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? desescaparXml(m[1].trim()) : null;
}

/** Valor de um atributo da PRIMEIRA tag `tag` (aceita prefixo de namespace). */
function atributo(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*?\\b${attr}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? desescaparXml(m[1]) : null;
}

/** Vetor {X,Y,Z} dentro do bloco de uma tag (ex.: CameraViewPoint). */
function vetor(xml: string, tag: string): Vec3 | null {
  const bloco = conteudo(xml, tag);
  if (bloco === null) return null;
  const x = conteudo(bloco, "X");
  const y = conteudo(bloco, "Y");
  const z = conteudo(bloco, "Z");
  if (x === null || y === null || z === null) return null;
  const nx = Number(x);
  const ny = Number(y);
  const nz = Number(z);
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) return null;
  return [nx, ny, nz];
}

function normalizar([x, y, z]: Vec3): Vec3 {
  const c = Math.hypot(x, y, z);
  return c === 0 ? [0, 0, -1] : [x / c, y / c, z / c];
}

/**
 * Reconstrói {position, target} (IFC) a partir do viewpoint + direction do BCF:
 * position = CameraViewPoint; target = position + normalize(direction)·DISTANCIA_ALVO.
 * O comprimento é arbitrário (só define o pivô de órbita) — a direção da vista é exata.
 */
export function bcfParaCamera(viewpoint: Vec3, direction: Vec3): { position: Vec3; target: Vec3 } {
  const d = normalizar(direction);
  return {
    position: viewpoint,
    target: [
      viewpoint[0] + d[0] * DISTANCIA_ALVO,
      viewpoint[1] + d[1] * DISTANCIA_ALVO,
      viewpoint[2] + d[2] * DISTANCIA_ALVO,
    ],
  };
}

// ── Parse dos dois arquivos ─────────────────────────────────────

/** IfcGuids de todos os `<Component IfcGuid="..." />` do viewpoint. */
function guidsDoViewpoint(xml: string): string[] {
  const re = /<(?:[\w.-]+:)?Component\b[^>]*?\bIfcGuid="([^"]*)"/gi;
  const guids: string[] = [];
  for (const m of xml.matchAll(re)) guids.push(desescaparXml(m[1]));
  return guids;
}

/**
 * Compõe um tópico importado a partir do markup.bcf (obrigatório) e do
 * viewpoint.bcfv (opcional). Sem Guid ou Title válidos → retorna null (tópico
 * inutilizável). O snapshot é resolvido pelo chamador via `snapshotFile`.
 */
export function lerTopico(markupXml: string, viewpointXml: string | null): TopicoImportado | null {
  const guid = atributo(markupXml, "Topic", "Guid");
  if (!guid) return null;
  const title = conteudo(markupXml, "Title") ?? "";
  const bcfStatus = atributo(markupXml, "Topic", "TopicStatus");

  let camera: { position: Vec3; target: Vec3 } | null = null;
  let guids: string[] = [];
  if (viewpointXml) {
    guids = guidsDoViewpoint(viewpointXml);
    const viewpoint = vetor(viewpointXml, "CameraViewPoint");
    const direction = vetor(viewpointXml, "CameraDirection");
    if (viewpoint && direction) camera = bcfParaCamera(viewpoint, direction);
  }

  return {
    guid,
    title,
    description: conteudo(markupXml, "Description") ?? "",
    status: statusDeBcf(bcfStatus),
    creationAuthor: conteudo(markupXml, "CreationAuthor") ?? "",
    creationDate: conteudo(markupXml, "CreationDate") ?? "",
    guids,
    camera,
    snapshotFile: conteudo(markupXml, "Snapshot"),
  };
}
