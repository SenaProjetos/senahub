import "server-only";
import { prisma } from "@/lib/prisma";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { relatorioDRE } from "@/modules/financeiro/relatorios/queries";
import { saldoContratual, somaDeltas } from "@/modules/licitacoes/contrato/saldo";
import { totalComposicao } from "@/modules/licitacoes/composicao/composicao";
import { podeVerFonte } from "@/modules/documentos/fontes-perm";
import { fontesUsadasNoSchema } from "@/modules/documentos/fontes-usadas";
import type { Role } from "@/lib/roles";
import type { DocSchema } from "@/modules/documentos/schema";
import type { Escalar, Linha } from "@/modules/documentos/tokens";

/**
 * Resolução das fontes de dados do Estúdio de Documentos (server).
 * Metadados (lista de fontes/campos) ficam em fontes-meta.ts (puro).
 * Novos módulos do Hub entram aqui (propostas O4, licitações O5…).
 */
export { FONTES, fonteDef, type FonteDef, type CampoDoc, type ParamFonte } from "@/modules/documentos/fontes-meta";

export type DadosResolvidos = { escalar: Escalar; linhas: Linha[] };

export { fontesUsadasNoSchema } from "@/modules/documentos/fontes-usadas";

/**
 * Resultado da resolução MULTI-COLEÇÃO de um modelo:
 *  - `escalarPrimaria`/`linhasPrimaria`: dados da fonte primária (`modelo.fonte`);
 *  - `porFonte`: mapa fonteId → {escalar, linhas} de TODAS as fontes usadas
 *    (inclui a primária), para as bandas de detalhe/grupo com `fonteId` próprio.
 *
 * Retrocompat: sem nenhum `fonteId` nas bandas, `porFonte` tem só a primária e o
 * render se comporta exatamente como antes (usa escalarPrimaria/linhasPrimaria).
 */
export type ModeloResolvido = {
  escalarPrimaria: Escalar;
  linhasPrimaria: Linha[];
  porFonte: Record<string, DadosResolvidos>;
};

/** Convenção de chave de params por fonte (multi-coleção): `f_<fonteId>_<paramId>`. */
export { PARAM_FONTE_PREFIX, chaveParamFonte } from "@/modules/documentos/fontes-meta";

/**
 * Resolve TODAS as fontes usadas por um modelo (multi-coleção), aplicando o gate
 * de permissão por fonte (segurança — fonte sem permissão resolve VAZIO, não
 * vaza dados). Datasets (`dataset:<id>`) não passam pelo gate (sem dados de
 * módulo) e resolvem sempre.
 *
 * @param fontePrimaria   `modelo.fonte` (pode ser null/"" = sem fonte primária).
 * @param schema          schema do modelo (deriva as fontes das bandas).
 * @param paramsPorFonte  params de cada fonte: `paramsPorFonte[fonteId]`.
 * @param viewerRole      papel do usuário, para `podeVerFonte`.
 */
export async function resolverModelo(
  fontePrimaria: string | null | undefined,
  schema: DocSchema,
  paramsPorFonte: Record<string, Record<string, string>>,
  viewerRole: Role,
): Promise<ModeloResolvido> {
  const usadas = fontesUsadasNoSchema(fontePrimaria, schema);

  const porFonte: Record<string, DadosResolvidos> = {};
  await Promise.all(
    usadas.map(async (fonteId) => {
      // Datasets não têm permissão de módulo; fontes de sistema passam pelo gate.
      const liberada = isFonteDataset(fonteId) || (await podeVerFonte(viewerRole, fonteId));
      if (!liberada) {
        porFonte[fonteId] = { escalar: {}, linhas: [] };
        return;
      }
      porFonte[fonteId] = await resolverFonte(fonteId, paramsPorFonte[fonteId] ?? {});
    }),
  );

  const prim = (fontePrimaria ?? "").trim();
  const dadosPrim = prim ? porFonte[prim] : undefined;
  return {
    escalarPrimaria: dadosPrim?.escalar ?? {},
    linhasPrimaria: dadosPrim?.linhas ?? [],
    porFonte,
  };
}

