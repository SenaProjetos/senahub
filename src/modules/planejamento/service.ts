import "server-only";

import { prisma } from "@/lib/prisma";
import type { Dia } from "@/lib/calendario-trabalho";
import { paraDataUtc, paraDia, planoDoProjeto } from "./agenda";
import {
  contarPorSeveridade,
  verificarCronograma,
  type Achado,
  type LinhaQualidade,
} from "./qualidade";
import { calcularSaude, principalCausa, type ResultadoSaude } from "./saude";
import { ehEtapaDeTerceiro, pessoasSemHoras } from "./recursos";
import { sincronizarCards } from "./recursos-service";
import { custosDoProjeto } from "./custo-service";
import { sincronizarPrevisoesDoProjeto } from "@/modules/juridico/contrato/previsao-service";

/**
 * Regras de negócio do cronograma, compartilhadas por `actions.ts` e pelos jobs.
 *
 * Fica separado das actions porque o job de foto semanal e o de lembrete de Data de Status
 * precisam da mesma lógica sem passar por sessão nem por HTTP — é a mesma razão que todo
 * `service.ts` do repo existe.
 */

/**
 * `temResponsavel` lê as ATRIBUIÇÕES da linha (F5): tem pessoa, tem responsável. Perfil não
 * conta — "Projetista Elétrico" sem ninguém escalado é vaga, não responsável (Doc 02 §30).
 *
 * Até a F5 a linha herdava a leitura da disciplina. A herança agora é um DADO gravado
 * (D22 — o responsável da disciplina desce como atribuição), e o script
 * `herdar-responsaveis-eap` faz isso para as linhas que já existiam. Sem ele rodado no
 * deploy, toda linha antiga apareceria sem responsável.
 */
export async function avaliarQualidade(projetoId: string): Promise<{
  achados: Achado[];
  saude: ResultadoSaude | null;
  totalLinhas: number;
  dataStatus: Dia | null;
} | null> {
  const plano = await planoDoProjeto(projetoId);
  if (!plano) return null;

  const [tarefas, cronograma] = await Promise.all([
    prisma.eapTarefa.findMany({
      where: { projetoId },
      select: {
        id: true,
        nome: true,
        tipoEap: true,
        duracaoDias: true,
        status: true,
        progresso: true,
        inicioPrevisto: true,
        fimPrevisto: true,
        inicioReal: true,
        fimReal: true,
        restricaoTipo: true,
        origem: { select: { sigla: true } },
        atribuicoes: { select: { userId: true, horasPrevistas: true } },
        _count: { select: { predecessoras: true, sucessoras: true } },
      },
    }),
    prisma.cronogramaProjeto.findUnique({
      where: { projetoId },
      select: { dataStatus: true },
    }),
  ]);

  const linhas: LinhaQualidade[] = tarefas.map((t) => {
    const agendada = plano.resultado.linhas.get(t.id);
    return {
      id: t.id,
      nome: t.nome,
      tipoEap: t.tipoEap,
      duracaoDias: Number(t.duracaoDias),
      status: t.status,
      progresso: agendada?.progresso ?? t.progresso,
      // Datas do MOTOR, não do banco: a qualidade julga o plano vigente, e o banco pode
      // estar desatualizado enquanto ninguém clicou em reagendar.
      inicioPrevisto: agendada?.inicio ?? paraDia(t.inicioPrevisto),
      fimPrevisto: agendada?.fim ?? paraDia(t.fimPrevisto),
      inicioReal: t.inicioReal ? paraDia(t.inicioReal) : null,
      fimReal: t.fimReal ? paraDia(t.fimReal) : null,
      temResponsavel: t.atribuicoes.some((a) => a.userId != null),
      pessoasSemHoras: pessoasSemHoras(
        {
          tipoEap: t.tipoEap,
          ehResumo: agendada?.ehResumo ?? false,
          duracaoDias: Number(t.duracaoDias),
          deTerceiro: ehEtapaDeTerceiro(t.origem?.sigla),
          status: t.status,
        },
        t.atribuicoes.map((a) => ({ userId: a.userId, horas: Number(a.horasPrevistas) })),
      ),
      temAtribuicao: t.atribuicoes.length > 0,
      temRestricao: t.restricaoTipo != null,
      temPredecessora: t._count.predecessoras > 0,
      temSucessora: t._count.sucessoras > 0,
      ehResumo: agendada?.ehResumo ?? false,
      critica: agendada?.critica ?? false,
    };
  });

  const dataStatus = cronograma?.dataStatus ? paraDia(cronograma.dataStatus) : null;
  const achados = verificarCronograma({
    linhas,
    dataStatus,
    ciclos: plano.resultado.ciclosIgnorados,
  });

  return { achados, saude: calcularSaude(achados, linhas.length), totalLinhas: linhas.length, dataStatus };
}

export type ResultadoAprovacao = {
  baselineNumero: number;
  linhas: number;
};

