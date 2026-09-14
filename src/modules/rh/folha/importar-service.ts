import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import {
  conferirClassificacao,
  sugerirTiposDesconhecidos,
  type FolhaImportada,
  type TipoRubricaImport,
} from "./importar-pdf";
import { pareceDecimoTerceiro } from "./tipo-folha";

/**
 * Camada de banco do import da folha CLT (plano 2026-09-13-folha-clt-import-assinatura.md, P2).
 * O parser (`importar-pdf.ts`) é puro e não sabe nada do banco; aqui é onde o PDF encontra o
 * cadastro: código de rubrica → `RubricaFolha`, matrícula → `User`.
 *
 * Regra que manda em tudo: **nada é gravado enquanto existir pendência**. O sistema nunca
 * adivinha rubrica nem pessoa — sem mapeamento, ele para e pede cadastro (decisão do dono).
 */

export type PendenciaRubrica = {
  codigoExterno: string;
  /** Descrição como aparece no PDF — pode mudar de mês (ex.: "diferença salarial 05/2026"). */
  descricao: string;
  valorExemplo: number;
  /** Pré-preenchimento da tela, deduzido da aritmética dos totais; `null` = RH decide sozinho. */
  tipoSugerido: TipoRubricaImport | null;
};

export type PendenciaMatricula = {
  matriculaExterna: string;
  nome: string;
  salarioContratual: number;
};

export type ItemPlanejado = {
  rubricaId: string;
  descricao: string;
  tipo: TipoRubricaImport;
  valor: number;
};

export type HoleritePlanejado = {
  userId: string;
  nome: string;
  matriculaExterna: string;
  itens: ItemPlanejado[];
  liquido: number;
};

export type PlanoImportacao = {
  folhaId: string;
  ano: number;
  mes: number;
  holerites: HoleritePlanejado[];
  /**
   * Holerites que já existem nesta folha e NÃO estão no PDF (ex.: lançados à mão antes, ou
   * alguém que saiu). O import não apaga nada — só avisa, pra decisão ser humana.
   */
  avisosForaDoPdf: string[];
  /**
   * Gente do PDF marcada como "sem acesso ao sistema" (`MatriculaExternaIgnorada`) — não vira
   * holerite, mas também nunca fica em silêncio: sempre listada aqui, mesmo quando a decisão de
   * ignorar já foi tomada em mês anterior (achado do primeiro import real, 2026-09-13 — o PDF do
   * contador tem gente que nunca vai ter usuário aqui).
   */
  matriculasIgnoradas: { matriculaExterna: string; nome: string }[];
};

export type AnaliseImportacao =
  | { status: "erro"; motivo: string }
  | {
      status: "pendencias";
      rubricas: PendenciaRubrica[];
      matriculas: PendenciaMatricula[];
      /**
       * Mesma lista que vai em `PlanoImportacao.matriculasIgnoradas` — precisa estar aqui TAMBÉM,
       * porque a maioria dos imports reais passa por pelo menos um round de pendência antes de
       * "pronto" (achado no review desta feature: sem isto, "sempre avisar" avisava zero vezes
       * sempre que o import terminava em pendência, que é o caso mais comum).
       */
      matriculasIgnoradas: { matriculaExterna: string; nome: string }[];
    }
  | { status: "pronto"; plano: PlanoImportacao };

/**
 * Líquido do que o plano grava — difere do `resumo.totalLiquido` impresso no PDF quando há
 * matrícula ignorada, e é este que bate com o lançamento criado ao fechar a folha.
 */
export function liquidoDoPlano(plano: PlanoImportacao): number {
  return Math.round(plano.holerites.reduce((s, h) => s + h.liquido, 0) * 100) / 100;
}

/**
 * Cruza o PDF já parseado com o cadastro e decide: dá pra gravar, falta cadastro, ou tem erro
 * que impede tudo. NÃO grava nada — quem grava é `aplicarImportacao`, e só com um plano pronto.
 */
