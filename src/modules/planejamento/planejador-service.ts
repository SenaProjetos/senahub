import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { notificarMuitos } from "@/lib/notificar";
import type { Dia } from "@/lib/calendario-trabalho";
import { paraDataUtc, paraDia, planoDoProjeto } from "./agenda";
import { moverRestricoes } from "./datas-linha";
import { agendar } from "./motor";
import { exigirPlanoEditavel } from "./trava-plano-service";
import { definirInicioDaLinha } from "./datas-linha-service";
import { ENCERRADA, linhaAceitaAtribuicao } from "./recursos";
import { nasceAutomatica } from "./horas-automaticas";
import { coordenadoresDoProjeto } from "@/modules/projetos/coordenacao-queries";
import { ocuparVagaDoPerfilNoTx, recalcularHorasAutomaticas } from "./horas-automaticas-service";
import { sincronizarCards, sincronizarPrincipal } from "./recursos-service";
import {
  MOTIVO_JA_COMECOU,
  MOTIVO_JA_NA_TAREFA,
  seguintesDaLinha,
  textoDoAvisoDeMudanca,
  type LinhaParaSeguintes,
} from "./planejador-acoes";

/**
 * Escritas do arrasto na tela por pessoa (pool de recursos, parte 4). Separadas da action para o smoke alcançar a regra
 * sem sessão. Quem chama confere a permissão e o escopo e reagenda (`aposMudarEap`); a trava do plano (data) é conferida
 * AQUI, dentro da transação e depois das validações — uma recusa não deixa a revisão marcada como alterada.
 */

/** As linhas e os vínculos de um projeto, no formato de `seguintesDaLinha`. */
async function seguintesDoProjeto(projetoId: string) {
  const [vinculos, linhas] = await Promise.all([
    prisma.eapDependencia.findMany({ where: { tarefa: { projetoId } }, select: { tarefaId: true, predecessoraId: true } }),
    prisma.eapTarefa.findMany({
      where: { projetoId },
      select: { id: true, nome: true, status: true, inicioReal: true, restricaoTipo: true, restricaoData: true },
    }),
  ]);
  const mapa = new Map<string, LinhaParaSeguintes & { restricaoTipo: string | null }>(
    linhas.map((l) => [
      l.id,
      {
        id: l.id,
        nome: l.nome,
        restricaoTipo: l.restricaoTipo,
        restricaoData: l.restricaoData ? paraDia(l.restricaoData) : null,
        // Concluída ou já começada tem as datas reais: o alfinete dela não anda.
        aberta: !ENCERRADA.has(l.status) && l.inicioReal == null,
      },
    ]),
  );
  return { vinculos, linhas: mapa };
}

/**
 * Muda o início planejado de uma linha pelo arrasto: a mesma regra do início digitado na tabela (o alfinete "não iniciar
 * antes de"; o motor respeita as predecessoras). `moverSeguintes`: as seguintes (pelos vínculos) que têm data fixada andam
 * os mesmos dias úteis — as outras já andam pelo vínculo. Tudo numa transação.
 */
