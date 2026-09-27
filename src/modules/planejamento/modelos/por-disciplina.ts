/**
 * Modelos de EAP por DISCIPLINA (pedido do dono, 2026-09-27). PURO.
 *
 * Um modelo de disciplina é um `ModeloEap` com `disciplinaCatalogoId`: o conteúdo de UMA disciplina, na forma
 * "disciplina › fase › tarefas" — é o que "Gerar EAP das disciplinas" cria em cada disciplina do projeto. O
 * modelo de projeto tem a forma inversa ("fase › disciplina › tarefas", como o XML da casa), então a mesma
 * disciplina aparece uma vez em cada fase; extrair junta essas aparições sob uma linha da disciplina.
 *
 * Vínculos com o que fica FORA da disciplina (outra disciplina, gestão, compatibilização) não têm como vir: a
 * outra ponta não existe no modelo de disciplina. Para a fase seguinte não começar junto com a anterior quando
 * o vínculo que a segurava era de fora (no XML, o Executivo espera a validação do Básico pelo cliente), cada
 * fase começa depois do fim da fase anterior da mesma disciplina.
 */
import { emOrdemDeArvore } from "./aplicar";
import type { EstruturaModelo, LinhaModelo, VinculoModelo } from "./estrutura";

export type Extracao = {
  linhas: LinhaModelo[];
  /** Fases em que a disciplina aparece, na ordem do modelo de origem. */
  fases: (string | null)[];
  /** Vínculos com linhas fora da disciplina, que ficaram de fora. */
  vinculosDeFora: number;
  /** Vínculos criados para uma fase começar depois do fim da anterior. */
  vinculosEntreFases: number;
};

export const ID_RAIZ_DISCIPLINA = "disciplina";

/** Disciplinas do catálogo que têm linha de disciplina (`disc`) no modelo — as que dão modelo de disciplina. */
export function disciplinasDoModelo(estrutura: EstruturaModelo): string[] {
  return [
    ...new Set(
      emOrdemDeArvore(estrutura.linhas)
        .filter((l) => l.tipoEap === "disc" && l.disciplinaCatalogoId)
        .map((l) => l.disciplinaCatalogoId!),
    ),
  ];
}

