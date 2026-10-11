import "server-only";
import { prisma } from "@/lib/prisma";
import { ehDiaUtil } from "@/lib/calendario-trabalho";
import { montarCalendario } from "@/modules/planejamento/agenda";
import type { Contratacao } from "@/generated/prisma/enums";
import { custoDoMes, type CustoMes } from "./encargos";
import {
  anosCompletos, baseDoHoleriteCent, basesDoMes, inicioDoTempoDeCasa, jornadaReferenciaMinutos, remuneracaoContratual, tabelaValidaVigente,
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

    if (contratacao !== "clt" && contratacao !== "estagio" && contratacao !== "pro_labore") {
      out.set(userId, base);
      continue;
    }

    // Janela do vínculo dentro do mês: do início do tempo de casa (vínculos colados da mesma
    // contratação) até o fim do vínculo vigente. Admissão e saída no meio do mês ficam proporcionais.
    const inicioCasa = inicioDoTempoDeCasa(
      doUser.map((v) => ({ contratacao: v.contratacao as Contratacao, dataInicio: v.ini, dataFim: v.fim, motivoFim: v.motivoFim })),
      contratacao,
      ultimoDia,
    );
    const de = [primeiroDia, inicioCasa ?? vigente?.ini ?? primeiroDia].sort()[1];
    const ate = vigente?.fim && vigente.fim < ultimoDia ? vigente.fim : ultimoDia;
    const diasNoVinculo = diasUteis.filter((d) => d >= de && d <= ate);
    const diasFerias = new Set<string>();
    for (const f of ferias.filter((x) => x.userId === userId)) {
      const a = iso(f.inicio);
      const b = iso(f.fim);
      for (const d of diasNoVinculo) if (d >= a && d <= b) diasFerias.add(d);
    }

    const itensHolerite = holeritePorUser.get(userId);
    const holeriteCent = itensHolerite
      ? baseDoHoleriteCent(itensHolerite.map((i) => ({ tipo: i.tipo, valorCent: cent(i.valor)!, descricao: i.descricao })))
      : null;
    const contratual = remuneracaoContratual({
      historico: historicos
        .filter((h) => h.userId === userId)
        .map((h) => ({ vigenciaEm: iso(h.vigenciaEm), remuneracaoCent: cent(h.remuneracao)!, contratacao: (h.vinculo?.contratacao ?? null) as Contratacao | null })),
      contratacao,
      inicioCasa,
      fimMes: ultimoDia,
      vinculoRemuneracaoCent: cent(vigente?.remuneracao),
    });

    const bases = basesDoMes({
      contratacao,
      holeriteCent,
      contratualCent: contratual?.cent ?? null,
      diasUteisMes: diasUteis.length,
      diasUteisNoVinculo: diasNoVinculo.length,
      diasUteisDeFerias: diasFerias.size,
    });
    if (!bases) {
      out.set(userId, base);
      continue;
    }
    const origemBase = bases.origem === "holerite" ? "holerite" : (contratual?.origem ?? "vinculo");

    const escolhida = tabelaValidaVigente(
      tabelas.filter((t) => t.contratacao === contratacao).map((t) => ({ vigenciaEm: iso(t.vigenciaEm), parametros: t.parametros })),
      primeiroDia,
    );
    if (!escolhida) {
      // Sem tabela válida: o salário do mês entra sem encargos (a tela diz "custo só do salário").
      out.set(userId, { ...base, origemBase, semTabela: true, custo: { baseCent: bases.baseCent, itens: [], totalCent: bases.baseCent } });
      continue;
    }

    out.set(userId, {
      ...base,
      origemBase,
      tabelaPosterior: escolhida.posterior,
      custo: custoDoMes({
        baseCent: bases.baseCent,
        salarioReservasCent: bases.salarioReservasCent,
        fracaoVinculo: bases.fracaoVinculo,
        parametros: escolhida.parametros,
        anosCompletos: inicioCasa ? anosCompletos(inicioCasa, ultimoDia) : 0,
        fracaoForaDeFerias: bases.fracaoForaDeFerias,
        viaAgenteIntegracao: !!vigente?.agenteIntegracao,
      }),
    });
  }
  return out;
}
