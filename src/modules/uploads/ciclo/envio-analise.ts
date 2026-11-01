import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/with-action";
import { interpretarNomeArquivo } from "@/modules/uploads/nomenclatura/interpretar";
import { carregarCatalogosNomenclaturaDaVersao, carregarExtensoesNomenclatura } from "@/modules/uploads/nomenclatura/queries";
import { montarVocabulario } from "@/modules/uploads/nomenclatura/vocabulario";
import { compilarPadrao } from "@/modules/uploads/nomenclatura/padrao";
import { resolverNomenclatura } from "@/modules/projetos/nomenclatura/queries";
import { gravarEventoNoTx } from "@/modules/uploads/historico/service";
import {
  descricaoDoCarimbo,
  descricaoVemDoCarimbo,
  mensagemDosProblemas,
  PRECISA_DESCRICAO_A_PARTIR_DE,
  problemasDoEnvio,
  type ArquivoParaEnvio,
  type DescricaoDoCarimbo,
} from "./envio-regras";
import { conferirCarimbo, MOTIVO_CARIMBO_ILEGIVEL, type LeituraCarimbo } from "./carimbo";
import type { RevisaoCarregada } from "./service";

/** O que o envio leu do carimbo ANTES da transação (ler PDF é lento; não segura a conexão). */
export type CarimboDoEnvio = { leitura: LeituraCarimbo; nomeArquivo: string } | null;

type Tx = Prisma.TransactionClient;

function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

/**
 * I/O das verificações do "Enviar para análise" (A4). Lê o nome pelo MESMO motor e o MESMO padrão que
 * o envio de arquivo usa (`api/uploads/route.ts`), os hashes da revisão e da anterior, e decide em
 * `envio-regras.ts`. Falha = `ActionError` com tudo o que corrigir; a transição não acontece.
 *
 * Carimbo (`carimbo.ts`, regra aprovada em 2026-10-09): código ou revisão divergente entra na lista de
 * problemas. Sem leitura possível, só depois de todo o resto estar certo, pede confirmação
 * (`MOTIVO_CARIMBO_ILEGIVEL`); confirmado, grava o evento "Envio sem conferência de carimbo" na transação.
 * `carimbo` nulo = revisão sem PDF (modelo IFC, planilha, memorial em Word): não há carimbo a conferir.
 *
 * Projeto em "Nomenclatura livre" (licitação segue o padrão do órgão): o nome e a revisão do carimbo não
 * bloqueiam; PDF, arquivo idêntico, descrição e o código do carimbo × nome do arquivo continuam valendo.
 *
 * Descrição (spec de 2026-10-21 §3): da R01 em diante a descrição é a do quadro de revisão do carimbo; linha
 * vazia ou genérica bloqueia. `contestarCarimbo` = o projetista disse que o carimbo foi lido errado: vale a
 * descrição digitada (mesma regra de genérico) e a revisão guarda o que o carimbo dizia: quem analisa vê o aviso
 * "Descrição contestada" na linha e no painel da revisão (não é notificação).
 */
