/**
 * Lógica pura de certidões (sem I/O) — compartilhada pela UI, pelas queries e pelo
 * job de alerta (`alertaCertidoes`, `lib/jobs-handlers.ts`). Datas em ISO (AAAA-MM-DD).
 */

export type StatusCertidao = "vencida" | "vence_em_breve" | "ok";

const DIA_MS = 24 * 60 * 60 * 1000;

/** Janela de "vence em breve" — a mesma em toda parte (status da tela, badge do menu, alertas). */
export const DIAS_ALERTA = 30;

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
  if (dias <= DIAS_ALERTA) return "vence_em_breve";
  return "ok";
}

/**
 * Fronteiras de `where` para o recorte "precisa de atenção" (vencida OU vence em breve).
 *
 * Existe para o badge do menu e o card do Início poderem contar por SQL (dois `count` sobre o
 * índice de `validade`) sem hidratar a tabela — mas contando EXATAMENTE o que `statusCertidao`
 * classificaria, senão o badge diz 3 e a tela mostra 2. `service.test.ts` prende esse acordo.
 *
 * Meia-noite **UTC** porque `Certidao.validade` é `@db.Date`: o Postgres devolve meia-noite UTC e
 * comparar com meia-noite local venceria a certidão de hoje um dia antes (ver `lib/data.ts`).
 */
export function janelaAtencaoUtc(agora: Date = new Date()): { hojeUtc: Date; limiteUtc: Date } {
  const hojeUtc = new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()));
  return { hojeUtc, limiteUtc: new Date(hojeUtc.getTime() + DIAS_ALERTA * DIA_MS) };
}

/**
 * Texto relativo da validade (§6) — o que a data absoluta não responde sozinha.
 *
 * Usa `diasParaVencimento`, a MESMA função que alimenta `statusCertidao`, de propósito: com dois
 * caminhos de data o texto e o badge acabariam discordando ("Vence em 31 dias" ao lado de um chip
 * "vence em breve"). Dia-calendário, sem hora — nada de contador dinâmico (§6).
 *
 * O tom da linha `ok` é NEUTRO, não verde-alarme: com toda linha carregando texto relativo, pintar
 * as regulares junto faria a tabela inteira parecer aviso e as vencidas perderiam o destaque.
 */
export function textoValidade(
  validadeISO: string,
  hojeISO: string = hojeISOPadrao(),
): { texto: string; tom: "danger" | "warning" | "neutral" } {
  const dias = diasParaVencimento(validadeISO, hojeISO);

  if (dias < 0) {
    const atraso = Math.abs(dias);
    return { texto: `Vencida há ${atraso} ${atraso === 1 ? "dia" : "dias"}`, tom: "danger" };
  }
  if (dias === 0) return { texto: "Vence hoje", tom: "warning" };
  if (dias <= DIAS_ALERTA) {
    return { texto: `Vence em ${dias} ${dias === 1 ? "dia" : "dias"}`, tom: "warning" };
  }
  return { texto: `Válida por ${dias} dias`, tom: "neutral" };
}

/**
 * O que a ordenação por prioridade (§8) precisa saber de cada linha.
 *
 * Pede `arquivoNome` (e não um `temArquivo: boolean`) porque é o campo que a certidão realmente
 * tem, no banco e na UI: com o booleano, todo chamador precisaria montar um objeto derivado antes
 * de ordenar — e o resultado carregaria um campo a mais que o tipo da linha não declara.
 */
export type CertidaoParaPrioridade = {
  validade: string;
  obrigatoria: boolean;
  arquivoNome: string | null;
};

/**
 * Ordem padrão orientada a pendência (§8), da mais urgente para a menos:
 *
 *   0. obrigatória vencida        3. demais que vencem em breve
 *   1. demais vencidas            4. OK sem documento
 *   2. obrigatória vence em breve 5. OK com documento
 *
 * Documento só desempata no grupo OK: uma obrigatória VENCIDA é o problema mais caro independente
 * de ter PDF anexado, e rebaixá-la por causa disso enterraria a linha que mais precisa de ação.
 */
export function prioridadeCertidao(
  c: CertidaoParaPrioridade,
  hojeISO: string = hojeISOPadrao(),
): number {
  const status = statusCertidao(c.validade, hojeISO);
  if (status === "vencida") return c.obrigatoria ? 0 : 1;
  if (status === "vence_em_breve") return c.obrigatoria ? 2 : 3;
  return c.arquivoNome ? 5 : 4;
}

/** Aplica §8: prioridade e, dentro do grupo, validade mais próxima primeiro. Não muta a entrada. */
export function ordenarPorPrioridade<T extends CertidaoParaPrioridade>(
  certidoes: T[],
  hojeISO: string = hojeISOPadrao(),
): T[] {
  return [...certidoes].sort((a, b) => {
    const pa = prioridadeCertidao(a, hojeISO);
    const pb = prioridadeCertidao(b, hojeISO);
    if (pa !== pb) return pa - pb;
    return a.validade.localeCompare(b.validade);
  });
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
