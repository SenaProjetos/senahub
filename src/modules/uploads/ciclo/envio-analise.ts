import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/with-action";
import { interpretarNomeArquivo } from "@/modules/uploads/nomenclatura/interpretar";
import { carregarCatalogosNomenclaturaDaVersao, carregarExtensoesNomenclatura } from "@/modules/uploads/nomenclatura/queries";
import { montarVocabulario } from "@/modules/uploads/nomenclatura/vocabulario";
import { compilarPadrao } from "@/modules/uploads/nomenclatura/padrao";
import { resolverNomenclatura } from "@/modules/projetos/nomenclatura/queries";
import { gravarEventoNoTx } from "@/modules/uploads/historico/service";
import { mensagemDosProblemas, problemasDoEnvio, type ArquivoParaEnvio } from "./envio-regras";
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
 * `carimbo` nulo = revisão sem PDF (modelo IFC): não há carimbo a conferir.
 */
export async function verificarEnvioParaAnalise(
  r: RevisaoCarregada,
  tx: Tx,
  opts: { carimbo: CarimboDoEnvio; confirmarSemCarimbo: boolean; userId: string },
): Promise<Record<string, Prisma.InputJsonValue>> {
  const projetoId = r.documento.disciplina.projetoId;
  // Uma leitura por vez: a transação tem UMA conexão (sem Promise.all em `tx` — guard do projeto).
  const projeto = await tx.projeto.findUniqueOrThrow({ where: { id: projetoId }, select: { codigo: true, ano: true, sequencial: true } });
  const disciplina = await tx.disciplina.findUniqueOrThrow({ where: { id: r.documento.disciplinaId }, select: { disciplinaId: true } });
  const atuais = await tx.upload.findMany({
    where: { revisaoId: r.id, excluidoEm: null, substituidoPorId: null },
    select: { nomeArquivo: true, hashSha256: true },
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

  const problemas = problemasDoEnvio({
    numero: r.numero,
    descricao: r.descricao,
    arquivos,
    anteriores: (anteriorRev?.uploads ?? []).map(paraEnvio),
    nome,
    camposDoPadrao: compilarPadrao(nomenclatura.padrao)?.campos ?? [],
    modelo: nomenclatura.padrao,
    codigoProjeto: projeto.codigo,
  });
  const carimbo = opts.carimbo ? conferirCarimbo(opts.carimbo.leitura, { nomeArquivo: opts.carimbo.nomeArquivo, numero: r.numero }) : null;
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

  // Vai no evento de estado: qual versão interna foi para análise (e se o carimbo foi conferido).
  return { versao: r.ultimaVersao, carimbo: carimbo === null ? "sem_pdf" : carimbo.leituraFalhou ? "nao_conferido" : "conferido" };
}
