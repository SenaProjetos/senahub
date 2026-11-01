import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { existeArquivo, lerArquivo } from "@/lib/storage";
import { brl } from "@/lib/utils";
import type { SessionUser } from "@/lib/session";
import { escopoProjeto } from "@/modules/projetos/queries";
import {
  ROTULO_CAMPO,
  caminhoAnexoLeadValido,
  dataBr,
  descricaoComResumo,
  marcarArquivos,
  motivoParaNaoVincular,
  planejarCampos,
  resumoHistorico,
  type AtividadeParaResumo,
  type ItemArquivo,
  type PlanoCampos,
  type PreviaVinculo,
} from "./regras";

const num = (v: { toString(): string } | null) => (v == null ? null : Number(v));

/** Projetos do MESMO cliente da ficha, sem ficha ainda, dentro do escopo de quem pede. */
export async function projetosLinkaveis(user: SessionUser, negociacaoId: string) {
  const n = await prisma.negociacao.findUnique({
    where: { id: negociacaoId },
    select: { clienteId: true, estagio: true, excluidoEm: true },
  });
  // Ficha que não pode ser linkada não oferece candidato (a prévia recusaria qualquer um).
  if (!n || n.excluidoEm || n.estagio !== "CONTRATADO") return [];
  return prisma.projeto.findMany({
    where: { clienteId: n.clienteId, negociacaoId: null, AND: [escopoProjeto(user)] },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, codigo: true, nome: true },
  });
}

/** Fichas Contratado do MESMO cliente do projeto. */
export async function fichasLinkaveis(user: SessionUser, projetoId: string) {
  const p = await prisma.projeto.findFirst({
    where: { id: projetoId, AND: [escopoProjeto(user)] },
    select: { clienteId: true },
  });
  if (!p) return [];
  const fichas = await prisma.negociacao.findMany({
    where: { clienteId: p.clienteId, estagio: "CONTRATADO" },
    orderBy: { dataFechamento: "desc" },
    take: 100,
    select: { id: true, titulo: true, valorNegociado: true },
  });
  return fichas.map((f) => ({ id: f.id, titulo: f.titulo, valorNegociado: num(f.valorNegociado) }));
}

