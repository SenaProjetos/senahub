/**
 * Editar o modelo de EAP na plataforma (plano 2026-09-27-editar-modelo-eap). PURO: cada operação recebe as
 * linhas do modelo e devolve as novas, ou o motivo de não poder. A tela aplica em memória e grava o modelo
 * inteiro em "Salvar"; o servidor revalida tudo com `validarIntegridade`.
 *
 * As regras são as MESMAS da EAP do projeto (M4): árvore em `arvore-eap.ts`, duração/marco em
 * `edicao-linha.ts`, ciclo em `ciclo-dependencias.ts`. Só a gravação muda — lá é o banco, aqui é o JSON.
 *
 * `ordem` segue a convenção do projeto: só a ordem relativa entre irmãos importa, então abrir lugar é empurrar
 * as `ordem` maiores uma casa, e "ir para o fim" é pegar o maior `ordem` + 1.
 */
import {
  MOTIVO_IRMA_E_MARCO,
  planoDeAvanco,
  planoDeInsercaoAcima,
  planoDeMoverNoNivel,
  planoDeMovimento,
  planoDeRecuo,
  type Movimento,
  type Posicao,
} from "../arvore-eap";
import { criaCiclo } from "../ciclo-dependencias";
import { regrasDeEdicao } from "../edicao-linha";
import type { LinhaModelo, VinculoModelo } from "./estrutura";

export type Edicao = { ok: true; linhas: LinhaModelo[] } | { ok: false; motivo: string };

/** Mesmos tetos do schema da estrutura (`estrutura.ts`). */
export const MAXIMO_LINHAS_MODELO = 1200;
const MAXIMO_PREDECESSORAS = 50;

export const MOTIVO_MODELO_CHEIO = `O modelo chegou ao limite de ${MAXIMO_LINHAS_MODELO} linhas.`;
export const MOTIVO_ULTIMA_LINHA = "O modelo precisa de pelo menos uma tarefa.";
export const MOTIVO_CICLO = "Essa ligação fecha um ciclo: a tarefa acabaria esperando por ela mesma.";
const NAO_ENCONTRADA = "Tarefa não encontrada no modelo.";

const temFilhos = (linhas: readonly LinhaModelo[], id: string) => linhas.some((l) => l.parentId === id);
const maiorOrdem = (linhas: readonly LinhaModelo[]) => linhas.reduce((m, l) => Math.max(m, l.ordem), -1);

function trocar(linhas: readonly LinhaModelo[], id: string, mudar: (l: LinhaModelo) => LinhaModelo): LinhaModelo[] {
  return linhas.map((l) => (l.id === id ? mudar(l) : l));
}

