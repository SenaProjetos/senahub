import "server-only";
import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { rotuloRevisao } from "@/lib/utils";
import { formatarCodigo } from "@/modules/projetos/numbering";
import {
  conteudoDoAlcance,
  conteudoDoAlcanceSemSelos,
  uploadLiberadoNoAlcance,
  type ConteudoPublico,
} from "@/modules/projetos/arquivos/link-publico";
import { alcanceDaObra } from "@/modules/projetos/arquivos/link-publico-regras";
import { ROTULO_SITUACAO } from "@/modules/uploads/revisao-marcada";
import { uploadsComBloqueioDeDownload } from "@/modules/uploads/ciclo/service";
import type { UsuarioDaSessao } from "../acesso";
import { acessoDaObraAoProjeto } from "./acesso";
import { obrasValidas } from "./regras";

export type ProjetoParaContaObra = { id: string; rotulo: string; detalhe: string; clienteId: string };

/**
 * Projetos que podem entrar na lista de uma conta de obra (Configurações → Usuários): os de clientes ativos, do mais novo para o
 * mais antigo. O formulário filtra pelo cliente quando a conta é "do cliente"; o serviço confere de novo ao gravar.
 */
export async function projetosParaContaObra(): Promise<ProjetoParaContaObra[]> {
  const projetos = await prisma.projeto.findMany({
    where: { cliente: { ativo: true } },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: { id: true, codigo: true, nome: true, clienteId: true, cliente: { select: { nome: true } } },
  });
  return projetos.map((p) => ({
    id: p.id,
    rotulo: `${formatarCodigo(p.codigo)} · ${p.nome}`,
    detalhe: p.cliente.nome,
    clienteId: p.clienteId,
  }));
}

export type ObraDaConta = {
  id: string;
  codigo: string;
  nome: string;
  endereco: string | null;
  /** Arquivos na pasta "Liberado para obra" (a mesma conta da página). */
  liberadas: number;
  /** Dia (São Paulo, `YYYY-MM-DD`) da liberação mais recente; null = nunca. */
  ultimaLiberacao: string | null;
};

const contarArquivos = (c: ConteudoPublico | null) =>
  c ? c.situacoes.reduce((n, s) => n + s.disciplinas.reduce((m, d) => m + d.total, 0), 0) : 0;

/**
 * Dia da liberação mais recente da obra: o controle `liberado_obra` ativo mais novo (dentro do ciclo documental; o da migração
 * não conta, a data dele é a da migração) ou o evento `situacao_marcada` mais novo da pasta (fora do ciclo).
 */
async function ultimaLiberacao(projetoId: string): Promise<string | null> {
  const controle = await prisma.controleRevisao.findFirst({
    where: {
      tipo: "liberado_obra",
      removidoEm: null,
      OR: [{ origem: null }, { origem: { not: "migracao" } }],
      revisao: { documento: { disciplina: { projetoId } } },
    },
    orderBy: { aplicadoEm: "desc" },
    select: { aplicadoEm: true },
  });
  const evento = await prisma.documentoEvento.findFirst({
    where: {
      tipo: "situacao_marcada",
      documento: { disciplina: { projetoId } },
      detalhe: { path: ["pasta"], equals: ROTULO_SITUACAO.liberado_obra },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const datas = [controle?.aplicadoEm, evento?.createdAt].filter((d): d is Date => !!d);
  if (datas.length === 0) return null;
  return diaDeSaoPaulo(new Date(Math.max(...datas.map((d) => d.getTime()))));
}

/**
 * "Minhas obras" (spec 2026-11-25): as obras da lista que a conta vê hoje (`obrasValidas`), cada uma com quantas pranchas estão
 * liberadas e a data da última liberação. Sem situação do projeto, sem progresso, sem contratos.
 */
export async function obrasParaLista(userId: string): Promise<ObraDaConta[]> {
  const conta = await prisma.contaObra.findUnique({
    where: { userId },
    select: {
      clienteId: true,
      cliente: { select: { ativo: true } },
      projetos: {
        select: {
          projetoId: true,
          projeto: {
            select: { id: true, codigo: true, nome: true, endereco: true, ano: true, sequencial: true, clienteId: true, cliente: { select: { ativo: true } } },
          },
        },
      },
    },
  });
  if (!conta) return [];
  const validas = obrasValidas(
    { clienteId: conta.clienteId, clienteAtivo: conta.cliente?.ativo ?? false },
    conta.projetos.map((i) => ({ projetoId: i.projetoId, clienteId: i.projeto.clienteId, clienteAtivo: i.projeto.cliente.ativo, projeto: i.projeto })),
  ).sort((a, b) => b.projeto.ano - a.projeto.ano || b.projeto.sequencial - a.projeto.sequencial);

  const obras: ObraDaConta[] = [];
  // Uma por vez: cada uma lê a pasta da obra, e uma conta de obra tem poucas obras.
  for (const { projeto: p } of validas) {
    obras.push({
      id: p.id,
      codigo: p.codigo,
      nome: p.nome,
      endereco: p.endereco,
      liberadas: contarArquivos(await conteudoDoAlcanceSemSelos(alcanceDaObra(p))),
      ultimaLiberacao: await ultimaLiberacao(p.id),
    });
  }
  return obras;
}

/** A obra para a página da conta de obra: o projeto e a pasta "Liberado para obra" (com os selos). `null` = 404. */
export async function obraParaVer(
  user: UsuarioDaSessao,
  projetoId: string,
): Promise<{ projeto: { id: string; codigo: string; nome: string; endereco: string | null }; conteudo: ConteudoPublico | null } | null> {
  const acesso = await acessoDaObraAoProjeto(user, projetoId);
  if (!acesso.ok) return null;
  const projeto = await prisma.projeto.findUnique({ where: { id: projetoId }, select: { id: true, codigo: true, nome: true, endereco: true } });
  if (!projeto) return null;
  return { projeto, conteudo: await conteudoDoAlcance(acesso.alcance) };
}

/** A prancha (PDF) para o visualizador da obra: só da pasta da obra e sem bloqueio de download. Sem pedidos. */
export async function pranchaDaObra(
  user: UsuarioDaSessao,
  projetoId: string,
  uploadId: string,
): Promise<{ nome: string; revisao: string; projetoNome: string } | null> {
  const acesso = await acessoDaObraAoProjeto(user, projetoId);
  if (!acesso.ok) return null;
  const liberado = await uploadLiberadoNoAlcance(acesso.alcance, uploadId);
  if (!liberado || !liberado.nomeArquivo.toLowerCase().endsWith(".pdf")) return null;
  if ((await uploadsComBloqueioDeDownload(prisma, [uploadId])).size > 0) return null;
  const up = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { nomeArquivo: true, revisao: { select: { numero: true } }, disciplina: { select: { projeto: { select: { nome: true } } } } },
  });
  if (!up) return null;
  return { nome: up.nomeArquivo, revisao: up.revisao ? rotuloRevisao(up.revisao.numero) : "", projetoNome: up.disciplina.projeto.nome };
}
