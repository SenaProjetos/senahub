"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { normalizarSigla } from "./planilha";
import { operacoesEscolhidas, planejarImportacao } from "./importacao";
import { conferirVoltas, operacoesComId, planejarTransferencia, resolverLeva, type OperacaoComId } from "./versao";
import { carregarCatalogoSnap, numerosDasVersoes } from "./queries";
import { executarOperacoes } from "./service";

const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;

function rev(versao: number) {
  revalidatePath(`/configuracoes/nomenclatura/${versao}`);
  revalidatePath("/configuracoes/nomenclatura", "layout");
  revalidatePath("/configuracoes/disciplinas");
  revalidatePath("/configuracoes/lista-mestre");
}

async function garantirVersao(versao: number) {
  const v = await prisma.nomenclaturaVersao.findUnique({ where: { numero: versao }, select: { id: true } });
  if (!v) throw new ActionError(`A v${versao} não existe.`);
}

/** Muitas escritas pequenas (uma planilha inteira): transação com folga, como as outras importações. */
const OPCOES_TX = { maxWait: 15000, timeout: 120000 };

const linhaPlanilhaSchema = z.object({
  linha: z.number().int().min(1),
  tipo: z.enum(["card", "sub"]),
  nome: z.string().trim().min(1).max(120),
  sigla: z.string().trim().max(6).nullable(),
  siglaLida: z.string().max(20).nullable(),
  grupo: z.string().max(120).nullable(),
  paiLinha: z.number().int().nullable(),
});

/**
 * Aplica a planilha lida (`/api/configuracoes/nomenclatura/catalogo-planilha`) à versão. O plano é
 * RECALCULADO aqui contra o banco de agora — o cliente manda só as linhas lidas e o que desmarcou —,
 * validado na simulação e gravado numa transação: ou entra tudo, ou nada.
 */
export const aplicarImportacaoCatalogo = defineAction(
  {
    ...base,
    acao: "importar-catalogo-versao",
    entidade: "NomenclaturaVersao",
    schema: z.object({
      versao: z.number().int().min(1),
      linhas: z.array(linhaPlanilhaSchema).min(1).max(2000),
      desmarcados: z.array(z.string().max(200)).max(4000),
    }),
  },
  async (i) => {
    await garantirVersao(i.versao);
    const linhas = i.linhas.map((l) => ({ ...l, sigla: l.sigla ? normalizarSigla(l.sigla) : null }));
    const [snap, versoes] = await Promise.all([carregarCatalogoSnap(), numerosDasVersoes()]);
    const desmarcados = new Set(i.desmarcados);
    const plano = planejarImportacao(snap, i.versao, { linhas, avisos: [] }, { desmarcados, versoesExistentes: versoes });
    if (plano.erros.length > 0) {
      throw new ActionError(plano.erros.length === 1 ? plano.erros[0] : `${plano.erros[0]} (e mais ${plano.erros.length - 1} problema(s))`);
    }
    const ops = operacoesEscolhidas(plano.itens, desmarcados);
    if (ops.length === 0) throw new ActionError("Nada a aplicar: a versão já está como a planilha.");
    await prisma.$transaction((tx) => executarOperacoes(tx, i.versao, ops), OPCOES_TX);
    rev(i.versao);
    const conta = (tipo: OperacaoComId["tipo"]) => ops.filter((o) => o.tipo === tipo).length;
    return {
      aplicadas: ops.length,
      cardsNovos: conta("card-novo"),
      subsNovas: conta("sub-nova"),
      siglasNovas: conta("sigla-nova"),
      saem: conta("sai"),
      voltam: conta("entra"),
      siglasEncerradas: conta("encerrar-sigla"),
    };
  },
);

const siglaSchema = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const n = normalizarSigla(s);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Sigla de 2 a 6 letras ou números." });
      return z.NEVER;
    }
    return n;
  });

const alvoSchema = z.object({ tipo: z.enum(["disciplina", "subdisciplina", "prancha"]), id: z.string().min(1) });
const nomeSchema = z.string().trim().min(1, "Informe o nome.").max(120);

// Sigla que já era do item (pode ser legada, fora do formato atual) — `conferirVoltas` confere contra o histórico.
const siglaVoltaSchema = z.object({ sigla: z.string().trim().min(1).max(20), oficial: z.boolean() });

const operacaoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("card-novo"), nome: nomeSchema, sigla: siglaSchema.nullable() }),
  z.object({ tipo: z.literal("sub-nova"), cardId: z.string().min(1), nome: nomeSchema, sigla: siglaSchema.nullable() }),
  z.object({ tipo: z.literal("item-novo"), categoria: z.enum(["fase", "tipo"]), nome: nomeSchema, sigla: siglaSchema }),
  z.object({ tipo: z.literal("sigla-nova"), alvo: alvoSchema, sigla: siglaSchema }),
  z.object({ tipo: z.literal("sinonimo-novo"), alvo: alvoSchema, sigla: siglaSchema }),
  // A sigla aqui só identifica a linha para a auditoria — pode ser legada (fora do formato atual).
  z.object({ tipo: z.literal("encerrar-sigla"), alvo: alvoSchema, linhaId: z.string().min(1), sigla: z.string().trim().min(1).max(20) }),
  z.object({ tipo: z.literal("sai"), alvo: alvoSchema }),
  z.object({ tipo: z.literal("entra"), alvo: alvoSchema, siglas: z.array(siglaVoltaSchema).max(20).optional() }),
]);

/**
 * Edições avulsas na tabela da versão (adicionar, siglas e sinônimos, tirar, voltar), numa
 * transação. Se uma sigla já tem dono na versão, a action só a tira do outro dono (a partir da
 * versão — a regra da importação, "a planilha manda") quando a transferência veio confirmada em
 * `transferencias` (ids de `plano.encerrar`, que a tela mostrou); senão recusa dizendo quem é e como.
 * O plano é recalculado contra o banco de agora (a tela pode estar velha). Os ids confirmados entram
 * na auditoria junto com a entrada — dá para saber depois de quem a sigla saiu.
 */
export const alterarCatalogoNaVersao = defineAction(
  {
    ...base,
    acao: "alterar-catalogo-versao",
    entidade: "NomenclaturaVersao",
    schema: z.object({
      versao: z.number().int().min(1),
      operacoes: z.array(operacaoSchema).min(1).max(50),
      transferencias: z.array(z.string().min(1).max(300)).max(50).default([]),
    }),
  },
  async (i) => {
    await garantirVersao(i.versao);
    const ops = operacoesComId(i.operacoes);
    const [snap, versoes] = await Promise.all([carregarCatalogoSnap(), numerosDasVersoes()]);
    const erroVolta = conferirVoltas(snap, i.versao, ops);
    if (erroVolta) throw new ActionError(erroVolta);
    const plano = planejarTransferencia(snap, i.versao, ops, versoes);
    const leva = resolverLeva(plano, ops, i.transferencias);
    if (!leva.ok) throw new ActionError(leva.erro);
    await prisma.$transaction((tx) => executarOperacoes(tx, i.versao, leva.ops), OPCOES_TX);
    rev(i.versao);
    return { ok: true, transferidas: plano.conflitos.length };
  },
);