/** Id de uma linha criada aqui: `novo-1`, `novo-2`… — nunca colide com o UID numérico que veio do arquivo. */
export function idParaLinhaNova(linhas: readonly LinhaModelo[]): string {
  let n = 0;
  for (const l of linhas) {
    const m = /^novo-(\d+)$/.exec(l.id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `novo-${n + 1}`;
}

export function renomear(linhas: readonly LinhaModelo[], id: string, nome: string): Edicao {
  const limpo = nome.trim();
  if (!limpo) return { ok: false, motivo: "Dê um nome à tarefa." };
  if (limpo.length > 300) return { ok: false, motivo: "Nome longo demais (máximo de 300 caracteres)." };
  if (!linhas.some((l) => l.id === id)) return { ok: false, motivo: NAO_ENCONTRADA };
  return { ok: true, linhas: trocar(linhas, id, (l) => ({ ...l, nome: limpo })) };
}

/** Duração em dias úteis; `marco` liga/desliga o marco (duração 0). Agrupamento não tem duração própria. */
export function mudarDuracao(linhas: readonly LinhaModelo[], id: string, pedido: { marco: boolean; duracaoDias?: number }): Edicao {
  const x = linhas.find((l) => l.id === id);
  if (!x) return { ok: false, motivo: NAO_ENCONTRADA };
  if (pedido.duracaoDias != null && pedido.duracaoDias > 9999) return { ok: false, motivo: "Duração longa demais (máximo de 9999 dias úteis)." };
  const r = regrasDeEdicao({ tipoEap: x.tipoEap, duracaoDias: x.duracaoDias, ehResumo: temFilhos(linhas, id) }, pedido);
  if (!r.ok) return r;
  // O modelo só conhece estes tipos; `regrasDeEdicao` só alterna atividade ↔ marco, então nunca sai daqui.
  const tipoEap = r.tipoEap as LinhaModelo["tipoEap"];
  return {
    ok: true,
    linhas: trocar(linhas, id, (l) => ({ ...l, tipoEap, duracaoDias: r.duracaoDias ?? l.duracaoDias })),
  };
}

/** A célula Predecessoras grava o conjunto inteiro de uma vez, como no projeto. */
export function definirPredecessoras(
  linhas: readonly LinhaModelo[],
  id: string,
  vinculos: readonly { predecessoraId: string; tipo: VinculoModelo["tipo"]; lagDias: number }[],
): Edicao {
  if (!linhas.some((l) => l.id === id)) return { ok: false, motivo: NAO_ENCONTRADA };
  const ids = new Set(linhas.map((l) => l.id));
  const vistos = new Set<string>();
  for (const v of vinculos) {
    if (v.predecessoraId === id) return { ok: false, motivo: "Uma tarefa não pode ser predecessora dela mesma." };
    if (!ids.has(v.predecessoraId)) return { ok: false, motivo: "Uma das predecessoras não existe no modelo." };
    if (vistos.has(v.predecessoraId)) return { ok: false, motivo: "A mesma predecessora aparece duas vezes." };
    if (!Number.isFinite(v.lagDias) || Math.abs(v.lagDias) > 999) return { ok: false, motivo: "Defasagem fora do limite (até 999 dias úteis)." };
    vistos.add(v.predecessoraId);
  }
  if (vinculos.length > MAXIMO_PREDECESSORAS) return { ok: false, motivo: `No máximo ${MAXIMO_PREDECESSORAS} predecessoras por tarefa.` };
  const arestas = linhas.flatMap((l) => l.predecessoras.map((p) => ({ tarefaId: l.id, predecessoraId: p.id })));
  if (criaCiclo(arestas, id, [...vistos])) return { ok: false, motivo: MOTIVO_CICLO };
  const novas: VinculoModelo[] = vinculos.map((v) => ({ id: v.predecessoraId, tipo: v.tipo, lagDias: v.lagDias }));
  return { ok: true, linhas: trocar(linhas, id, (l) => ({ ...l, predecessoras: novas })) };
}

/**
 * Disciplina, fase e etapa de terceiro — a janela da linha. `undefined` = não mexe no campo.
 *
 * Num AGRUPAMENTO, disciplina e fase DESCEM, como na conferência da importação (`aplicarRespostas`): toda linha
 * abaixo que herdava o valor antigo recebe o novo; a que tem valor próprio (um agrupamento de outra disciplina
 * lá dentro) fica como está. E o agrupamento passa a ser "disciplina" (`disc`) quando ganha uma, e volta a
 * agrupamento comum (`res`) quando perde — é o `disc` que "Criar modelos de disciplina" procura, e é pela
 * disciplina que aplicar o modelo decide o que o projeto recebe. Sem isto, o "GLP" que a importação não casou
 * com "Gás" só se corrigia reimportando o arquivo (reunião de 29/09/2026).
 */
export function mudarInformacoes(
  linhas: readonly LinhaModelo[],
  id: string,
  campos: { disciplinaCatalogoId?: string | null; etapaId?: string | null; deTerceiro?: boolean },
): Edicao {
  const x = linhas.find((l) => l.id === id);
  if (!x) return { ok: false, motivo: NAO_ENCONTRADA };
  const disciplinaNova = campos.disciplinaCatalogoId === undefined ? x.disciplinaCatalogoId : campos.disciplinaCatalogoId;
  const etapaNova = campos.etapaId === undefined ? x.etapaId : campos.etapaId;
  const ehAgrupamento = temFilhos(linhas, id);
  const abaixo = ehAgrupamento ? subarvore(linhas, id) : new Set<string>();
  const tipoEap: LinhaModelo["tipoEap"] =
    ehAgrupamento && (x.tipoEap === "res" || x.tipoEap === "disc") ? (disciplinaNova ? "disc" : "res") : x.tipoEap;

  return {
    ok: true,
    linhas: linhas.map((l) => {
      if (l.id === id) {
        return { ...l, tipoEap, disciplinaCatalogoId: disciplinaNova, etapaId: etapaNova, deTerceiro: campos.deTerceiro ?? l.deTerceiro };
      }
      if (!abaixo.has(l.id)) return l;
      const herdaDisciplina = l.disciplinaCatalogoId === x.disciplinaCatalogoId;
      const herdaEtapa = l.etapaId === x.etapaId;
      if (!herdaDisciplina && !herdaEtapa) return l;
      return {
        ...l,
        disciplinaCatalogoId: herdaDisciplina ? disciplinaNova : l.disciplinaCatalogoId,
        etapaId: herdaEtapa ? etapaNova : l.etapaId,
      };
    }),
  };
}

function linhaNova(id: string, parentId: string | null, ordem: number, referencia?: LinhaModelo): LinhaModelo {
  return {
    id,
    parentId,
    ordem,
    nome: "Nova tarefa",
    tipoEap: "atv",
    duracaoDias: 1,
    // Como no projeto: nasce na disciplina (e aqui também na fase) da linha de referência.
    disciplinaCatalogoId: referencia?.disciplinaCatalogoId ?? null,
    etapaId: referencia?.etapaId ?? null,
    deTerceiro: false,
    predecessoras: [],
  };
}

/** Inserir acima: a nova nasce no mesmo nível, logo antes da linha. */
export function inserirAcima(linhas: readonly LinhaModelo[], id: string): Edicao & { novaId?: string } {
  if (linhas.length >= MAXIMO_LINHAS_MODELO) return { ok: false, motivo: MOTIVO_MODELO_CHEIO };
  const plano = planoDeInsercaoAcima(linhas, id);
  if (!plano.ok) return plano;
  const ref = linhas.find((l) => l.id === id);
  const novaId = idParaLinhaNova(linhas);
  const empurradas = linhas.map((l) => (l.ordem >= plano.aPartirDeOrdem ? { ...l, ordem: l.ordem + 1 } : l));
  return { ok: true, linhas: [...empurradas, linhaNova(novaId, plano.paiId, plano.aPartirDeOrdem, ref)], novaId };
}

/** Uma tarefa nova no fim do modelo, no nível mais alto (recue para pôr dentro de um agrupamento). */
export function adicionarNoFim(linhas: readonly LinhaModelo[]): Edicao & { novaId?: string } {
  if (linhas.length >= MAXIMO_LINHAS_MODELO) return { ok: false, motivo: MOTIVO_MODELO_CHEIO };
  const novaId = idParaLinhaNova(linhas);
  return { ok: true, linhas: [...linhas, linhaNova(novaId, null, maiorOrdem(linhas) + 1)], novaId };
}

/** Recuar: vira a última subtarefa da linha de cima, no mesmo nível. */
export function recuar(linhas: readonly LinhaModelo[], id: string): Edicao {
  const plano = planoDeRecuo(linhas, id);
  if (!plano.ok) return plano;
  const ordem = maiorOrdem(linhas) + 1;
  return { ok: true, linhas: trocar(linhas, id, (l) => ({ ...l, parentId: plano.novoPaiId, ordem })) };
}

/** Avançar: sobe um nível e fica logo depois do pai antigo; as irmãs que vinham depois passam a ser filhas dela. */
export function avancar(linhas: readonly LinhaModelo[], id: string): Edicao {
  const plano = planoDeAvanco(linhas, id);
  if (!plano.ok) return plano;
  const pai = linhas.find((l) => l.id === plano.depoisDeId)!;
  const reparentar = new Set(plano.reparentarIds);
  let proxima = maiorOrdem(linhas) + 2; // +1 abre o lugar logo depois do pai; as reparentadas vão depois de tudo
  const ordemNova = new Map(plano.reparentarIds.map((r) => [r, proxima++]));
  return {
    ok: true,
    linhas: linhas.map((l) => {
      const empurrada = l.ordem > pai.ordem ? l.ordem + 1 : l.ordem;
      if (l.id === id) return { ...l, parentId: plano.novoPaiId, ordem: pai.ordem + 1 };
      if (reparentar.has(l.id)) return { ...l, parentId: id, ordem: ordemNova.get(l.id)! };
      return empurrada === l.ordem ? l : { ...l, ordem: empurrada };
    }),
  };
}

function aplicarMovimento(linhas: readonly LinhaModelo[], id: string, plano: Movimento): Edicao {
  if (!plano.ok) return plano;
  const ordens = new Map(plano.ordens.map((o) => [o.id, o.ordem]));
  return {
    ok: true,
    linhas: linhas.map((l) => {
      if (l.id === id) return { ...l, parentId: plano.novoPaiId, ordem: ordens.get(l.id) ?? l.ordem };
      const ordem = ordens.get(l.id);
      return ordem === undefined ? l : { ...l, ordem };
    }),
  };
}

/** Mover (arrastar a linha): vai para antes/depois de `alvoId`, no nível dele, com as subtarefas junto. */
export function mover(linhas: readonly LinhaModelo[], id: string, alvoId: string, posicao: Posicao): Edicao {
  return aplicarMovimento(linhas, id, planoDeMovimento(linhas, id, alvoId, posicao));
}

/** Mover para cima (`-1`) ou para baixo (`1`) no mesmo nível, com as subtarefas junto. */
export function moverNoNivel(linhas: readonly LinhaModelo[], id: string, direcao: -1 | 1): Edicao {
  return aplicarMovimento(linhas, id, planoDeMoverNoNivel(linhas, id, direcao));
}

/** Ids da linha e de tudo abaixo dela. */
export function subarvore(linhas: readonly LinhaModelo[], id: string): Set<string> {
  const fora = new Set([id]);
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const l of linhas) {
      if (l.parentId && fora.has(l.parentId) && !fora.has(l.id)) {
        fora.add(l.id);
        cresceu = true;
      }
    }
  }
  return fora;
}