/** Prefixo da convenção de fonte que aponta para um DatasetDocumento de CSV. */
export const DATASET_PREFIX = "dataset:";

/** A fonte é um dataset de CSV salvo? (convenção `dataset:<id>`) */
export function isFonteDataset(fonteId: string | null | undefined): boolean {
  return typeof fonteId === "string" && fonteId.startsWith(DATASET_PREFIX);
}

/** Resolve a fonte com os parâmetros → dados prontos para o motor de tokens. */
export async function resolverFonte(
  fonteId: string,
  params: Record<string, string>,
): Promise<DadosResolvidos> {
  // Dataset de CSV como fonte (convenção: "dataset:<datasetId>").
  // Cada linha é um objeto coluna→valor; os tokens [Coluna] resolvem direto.
  if (isFonteDataset(fonteId)) {
    const datasetId = fonteId.slice(DATASET_PREFIX.length);
    const d = await prisma.datasetDocumento.findUnique({
      where: { id: datasetId },
      select: { nome: true, linhas: true },
    });
    if (!d) return { escalar: {}, linhas: [] };
    const linhas = (Array.isArray(d.linhas) ? d.linhas : []) as Linha[];
    return {
      escalar: { DatasetNome: d.nome, TotalLinhas: linhas.length },
      linhas,
    };
  }

  switch (fonteId) {
    case "empresa": {
      return { escalar: { EmpresaNome: "Sena Projetos", Hoje: new Date() }, linhas: [] };
    }

    case "projeto": {
      const p = await prisma.projeto.findUnique({
        where: { id: params.projetoId ?? "" },
        include: {
          cliente: true,
          disciplinas: {
            orderBy: { ordem: "asc" },
            include: { responsaveis: { include: { user: { select: { name: true } } } } },
          },
        },
      });
      if (!p) return { escalar: {}, linhas: [] };
      const endCliente = [p.cliente.logradouro, p.cliente.numero, p.cliente.cidade, p.cliente.uf]
        .filter(Boolean)
        .join(", ");
      return {
        escalar: {
          Codigo: formatarCodigo(p.codigo),
          Nome: p.nome,
          Tipo: p.tipo === "licitacao" ? "Licitação" : "Particular",
          AreaM2: p.areaM2 != null ? Number(p.areaM2) : "",
          Endereco: p.endereco ?? "",
          PrazoFinal: p.prazoFinal ?? "",
          ClienteNome: p.cliente.nome,
          ClienteDocumento: p.cliente.documento ?? "",
          ClienteEmail: p.cliente.email ?? "",
          ClienteEndereco: endCliente,
        },
        linhas: p.disciplinas.map((d) => ({
          Disciplina: d.nome,
          Status: d.status.replace("_", " "),
          Prazo: d.prazo ?? "",
          Valor: d.valor != null ? Number(d.valor) : 0,
          Responsaveis: d.responsaveis.map((r) => r.user.name).join(", "),
        })),
      };
    }

    case "proposta": {
      const p = await prisma.proposta.findUnique({
        where: { id: params.propostaId ?? "" },
        include: {
          cliente: true,
          itens: { orderBy: { ordem: "asc" } },
          condicoes: { orderBy: { ordem: "asc" } },
        },
      });
      if (!p) return { escalar: {}, linhas: [] };
      const total = p.itens.reduce((s, it) => s + Number(it.valor), 0);
      const endereco = [p.cliente.logradouro, p.cliente.numero, p.cliente.cidade, p.cliente.uf]
        .filter(Boolean)
        .join(", ");
      const condicoes = p.condicoes
        .map((c) =>
          c.tipo === "percentual"
            ? `${c.descricao}: ${Number(c.valor)}%`
            : `${c.descricao}: R$ ${Number(c.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        )
        .join(" · ");
      return {
        escalar: {
          Numero: p.numero,
          Titulo: p.titulo,
          ClienteNome: p.cliente.nome,
          ClienteDocumento: p.cliente.documento ?? "",
          ClienteEndereco: endereco,
          AreaM2: p.areaM2 != null ? Number(p.areaM2) : "",
          Validade: p.validade ?? "",
          Total: total,
          Condicoes: condicoes,
          Observacoes: p.observacoes ?? "",
        },
        linhas: p.itens.map((it) => ({
          Disciplina: it.disciplina,
          Descricao: it.descricao ?? "",
          Valor: Number(it.valor),
        })),
      };
    }

    case "extrato": {
      const userId = params.userId ?? "";
      const [user, pagamentos] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
        prisma.pagamentoProjetista.findMany({
          where: { projetistaId: userId },
          orderBy: { liberadoEm: "desc" },
          include: {
            disciplina: { select: { nome: true, projeto: { select: { codigo: true } } } },
          },
        }),
      ]);
      const pend = pagamentos.filter((x) => x.status === "pendente").reduce((s, x) => s + Number(x.valor), 0);
      const pago = pagamentos.filter((x) => x.status === "pago").reduce((s, x) => s + Number(x.valor), 0);
      return {
        escalar: {
          ProjetistaNome: user?.name ?? "",
          TotalPendente: pend,
          TotalPago: pago,
        },
        linhas: pagamentos.map((x) => ({
          Projeto: formatarCodigo(x.disciplina.projeto.codigo),
          Disciplina: x.disciplina.nome,
          Valor: Number(x.valor),
          Status: x.status,
          LiberadoEm: x.liberadoEm,
        })),
      };
    }

    case "lancamentos": {
      const [anoS, mesS] = (params.mes ?? "").split("-");
      const ano = Number(anoS);
      const mes = Number(mesS);
      if (!ano || !mes) return { escalar: {}, linhas: [] };
      const de = new Date(ano, mes - 1, 1);
      const ate = new Date(ano, mes, 0, 23, 59, 59);
      const lancs = await prisma.lancamento.findMany({
        where: { status: "confirmado", dataConfirmacao: { gte: de, lte: ate } },
        orderBy: { dataConfirmacao: "asc" },
        include: { categoria: { select: { codigo: true, nome: true } } },
      });
      const rec = lancs.filter((l) => l.tipo === "receita").reduce((s, l) => s + Number(l.valorEfetivo ?? l.valor), 0);
      const des = lancs.filter((l) => l.tipo === "despesa").reduce((s, l) => s + Number(l.valorEfetivo ?? l.valor), 0);
      return {
        escalar: {
          Competencia: `${String(mes).padStart(2, "0")}/${ano}`,
          TotalReceitas: rec,
          TotalDespesas: des,
          Resultado: rec - des,
        },
        linhas: lancs.map((l) => ({
          Data: l.dataConfirmacao ?? l.data,
          Descricao: l.descricao,
          Categoria: `${l.categoria.codigo} ${l.categoria.nome}`,
          TipoMov: l.tipo,
          Valor: Number(l.valorEfetivo ?? l.valor),
        })),
      };
    }

    case "cliente": {
      const c = await prisma.cliente.findUnique({
        where: { id: params.clienteId ?? "" },
        include: { projetos: { orderBy: [{ ano: "desc" }, { sequencial: "desc" }] } },
      });
      if (!c) return { escalar: {}, linhas: [] };
      const endereco = [c.logradouro, c.numero, c.bairro, c.cidade, c.uf].filter(Boolean).join(", ");
      return {
        escalar: {
          Nome: c.nome,
          NomeFantasia: c.nomeFantasia ?? "",
          Documento: c.documento ?? "",
          Email: c.email ?? "",
          Telefone: c.telefone ?? "",
          Endereco: endereco,
        },
        linhas: c.projetos.map((p) => ({
          Codigo: formatarCodigo(p.codigo),
          Projeto: p.nome,
          Situacao: p.situacao.replace("_", " "),
          PrazoFinal: p.prazoFinal ?? "",
        })),
      };
    }

    case "licitacao": {
      const l = await prisma.licitacao.findUnique({
        where: { id: params.licitacaoId ?? "" },
        include: {
          medicoes: { orderBy: { numero: "asc" } },
          contrato: { include: { aditivos: true } },
          composicao: { include: { itens: true } },
          viabilidade: true,
          resultado: true,
        },
      });
      if (!l) return { escalar: {}, linhas: [] };
      const totalMedido = l.medicoes.reduce((s, m) => s + Number(m.valor), 0);
      const homologado = l.contrato ? Number(l.contrato.valorHomologado) : 0;
      const deltas = l.contrato
        ? somaDeltas(l.contrato.aditivos.map((a) => ({ valorDelta: a.valorDelta != null ? Number(a.valorDelta) : null })))
        : 0;
      const saldo = l.contrato ? saldoContratual(homologado, deltas, totalMedido) : "";
      const totalComp = l.composicao
        ? totalComposicao(
            l.composicao.itens.map((it) => ({
              quantidade: Number(it.quantidade),
              valorUnitario: Number(it.valorUnitario),
            })),
          )
        : "";
      const decisao = l.viabilidade
        ? l.viabilidade.decisao === "go"
          ? "GO"
          : l.viabilidade.decisao === "no_go"
            ? "NO-GO"
            : "Pendente"
        : "";
      return {
        escalar: {
          Titulo: l.titulo,
          Orgao: l.orgao ?? "",
          Modalidade: l.modalidade ?? "",
          NumeroEdital: l.numeroEdital ?? "",
          PrazoProposta: l.prazoProposta ?? "",
          ValorEstimado: l.valorEstimado != null ? Number(l.valorEstimado) : "",
          Status: l.status.replace("_", " "),
          TotalMedido: totalMedido,
          ValorHomologado: l.contrato ? homologado : "",
          SaldoContratual: saldo,
          NumeroContrato: l.contrato?.numeroContrato ?? "",
          VigenciaFim: l.contrato?.vigenciaFim ?? "",
          TotalComposicao: totalComp,
          DecisaoViabilidade: decisao,
          Vencedor: l.resultado?.vencedor ?? "",
          ValorVencedor: l.resultado?.valorVencedor != null ? Number(l.resultado.valorVencedor) : "",
          NumeroControlePNCP: l.numeroControlePNCP ?? "",
          PublicadoPNCP: l.publicadoPNCPEm ? "Sim" : "Não",
        },
        linhas: l.medicoes.map((m) => ({
          Numero: m.numero,
          Descricao: m.descricao ?? "",
          Valor: Number(m.valor),
          Data: m.data,
        })),
      };
    }

    case "holerite": {
      const h = await prisma.holerite.findUnique({
        where: { id: params.holeriteId ?? "" },
        include: {
          user: { select: { name: true } },
          folha: { select: { ano: true, mes: true } },
          itens: true,
        },
      });
      if (!h) return { escalar: {}, linhas: [] };
      const proventos = h.itens.filter((i) => i.tipo === "provento").reduce((s, i) => s + Number(i.valor), 0);
      const descontos = h.itens.filter((i) => i.tipo === "desconto").reduce((s, i) => s + Number(i.valor), 0);
      return {
        escalar: {
          Colaborador: h.user.name,
          Competencia: `${String(h.folha.mes).padStart(2, "0")}/${h.folha.ano}`,
          TotalProventos: proventos,
          TotalDescontos: descontos,
          Liquido: proventos - descontos,
        },
        linhas: h.itens.map((i) => ({
          Descricao: i.descricao,
          TipoRubrica: i.tipo,
          Valor: Number(i.valor),
        })),
      };
    }

    case "dre": {
      const [anoS, mesS] = (params.mes ?? "").split("-");
      const ano = Number(anoS);
      const mes = Number(mesS);
      if (!ano || !mes) return { escalar: {}, linhas: [] };
      const dre = await relatorioDRE(new Date(ano, mes - 1, 1), new Date(ano, mes, 0, 23, 59, 59));
      return {
        escalar: {
          Competencia: `${String(mes).padStart(2, "0")}/${ano}`,
          TotalReceitas: dre.totalReceitas,
          TotalDespesas: dre.totalDespesas,
          Resultado: dre.resultado,
        },
        linhas: [...dre.receitas, ...dre.despesas].map((l) => ({
          Codigo: l.codigo,
          Categoria: l.nome,
          Tipo: l.tipo,
          Valor: l.valor,
        })),
      };
    }

    default:
      return { escalar: {}, linhas: [] };
  }
}