/**
 * Congela a linha de base e libera o cronograma.
 *
 * `BL-00` é a do aprovar; cada replanejamento cria a próxima. A baseline NUNCA é
 * sobrescrita (Doc 03 §20) — é o que responde, no fim do projeto, "o prazo estourou 40
 * dias e 25 entraram naquele replanejamento de março, por atraso do cliente".
 *
 * A foto copia nome e código em vez de referenciar: excluir a tarefa depois não pode
 * apagar a prova do que foi combinado.
 */
export async function congelarBaseline(
  projetoId: string,
  autorId: string | null,
  opcoes: { motivo?: string | null; observacao?: string | null } = {},
): Promise<ResultadoAprovacao> {
  const plano = await planoDoProjeto(projetoId);
  if (!plano) throw new Error("Projeto sem EAP: não há o que congelar.");

  const [tarefas, ultima] = await Promise.all([
    prisma.eapTarefa.findMany({
      where: { projetoId },
      select: {
        id: true,
        parentId: true,
        nome: true,
        codigoEap: true,
        progresso: true,
        atribuicoes: { select: { userId: true, horasPrevistas: true } },
      },
    }),
    prisma.eapBaseline.findFirst({
      where: { projetoId },
      orderBy: { numero: "desc" },
      select: { numero: true },
    }),
  ]);

  const numero = ultima ? ultima.numero + 1 : 0;
  // F7.1: o custo previsto congela junto (VP da F8). Taxa que mudar depois não mexe no combinado.
  const { porLinha: custos } = await custosDoProjeto(plano, tarefas);

  await prisma.$transaction(async (tx) => {
    const baseline = await tx.eapBaseline.create({
      data: {
        projetoId,
        numero,
        motivo: opcoes.motivo ?? null,
        observacao: opcoes.observacao ?? null,
        autorId,
      },
      select: { id: true },
    });

    await tx.eapBaselineLinha.createMany({
      data: tarefas.flatMap((t) => {
        const a = plano.resultado.linhas.get(t.id);
        if (!a) return [];
        return [
          {
            baselineId: baseline.id,
            tarefaId: t.id,
            nome: t.nome,
            codigoEap: t.codigoEap,
            inicio: paraDataUtc(a.inicio),
            fim: paraDataUtc(a.fim),
            duracaoDias: a.duracaoDias,
            // Horas combinadas (D23): o "trabalho da linha de base" do MS Project, que o Valor
            // Agregado (F8) lê. `null` quando a linha não estava estimada ao congelar.
            trabalhoHoras: a.trabalhoHoras,
            custoPrevisto: custos.get(t.id)?.custo ?? null,
            avancoPlanejado: a.progresso,
            // F8: o Valor Agregado soma só as folhas DESTA baseline (a árvore de hoje pode ser outra).
            resumo: a.ehResumo,
          },
        ];
      }),
    });

    // Cache da baseline ATIVA nas colunas antigas, para as telas atuais não quebrarem.
    // Escrita só aqui, nunca direto — é o que impede virar a segunda fonte de verdade.
    // Some na troca do caminho de leitura (ver nota no schema).
    for (const t of tarefas) {
      const a = plano.resultado.linhas.get(t.id);
      if (!a) continue;
      await tx.eapTarefa.update({
        where: { id: t.id },
        data: { inicioBaseline: paraDataUtc(a.inicio), fimBaseline: paraDataUtc(a.fim) },
      });
    }
  });

  return { baselineNumero: numero, linhas: tarefas.length };
}

/**
 * Aprova o cronograma: valida, congela `BL-00` e libera.
 *
 * Recusa quando há ERRO de qualidade. Não é rigor gratuito — aprovar significa que aquelas
 * datas viram o combinado com o cliente, e congelar um cronograma com marco de duração 3
 * ou dependência circular grava a inconsistência como se fosse compromisso.
 */