/** Exclui a linha com as subtarefas; quem dependia delas perde o vínculo (a ponta sumiu). */
export function excluir(linhas: readonly LinhaModelo[], id: string): Edicao {
  if (!linhas.some((l) => l.id === id)) return { ok: false, motivo: NAO_ENCONTRADA };
  const fora = subarvore(linhas, id);
  const restam = linhas.filter((l) => !fora.has(l.id));
  if (restam.length === 0) return { ok: false, motivo: MOTIVO_ULTIMA_LINHA };
  return {
    ok: true,
    linhas: restam.map((l) =>
      l.predecessoras.some((p) => fora.has(p.id)) ? { ...l, predecessoras: l.predecessoras.filter((p) => !fora.has(p.id)) } : l,
    ),
  };
}

/**
 * O que o servidor confere antes de gravar (M5). O schema Zod garante a forma; isto garante que o modelo
 * APLICA: pai e predecessora existem, nada em ciclo, marco sem subtarefa. Um JSON bem formado com uma
 * predecessora de linha excluída viraria vínculo quebrado em todo projeto que usasse o modelo.
 */
export function validarIntegridade(linhas: readonly LinhaModelo[]): { ok: true } | { ok: false; motivo: string } {
  if (linhas.length === 0) return { ok: false, motivo: MOTIVO_ULTIMA_LINHA };
  const porId = new Map<string, LinhaModelo>();
  for (const l of linhas) {
    if (porId.has(l.id)) return { ok: false, motivo: `A tarefa "${l.nome}" aparece duas vezes no modelo.` };
    porId.set(l.id, l);
  }
  for (const l of linhas) {
    if (l.parentId != null) {
      const pai = porId.get(l.parentId);
      if (!pai || l.parentId === l.id) return { ok: false, motivo: `A tarefa "${l.nome}" está dentro de uma linha que não existe.` };
      if (pai.tipoEap === "mrc") return { ok: false, motivo: `${MOTIVO_IRMA_E_MARCO} ("${pai.nome}")` };
    }
    const vistos = new Set<string>();
    for (const p of l.predecessoras) {
      if (p.id === l.id || !porId.has(p.id)) return { ok: false, motivo: `A tarefa "${l.nome}" depende de uma linha que não existe.` };
      if (vistos.has(p.id)) return { ok: false, motivo: `A tarefa "${l.nome}" tem a mesma predecessora duas vezes.` };
      vistos.add(p.id);
    }
  }
  // Árvore sem ciclo: subir pelos pais nunca volta a uma linha já vista.
  for (const l of linhas) {
    const caminho = new Set<string>();
    for (let x: LinhaModelo | undefined = l; x?.parentId != null; x = porId.get(x.parentId)) {
      if (caminho.has(x.id)) return { ok: false, motivo: `A tarefa "${l.nome}" está dentro dela mesma.` };
      caminho.add(x.id);
    }
  }
  // Dependências sem ciclo (Kahn): sobra linha sem entrar na ordem = ciclo.
  const entradas = new Map(linhas.map((l) => [l.id, l.predecessoras.length]));
  const sucessoras = new Map<string, string[]>();
  for (const l of linhas) for (const p of l.predecessoras) sucessoras.set(p.id, [...(sucessoras.get(p.id) ?? []), l.id]);
  const fila = linhas.filter((l) => l.predecessoras.length === 0).map((l) => l.id);
  let ordenadas = 0;
  while (fila.length) {
    const id = fila.pop()!;
    ordenadas++;
    for (const s of sucessoras.get(id) ?? []) {
      const n = entradas.get(s)! - 1;
      entradas.set(s, n);
      if (n === 0) fila.push(s);
    }
  }
  if (ordenadas < linhas.length) return { ok: false, motivo: MOTIVO_CICLO };
  return { ok: true };
}
