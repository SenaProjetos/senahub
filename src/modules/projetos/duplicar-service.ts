import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { proximoCodigoProjeto } from "@/modules/projetos/numbering";
import { usaEstruturaCustom } from "@/modules/projetos/estrutura-tipo";
import { semearPastasTemplate } from "@/modules/projetos/pastas/seed";
import type { duplicarProjetoSchema } from "@/modules/projetos/schemas";
import { clonarEap } from "@/modules/projetos/duplicar-eap";
import { herdarResponsaveisNoProjeto } from "@/modules/planejamento/recursos-service";
import { paraDataUtc, reagendarProjeto } from "@/modules/planejamento/agenda";
import { reservarIdsParaLinhas } from "@/modules/planejamento/id-corporativo";

/**
 * Duplica um projeto: novo código AAXXXX, nome + " (cópia)", mesmo cliente/tipo e disciplinas
 * (catálogo/nome/ordem/valor/prazo e a estrutura de etapas por fase). Copia responsáveis, membros, EAP e
 * composição de preço conforme as flags. Uploads, revisões e pagamentos nunca são copiados.
 *
 * A EAP copiada é a estrutura do plano (ver `duplicar-eap.ts`), num cronograma novo em RASCUNHO. Com
 * `inicioCronograma` o motor calcula as datas a partir dele; sem, parte do menor início copiado.
 * Separado da action para o smoke alcançar a regra sem sessão.
 */