export async function analisarImportacao(
  folhaId: string,
  folha: FolhaImportada,
): Promise<AnaliseImportacao> {
  const folhaPagamento = await prisma.folhaPagamento.findUnique({
    where: { id: folhaId },
    select: {
      id: true,
      ano: true,
      mes: true,
      tipo: true,
      status: true,
      holerites: { select: { userId: true, user: { select: { name: true } } } },
    },
  });
  if (!folhaPagamento) return { status: "erro", motivo: "Folha não encontrada." };
  if (folhaPagamento.status === "fechada") {
    return { status: "erro", motivo: "Folha fechada — reabra antes de importar." };
  }
  // Trava contra importar o PDF do mês errado: `FolhaPagamento` é única por (ano, mes), então
  // sem esta checagem o PDF de agosto entraria calado na folha de julho.
  if (folhaPagamento.ano !== folha.ano || folhaPagamento.mes !== folha.mes) {
    const alvo = `${String(folhaPagamento.mes).padStart(2, "0")}/${folhaPagamento.ano}`;
    const doPdf = `${String(folha.mes).padStart(2, "0")}/${folha.ano}`;
    return {
      status: "erro",
      motivo: `Esta folha é de ${alvo}, mas o PDF é de ${doPdf}. Abra a folha da competência certa.`,
    };
  }
  // Mesma competência não basta: em dezembro a folha mensal e a de 13º têm o mesmo mês, e o
  // import SUBSTITUI os itens de cada holerite — o PDF errado apagaria o salário (ou o 13º).
  // Lê todas as rubricas do PDF, inclusive de quem é ignorado: o que se quer saber é o tipo do
  // arquivo, não de quem vai virar holerite.
  const rubricas13 = [
    ...new Set(folha.funcionarios.flatMap((f) => f.rubricas.map((r) => r.descricao)).filter(pareceDecimoTerceiro)),
  ];
  const competencia = `${String(folhaPagamento.mes).padStart(2, "0")}/${folhaPagamento.ano}`;
  if (folhaPagamento.tipo === "mensal" && rubricas13.length > 0) {
    return {
      status: "erro",
      motivo: `Este PDF tem rubrica de 13º salário ("${rubricas13[0]}"). Importe na folha de 13º salário de ${competencia} — crie em Folha CLT → Nova folha, tipo 13º salário.`,
    };
  }
  if (folhaPagamento.tipo === "decimo_terceiro" && rubricas13.length === 0) {
    return {
      status: "erro",
      motivo: `Nenhuma rubrica deste PDF é de 13º salário — parece a folha mensal. Importe na folha mensal de ${competencia}.`,
    };
  }

  // Gente do PDF sem (e que nunca vai ter) usuário no sistema — não entra em NADA do que segue:
  // nem exige rubrica cadastrada, nem matrícula vinculada, nem holerite. `analisarImportacao`
  // finge que essas linhas do PDF não existem, a partir daqui.
  const matriculasIgnoradasRows = await prisma.matriculaExternaIgnorada.findMany({
    where: { matriculaExterna: { in: folha.funcionarios.map((f) => f.matriculaExterna) } },
    select: { matriculaExterna: true, nome: true },
  });
  const matriculasIgnoradasSet = new Set(matriculasIgnoradasRows.map((i) => i.matriculaExterna));
  const funcionariosConsiderados = folha.funcionarios.filter(
    (f) => !matriculasIgnoradasSet.has(f.matriculaExterna),
  );
  const folhaConsiderada: FolhaImportada = { ...folha, funcionarios: funcionariosConsiderados };

  const codigos = [...new Set(funcionariosConsiderados.flatMap((f) => f.rubricas.map((r) => r.codigoExterno)))];
  const matriculas = funcionariosConsiderados.map((f) => f.matriculaExterna);

  const [rubricas, usuarios] = await Promise.all([
    prisma.rubricaFolha.findMany({
      where: { codigoExterno: { in: codigos } },
      select: { id: true, tipo: true, codigoExterno: true },
    }),
    prisma.user.findMany({
      where: { matriculaFolhaExterna: { in: matriculas } },
      select: { id: true, name: true, matriculaFolhaExterna: true },
    }),
  ]);

  const rubricaPorCodigo = new Map(rubricas.map((r) => [r.codigoExterno!, r]));
  const usuarioPorMatricula = new Map(usuarios.map((u) => [u.matriculaFolhaExterna!, u]));
  const tipoPorCodigo = new Map<string, TipoRubricaImport>(
    rubricas.map((r) => [r.codigoExterno!, r.tipo as TipoRubricaImport]),
  );

  const codigosFaltando = codigos.filter((c) => !rubricaPorCodigo.has(c));
  const matriculasFaltando = matriculas.filter((m) => !usuarioPorMatricula.has(m));

  if (codigosFaltando.length > 0 || matriculasFaltando.length > 0) {
    const sugestoes = sugerirTiposDesconhecidos(folhaConsiderada, tipoPorCodigo);
    const exemploPorCodigo = new Map<string, { descricao: string; valor: number }>();
    for (const f of funcionariosConsiderados) {
      for (const r of f.rubricas) {
        if (!exemploPorCodigo.has(r.codigoExterno)) {
          exemploPorCodigo.set(r.codigoExterno, { descricao: r.descricao, valor: r.valor });
        }
      }
    }
    return {
      status: "pendencias",
      rubricas: codigosFaltando.map((codigo) => ({
        codigoExterno: codigo,
        descricao: exemploPorCodigo.get(codigo)?.descricao ?? "",
        valorExemplo: exemploPorCodigo.get(codigo)?.valor ?? 0,
        tipoSugerido: sugestoes.get(codigo) ?? null,
      })),
      matriculas: matriculasFaltando.map((matricula) => {
        const f = funcionariosConsiderados.find((x) => x.matriculaExterna === matricula)!;
        return { matriculaExterna: matricula, nome: f.nome, salarioContratual: f.salarioContratual };
      }),
      matriculasIgnoradas: matriculasIgnoradasRows,
    };
  }

  // Todos os códigos conhecidos: agora a classificação CADASTRADA precisa reproduzir os totais
  // impressos no PDF. É aqui que uma rubrica cadastrada com o sinal trocado é pega — nenhuma
  // outra checagem do caminho enxerga esse erro.
  const classificacao = conferirClassificacao(folhaConsiderada, tipoPorCodigo);
  if (!classificacao.ok) return { status: "erro", motivo: classificacao.motivo };

  const holerites: HoleritePlanejado[] = funcionariosConsiderados.map((f) => {
    const usuario = usuarioPorMatricula.get(f.matriculaExterna)!;
    return {
      userId: usuario.id,
      nome: usuario.name,
      matriculaExterna: f.matriculaExterna,
      itens: f.rubricas.map((r) => {
        const rubrica = rubricaPorCodigo.get(r.codigoExterno)!;
        return {
          rubricaId: rubrica.id,
          descricao: r.descricao,
          tipo: rubrica.tipo as TipoRubricaImport,
          valor: r.valor,
        };
      }),
      liquido: f.liquido,
    };
  });

  const idsNoPdf = new Set(holerites.map((h) => h.userId));
  const avisosForaDoPdf = folhaPagamento.holerites
    .filter((h) => !idsNoPdf.has(h.userId))
    .map((h) => h.user.name);

  return {
    status: "pronto",
    plano: {
      folhaId,
      ano: folha.ano,
      mes: folha.mes,
      holerites,
      avisosForaDoPdf,
      matriculasIgnoradas: matriculasIgnoradasRows,
    },
  };
}

