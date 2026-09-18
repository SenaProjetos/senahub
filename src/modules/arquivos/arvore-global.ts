/**
 * Árvore do diretório geral (regra pura, sem I/O): ano → projeto → disciplina → …
 *
 * O disco guarda por `{ano}/{cliente}/{codigo}_{projeto}/{SIGLA}` (`uploads/caminho.ts`), mas o
 * nível de cliente fica fora da tela: o projetista trabalha por projeto, e o código já traz o ano
 * na frente. Os dois níveis abaixo da disciplina são os mesmos da aba do projeto.
 *
 * Abaixo da disciplina existem DOIS formatos, porque existem dois jeitos de guardar arquivo:
 *  - disciplina comum: fase → formato, os filtros que a aba do projeto já tinha (não há pasta no
 *    banco para esses níveis);
 *  - disciplina de aprovação/laudo (`usaPastas`): a árvore de `PastaProjeto`, que é pasta de
 *    verdade, aninhada.
 * Ao lado das disciplinas ficam as ÁREAS do projeto (Recebidos, Base, Geral, ARTs, Lixeira).
 *
 * CONTAGEM — duas regras que não se misturam:
 *
 *  1. `total` de disciplina, projeto e ano conta DOCUMENTOS (`DocumentoDisciplina`), a unidade
 *     oficial: PDF + DWG do mesmo documento é 1. A fonte é sempre a árvore de documentos, também
 *     para disciplina com pastas — nunca a soma dos filhos.
 *  2. As ÁREAS não entram nesse total. Recebidos/Base/Geral são `Documento` (outro model), ARTs
 *     são `Art` e a Lixeira são uploads excluídos: somá-las ao número de documentos misturaria
 *     unidades diferentes no mesmo rótulo. Cada área mostra a contagem dela, ao lado.
 *
 * Como já acontece no nível de extensão, a soma dos filhos pode não fechar com o pai: um
 * documento com PDF e DWG conta nas duas extensões, e uma pasta só conta o que está dentro dela
 * (documento da disciplina fora de qualquer pasta não aparece em nenhuma). O número de cada nó
 * responde "quantos documentos eu vejo se clicar aqui", que é o que o clique entrega.
 */
import { AREAS_PROJETO, rotuloArea, type AreaProjeto } from "@/modules/uploads/areas-projeto";
import type { ArvoreDaDisciplinaComProjeto } from "@/modules/uploads/documentos-agrupados";
import type { NoFase } from "@/modules/uploads/arvore-navegacao";

/**
 * Teto de arquivos por .zip, o mesmo de `/api/uploads/zip` — as duas rotas não podem divergir.
 * Fica no módulo puro porque a TELA também precisa dele: o botão de baixar pasta já nasce
 * desabilitado acima do teto, em vez de deixar a pessoa clicar e receber erro.
 */
export const MAX_ARQUIVOS_ZIP = 500;

export type ProjetoParaArvoreGlobal = {
  id: string;
  ano: number;
  codigo: string;
  nome: string;
};

export type DisciplinaParaArvoreGlobal = {
  id: string;
  projetoId: string;
  nome: string;
  /** Aprovação/laudo: mostra a árvore de `PastaProjeto` no lugar de fase → formato. */
  usaPastas: boolean;
};

export type PastaParaArvoreGlobal = {
  id: string;
  disciplinaId: string;
  parentId: string | null;
  nome: string;
  ordem: number;
  /** Documentos vivos DENTRO desta pasta (não inclui os das subpastas). */
  total: number;
  /** Arquivos vivos dentro desta pasta — o que entra no .zip dela. */
  totalArquivos: number;
};

export type ContagemAreaProjeto = { projetoId: string; area: AreaProjeto; total: number };

export type NoPastaGlobal = {
  pastaId: string;
  rotulo: string;
  /** Documentos desta pasta E de tudo abaixo dela — é o que o clique entrega. */
  total: number;
  totalArquivos: number;
  filhos: NoPastaGlobal[];
};