export async function moverLinhaNoPlanejador(p: { id: string; inicio: Dia; moverSeguintes: boolean }): Promise<{
  projetoId: string;
  nome: string;
  movidas: number;
}> {
  const t = await prisma.eapTarefa.findUnique({ where: { id: p.id }, select: { projetoId: true, nome: true, status: true, inicioReal: true } });
  if (!t) throw new ActionError("Tarefa não encontrada.");
  if (t.inicioReal != null || ENCERRADA.has(t.status)) throw new ActionError(MOTIVO_JA_COMECOU);

  let novas: { id: string; restricaoData: Dia }[] = [];
  if (p.moverSeguintes) {
    const plano = await planoDoProjeto(t.projetoId);
    const de = plano?.resultado.linhas.get(p.id)?.inicio;
    if (!plano || !de) throw new ActionError("Não foi possível calcular o início desta tarefa. Reagende o projeto e tente de novo.");
    // As seguintes andam o que a tarefa ANDA DE FATO, não o que foi pedido: a predecessora ou o dia não útil podem segurar
    // o início. O motor roda em memória com o novo alfinete (e a mesma Data de Status) para saber onde ela cai.
    const simulado = agendar(
      plano.entrada.map((l) => (l.id === p.id ? { ...l, restricaoTipo: "iniciar_nao_antes_de", restricaoData: p.inicio } : l)),
      plano.inicioProjeto,
      plano.calendario,
      { dataStatus: plano.dataStatus },
    );
    const para = simulado.linhas.get(p.id)?.inicio ?? p.inicio;
    const { vinculos, linhas } = await seguintesDoProjeto(t.projetoId);
    const { fixadas } = seguintesDaLinha(p.id, vinculos, linhas);
    novas = moverRestricoes(
      fixadas.map((id) => {
        const l = linhas.get(id)!;
        return { id, restricaoTipo: l.restricaoTipo, restricaoData: l.restricaoData };
      }),
      de,
      para,
      plano.calendario,
    );
  }

  await prisma.$transaction(async (tx) => {
    // Valida a linha (agrupamento recusa) e só então trava/marca o plano: tudo na mesma transação.
    await definirInicioDaLinha({ id: p.id, data: p.inicio }, tx);
    await exigirPlanoEditavel(t.projetoId, tx);
    for (const n of novas) await tx.eapTarefa.update({ where: { id: n.id }, data: { restricaoData: paraDataUtc(n.restricaoData) } });
  });
  return { projetoId: t.projetoId, nome: t.nome, movidas: novas.length };
}

/**
 * Troca a pessoa de uma linha (`de` → `para`) ou atribui a linha sem ninguém (`de` nulo) pelo arrasto. Livre também no
 * aprovado (pessoas e horas seguem livres na trava). As horas vão com a atribuição: a automática é recalculada pelo peso da
 * pessoa nova; a digitada fica como estava. Atribuição nova nasce automática, como na EAP.
 */
export async function trocarPessoaNoPlanejador(p: { tarefaId: string; de: string | null; para: string; autorId: string }): Promise<{
  projetoId: string;
  nome: string;
}> {
  const linha = await prisma.eapTarefa.findUnique({
    where: { id: p.tarefaId },
    select: { projetoId: true, nome: true, tipoEap: true, _count: { select: { filhas: true } } },
  });
  if (!linha) throw new ActionError("Tarefa não encontrada.");
  const aceita = linhaAceitaAtribuicao({ tipoEap: linha.tipoEap, ehResumo: linha._count.filhas > 0 });
  if (!aceita.ok) throw new ActionError(aceita.motivo);
  const pessoa = await prisma.user.findUnique({ where: { id: p.para }, select: { ativo: true, tipo: true } });
  if (!pessoa?.ativo || pessoa.tipo !== "interno") throw new ActionError("Escolha uma pessoa ativa da equipe.");

  try {
    await prisma.$transaction(async (tx) => {
    // Uma troca por vez na mesma tarefa: dois arrastos simultâneos para "sem ninguém" não deixam dois responsáveis.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"troca-pessoa:" + p.tarefaId}))`;
    const ja = await tx.eapAtribuicao.findFirst({ where: { tarefaId: p.tarefaId, userId: p.para }, select: { id: true } });
    if (ja) throw new ActionError(MOTIVO_JA_NA_TAREFA);
    if (p.de) {
      const r = await tx.eapAtribuicao.updateMany({ where: { tarefaId: p.tarefaId, userId: p.de }, data: { userId: p.para } });
      if (r.count === 0) throw new ActionError("Esta pessoa já não está nesta tarefa. Atualize a tela.");
    } else {
      // A linha pode ter ganhado alguém enquanto a tela estava aberta: aí não é mais "sem ninguém".
      const alguem = await tx.eapAtribuicao.findFirst({ where: { tarefaId: p.tarefaId, userId: { not: null } }, select: { id: true } });
      if (alguem) throw new ActionError("A tarefa já tem responsável. Atualize a tela.");
      // A linha com "(perfil) Projetista": a pessoa preenche a vaga (com as horas dela), não divide as horas com o perfil.
      const vaga = await ocuparVagaDoPerfilNoTx(tx, { tarefaId: p.tarefaId, userId: p.para, papel: null, horasDigitadas: 0 });
      if (!vaga) {
        await tx.eapAtribuicao.create({
          data: {
            tarefaId: p.tarefaId,
            userId: p.para,
            papel: "pro",
            horasPrevistas: 0,
            horasAutomaticas: nasceAutomatica({ userId: p.para, papel: "pro", horas: 0 }),
          },
        });
      }
    }
    await recalcularHorasAutomaticas(tx, linha.projetoId);
    await sincronizarPrincipal(tx, p.tarefaId);
    await sincronizarCards(tx, linha.projetoId, p.autorId);
    });
  } catch (e) {
    // A mesma pessoa e papel na tarefa (índice único): outra troca chegou antes.
    if ((e as { code?: string } | null)?.code === "P2002") throw new ActionError(MOTIVO_JA_NA_TAREFA);
    throw e;
  }
  return { projetoId: linha.projetoId, nome: linha.nome };
}

