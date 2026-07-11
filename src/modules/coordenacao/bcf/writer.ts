/**
 * Writer BCF 2.1 (BIM Collaboration Format) — PURO: sem I/O, sem Prisma, sem
 * `server-only`. Gera as strings XML dos três arquivos de um `.bcfzip`; a
 * montagem do zip (archiver) e a leitura do snapshot em disco ficam em
 * `exportar.ts`. Mesmo padrão de writer puro+testado do lib/dxf.ts.
 *
 * Referência: buildingSMART BCF-XML, release_2_1. Estrutura do zip:
 *   bcf.version
 *   {TopicGuid}/markup.bcf
 *   {TopicGuid}/viewpoint.bcfv
 *   {TopicGuid}/snapshot.png   (opcional)
 *
 * Eixos: a câmera JÁ chega em espaço IFC (Z-up, metros) — o Apontamento persiste
 * assim (conversão three→IFC fica no viewer). Aqui só derivamos direção/up (BCF
 * exige os dois vetores) a partir de position+target, assumindo câmera sem "roll"
 * (o viewer nunca rola) → up = componente do Z-up global ortogonal à direção.
 */

/** FOV vertical (graus) do viewer — a câmera de captura é fixa em 55°. */
const FIELD_OF_VIEW = 55;

/** Status do apontamento → TopicStatus do BCF (valores usuais aceitos por Navisworks/BIMcollab). */
const STATUS_BCF: Record<string, string> = {
  aberta: "Open",
  resolvida: "Resolved",
  fechada: "Closed",
  descartada: "Closed",
};

export function statusParaBcf(status: string): string {
  return STATUS_BCF[status] ?? "Open";
}

// ── Helpers de serialização ─────────────────────────────────────

/** Escapa os cinco caracteres reservados de XML (texto e atributos). */
export function escaparXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Número sem notação científica, sem `-0`, com até 6 casas e sem zeros supérfluos. */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Object.is(n, -0)) return "0";
  const s = n.toFixed(6);
  return s.replace(/\.?0+$/, "");
}

export type Vec3 = [number, number, number];

function vetorXml(tag: string, [x, y, z]: Vec3, indent: string): string {
  return (
    `${indent}<${tag}>\n` +
    `${indent}  <X>${fmtNum(x)}</X>\n` +
    `${indent}  <Y>${fmtNum(y)}</Y>\n` +
    `${indent}  <Z>${fmtNum(z)}</Z>\n` +
    `${indent}</${tag}>`
  );
}

// ── Câmera IFC → BCF (direção + up derivados) ───────────────────

function subtrair(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function comprimento([x, y, z]: Vec3): number {
  return Math.hypot(x, y, z);
}
function normalizar(v: Vec3): Vec3 {
  const c = comprimento(v);
  return c === 0 ? [0, 0, 1] : [v[0] / c, v[1] / c, v[2] / c];
}
function produtoEscalar(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Deriva os vetores da PerspectiveCamera do BCF a partir de position+target (IFC):
 * - CameraViewPoint = position
 * - CameraDirection = normalize(target − position)
 * - CameraUpVector  = Gram-Schmidt do Z-up global (0,0,1) contra a direção
 *   (exato para câmera sem roll; se a direção for vertical, cai para (0,1,0)).
 */
export function cameraParaBcf(position: Vec3, target: Vec3): {
  viewpoint: Vec3;
  direction: Vec3;
  up: Vec3;
} {
  const direction = normalizar(subtrair(target, position));
  const zUp: Vec3 = [0, 0, 1];
  const proj = produtoEscalar(zUp, direction);
  let up: Vec3 = [zUp[0] - proj * direction[0], zUp[1] - proj * direction[1], zUp[2] - proj * direction[2]];
  if (comprimento(up) < 1e-6) up = [0, 1, 0]; // direção quase vertical → up alternativo
  return { viewpoint: position, direction, up: normalizar(up) };
}

// ── Arquivos BCF ────────────────────────────────────────────────

export function bcfVersionXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Version VersionId="2.1">\n` +
    `  <DetailedVersion>2.1</DetailedVersion>\n` +
    `</Version>\n`
  );
}

export type TopicBcf = {
  guid: string;
  title: string;
  description: string;
  status: string; // status interno (aberta|resolvida|…)
  creationDate: string; // ISO 8601
  creationAuthor: string;
  temViewpoint: boolean;
  temSnapshot: boolean;
  viewpointGuid: string;
};

export function markupXml(t: TopicBcf): string {
  const linhas: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Markup>`,
    `  <Topic Guid="${escaparXml(t.guid)}" TopicType="Issue" TopicStatus="${escaparXml(statusParaBcf(t.status))}">`,
    `    <Title>${escaparXml(t.title)}</Title>`,
    `    <CreationDate>${escaparXml(t.creationDate)}</CreationDate>`,
    `    <CreationAuthor>${escaparXml(t.creationAuthor)}</CreationAuthor>`,
  ];
  if (t.description.trim()) linhas.push(`    <Description>${escaparXml(t.description)}</Description>`);
  linhas.push(`  </Topic>`);
  if (t.temViewpoint) {
    linhas.push(`  <Viewpoints Guid="${escaparXml(t.viewpointGuid)}">`);
    linhas.push(`    <Viewpoint>viewpoint.bcfv</Viewpoint>`);
    if (t.temSnapshot) linhas.push(`    <Snapshot>snapshot.png</Snapshot>`);
    linhas.push(`  </Viewpoints>`);
  }
  linhas.push(`</Markup>`, ``);
  return linhas.join("\n");
}

export type ViewpointBcf = {
  guid: string;
  guids: string[]; // IfcGuids selecionados
  camera: { position: Vec3; target: Vec3 };
  /** Planos de corte em espaço IFC (opcional). */
  clippingPlanes?: { location: Vec3; direction: Vec3 }[];
};

export function viewpointXml(vp: ViewpointBcf): string {
  const { viewpoint, direction, up } = cameraParaBcf(vp.camera.position, vp.camera.target);
  const linhas: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<VisualizationInfo Guid="${escaparXml(vp.guid)}">`,
    `  <Components>`,
    `    <Selection>`,
  ];
  for (const g of vp.guids) linhas.push(`      <Component IfcGuid="${escaparXml(g)}" />`);
  linhas.push(
    `    </Selection>`,
    `    <Visibility DefaultVisibility="true" />`,
    `  </Components>`,
    `  <PerspectiveCamera>`,
    vetorXml("CameraViewPoint", viewpoint, "    "),
    vetorXml("CameraDirection", direction, "    "),
    vetorXml("CameraUpVector", up, "    "),
    `    <FieldOfView>${FIELD_OF_VIEW}</FieldOfView>`,
    `  </PerspectiveCamera>`,
  );
  if (vp.clippingPlanes && vp.clippingPlanes.length > 0) {
    linhas.push(`  <ClippingPlanes>`);
    for (const p of vp.clippingPlanes) {
      linhas.push(
        `    <ClippingPlane>`,
        vetorXml("Location", p.location, "      "),
        vetorXml("Direction", p.direction, "      "),
        `    </ClippingPlane>`,
      );
    }
    linhas.push(`  </ClippingPlanes>`);
  }
  linhas.push(`</VisualizationInfo>`, ``);
  return linhas.join("\n");
}