export type NoDisciplinaGlobal = {
  disciplinaId: string;
  rotulo: string;
  total: number;
  /** Arquivos, não documentos: é o número que decide se a pasta cabe num .zip. */
  totalArquivos: number;
} & ({ formato: "fases"; fases: NoFase[] } | { formato: "pastas"; pastas: NoPastaGlobal[] });

export type NoAreaGlobal = { area: AreaProjeto; rotulo: string; total: number };

export type NoProjetoGlobal = {
  projetoId: string;
  codigo: string;
  nome: string;
  /** Só documentos de disciplina — as áreas contam à parte (ver cabeçalho). */
  total: number;
  totalArquivos: number;
  disciplinas: NoDisciplinaGlobal[];
  areas: NoAreaGlobal[];
};

export type NoAnoGlobal = { ano: number; total: number; totalArquivos: number; projetos: NoProjetoGlobal[] };

/** Documentos da disciplina, somando as FASES — um documento tem uma fase só. */
function totalDaDisciplina(fases: NoFase[]): number {
  return fases.reduce((soma, f) => soma + f.total, 0);
}

/** Arquivos da disciplina, pela mesma soma — é o que entra no .zip dela. */
function arquivosDaDisciplina(fases: NoFase[]): number {
  return fases.reduce((soma, f) => soma + f.totalArquivos, 0);
}

/**
 * Monta a subárvore de pastas de uma disciplina. O `total` de cada nó acumula as subpastas,
 * senão uma pasta que só tem subpastas apareceria como vazia e ninguém clicaria nela.
 */
