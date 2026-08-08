/**
 * Lógica pura de certidões (sem I/O) — compartilhada pela UI, pelas queries e pelo
 * job de alerta (`alertaCertidoes`, `lib/jobs-handlers.ts`). Datas em ISO (AAAA-MM-DD).
 */

export type StatusCertidao = "vencida" | "vence_em_breve" | "ok";

const DIA_MS = 24 * 60 * 60 * 1000;

function hojeISOPadrao(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Dias até a validade (negativo = já venceu). */
export function diasParaVencimento(validadeISO: string, hojeISO: string = hojeISOPadrao()): number {
  const validade = new Date(`${validadeISO}T00:00:00`).getTime();
  const hoje = new Date(`${hojeISO}T00:00:00`).getTime();
  return Math.round((validade - hoje) / DIA_MS);
}

/** Status por validade (independe de ter arquivo anexado — ver `semArquivo` à parte). */
export function statusCertidao(validadeISO: string, hojeISO: string = hojeISOPadrao()): StatusCertidao {
  const dias = diasParaVencimento(validadeISO, hojeISO);
  if (dias < 0) return "vencida";
  if (dias <= 30) return "vence_em_breve";
  return "ok";
}

export type CertidaoParaPanorama = {
  id: string;
  tipoId: string;
  validade: string;
  arquivoPath: string | null;
};

export type PanoramaCompliance = {
  vencidas: number;
  venceEmBreve: number;
  ok: number;
  semArquivo: number;
};

/** Agregação p/ o painel de vencimentos (feature 1). */
export function panoramaCompliance(
  certidoes: CertidaoParaPanorama[],
  hojeISO: string = hojeISOPadrao(),
): PanoramaCompliance {
  const p: PanoramaCompliance = { vencidas: 0, venceEmBreve: 0, ok: 0, semArquivo: 0 };
  for (const c of certidoes) {
    const status = statusCertidao(c.validade, hojeISO);
    if (status === "vencida") p.vencidas++;
    else if (status === "vence_em_breve") p.venceEmBreve++;
    else p.ok++;
    if (!c.arquivoPath) p.semArquivo++;
  }
  return p;
}

export type TipoObrigatorio = { id: string; nome: string; obrigatoria: boolean };
export type CertidaoParaChecklist = { tipoId: string; validade: string };

/**
 * Tipos obrigatórios (feature 2) sem nenhuma certidão vigente (não vencida) desse tipo —
 * ou porque nunca foi registrada, ou porque todas as registradas já venceram.
 */
export function tiposObrigatoriosFaltantes(
  tipos: TipoObrigatorio[],
  certidoes: CertidaoParaChecklist[],
  hojeISO: string = hojeISOPadrao(),
): TipoObrigatorio[] {
  const tiposComVigente = new Set(
    certidoes.filter((c) => diasParaVencimento(c.validade, hojeISO) >= 0).map((c) => c.tipoId),
  );
  return tipos.filter((t) => t.obrigatoria && !tiposComVigente.has(t.id));
}