export async function verificarEnvioParaAnalise(
  r: RevisaoCarregada,
  tx: Tx,
  opts: { carimbo: CarimboDoEnvio; confirmarSemCarimbo: boolean; contestarCarimbo: boolean; userId: string },
): Promise<Record<string, Prisma.InputJsonValue>> {
  const projetoId = r.documento.disciplina.projetoId;
  // Uma leitura por vez: a transação tem UMA conexão (sem Promise.all em `tx` — guard do projeto).
  const projeto = await tx.projeto.findUniqueOrThrow({ where: { id: projetoId }, select: { codigo: true, ano: true, sequencial: true } });
  const disciplina = await tx.disciplina.findUniqueOrThrow({ where: { id: r.documento.disciplinaId }, select: { disciplinaId: true } });
  const atuais = await tx.upload.findMany({
    where: { revisaoId: r.id, excluidoEm: null, substituidoPorId: null },
    select: { nomeArquivo: true, hashSha256: true },
    // Sem PDF (planilha, memorial em Word), o nome conferido é o do arquivo mais recente — sempre o mesmo.
    orderBy: { createdAt: "desc" },
  });
  const anteriorRev = await tx.documentoRevisao.findFirst({
    where: { documentoId: r.documentoId, numero: { lt: r.numero } },
    orderBy: { numero: "desc" },
    select: { uploads: { where: { excluidoEm: null, substituidoPorId: null }, select: { nomeArquivo: true, hashSha256: true } } },
  });
  // Catálogos e padrão: leituras de configuração, fora da transação (o motor é o do envio de arquivo).
  const nomenclatura = await resolverNomenclatura(projetoId);
  const catalogos = await carregarCatalogosNomenclaturaDaVersao(projetoId, nomenclatura.versao?.numero ?? 1);
  const extensoes = await carregarExtensoesNomenclatura();
  const vocabulario = montarVocabulario(catalogos, projetoId);

  const paraEnvio = (u: { nomeArquivo: string; hashSha256: string }): ArquivoParaEnvio => ({
    nome: u.nomeArquivo,
    ext: extensao(u.nomeArquivo),
    hash: u.hashSha256,
  });
  const arquivos = atuais.map(paraEnvio);
  const principal = atuais.find((u) => extensao(u.nomeArquivo) === "pdf") ?? atuais[0];
  const nome = interpretarNomeArquivo(principal?.nomeArquivo ?? r.documento.nomeArquivo, {
    projeto: { codigo: projeto.codigo, ano: projeto.ano, sequencial: projeto.sequencial },
    disciplinaCatalogoId: disciplina.disciplinaId,
    padrao: nomenclatura.padrao,
    vocabulario,
    extensoes,
    outrosPadroes: nomenclatura.outrosPadroes,
  });

  const descricaoLida: DescricaoDoCarimbo | null = opts.carimbo
    ? descricaoDoCarimbo({
        numero: r.numero,
        quadro: opts.carimbo.leitura.quadro,
        revisaoDoCarimbo: opts.carimbo.leitura.revisao,
        nomenclaturaLivre: !nomenclatura.exigir,
      })
    : null;
  // Só se contesta uma leitura que existe: sem quadro (ou sem PDF) a descrição já é a digitada.
  const contestada = opts.contestarCarimbo && descricaoLida !== null && descricaoLida.tipo !== "sem_quadro";

  const problemas = problemasDoEnvio({
    numero: r.numero,
    descricao: r.descricao,
    arquivos,
    anteriores: (anteriorRev?.uploads ?? []).map(paraEnvio),
    nome,
    camposDoPadrao: compilarPadrao(nomenclatura.padrao)?.campos ?? [],
    modelo: nomenclatura.padrao,
    codigoProjeto: projeto.codigo,
    nomenclaturaLivre: !nomenclatura.exigir,
    carimbo: descricaoLida,
    contestada,
  });
  const carimbo = opts.carimbo
    ? conferirCarimbo(opts.carimbo.leitura, { nomeArquivo: opts.carimbo.nomeArquivo, numero: r.numero, conferirRevisao: nomenclatura.exigir })
    : null;
  problemas.push(...(carimbo?.problemas ?? []));
  if (problemas.length > 0) throw new ActionError(mensagemDosProblemas(problemas));

  if (carimbo?.leituraFalhou) {
    if (!opts.confirmarSemCarimbo) throw new ActionError(MOTIVO_CARIMBO_ILEGIVEL);
    await gravarEventoNoTx(tx, {
      documentoId: r.documentoId,
      revisaoId: r.id,
      tipo: "envio_sem_carimbo",
      userId: opts.userId,
      detalhe: { motivo: "Carimbo ilegível; envio confirmado sem a conferência", revisao: r.numero },
    });
  }

  const descricao = await gravarOrigemDaDescricao(tx, r, descricaoLida, contestada);

  // Vai no evento de estado: qual versão interna foi para análise (e se o carimbo foi conferido).
  return {
    versao: r.ultimaVersao,
    carimbo: carimbo === null ? "sem_pdf" : carimbo.leituraFalhou ? "nao_conferido" : "conferido",
    ...(descricao ? { descricao } : {}),
  };
}

/**
 * Grava de onde veio a descrição (já verificada) e devolve o trecho do evento de estado. Lida do carimbo:
 * o texto do carimbo SUBSTITUI o digitado. Contestada: fica o digitado e o que o carimbo dizia (`null` =
 * linha vazia). R00 sem descrição: nada a registrar.
 */
async function gravarOrigemDaDescricao(
  tx: Tx,
  r: RevisaoCarregada,
  lida: DescricaoDoCarimbo | null,
  contestada: boolean,
): Promise<Prisma.InputJsonObject | null> {
  const digitada = r.descricao?.trim() || null;
  if (r.numero >= PRECISA_DESCRICAO_A_PARTIR_DE && lida?.tipo === "lida" && descricaoVemDoCarimbo(lida, contestada)) {
    await tx.documentoRevisao.update({ where: { id: r.id }, data: { descricao: lida.texto, descricaoOrigem: "carimbo", descricaoCarimbo: null } });
    r.descricao = lida.texto;
    return { origem: "carimbo", lido: lida.texto };
  }
  if (r.numero >= PRECISA_DESCRICAO_A_PARTIR_DE && contestada && lida) {
    const lido = lida.tipo === "lida" || lida.tipo === "generica" ? lida.texto : null;
    await tx.documentoRevisao.update({ where: { id: r.id }, data: { descricaoOrigem: "contestada", descricaoCarimbo: lido } });
    return { origem: "contestada", lido, digitado: digitada };
  }
  await tx.documentoRevisao.update({
    where: { id: r.id },
    data: { descricaoOrigem: digitada ? "digitada" : null, descricaoCarimbo: null },
  });
  return digitada ? { origem: "digitada", digitado: digitada } : null;
}
