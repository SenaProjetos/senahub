import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { copiarArquivo, removerArquivo } from "@/lib/storage";
import type { SessionUser } from "@/lib/session";
import { escopoProjeto } from "@/modules/projetos/queries";
import { registrarAtividade } from "@/modules/comercial/service";
import { enfileirarConversaoDwgDocumento } from "@/modules/dwg/service";
import { enfileirarConversaoDocumento } from "@/modules/coordenacao/service";
import { previaVinculo } from "./queries";
import { MOTIVO_CRIADO_PELO_ACEITE, extensaoDe, type ItemArquivoPrevia } from "./regras";

export type EntradaVinculo = {
  projetoId: string;
  negociacaoId: string;
  arquivos: { chave: string; exibirEmRecebidos: boolean }[];
  incluirResumo: boolean;
};

type Copiado = { caminho: string; tamanho: number; hashSha256: string; item: ItemArquivoPrevia; exibir: boolean };

/**
 * Linka um projeto a uma ficha Contratado: copia os arquivos escolhidos para a Geral do projeto (origem
 * `interno`) e preenche só o que está vazio. Ordem: (1) copia os arquivos, (2) UMA transação com todo o resto,
 * (3) se a transação falha, apaga as cópias — nunca sobra arquivo órfão. O original do funil não é tocado.
 */
export async function vincularProjetoNaFicha(user: SessionUser, input: EntradaVinculo) {
  const previa = await previaVinculo(user, input.projetoId, input.negociacaoId);
  if (previa.motivo) throw new ActionError(previa.motivo);

  const porChave = new Map(previa.arquivos.map((a) => [a.chave, a]));
  const vistos = new Set<string>();
  const escolhidos = input.arquivos.map((e) => {
    const item = porChave.get(e.chave);
    if (!item) throw new ActionError("A lista de arquivos mudou. Reabra o diálogo.");
    if (!item.existe) throw new ActionError(`O arquivo "${item.nome}" não foi encontrado no disco.`);
    if (vistos.has(e.chave)) throw new ActionError("Arquivo repetido na seleção.");
    vistos.add(e.chave);
    return { item, exibir: e.exibirEmRecebidos };
  });

  const copiados: Copiado[] = [];
  let criadas: { versaoId: string; nomeArquivo: string }[] = [];
  try {
    for (const { item, exibir } of escolhidos) {
      const rel = `documentos/${previa.projeto.clienteId}/${randomBytes(12).toString("hex")}${extensaoDe(item.nomeArquivo)}`;
      // Stream: anexo chega a 500 MB. Escrita que quebra no meio já apaga o parcial dentro de `copiarArquivo`.
      const salvo = await copiarArquivo(item.caminho, rel);
      copiados.push({ ...salvo, item, exibir });
    }

    criadas = await prisma.$transaction(async (tx) => {
      const { plano } = previa;
      const data: Prisma.ProjetoUncheckedUpdateManyInput = { negociacaoId: input.negociacaoId };
      // O `where` repete "estava vazio": se alguém preencheu o campo no meio do caminho, o count ≠ 1 e nada grava.
      const where: Prisma.ProjetoWhereInput = { id: input.projetoId, negociacaoId: null };
      if (plano.preenche.valorContrato != null) {
        data.valorContrato = plano.preenche.valorContrato;
        where.valorContrato = null;
      }
      if (plano.preenche.areaM2 != null) {
        data.areaM2 = plano.preenche.areaM2;
        where.areaM2 = null;
      }
      if (plano.preenche.tipoEmpreendimentoId != null) {
        data.tipoEmpreendimentoId = plano.preenche.tipoEmpreendimentoId;
        where.tipoEmpreendimentoId = null;
      }
      if (input.incluirResumo && previa.novaDescricao) {
        data.descricao = previa.novaDescricao;
        where.descricao = previa.projeto.descricao;
      }
      const r = await tx.projeto.updateMany({ where, data });
      if (r.count !== 1) {
        throw new ActionError("O projeto mudou enquanto você montava o link (ou já foi linkado). Reabra o diálogo e tente de novo.");
      }

      if (plano.coordenadorId) {
        await tx.projetoMembro.createMany({
          data: [{ projetoId: input.projetoId, userId: plano.coordenadorId, papel: "coordenador" }],
          skipDuplicates: true,
        });
      }

      const feitas: { versaoId: string; nomeArquivo: string }[] = [];
      for (const c of copiados) {
        const doc = await tx.documento.create({
          data: {
            clienteId: previa.projeto.clienteId,
            projetoId: input.projetoId,
            origem: "interno",
            canal: "interno",
            nome: c.item.nome,
            categoria: "Comercial",
            descricao: `Importado da ficha ${previa.ficha.titulo}`,
            exibirEmRecebidos: c.exibir,
            autorId: user.id,
            versoes: {
              create: {
                numero: 1,
                caminho: c.caminho,
                nomeArquivo: c.item.nomeArquivo,
                mime: c.item.mime,
                tamanho: c.tamanho,
                hashSha256: c.hashSha256,
                autorId: user.id,
              },
            },
          },
          select: { versoes: { select: { id: true } } },
        });
        feitas.push({ versaoId: doc.versoes[0].id, nomeArquivo: c.item.nomeArquivo });
      }

      // `registrarAtividade` engole o próprio erro; dentro da transação isso deixaria o Postgres abortado e o
      // commit poderia sair "ok" sem gravar nada. Falhou → lança, a transação volta e as cópias são apagadas.
      const registrou = await registrarAtividade(
        { evento: "PROJETO_LINKADO", codigo: previa.projeto.codigo, nome: previa.projeto.nome },
        { autorId: user.id, clienteId: previa.projeto.clienteId, negociacaoId: input.negociacaoId, tx },
      );
      if (!registrou) throw new Error("[vinculo] falha ao registrar o evento na timeline da ficha");
      return feitas;
    });
  } catch (erro) {
    for (const c of copiados) await removerArquivo(c.caminho).catch(() => undefined);
    throw erro;
  }

  // Fire-and-forget, como em `criarDocumento`: nunca derruba o link já gravado.
  for (const c of criadas) {
    if (/\.dwg$/i.test(c.nomeArquivo)) {
      void enfileirarConversaoDwgDocumento(c.versaoId).catch((e) => console.error("[vinculo] DWG:", e));
    }
    if (/\.ifc$/i.test(c.nomeArquivo)) {
      void enfileirarConversaoDocumento(c.versaoId).catch((e) => console.error("[vinculo] IFC:", e));
    }
  }

  return {
    arquivos: criadas.length,
    preencheu: Object.keys(previa.plano.preenche),
    coordenadorCriado: previa.plano.coordenadorId != null,
    descricaoGravada: input.incluirResumo && previa.novaDescricao != null,
  };
}