async function carregarProjeto(user: SessionUser, projetoId: string) {
  const p = await prisma.projeto.findFirst({
    where: { id: projetoId, AND: [escopoProjeto(user)] },
    select: {
      id: true,
      codigo: true,
      nome: true,
      clienteId: true,
      negociacaoId: true,
      valorContrato: true,
      areaM2: true,
      tipoEmpreendimentoId: true,
      descricao: true,
      membros: { select: { userId: true } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    clienteId: p.clienteId,
    negociacaoId: p.negociacaoId,
    valorContrato: num(p.valorContrato),
    areaM2: num(p.areaM2),
    tipoEmpreendimentoId: p.tipoEmpreendimentoId,
    descricao: p.descricao,
    membrosIds: p.membros.map((m) => m.userId),
  };
}

async function carregarFicha(negociacaoId: string) {
  return prisma.negociacao.findUnique({
    where: { id: negociacaoId },
    select: {
      id: true,
      titulo: true,
      clienteId: true,
      estagio: true,
      excluidoEm: true,
      valorNegociado: true,
      areaM2: true,
      tipoEmpreendimentoId: true,
      responsavelId: true,
      leadId: true,
      tipoEmpreendimento: { select: { nome: true } },
      lead: {
        select: {
          anexos: {
            orderBy: { createdAt: "asc" },
            select: { id: true, nome: true, nomeArquivo: true, caminho: true, mime: true, tamanho: true, hashSha256: true },
          },
        },
      },
      propostas: {
        orderBy: { createdAt: "asc" },
        select: {
          numero: true,
          // A VIGENTE (a de número maior), com ou sem PDF: vigente sem PDF não oferece o PDF de uma versão velha.
          versoes: {
            orderBy: { numero: "desc" },
            take: 1,
            select: { id: true, numero: true, pdfPath: true },
          },
        },
      },
    },
  });
}
type FichaCarregada = NonNullable<Awaited<ReturnType<typeof carregarFicha>>>;

/** Anexos do lead de origem + o PDF vigente de cada proposta da ficha. */
async function itensDaFicha(ficha: FichaCarregada): Promise<ItemArquivo[]> {
  const itens: ItemArquivo[] = [];
  for (const a of ficha.lead?.anexos ?? []) {
    // Caminho fora de `comercial/leads/` (linha antiga gravada sem validação) pode ser arquivo de outro cliente:
    // nem aparece na lista, então o serviço também recusa a chave.
    if (!caminhoAnexoLeadValido(a.caminho)) continue;
    itens.push({
      chave: `lead:${a.id}`,
      origem: "anexo_lead",
      nome: a.nome,
      nomeArquivo: a.nomeArquivo,
      caminho: a.caminho,
      mime: a.mime,
      tamanho: a.tamanho,
      hashSha256: a.hashSha256,
      existe: await existeArquivo(a.caminho),
    });
  }
  for (const pr of ficha.propostas) {
    const v = pr.versoes[0];
    if (!v?.pdfPath) continue;
    const base = {
      chave: `pv:${v.id}`,
      origem: "proposta_pdf" as const,
      nome: `Proposta ${pr.numero} v${v.numero} (PDF)`,
      nomeArquivo: `${pr.numero}-v${v.numero}.pdf`,
      caminho: v.pdfPath,
      mime: "application/pdf",
    };
    try {
      const buffer = await lerArquivo(v.pdfPath);
      itens.push({
        ...base,
        tamanho: buffer.length,
        hashSha256: createHash("sha256").update(buffer).digest("hex"),
        existe: true,
      });
    } catch {
      itens.push({ ...base, tamanho: 0, hashSha256: null, existe: false });
    }
  }
  return itens;
}

async function atividadesParaResumo(ficha: FichaCarregada): Promise<AtividadeParaResumo[]> {
  const novas = await prisma.atividade.findMany({
    where: {
      tipo: { in: ["NOTA", "REUNIAO"] },
      OR: [{ negociacaoId: ficha.id }, ...(ficha.leadId ? [{ leadId: ficha.leadId }] : [])],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { tipo: true, descricao: true, createdAt: true },
  });
  const legadas = ficha.leadId
    ? await prisma.atividadeLead.findMany({
        where: { leadId: ficha.leadId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { nota: true, createdAt: true },
      })
    : [];
  return [
    ...novas.map((a) => ({ tipo: a.tipo as string, descricao: a.descricao, createdAt: a.createdAt })),
    ...legadas.map((a) => ({ tipo: "NOTA_LEGADA", descricao: a.nota, createdAt: a.createdAt })),
  ];
}

const PLANO_VAZIO: PlanoCampos = { preenche: {}, mantem: [], coordenadorId: null };

/**
 * Tudo o que o diálogo mostra E o que o serviço usa para gravar — uma regra só. O serviço a RECALCULA ao gravar
 * (nunca confia na que foi à tela): se algo mudou no meio (ex.: o projeto ganhou valor), o resultado pode diferir
 * do que a pessoa viu, mas sempre para o lado seguro — nada é sobrescrito. Só leitura.
 */
export async function previaVinculo(
  user: SessionUser,
  projetoId: string,
  negociacaoId: string,
): Promise<PreviaVinculo> {
  const projeto = await carregarProjeto(user, projetoId);
  if (!projeto) throw new ActionError("Projeto não encontrado.");
  const ficha = await carregarFicha(negociacaoId);
  if (!ficha) throw new ActionError("Ficha não encontrada.");

  const fichaParaRegras = {
    id: ficha.id,
    titulo: ficha.titulo,
    clienteId: ficha.clienteId,
    estagio: ficha.estagio,
    excluida: ficha.excluidoEm != null,
    valorNegociado: num(ficha.valorNegociado),
    areaM2: num(ficha.areaM2),
    tipoEmpreendimentoId: ficha.tipoEmpreendimentoId,
    responsavelId: ficha.responsavelId,
  };
  const motivo = motivoParaNaoVincular(projeto, fichaParaRegras);

  const cabecalho = {
    projeto: {
      id: projeto.id,
      codigo: projeto.codigo,
      nome: projeto.nome,
      clienteId: projeto.clienteId,
      descricao: projeto.descricao,
    },
    ficha: { id: ficha.id, titulo: ficha.titulo },
    motivo,
  };
  if (motivo) {
    return {
      ...cabecalho,
      plano: PLANO_VAZIO,
      preencheTexto: [],
      mantemTexto: [],
      coordenador: null,
      arquivos: [],
      resumo: null,
      descricaoVazia: false,
      novaDescricao: null,
    };
  }

  const responsavel = ficha.responsavelId
    ? await prisma.user.findFirst({
        where: { id: ficha.responsavelId, tipo: "interno", ativo: true },
        select: { id: true, name: true },
      })
    : null;

  const plano = planejarCampos(projeto, fichaParaRegras, responsavel != null);

  const preencheTexto: PreviaVinculo["preencheTexto"] = [];
  if (plano.preenche.valorContrato != null)
    preencheTexto.push({ campo: "valorContrato", rotulo: ROTULO_CAMPO.valorContrato, valor: brl(plano.preenche.valorContrato) });
  if (plano.preenche.areaM2 != null)
    preencheTexto.push({
      campo: "areaM2",
      rotulo: ROTULO_CAMPO.areaM2,
      valor: `${plano.preenche.areaM2.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`,
    });
  if (plano.preenche.tipoEmpreendimentoId != null)
    preencheTexto.push({
      campo: "tipoEmpreendimentoId",
      rotulo: ROTULO_CAMPO.tipoEmpreendimentoId,
      valor: ficha.tipoEmpreendimento?.nome ?? "—",
    });

  const existentes = await prisma.documentoVersao.findMany({
    where: { documento: { projetoId } },
    select: { hashSha256: true },
  });
  const arquivos = marcarArquivos(await itensDaFicha(ficha), new Set(existentes.map((e) => e.hashSha256)));

  const resumo = resumoHistorico(await atividadesParaResumo(ficha), dataBr(new Date()));
  const novaDescricao = descricaoComResumo(projeto.descricao, resumo);

  return {
    ...cabecalho,
    plano,
    preencheTexto,
    mantemTexto: plano.mantem.map((campo) => ({ campo, rotulo: ROTULO_CAMPO[campo] })),
    coordenador: plano.coordenadorId && responsavel ? { id: responsavel.id, nome: responsavel.name } : null,
    arquivos,
    resumo,
    descricaoVazia: !projeto.descricao || projeto.descricao.trim() === "",
    novaDescricao,
  };
}

/** De onde veio o projeto, do lado comercial — para o cabeçalho e para o ⋯ do projeto. */
export async function origemComercialDoProjeto(projetoId: string) {
  const p = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: {
      negociacaoId: true,
      negociacao: { select: { id: true, titulo: true, excluidoEm: true } },
      proposta: { select: { negociacaoId: true } },
    },
  });
  // Leitura aninhada não passa pelo filtro de soft delete: ficha excluída não aparece como origem.
  const ficha = p?.negociacao && !p.negociacao.excluidoEm ? { id: p.negociacao.id, titulo: p.negociacao.titulo } : null;
  return {
    ficha,
    // Mesma regra de `desvincularProjetoDaFicha`: só trava quando a proposta aceita é desta ficha.
    criadoPeloAceite: p?.proposta != null && p.negociacaoId != null && p.proposta.negociacaoId === p.negociacaoId,
  };
}