function montarPastas(pastas: PastaParaArvoreGlobal[]): NoPastaGlobal[] {
  const filhosDe = new Map<string | null, PastaParaArvoreGlobal[]>();
  for (const p of pastas) {
    const irmaos = filhosDe.get(p.parentId) ?? [];
    irmaos.push(p);
    filhosDe.set(p.parentId, irmaos);
  }

  // Pasta órfã (pai fora da lista) viraria subárvore invisível — sobe para a raiz, para o
  // arquivo dentro dela continuar alcançável.
  const ids = new Set(pastas.map((p) => p.id));
  const raizes = pastas.filter((p) => p.parentId === null || !ids.has(p.parentId));

  const construir = (pasta: PastaParaArvoreGlobal, visitados: Set<string>): NoPastaGlobal => {
    // Ciclo em `parentId` travaria a recursão: o nó repetido vira folha.
    if (visitados.has(pasta.id)) {
      return {
        pastaId: pasta.id,
        rotulo: pasta.nome,
        total: pasta.total,
        totalArquivos: pasta.totalArquivos,
        filhos: [],
      };
    }
    const proximos = new Set(visitados).add(pasta.id);
    const filhos = (filhosDe.get(pasta.id) ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
      .map((f) => construir(f, proximos));
    return {
      pastaId: pasta.id,
      rotulo: pasta.nome,
      total: pasta.total + filhos.reduce((soma, f) => soma + f.total, 0),
      totalArquivos: pasta.totalArquivos + filhos.reduce((soma, f) => soma + f.totalArquivos, 0),
      filhos,
    };
  };

  return raizes
    .slice()
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((r) => construir(r, new Set()));
}

/**
 * Ano → projeto → disciplina → (fase → formato | pastas), com as áreas ao lado das disciplinas.
 *
 * Nada de nó vazio: ano, projeto e disciplina só existem se houver documento visível dentro. É o
 * que faz a muralha por disciplina valer para a árvore inteira sem filtro extra — quem enxerga
 * uma disciplina de um projeto não vê os outros projetos do mesmo ano.
 *
 * A exceção é a ÁREA: ela é listada com o total que vier, inclusive zero, porque a visibilidade
 * dela é decidida por permissão (quem gere Recebidos precisa achar a pasta vazia para subir o
 * primeiro arquivo). Quem chama passa só as áreas que a pessoa pode ver.
 */
export function montarArvoreGlobal(entrada: {
  projetos: ProjetoParaArvoreGlobal[];
  disciplinas: DisciplinaParaArvoreGlobal[];
  /** Saída de `arvoreNavegacaoDocumentos` — fases e formatos por disciplina. */
  documentos: ArvoreDaDisciplinaComProjeto[];
  pastas: PastaParaArvoreGlobal[];
  areas: ContagemAreaProjeto[];
}): NoAnoGlobal[] {
  const { projetos, disciplinas, documentos, pastas, areas } = entrada;

  const fasesPorDisciplina = new Map(documentos.map((d) => [d.disciplinaId, d.fases]));
  const pastasPorDisciplina = new Map<string, PastaParaArvoreGlobal[]>();
  for (const p of pastas) {
    const lista = pastasPorDisciplina.get(p.disciplinaId) ?? [];
    lista.push(p);
    pastasPorDisciplina.set(p.disciplinaId, lista);
  }
  const areasPorProjeto = new Map<string, ContagemAreaProjeto[]>();
  for (const a of areas) {
    const lista = areasPorProjeto.get(a.projetoId) ?? [];
    lista.push(a);
    areasPorProjeto.set(a.projetoId, lista);
  }

  const disciplinasPorProjeto = new Map<string, DisciplinaParaArvoreGlobal[]>();
  for (const d of disciplinas) {
    const lista = disciplinasPorProjeto.get(d.projetoId) ?? [];
    lista.push(d);
    disciplinasPorProjeto.set(d.projetoId, lista);
  }

  const nosProjeto: NoProjetoGlobal[] = [];
  for (const projeto of projetos) {
    const nosDisciplina: NoDisciplinaGlobal[] = [];
    for (const disciplina of disciplinasPorProjeto.get(projeto.id) ?? []) {
      const fases = fasesPorDisciplina.get(disciplina.id) ?? [];
      const total = totalDaDisciplina(fases);
      // Disciplina sem documento visível não vira pasta — nem quando tem estrutura de pastas
      // criada: pasta vazia em 16 projetos é ruído, e o arquivo é que justifica o nó.
      if (total === 0) continue;
      const base = {
        disciplinaId: disciplina.id,
        rotulo: disciplina.nome,
        total,
        totalArquivos: arquivosDaDisciplina(fases),
      };
      nosDisciplina.push(
        disciplina.usaPastas
          ? { ...base, formato: "pastas", pastas: montarPastas(pastasPorDisciplina.get(disciplina.id) ?? []) }
          : { ...base, formato: "fases", fases },
      );
    }

    const contagens = new Map((areasPorProjeto.get(projeto.id) ?? []).map((a) => [a.area, a.total]));
    const nosArea: NoAreaGlobal[] = AREAS_PROJETO.filter((a) => contagens.has(a)).map((area) => ({
      area,
      rotulo: rotuloArea(area),
      total: contagens.get(area) ?? 0,
    }));

    // Projeto sem documento E sem área visível não aparece. Com área (ainda que vazia) aparece:
    // é onde a pessoa sobe o primeiro Recebido.
    if (nosDisciplina.length === 0 && nosArea.length === 0) continue;

    nosProjeto.push({
      projetoId: projeto.id,
      codigo: projeto.codigo,
      nome: projeto.nome,
      total: nosDisciplina.reduce((soma, d) => soma + d.total, 0),
      totalArquivos: nosDisciplina.reduce((soma, d) => soma + d.totalArquivos, 0),
      disciplinas: nosDisciplina,
      areas: nosArea,
    });
  }

  const porAno = new Map<number, NoProjetoGlobal[]>();
  const anoDoProjeto = new Map(projetos.map((p) => [p.id, p.ano]));
  for (const no of nosProjeto) {
    const ano = anoDoProjeto.get(no.projetoId)!;
    const lista = porAno.get(ano) ?? [];
    lista.push(no);
    porAno.set(ano, lista);
  }

  return [...porAno]
    // Ano mais recente primeiro (é onde está o trabalho); projeto na ordem do código, que é a
    // sequência em que foram abertos (260001, 260002…).
    .sort((a, b) => b[0] - a[0])
    .map(([ano, lista]) => ({
      ano,
      total: lista.reduce((soma, p) => soma + p.total, 0),
      totalArquivos: lista.reduce((soma, p) => soma + p.totalArquivos, 0),
      projetos: lista.slice().sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR")),
    }));
}
