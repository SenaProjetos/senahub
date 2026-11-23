import "server-only";
import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { contaPodeVerConversa, contasDoClienteDoProjeto, podeVerConversaDoProjeto } from "@/modules/portal/mensagens/service";
import type { DecisaoDeAtaDTO } from "./decisoes";
import { pendenciaAtrasada, type EstadoVersao, type RespostaAta, type SituacaoPendencia, type TipoItem } from "./regras";
import { membrosInternosDoProjeto } from "./service";

/**
 * Leituras das atas de reunião, uma por lado. A porta é a mesma do serviço: o cliente pela regra do portal
 * (`contaPodeVerConversa`), a equipe pela audiência da conversa (`podeVerConversaDoProjeto`); fora dela, `null`.
 *
 * O lado do CLIENTE nunca recebe: rascunho, reunião retirada, arquivos, nomes internos (quem publicou, conferiu, reabriu,
 * retirou) nem o responsável da tarefa da equipe.
 */

export type ItemAtaDTO = {
  chave: string;
  tipo: TipoItem;
  titulo: string;
  descricao: string | null;
  prazo: string | null;
  /** Só a equipe; nulo no cliente. */
  responsavelId: string | null;
  responsavelNome: string | null;
};

export type VersaoDTO = {
  id: string;
  numero: number;
  estado: EstadoVersao;
  texto: string;
  /** Só no rascunho de uma correção: título/data propostos (nulos = os da reunião). */
  titulo: string | null;
  data: string | null;
  itens: ItemAtaDTO[];
  publicadaEm: string | null;
  publicadaPorNome: string | null;
  resposta: RespostaAta | null;
  observacao: string | null;
  respondidaPorNome: string | null;
  respondidaEm: string | null;
};

export type PendenciaDTO = {
  id: string;
  reuniaoId: string;
  titulo: string;
  descricao: string | null;
  prazo: string | null;
  situacao: SituacaoPendencia;
  atrasada: boolean;
  feitaPorNome: string | null;
  feitaEm: string | null;
  comentarioFeito: string | null;
  motivoReabertura: string | null;
  reuniaoTitulo: string;
  reuniaoData: string;
};

export type ReuniaoDTO = {
  id: string;
  titulo: string;
  data: string;
  retirada: { em: string; motivo: string; por: string } | null;
  vigente: VersaoDTO | null;
  rascunho: VersaoDTO | null;
  /** Versões substituídas, da mais nova para a mais velha. */
  anteriores: VersaoDTO[];
  arquivos: { id: string; tipo: "anotacoes" | "transcricao"; nome: string }[];
};

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

type Lado = "cliente" | "equipe";

async function montarReunioes(projetoId: string, lado: Lado): Promise<ReuniaoDTO[]> {
  const equipe = lado === "equipe";
  const reunioes = await prisma.reuniaoProjeto.findMany({
    where: { projetoId, ...(equipe ? {} : { retiradaEm: null }) },
    orderBy: [{ data: "desc" }, { criadaEm: "desc" }],
    select: {
      id: true,
      titulo: true,
      data: true,
      retiradaEm: true,
      retiradaPorNome: true,
      motivoRetirada: true,
      // O cliente nunca recebe rascunho — nem na memória do servidor.
      versoes: {
        where: equipe ? {} : { estado: { not: "rascunho" } },
        orderBy: { numero: "desc" },
        include: { itens: { orderBy: { ordem: "asc" } } },
      },
      arquivos: equipe ? { select: { id: true, tipo: true, nome: true }, orderBy: { criadoEm: "asc" } } : false,
    },
  });
  const ids = new Set<string>();
  for (const r of reunioes) for (const v of r.versoes) for (const i of v.itens) if (i.responsavelId) ids.add(i.responsavelId);
  const nomes = equipe && ids.size > 0 ? new Map((await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name])) : new Map<string, string>();

  const versao = (v: (typeof reunioes)[number]["versoes"][number]): VersaoDTO => ({
    id: v.id,
    numero: v.numero,
    estado: v.estado,
    texto: v.texto,
    titulo: equipe && v.estado === "rascunho" ? v.titulo : null,
    data: equipe && v.estado === "rascunho" ? dia(v.data) : null,
    itens: v.itens.map((i) => ({
      chave: i.chave,
      tipo: i.tipo,
      titulo: i.titulo,
      // A descrição da tarefa da equipe é interna: o cliente vê só título e prazo ("a cargo da equipe").
      descricao: equipe || i.tipo !== "tarefa_equipe" ? i.descricao : null,
      prazo: dia(i.prazo),
      responsavelId: equipe ? i.responsavelId : null,
      responsavelNome: equipe && i.responsavelId ? nomes.get(i.responsavelId) ?? null : null,
    })),
    publicadaEm: iso(v.publicadaEm),
    publicadaPorNome: equipe ? v.publicadaPorNome : null,
    resposta: v.resposta,
    observacao: v.observacao,
    respondidaPorNome: v.respondidaPorNome,
    respondidaEm: iso(v.respondidaEm),
  });

  const lista: ReuniaoDTO[] = [];
  for (const r of reunioes) {
    const vigente = r.versoes.find((v) => v.estado === "publicada") ?? null;
    if (!equipe && !vigente) continue; // o cliente só vê ata publicada
    const rascunho = equipe ? r.versoes.find((v) => v.estado === "rascunho") ?? null : null;
    lista.push({
      id: r.id,
      titulo: r.titulo,
      data: dia(r.data)!,
      retirada:
        equipe && r.retiradaEm ? { em: r.retiradaEm.toISOString(), motivo: r.motivoRetirada ?? "", por: r.retiradaPorNome ?? "" } : null,
      vigente: vigente ? versao(vigente) : null,
      rascunho: rascunho ? versao(rascunho) : null,
      anteriores: r.versoes.filter((v) => v.estado === "substituida").map(versao),
      arquivos: equipe && Array.isArray(r.arquivos) ? r.arquivos.map((a) => ({ id: a.id, tipo: a.tipo, nome: a.nome })) : [],
    });
  }
  return lista;
}

