import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import {
  conferirClassificacao,
  sugerirTiposDesconhecidos,
  type FolhaImportada,
  type TipoRubricaImport,
} from "./importar-pdf";

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
};

export type AnaliseImportacao =
  | { status: "erro"; motivo: string }
  | { status: "pendencias"; rubricas: PendenciaRubrica[]; matriculas: PendenciaMatricula[] }
  | { status: "pronto"; plano: PlanoImportacao };

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

  const codigos = [...new Set(folha.funcionarios.flatMap((f) => f.rubricas.map((r) => r.codigoExterno)))];
  const matriculas = folha.funcionarios.map((f) => f.matriculaExterna);

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
    const sugestoes = sugerirTiposDesconhecidos(folha, tipoPorCodigo);
    const exemploPorCodigo = new Map<string, { descricao: string; valor: number }>();
    for (const f of folha.funcionarios) {
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
        const f = folha.funcionarios.find((x) => x.matriculaExterna === matricula)!;
        return { matriculaExterna: matricula, nome: f.nome, salarioContratual: f.salarioContratual };
      }),
    };
  }

  // Todos os códigos conhecidos: agora a classificação CADASTRADA precisa reproduzir os totais
  // impressos no PDF. É aqui que uma rubrica cadastrada com o sinal trocado é pega — nenhuma
  // outra checagem do caminho enxerga esse erro.
  const classificacao = conferirClassificacao(folha, tipoPorCodigo);
  if (!classificacao.ok) return { status: "erro", motivo: classificacao.motivo };

  const holerites: HoleritePlanejado[] = folha.funcionarios.map((f) => {
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
    plano: { folhaId, ano: folha.ano, mes: folha.mes, holerites, avisosForaDoPdf },
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