/**
 * Grava o plano: um `Holerite` por funcionário do PDF, substituindo os itens inteiros (mesma
 * semântica de `salvarHolerite`, que já é "os itens são o holerite"). Tudo numa transação —
 * ou entra a folha inteira, ou não entra nada.
 *
 * NÃO apaga holerite que não está no PDF: quem não veio no arquivo fica como estava, e sai como
 * aviso na resposta. Apagar trabalho manual de alguém por ausência num arquivo seria destrutivo
 * demais pra uma ação de import.
 */
export async function aplicarImportacao(plano: PlanoImportacao, pdf: { path: string; nome: string }) {
  return prisma.$transaction(async (tx) => {
    // Relê a classificação DENTRO da transação: o plano foi montado antes de salvar o PDF, e
    // entre uma coisa e outra outro usuário de RH pode ter editado o tipo da rubrica noutra aba.
    // Sem isto, gravaríamos a classificação velha sem `conferirClassificacao` rodar de novo.
    // Mesma disciplina da G14 da Produção: guarda na leitura, guarda repetida na escrita.
    const idsRubricas = [...new Set(plano.holerites.flatMap((h) => h.itens.map((i) => i.rubricaId)))];
    const atuais = await tx.rubricaFolha.findMany({
      where: { id: { in: idsRubricas } },
      select: { id: true, nome: true, tipo: true },
    });
    const tipoAtual = new Map(atuais.map((r) => [r.id, r.tipo as string]));
    for (const h of plano.holerites) {
      for (const i of h.itens) {
        if (tipoAtual.get(i.rubricaId) !== i.tipo) {
          // `ActionError` = mensagem escrita pra ser lida por gente; a rota repassa o texto em
          // vez de trocar por "falha ao gravar", que esconderia justamente o que fazer a seguir.
          throw new ActionError(
            `A rubrica "${atuais.find((r) => r.id === i.rubricaId)?.nome ?? i.rubricaId}" mudou de tipo enquanto o arquivo era processado — reenvie o PDF.`,
          );
        }
      }
    }

    for (const h of plano.holerites) {
      const holerite = await tx.holerite.upsert({
        where: { folhaId_userId: { folhaId: plano.folhaId, userId: h.userId } },
        create: { folhaId: plano.folhaId, userId: h.userId },
        update: {},
      });
      await tx.holeriteItem.deleteMany({ where: { holeriteId: holerite.id } });
      await tx.holeriteItem.createMany({
        data: h.itens.map((i) => ({
          holeriteId: holerite.id,
          rubricaId: i.rubricaId,
          descricao: i.descricao,
          tipo: i.tipo,
          valor: i.valor,
        })),
      });
    }
    // Devolve o PDF anterior (reimport) pra quem chamou apagar do disco DEPOIS do commit —
    // arquivo não participa de transação, então some só quando a gravação já é fato.
    const anterior = await tx.folhaPagamento.findUnique({
      where: { id: plano.folhaId },
      select: { origemPdfPath: true },
    });
    await tx.folhaPagamento.update({
      where: { id: plano.folhaId },
      data: { origemPdfPath: pdf.path, origemPdfNome: pdf.nome },
    });
    return {
      holerites: plano.holerites.length,
      pdfSubstituido: anterior?.origemPdfPath ?? null,
    };
  });
}