export async function aprovarCronograma(
  projetoId: string,
  autorId: string,
): Promise<ResultadoAprovacao & { avisos: number; cardsCriados: number; alocacoesSubstituidas: number }> {
  const cronograma = await prisma.cronogramaProjeto.findUnique({
    where: { projetoId },
    select: { aprovado: true, inicioProjeto: true },
  });
  if (cronograma?.aprovado) throw new Error("Este cronograma já está aprovado.");
  if (!cronograma?.inicioProjeto) {
    throw new Error("Defina a data de início do projeto antes de aprovar o cronograma.");
  }

  const avaliacao = await avaliarQualidade(projetoId);
  if (!avaliacao) throw new Error("Projeto sem EAP: não há o que aprovar.");
  const { erro, alerta } = contarPorSeveridade(avaliacao.achados);
  if (erro > 0) {
    throw new Error(
      `Corrija os ${erro} erro(s) de qualidade antes de aprovar — aprovar transforma estas datas no combinado com o cliente.`,
    );
  }

  const r = await congelarBaseline(projetoId, autorId, { motivo: "Aprovação do cronograma." });
  await prisma.cronogramaProjeto.update({
    where: { projetoId },
    data: { aprovado: true, aprovadoEm: new Date(), aprovadoPorId: autorId },
  });
  // Aprovado, a EAP passa a criar os cards de quem está escalado (D14/D24).
  const cards = await sincronizarCards(prisma, projetoId, autorId);
  // F7.2: aprovado, os marcos de contrato por entrega passam a prever recebimento (D14/D25).
  await sincronizarPrevisoesDoProjeto(projetoId, autorId);
  // E a matriz de recursos passa a CALCULAR este projeto pelas horas das linhas (D17): a
  // alocação digitada dele deixa de contar. A tela precisa dizer isso — aprovar sem horas
  // estimadas faz o projeto sumir da carga da equipe.
  const alocacoesSubstituidas = await prisma.alocacao.count({ where: { projetoId } });
  return { ...r, avisos: alerta, cardsCriados: cards.criados, alocacoesSubstituidas };
}

/**
 * Replanejamento autorizado: nova versão de baseline, com motivo obrigatório.
 *
 * O motivo é obrigatório de propósito. Sem ele, seis meses depois a série de baselines
 * vira uma lista de datas sem história, e a pergunta que ela existe para responder
 * ("por que o prazo andou?") fica sem resposta de novo.
 */
export async function replanejar(
  projetoId: string,
  autorId: string,
  motivo: string,
  observacao?: string | null,
): Promise<ResultadoAprovacao> {
  const cronograma = await prisma.cronogramaProjeto.findUnique({
    where: { projetoId },
    select: { aprovado: true },
  });
  if (!cronograma?.aprovado) {
    throw new Error("Aprove o cronograma antes de replanejar — não há linha de base para comparar.");
  }
  return congelarBaseline(projetoId, autorId, { motivo, observacao: observacao ?? null });
}

/** Grava a foto da Saúde do dia. Idempotente: rodar duas vezes no mesmo dia atualiza. */
export async function gravarSaude(projetoId: string, dia: Dia): Promise<number | null> {
  const avaliacao = await avaliarQualidade(projetoId);
  if (!avaliacao?.saude) return null;

  const { erro, alerta } = contarPorSeveridade(avaliacao.achados);
  const dados = {
    nota: avaliacao.saude.nota,
    faixa: avaliacao.saude.faixa,
    erros: erro,
    alertas: alerta,
    principalCausa: principalCausa(avaliacao.saude),
    notaProvisoria: avaliacao.saude.provisoria,
  };
  await prisma.cronogramaSaudeSnapshot.upsert({
    where: { projetoId_dia: { projetoId, dia: paraDataUtc(dia) } },
    create: { projetoId, dia: paraDataUtc(dia), ...dados },
    update: dados,
  });
  return avaliacao.saude.nota;
}

/**
 * Foto semanal de todos os projetos com cronograma. Chamado pelo job.
 *
 * Projeto sem EAP é pulado em silêncio: `calcularSaude` devolve `null` para cronograma
 * vazio de propósito, e gravar 100 ali seria a pior leitura possível do indicador.
 */
export async function fotografarSaudeDeTodos(dia: Dia): Promise<{ projetos: number; fotos: number }> {
  const projetos = await prisma.projeto.findMany({
    where: { eapTarefas: { some: {} }, situacao: "em_andamento" },
    select: { id: true },
  });
  let fotos = 0;
  for (const p of projetos) {
    const nota = await gravarSaude(p.id, dia);
    if (nota != null) fotos++;
  }
  return { projetos: projetos.length, fotos };
}

/**
 * Projetos cuja Data de Status está velha demais — alimenta o lembrete (D39).
 *
 * Só cronograma APROVADO entra: cobrar apuração de um rascunho seria cobrar disciplina
 * de um plano que ainda não vale.
 */
export async function cronogramasSemApuracao(
  hoje: Dia,
  diasDeTolerancia = 10,
): Promise<{ projetoId: string; codigo: string; nome: string; dataStatus: Dia | null }[]> {
  const limite = paraDataUtc(hoje);
  limite.setUTCDate(limite.getUTCDate() - diasDeTolerancia);

  const linhas = await prisma.cronogramaProjeto.findMany({
    where: {
      aprovado: true,
      projeto: { situacao: "em_andamento" },
      OR: [{ dataStatus: null }, { dataStatus: { lt: limite } }],
    },
    select: {
      projetoId: true,
      dataStatus: true,
      projeto: { select: { codigo: true, nome: true } },
    },
  });

  return linhas.map((l) => ({
    projetoId: l.projetoId,
    codigo: l.projeto.codigo,
    nome: l.projeto.nome,
    dataStatus: l.dataStatus ? paraDia(l.dataStatus) : null,
  }));
}
