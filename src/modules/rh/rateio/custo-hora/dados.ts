import "server-only";
import { prisma } from "@/lib/prisma";
import { ehDiaUtil } from "@/lib/calendario-trabalho";
import { montarCalendario } from "@/modules/planejamento/agenda";
import type { Contratacao } from "@/generated/prisma/enums";
import { custoDoMes, type CustoMes } from "./encargos";
import {
  anosCompletos, baseDoHoleriteCent, basesDoMes, inicioDoTempoDeCasa, jornadaReferenciaMinutos, remuneracaoContratual, segmentosDoMes, tabelaValidaVigente,
} from "./distribuicao";

export type CustoDaPessoaNoMes = {
  nome: string;
  contratacao: Contratacao | null;
  /** null = PJ/autônomo (só horas) ou sem salário cadastrado. Sem tabela = só o salário, sem encargos. */
  custo: CustoMes | null;
  jornadaReferenciaMin: number;
  origemBase: "holerite" | "historico" | "vinculo" | null;
  /** A tabela usada começa depois do mês (só ao recalcular mês anterior à primeira tabela). */
  tabelaPosterior: boolean;
  semTabela: boolean;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const cent = (v: { toString(): string } | number | null | undefined) => (v == null ? null : Math.round(Number(v) * 100));

/** Junta os custos das partes do mês (decisão 27). Com mais de uma contratação, o rótulo de cada item diz de qual. */
function somarCustos(partes: CustoMes[], contratacoes: Contratacao[] | null): CustoMes {
  const nomes: Record<string, string> = { clt: "CLT", estagio: "estágio", pro_labore: "pró-labore" };
  const itens = partes.flatMap((p, i) =>
    contratacoes ? p.itens.map((it) => ({ ...it, chave: `${contratacoes[i]}:${it.chave}`, rotulo: `${it.rotulo} (${nomes[contratacoes[i]] ?? contratacoes[i]})` })) : p.itens,
  );
  return {
    baseCent: partes.reduce((s, p) => s + p.baseCent, 0),
    itens,
    totalCent: partes.reduce((s, p) => s + p.totalCent, 0),
  };
}

function diasDoMes(ano: number, mes: number): string[] {
  const n = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${ano}-${String(mes).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Custo do mês de cada pessoa (decisões 1–7). Base: CLT e estágio pelo holerite da folha mensal do
 * sistema, senão o histórico contratual, senão o vínculo; sócio sempre pelo cadastro (decisão 6).
 */
export async function custosDoMes(ano: number, mes: number, userIds: string[]): Promise<Map<string, CustoDaPessoaNoMes>> {
  const out = new Map<string, CustoDaPessoaNoMes>();
  if (userIds.length === 0) return out;
  const iniMes = new Date(Date.UTC(ano, mes - 1, 1));
  const fimMes = new Date(Date.UTC(ano, mes, 0));
  const primeiroDia = iso(iniMes);
  const ultimoDia = iso(fimMes);

  const [usuarios, vinculos, folha, historicos, tabelas, ferias, calendario] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, contratacao: true } }),
    prisma.vinculo.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, contratacao: true, dataInicio: true, dataFim: true, motivoFim: true, cargaSemanal: true, remuneracao: true, agenteIntegracao: true },
    }),
    prisma.folhaPagamento.findUnique({
      where: { ano_mes_tipo: { ano, mes, tipo: "mensal" } },
      select: { holerites: { where: { userId: { in: userIds } }, select: { userId: true, itens: { select: { tipo: true, valor: true, descricao: true } } } } },
    }),
    prisma.historicoContratual.findMany({
      where: { userId: { in: userIds }, vigenciaEm: { lte: fimMes }, remuneracao: { not: null } },
      select: { userId: true, vigenciaEm: true, remuneracao: true, vinculo: { select: { contratacao: true } } },
    }),
    prisma.tabelaEncargos.findMany({ select: { contratacao: true, vigenciaEm: true, parametros: true } }),
    prisma.ferias.findMany({
      where: { userId: { in: userIds }, status: "aprovado", inicio: { lte: fimMes }, fim: { gte: iniMes } },
      select: { userId: true, inicio: true, fim: true },
    }),
    montarCalendario([ano]),
  ]);

  const diasUteis = diasDoMes(ano, mes).filter((d) => ehDiaUtil(d, calendario));
  const holeritePorUser = new Map((folha?.holerites ?? []).map((h) => [h.userId, h.itens]));
  const contratacaoUser = new Map(usuarios.map((u) => [u.id, u.contratacao]));
  const nomeUser = new Map(usuarios.map((u) => [u.id, u.name]));

  for (const userId of userIds) {
    const doUser = vinculos
      .filter((v) => v.userId === userId)
      .map((v) => ({ ...v, ini: iso(v.dataInicio), fim: v.dataFim ? iso(v.dataFim) : null }));
    const vigente = doUser
      .filter((v) => v.ini <= ultimoDia && (v.fim === null || v.fim >= primeiroDia))
      .sort((a, b) => b.ini.localeCompare(a.ini))[0];
    const contratacao = (vigente?.contratacao ?? contratacaoUser.get(userId) ?? null) as Contratacao | null;
    const jornadaReferenciaMin = jornadaReferenciaMinutos(vigente?.cargaSemanal != null ? Number(vigente.cargaSemanal) : null, diasUteis.length);
    const base: CustoDaPessoaNoMes = { nome: nomeUser.get(userId) ?? userId, contratacao, custo: null, jornadaReferenciaMin, origemBase: null, tabelaPosterior: false, semTabela: false };

    // Decisão 27: o mês é dividido pelos vínculos que o tocam (estágio até o dia 14, CLT a partir do 15…).
    // Sem vínculo cadastrado, vale o cache da contratação no mês inteiro (comportamento anterior).
    const vinculosSimples = doUser.map((v) => ({ contratacao: v.contratacao as Contratacao, dataInicio: v.ini, dataFim: v.fim, motivoFim: v.motivoFim }));
    let segmentos = segmentosDoMes({ vinculos: vinculosSimples, primeiroDia, ultimoDia, diasUteis });
    if (segmentos.length === 0 && contratacao) {
      segmentos = [{ contratacao, de: primeiroDia, ate: ultimoDia, diasUteis: diasUteis.length, vigente: true }];
    }
    const comEncargos = segmentos.filter((s) => s.contratacao === "clt" || s.contratacao === "estagio" || s.contratacao === "pro_labore");
    if (comEncargos.length === 0) {
      out.set(userId, base);
      continue;
    }

    const feriasDoUser = ferias.filter((x) => x.userId === userId).map((f) => ({ a: iso(f.inicio), b: iso(f.fim) }));
    const itensHolerite = holeritePorUser.get(userId);
    const holeriteCent = itensHolerite
      ? baseDoHoleriteCent(itensHolerite.map((i) => ({ tipo: i.tipo, valorCent: cent(i.valor)!, descricao: i.descricao })))
      : null;
    const historicoDoUser = historicos
      .filter((h) => h.userId === userId)
      .map((h) => ({ vigenciaEm: iso(h.vigenciaEm), remuneracaoCent: cent(h.remuneracao)!, contratacao: (h.vinculo?.contratacao ?? null) as Contratacao | null }));

    const partes: CustoMes[] = [];
    let origemBase: CustoDaPessoaNoMes["origemBase"] = null;
    let semTabela = false;
    let tabelaPosterior = false;
    for (const seg of comEncargos) {
      const vinculoDoSeg = doUser
        .filter((v) => v.contratacao === seg.contratacao && v.ini <= seg.ate && (v.fim === null || v.fim >= seg.de))
        .sort((a, b) => b.ini.localeCompare(a.ini))[0];
      const inicioCasa = inicioDoTempoDeCasa(vinculosSimples, seg.contratacao, seg.ate) ?? seg.de;
      const diasDoSeg = diasUteis.filter((d) => d >= seg.de && d <= seg.ate);
      const diasFerias = diasDoSeg.filter((d) => feriasDoUser.some((f) => d >= f.a && d <= f.b)).length;
      const contratual = remuneracaoContratual({
        historico: historicoDoUser,
        contratacao: seg.contratacao,
        inicioCasa,
        fimMes: seg.ate,
        vinculoRemuneracaoCent: cent(vinculoDoSeg?.remuneracao),
      });
      const bases = basesDoMes({
        contratacao: seg.contratacao,
        // O holerite do mês fica com o vínculo vigente (decisão 27).
        holeriteCent: seg.vigente ? holeriteCent : null,
        contratualCent: contratual?.cent ?? null,
        diasUteisMes: diasUteis.length,
        diasUteisNoVinculo: diasDoSeg.length,
        diasUteisDeFerias: diasFerias,
      });
      if (!bases) continue;
      if (seg.vigente) origemBase = bases.origem === "holerite" ? "holerite" : (contratual?.origem ?? "vinculo");

      const escolhida = tabelaValidaVigente(
        tabelas.filter((t) => t.contratacao === seg.contratacao).map((t) => ({ vigenciaEm: iso(t.vigenciaEm), parametros: t.parametros })),
        primeiroDia,
      );
      if (!escolhida) {
        // Sem tabela válida: o salário entra sem encargos (a tela diz "custo só do salário").
        semTabela = true;
        partes.push({ baseCent: bases.baseCent, itens: [], totalCent: bases.baseCent });
        continue;
      }
      tabelaPosterior ||= escolhida.posterior;
      partes.push(
        custoDoMes({
          baseCent: bases.baseCent,
          salarioReservasCent: bases.salarioReservasCent,
          fracaoVinculo: bases.fracaoVinculo,
          parametros: escolhida.parametros,
          anosCompletos: anosCompletos(inicioCasa, seg.ate),
          fracaoForaDeFerias: bases.fracaoForaDeFerias,
          viaAgenteIntegracao: !!vinculoDoSeg?.agenteIntegracao,
        }),
      );
    }
    if (partes.length === 0) {
      out.set(userId, base);
      continue;
    }

    out.set(userId, {
      ...base,
      origemBase,
      semTabela,
      tabelaPosterior,
      custo: somarCustos(partes, comEncargos.length > 1 ? comEncargos.map((s) => s.contratacao) : null),
    });
  }
  return out;
}