/** Só zera `negociacaoId`; o que foi importado fica (já é do projeto). Projeto do aceite não desfaz. */
export async function desvincularProjetoDaFicha(user: SessionUser, projetoId: string) {
  const p = await prisma.projeto.findFirst({
    where: { id: projetoId, AND: [escopoProjeto(user)] },
    select: { id: true, codigo: true, nome: true, clienteId: true, negociacaoId: true },
  });
  if (!p) throw new ActionError("Projeto não encontrado.");
  const negociacaoId = p.negociacaoId;
  if (!negociacaoId) throw new ActionError("Este projeto não está linkado a nenhuma ficha.");
  // Trava só o projeto que nasceu do aceite DESTA ficha: aí `Proposta.projetoId` e `Projeto.negociacaoId` andam
  // juntos. Proposta aceita sem negociação (histórica/avulsa) não conta — o link foi feito à mão e se desfaz.
  if (await prisma.proposta.findFirst({ where: { projetoId, negociacaoId }, select: { id: true } })) {
    throw new ActionError(MOTIVO_CRIADO_PELO_ACEITE);
  }
  await prisma.$transaction(async (tx) => {
    const r = await tx.projeto.updateMany({ where: { id: p.id, negociacaoId }, data: { negociacaoId: null } });
    if (r.count !== 1) throw new ActionError("O link mudou enquanto você olhava. Recarregue a página.");
    const registrou = await registrarAtividade(
      { evento: "PROJETO_DESLINKADO", codigo: p.codigo, nome: p.nome },
      { autorId: user.id, clienteId: p.clienteId, negociacaoId, tx },
    );
    if (!registrou) throw new Error("[vinculo] falha ao registrar o evento na timeline da ficha");
  });
  return { negociacaoId };
}
