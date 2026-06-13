import "server-only";
import { prisma } from "@/lib/prisma";
import { formatarCodigo } from "@/modules/projetos/numbering";
import type { Escalar, Linha } from "@/modules/documentos/tokens";

/**
 * Resolução das fontes de dados do Estúdio de Documentos (server).
 * Metadados (lista de fontes/campos) ficam em fontes-meta.ts (puro).
 * Novos módulos do Hub entram aqui (propostas O4, licitações O5…).
 */
export { FONTES, fonteDef, type FonteDef, type CampoDoc, type ParamFonte } from "@/modules/documentos/fontes-meta";

export type DadosResolvidos = { escalar: Escalar; linhas: Linha[] };

/** Resolve a fonte com os parâmetros → dados prontos para o motor de tokens. */
export async function resolverFonte(
  fonteId: string,
  params: Record<string, string>,
): Promise<DadosResolvidos> {
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
        include: { medicoes: { orderBy: { numero: "asc" } } },
      });
      if (!l) return { escalar: {}, linhas: [] };
      const totalMedido = l.medicoes.reduce((s, m) => s + Number(m.valor), 0);
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

    default:
      return { escalar: {}, linhas: [] };
  }
}