export async function duplicarProjetoNoBanco(
  input: z.infer<typeof duplicarProjetoSchema>,
  autorId: string,
): Promise<{ id: string; codigo: string }> {
  const origem = await prisma.projeto.findUnique({
    where: { id: input.id },
    select: {
      tipo: true,
      nome: true,
      clienteId: true,
      descricao: true,
      areaM2: true,
      endereco: true,
      prazoContrato: true,
      prazoPlanejado: true,
      valorContrato: true,
      membros: { select: { userId: true } },
      disciplinas: {
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          disciplinaId: true,
          disciplinaTextoLegado: true,
          valor: true,
          prazo: true,
          ordem: true,
          responsaveis: { select: { userId: true } },
          etapas: {
            orderBy: { ordem: "asc" },
            select: { etapaId: true, percentual: true, ordem: true, etapa: { select: { projetoId: true } } },
          },
        },
      },
      eapTarefas: {
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          parentId: true,
          disciplinaId: true,
          nome: true,
          ordem: true,
          tipoEap: true,
          duracaoDias: true,
          prioridade: true,
          etapaId: true,
          tipoAtividadeId: true,
          sistemaId: true,
          localizacaoId: true,
          origemId: true,
          inicioPrevisto: true,
          fimPrevisto: true,
          predecessoras: { select: { predecessoraId: true, tipo: true, lagDias: true } },
        },
      },
      composicaoPreco: {
        select: {
          observacao: true,
          itens: {
            orderBy: { ordem: "asc" },
            select: { descricao: true, quantidade: true, valorUnitario: true, ordem: true },
          },
        },
      },
    },
  });
  if (!origem) throw new ActionError("Projeto não encontrado.");

  const copiouEap = input.copiarEap && origem.eapTarefas.length > 0;

  const novo = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    const criado = await tx.projeto.create({
      data: {
        ano,
        sequencial,
        codigo,
        tipo: origem.tipo,
        nome: `${origem.nome} (cópia)`,
        clienteId: origem.clienteId,
        descricao: origem.descricao,
        areaM2: origem.areaM2,
        endereco: origem.endereco,
        prazoContrato: origem.prazoContrato,
        prazoPlanejado: origem.prazoPlanejado,
        valorContrato: origem.valorContrato,
        disciplinas: {
          create: origem.disciplinas.map((d) => ({
            disciplinaId: d.disciplinaId,
            disciplinaTextoLegado: d.disciplinaTextoLegado,
            valor: d.valor,
            prazo: d.prazo,
            ordem: d.ordem,
          })),
        },
      },
    });

    // Mapa oldDisciplinaId → newDisciplinaId (por ordem, que é preservada).
    const novasDisciplinas = await tx.disciplina.findMany({
      where: { projetoId: criado.id },
      orderBy: { ordem: "asc" },
      select: { id: true, ordem: true },
    });
    const dMap = new Map<string, string>();
    for (const orig of origem.disciplinas) {
      const nova = novasDisciplinas.find((d) => d.ordem === orig.ordem);
      if (nova) dMap.set(orig.id, nova.id);
    }

    // Etapas por fase: a estrutura (fase, %, ordem) vem com a disciplina; prazo, situação e pagamento
    // não — são do projeto de origem. Só fase do catálogo global (a do projeto de origem não vale aqui).
    const etapasNovas = origem.disciplinas.flatMap((d) => {
      const disciplinaId = dMap.get(d.id);
      if (!disciplinaId) return [];
      return d.etapas
        .filter((e) => e.etapa.projetoId == null)
        .map((e) => ({ disciplinaId, etapaId: e.etapaId, percentual: e.percentual, ordem: e.ordem }));
    });
    if (etapasNovas.length > 0) await tx.disciplinaEtapa.createMany({ data: etapasNovas });
    const fasesDaDisciplina = new Map<string, Set<string>>();
    for (const e of etapasNovas) {
      fasesDaDisciplina.set(e.disciplinaId, (fasesDaDisciplina.get(e.disciplinaId) ?? new Set()).add(e.etapaId));
    }

    // Duplicar é criar um projeto novo: se o tipo usa árvore-template, semeia em todas
    // as disciplinas do clone (mesma regra de "só projetos novos" da criação normal).
    if (usaEstruturaCustom(origem.tipo)) {
      for (const nova of novasDisciplinas) {
        await semearPastasTemplate(tx, nova.id, origem.tipo);
      }
    }

    if (input.copiarResponsaveis) {
      const rows: { disciplinaId: string; userId: string }[] = [];
      for (const d of origem.disciplinas) {
        const newDId = dMap.get(d.id);
        if (!newDId) continue;
        for (const r of d.responsaveis) rows.push({ disciplinaId: newDId, userId: r.userId });
      }
      if (rows.length > 0) await tx.disciplinaResponsavel.createMany({ data: rows, skipDuplicates: true });
    }

    if (input.copiarMembros && origem.membros.length > 0) {
      await tx.projetoMembro.createMany({
        data: origem.membros.map((m) => ({ projetoId: criado.id, userId: m.userId })),
        skipDuplicates: true,
      });
    }

    if (copiouEap) {
      const classificadores = await tx.eapCatalogo.findMany({
        where: {
          projetoId: null,
          id: {
            in: origem.eapTarefas.flatMap((t) =>
              [t.tipoAtividadeId, t.sistemaId, t.localizacaoId, t.origemId].filter((id): id is string => !!id),
            ),
          },
        },
        select: { id: true },
      });

      const idsCorporativos = await reservarIdsParaLinhas(tx, origem.eapTarefas.map((t) => t.tipoEap));
      const novaLinha = new Map(
        origem.eapTarefas.map((t, i) => [t.id, { id: randomUUID(), idCorporativo: idsCorporativos[i] }] as const),
      );
      const { linhas, dependencias } = clonarEap(origem.eapTarefas, {
        projetoId: criado.id,
        disciplinaNova: dMap,
        fasesDaDisciplina,
        novaLinha,
        catalogosGlobais: new Set(classificadores.map((c) => c.id)),
      });
      await tx.eapTarefa.createMany({ data: linhas });
      if (dependencias.length > 0) await tx.eapDependencia.createMany({ data: dependencias, skipDuplicates: true });
      // Cronograma novo em RASCUNHO (D27): nada vale até alguém revisar e aprovar.
      await tx.cronogramaProjeto.create({
        data: { projetoId: criado.id, inicioProjeto: input.inicioCronograma ? paraDataUtc(input.inicioCronograma) : null },
      });
      // D22: as linhas copiadas recebem os responsáveis das disciplinas DO CLONE (as
      // atribuições da origem não vêm junto — a equipe do projeto novo é outra decisão).
      await herdarResponsaveisNoProjeto(tx, criado.id);
    }

    if (input.copiarComposicao && origem.composicaoPreco) {
      await tx.projetoComposicaoPreco.create({
        data: {
          projetoId: criado.id,
          observacao: origem.composicaoPreco.observacao,
          itens: {
            create: origem.composicaoPreco.itens.map((item) => ({
              descricao: item.descricao,
              quantidade: item.quantidade,
              valorUnitario: item.valorUnitario,
              ordem: item.ordem,
            })),
          },
        },
      });
    }

    return criado;
  });

  if (copiouEap) {
    // Já gravado: se o motor falhar, o projeto está duplicado e "Reagendar" na tela refaz a conta.
    try {
      await reagendarProjeto(novo.id, autorId);
    } catch (e) {
      console.error("[duplicar-projeto] falha ao reagendar o cronograma do clone", novo.id, e);
    }
  }

  return { id: novo.id, codigo: novo.codigo };
}