export function extrairDisciplina(
  estrutura: EstruturaModelo,
  disciplinaCatalogoId: string,
  nomes: { disciplina: string; fase: (etapaId: string) => string | null },
): Extracao {
  const ordenadas = emOrdemDeArvore(estrutura.linhas);
  const aparicoes = ordenadas.filter((l) => l.tipoEap === "disc" && l.disciplinaCatalogoId === disciplinaCatalogoId);

  const filhos = new Map<string, LinhaModelo[]>();
  for (const l of ordenadas) if (l.parentId) filhos.set(l.parentId, [...(filhos.get(l.parentId) ?? []), l]);
  const abaixo = (id: string): LinhaModelo[] => (filhos.get(id) ?? []).flatMap((f) => [f, ...abaixo(f.id)]);

  const raiz: LinhaModelo = {
    id: ID_RAIZ_DISCIPLINA,
    parentId: null,
    ordem: 0,
    nome: nomes.disciplina,
    tipoEap: "disc",
    duracaoDias: 0,
    disciplinaCatalogoId,
    etapaId: null,
    deTerceiro: false,
    predecessoras: [],
  };
  const linhas: LinhaModelo[] = [raiz];
  const grupos: { ids: Set<string>; folhas: LinhaModelo[] }[] = [];

  aparicoes.forEach((ap, k) => {
    const conteudo = abaixo(ap.id);
    // A aparição vira o agrupamento da FASE dentro da disciplina (mesmo id, para os vínculos continuarem valendo).
    // Sem fase, o conteúdo vai direto para a linha da disciplina.
    const comFase = ap.etapaId != null;
    if (comFase) {
      linhas.push({
        ...ap,
        parentId: raiz.id,
        ordem: k,
        nome: nomes.fase(ap.etapaId!) ?? ap.nome,
        tipoEap: "fas",
        duracaoDias: 0,
        disciplinaCatalogoId,
        deTerceiro: false,
        predecessoras: ap.predecessoras,
      });
    }
    for (const l of conteudo) {
      linhas.push({ ...l, parentId: l.parentId === ap.id && !comFase ? raiz.id : l.parentId, disciplinaCatalogoId });
    }
    const ids = new Set([...(comFase ? [ap.id] : []), ...conteudo.map((l) => l.id)]);
    const comFilho = new Set(conteudo.map((l) => l.parentId));
    grupos.push({ ids, folhas: conteudo.filter((l) => !comFilho.has(l.id)) });
  });

  // Só os vínculos entre linhas que vieram.
  const presentes = new Set(linhas.map((l) => l.id));
  let vinculosDeFora = 0;
  for (const l of linhas) {
    const dentro = l.predecessoras.filter((p) => presentes.has(p.id));
    vinculosDeFora += l.predecessoras.length - dentro.length;
    l.predecessoras = dentro;
  }

  // Cada fase começa depois do fim da anterior: as folhas da fase k sem predecessora esperam as folhas da fase k-1
  // que não têm sucessora (o "X liberado" do fim da fase). Marco no fim tem preferência — é o que a casa usa.
  let vinculosEntreFases = 0;
  const porId = new Map(linhas.map((l) => [l.id, l]));
  for (let k = 1; k < grupos.length; k++) {
    const antes = grupos[k - 1];
    // Folha que outra linha da MESMA fase espera não é o fim da fase.
    const esperadas = new Set<string>();
    for (const l of linhas) {
      if (!antes.ids.has(l.id)) continue;
      for (const p of l.predecessoras) if (antes.ids.has(p.id)) esperadas.add(p.id);
    }
    let fins = antes.folhas.filter((f) => !esperadas.has(f.id));
    const marcos = fins.filter((f) => f.tipoEap === "mrc");
    if (marcos.length > 0) fins = marcos;
    const inicios = grupos[k].folhas.filter((f) => porId.get(f.id)!.predecessoras.length === 0);
    for (const ini of inicios) {
      const alvo = porId.get(ini.id)!;
      const novos: VinculoModelo[] = fins.map((f) => ({ id: f.id, tipo: "fs", lagDias: 0 }));
      alvo.predecessoras = [...alvo.predecessoras, ...novos];
      vinculosEntreFases += novos.length;
    }
  }

  return { linhas, fases: aparicoes.map((a) => a.etapaId), vinculosDeFora, vinculosEntreFases };
}

/**
 * A estrutura do modelo de disciplina: as linhas extraídas com a jornada do arquivo de origem. Os percentuais por
 * fase vêm junto só quando a disciplina aparece em TODAS as fases que têm percentual — senão a soma não fecharia 100
 * e repartir o valor sozinho seria decidir dinheiro por ela.
 */
export function estruturaDaDisciplina(origem: EstruturaModelo, extracao: Extracao, aviso: string): EstruturaModelo {
  const fasesComPercentual = Object.keys(origem.percentuaisPorFase ?? {});
  const presentes = new Set(extracao.fases.filter((f): f is string => f != null));
  const todas = fasesComPercentual.length > 0 && fasesComPercentual.every((f) => presentes.has(f));
  return {
    versao: 1,
    jornadaMinutos: origem.jornadaMinutos,
    linhas: extracao.linhas,
    mapaDisciplina: {},
    mapaFase: {},
    percentuaisPorFase: todas ? { ...origem.percentuaisPorFase } : {},
    avisos: [aviso],
  };
}

/**
 * Qual modelo de disciplina usar por padrão em cada disciplina do projeto: o do mesmo Tipo de Empreendimento do
 * projeto, senão o sem tipo, senão o mais recente. A tela deixa trocar (ou usar a linha única, como antes).
 */
export function modeloPadraoDaDisciplina<M extends { id: string; tipoEmpreendimentoId: string | null; updatedAt: Date }>(
  modelos: readonly M[],
  tipoDoProjeto: string | null,
): M | null {
  const recentes = [...modelos].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return (
    (tipoDoProjeto ? recentes.find((m) => m.tipoEmpreendimentoId === tipoDoProjeto) : undefined) ??
    recentes.find((m) => m.tipoEmpreendimentoId == null) ??
    recentes[0] ??
    null
  );
}