type Enviar = typeof notificarMuitos;
type Mudanca = { tipo: "data"; tarefa: string; inicio: Dia } | { tipo: "pessoa"; tarefa: string; de: string | null; para: string };

/**
 * Decisão 4 do Ryan: quem NÃO coordena o projeto (Gerência, administrativo) arrastou uma barra ou trocou a pessoa → a
 * coordenação do projeto recebe aviso. Coordenador que mexe no próprio projeto não avisa ninguém; quem fez não recebe.
 * Devolve quantas pessoas estavam na audiência. Nunca lança: a mudança já foi gravada.
 */
export async function avisarCoordenacaoDaMudanca(
  p: { projetoId: string; autorId: string; mudanca: Mudanca },
  enviar: Enviar = notificarMuitos,
): Promise<number> {
  try {
    const ids = await coordenadoresDoProjeto(p.projetoId);
    if (ids.length === 0 || ids.includes(p.autorId)) return 0;
    const [projeto, autor] = [
      await prisma.projeto.findUnique({ where: { id: p.projetoId }, select: { codigo: true } }),
      await prisma.user.findUnique({ where: { id: p.autorId }, select: { name: true } }),
    ];
    const nomes = p.mudanca.tipo === "pessoa" ? await prisma.user.findMany({ where: { id: { in: [p.mudanca.de, p.mudanca.para].filter((x): x is string => !!x) } }, select: { id: true, name: true } }) : [];
    const nome = (id: string | null) => (id ? (nomes.find((u) => u.id === id)?.name ?? "outra pessoa") : null);
    const base = { autor: autor?.name ?? "Alguém", projeto: projeto?.codigo ?? "do projeto", tarefa: p.mudanca.tarefa };
    const texto =
      p.mudanca.tipo === "data"
        ? textoDoAvisoDeMudanca({ tipo: "data", ...base, inicio: p.mudanca.inicio })
        : textoDoAvisoDeMudanca({ tipo: "pessoa", ...base, de: nome(p.mudanca.de), para: nome(p.mudanca.para) ?? "outra pessoa" });
    await enviar(ids, { ...texto, href: `/planejamento/${p.projetoId}`, tag: `alteracao-cronograma-${p.projetoId}` }, { categoria: "alteracao_cronograma" });
    return ids.length;
  } catch (e) {
    console.error("[planejador] falha ao avisar a coordenação", p.projetoId, e);
    return 0;
  }
}