async function montarPendencias(projetoId: string, lado: Lado): Promise<PendenciaDTO[]> {
  const hoje = diaDeSaoPaulo();
  const pendencias = await prisma.pendenciaCliente.findMany({
    where: { projetoId, reuniao: { retiradaEm: null }, ...(lado === "cliente" ? { situacao: { not: "cancelada" } } : {}) },
    include: { reuniao: { select: { titulo: true, data: true } } },
    orderBy: [{ prazo: { sort: "asc", nulls: "last" } }, { criadaEm: "asc" }],
  });
  const peso: Record<SituacaoPendencia, number> = { reaberta: 0, aberta: 1, aguardando_conferencia: 2, conferida: 3, cancelada: 4 };
  return pendencias
    .map((p) => ({
      id: p.id,
      reuniaoId: p.reuniaoId,
      titulo: p.titulo,
      descricao: p.descricao,
      prazo: dia(p.prazo),
      situacao: p.situacao,
      atrasada: pendenciaAtrasada({ situacao: p.situacao, prazo: dia(p.prazo) }, hoje),
      feitaPorNome: p.feitaPorNome,
      feitaEm: iso(p.feitaEm),
      comentarioFeito: p.comentarioFeito,
      motivoReabertura: p.situacao === "reaberta" ? p.motivoReabertura : null,
      reuniaoTitulo: p.reuniao.titulo,
      reuniaoData: dia(p.reuniao.data)!,
    }))
    .sort((a, b) => Number(b.atrasada) - Number(a.atrasada) || peso[a.situacao] - peso[b.situacao]);
}

export async function atasParaCliente(projetoId: string, userId: string): Promise<{ reunioes: ReuniaoDTO[]; pendencias: PendenciaDTO[] } | null> {
  if (!(await contaPodeVerConversa(userId, projetoId))) return null;
  return { reunioes: await montarReunioes(projetoId, "cliente"), pendencias: await montarPendencias(projetoId, "cliente") };
}

export async function atasParaEquipe(
  projetoId: string,
  userId: string,
): Promise<{ reunioes: ReuniaoDTO[]; pendencias: PendenciaDTO[]; contasAtivas: number } | null> {
  if (!(await podeVerConversaDoProjeto(userId, projetoId))) return null;
  return {
    reunioes: await montarReunioes(projetoId, "equipe"),
    pendencias: await montarPendencias(projetoId, "equipe"),
    contasAtivas: (await contasDoClienteDoProjeto(projetoId)).length,
  };
}

export type AtaParaEditar = {
  reuniao: ReuniaoDTO;
  projeto: { id: string; codigo: string; nome: string; cliente: string | null };
  membros: { id: string; nome: string }[];
  contasAtivas: number;
};

export async function ataParaEditar(reuniaoId: string, userId: string): Promise<AtaParaEditar | null> {
  const r = await prisma.reuniaoProjeto.findUnique({ where: { id: reuniaoId }, select: { projetoId: true } });
  if (!r) return null;
  if (!(await podeVerConversaDoProjeto(userId, r.projetoId))) return null;
  const reuniao = (await montarReunioes(r.projetoId, "equipe")).find((x) => x.id === reuniaoId);
  const projeto = await prisma.projeto.findUnique({
    where: { id: r.projetoId },
    select: { id: true, codigo: true, nome: true, cliente: { select: { nome: true } } },
  });
  if (!reuniao || !projeto) return null;
  return {
    reuniao,
    projeto: { id: projeto.id, codigo: projeto.codigo, nome: projeto.nome, cliente: projeto.cliente?.nome ?? null },
    membros: await membrosInternosDoProjeto(r.projetoId),
    contasAtivas: (await contasDoClienteDoProjeto(r.projetoId)).length,
  };
}

/**
 * Decisões da versão vigente de cada ata publicada e não retirada do projeto (para a lista "Decisões"). SEM porta
 * própria: só para quem já passou pela porta da conversa (`conversaParaCliente` / `conversaParaEquipe`).
 */
export async function decisoesDasAtas(projetoId: string): Promise<DecisaoDeAtaDTO[]> {
  const versoes = await prisma.ataVersao.findMany({
    where: { estado: "publicada", reuniao: { projetoId, retiradaEm: null } },
    select: {
      resposta: true,
      reuniao: { select: { id: true, titulo: true, data: true } },
      itens: { where: { tipo: "decisao" }, orderBy: { ordem: "asc" }, select: { chave: true, titulo: true, descricao: true } },
    },
  });
  return versoes.flatMap((v) =>
    v.itens.map((i) => ({
      reuniaoId: v.reuniao.id,
      chave: i.chave,
      titulo: i.titulo,
      descricao: i.descricao,
      reuniaoTitulo: v.reuniao.titulo,
      reuniaoData: dia(v.reuniao.data)!,
      comObservacoes: v.resposta === "observacoes",
    })),
  );
}
