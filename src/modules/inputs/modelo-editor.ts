/**
 * Operações do editor de modelos de formulário — puras e imutáveis (a tela guarda o rascunho em
 * estado e aplica estas funções). Chaves e ids novos vêm de `modelo-schema.ts` e nunca mudam depois.
 */
import { OPCOES_SIM_NAO, TIPOS_CONTROLADORES, type CampoBriefing, type CampoTipo, type SecaoBriefing } from "./briefing-schema";
import { novaChave, novoIdSecao, tipoUsaOpcoes, type Renomeio } from "./modelo-schema";

export type Esquema = readonly SecaoBriefing[];

type Sorteio = () => number;

export function moverItem<T>(lista: readonly T[], de: number, para: number): T[] {
  if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return [...lista];
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

/** Opções que um campo ganha ao mudar para `tipo` (o que ele já tinha é aproveitado quando serve). */
function opcoesPara(tipo: CampoTipo, atuais: string[] | undefined, label: string): string[] | undefined {
  if (tipo === "sim-nao") return [...OPCOES_SIM_NAO];
  if (!tipoUsaOpcoes(tipo)) return undefined;
  if (tipo === "checkbox-single") return atuais?.length ? [atuais[0]] : [label || "Ciente"];
  if (atuais && atuais.length >= 2) return atuais;
  return ["Opção 1", "Opção 2"];
}

export function adicionarSecao(esquema: Esquema, sorteio?: Sorteio): SecaoBriefing[] {
  return [...esquema, { id: novoIdSecao(sorteio), titulo: "Nova seção", campos: [] }];
}

export function removerSecao(esquema: Esquema, id: string): SecaoBriefing[] {
  return normalizarCondicoes(esquema.filter((s) => s.id !== id));
}

export function atualizarSecao(
  esquema: Esquema,
  id: string,
  patch: Partial<Pick<SecaoBriefing, "titulo" | "descricao" | "disciplinas">>,
): SecaoBriefing[] {
  return esquema.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export function reordenarSecoes(esquema: Esquema, deId: string, paraId: string): SecaoBriefing[] {
  return normalizarCondicoes(moverItem(esquema, esquema.findIndex((s) => s.id === deId), esquema.findIndex((s) => s.id === paraId)));
}

export function adicionarCampo(esquema: Esquema, secaoId: string, sorteio?: Sorteio): SecaoBriefing[] {
  const campo: CampoBriefing = { chave: novaChave(sorteio), label: "Nova pergunta", tipo: "text", obrigatorio: false };
  return esquema.map((s) => (s.id === secaoId ? { ...s, campos: [...s.campos, campo] } : s));
}

export function atualizarCampo(esquema: Esquema, chave: string, patch: Partial<Omit<CampoBriefing, "chave">>): SecaoBriefing[] {
  return normalizarCondicoes(
    esquema.map((s) => ({
    ...s,
    campos: s.campos.map((c) => {
      if (c.chave !== chave) return c;
      const novo = { ...c, ...patch };
      if (patch.tipo && patch.tipo !== c.tipo) {
        novo.opcoes = opcoesPara(patch.tipo, c.opcoes, novo.label);
        // Trocou de tipo: as opções são outras, não há de onde migrar resposta.
        delete novo.opcoesOrigem;
        if (patch.tipo !== "text") delete novo.formato;
        if (patch.tipo !== "text" && patch.tipo !== "textarea") delete novo.placeholder;
      }
      return novo;
    }),
  })),
  );
}

export function removerCampo(esquema: Esquema, chave: string): SecaoBriefing[] {
  return normalizarCondicoes(esquema.map((s) => ({ ...s, campos: s.campos.filter((c) => c.chave !== chave) })));
}

/** Cópia logo abaixo do original, com chave própria (resposta própria). */
export function duplicarCampo(esquema: Esquema, chave: string, sorteio?: Sorteio): SecaoBriefing[] {
  return esquema.map((s) => {
    const i = s.campos.findIndex((c) => c.chave === chave);
    if (i < 0) return s;
    const original = s.campos[i];
    const copia: CampoBriefing = { ...original, chave: novaChave(sorteio), label: `${original.label} (cópia)` };
    delete copia.importarDoCadastro;
    // A cópia é pergunta nova: não há resposta antiga para migrar.
    delete copia.opcoesOrigem;
    return { ...s, campos: [...s.campos.slice(0, i + 1), copia, ...s.campos.slice(i + 1)] };
  });
}

/** Leva a pergunta para o fim de outra seção. */
export function moverCampoParaSecao(esquema: Esquema, chave: string, secaoId: string): SecaoBriefing[] {
  const campo = esquema.flatMap((s) => s.campos).find((c) => c.chave === chave);
  if (!campo || !esquema.some((s) => s.id === secaoId)) return [...esquema];
  return normalizarCondicoes(
    esquema.map((s) => {
      const sem = s.campos.filter((c) => c.chave !== chave);
      return s.id === secaoId ? { ...s, campos: [...sem, campo] } : { ...s, campos: sem };
    }),
  );
}

export function reordenarCampos(esquema: Esquema, secaoId: string, deChave: string, paraChave: string): SecaoBriefing[] {
  return normalizarCondicoes(
    esquema.map((s) =>
      s.id !== secaoId
        ? s
        : { ...s, campos: moverItem(s.campos, s.campos.findIndex((c) => c.chave === deChave), s.campos.findIndex((c) => c.chave === paraChave)) },
    ),
  );
}

function mapearCampo(esquema: Esquema, chave: string, f: (c: CampoBriefing) => CampoBriefing): SecaoBriefing[] {
  return esquema.map((s) => ({ ...s, campos: s.campos.map((c) => (c.chave === chave ? f(c) : c)) }));
}

/** A origem de cada opção (a de hoje, se o campo ainda não tem — tudo que está salvo veio de si mesmo). */
function origensDe(c: CampoBriefing): (string | null)[] {
  return c.opcoesOrigem && c.opcoesOrigem.length === (c.opcoes?.length ?? 0) ? [...c.opcoesOrigem] : [...(c.opcoes ?? [])];
}

export function reordenarOpcoes(esquema: Esquema, chave: string, de: number, para: number): SecaoBriefing[] {
  return mapearCampo(esquema, chave, (c) =>
    c.opcoes ? { ...c, opcoes: moverItem(c.opcoes, de, para), opcoesOrigem: moverItem(origensDe(c), de, para) } : c,
  );
}

/** Opção nova no fim (sem origem: não migra resposta nenhuma). */
export function adicionarOpcao(esquema: Esquema, chave: string): SecaoBriefing[] {
  return mapearCampo(esquema, chave, (c) => {
    const opcoes = c.opcoes ?? [];
    return { ...c, opcoes: [...opcoes, `Opção ${opcoes.length + 1}`], opcoesOrigem: [...origensDe(c), null] };
  });
}

/**
 * Renomeia a opção `indice`. Pergunta condicional que usava o texto antigo passa a usar o novo — a cada letra
 * digitada (o texto antigo é sempre o de antes da letra), então a condição acompanha o nome. Se outra opção tem o
 * mesmo texto antigo (no meio da digitação "Casas" passa por "Casa"), a condição é dela e fica onde está.
 */
export function renomearOpcao(esquema: Esquema, chave: string, indice: number, texto: string): SecaoBriefing[] {
  const alvo = esquema.flatMap((s) => s.campos).find((c) => c.chave === chave);
  const antigo = alvo?.opcoes?.[indice];
  if (antigo === undefined) return [...esquema];
  const repetido = (alvo?.opcoes ?? []).some((o, i) => i !== indice && o === antigo);
  return esquema.map((s) => ({
    ...s,
    campos: s.campos.map((c) => {
      if (c.chave === chave) return { ...c, opcoes: (c.opcoes ?? []).map((o, i) => (i === indice ? texto : o)) };
      if (c.condicao?.campo === chave && c.condicao.igual.includes(antigo) && !repetido) {
        return { ...c, condicao: { ...c.condicao, igual: c.condicao.igual.map((r) => (r === antigo ? texto : r)) } };
      }
      return c;
    }),
  }));
}

/** Tira a opção `indice`; a condição que dependia só dela some junto (via `normalizarCondicoes`). */
export function removerOpcao(esquema: Esquema, chave: string, indice: number): SecaoBriefing[] {
  return normalizarCondicoes(
    mapearCampo(esquema, chave, (c) =>
      c.opcoes
        ? { ...c, opcoes: c.opcoes.filter((_, i) => i !== indice), opcoesOrigem: origensDe(c).filter((_, i) => i !== indice) }
        : c,
    ),
  );
}

/**
 * Tira do rascunho a condição que deixou de valer: controladora excluída, movida para depois, trocada para um tipo
 * que não é de escolha ou sem a resposta da condição entre as opções. Respostas que sobraram são podadas; sem
 * nenhuma resposta, a condição inteira sai (a pergunta volta a aparecer sempre).
 */
export function normalizarCondicoes(esquema: Esquema): SecaoBriefing[] {
  const vistos = new Map<string, CampoBriefing>();
  return esquema.map((s) => ({
    ...s,
    campos: s.campos.map((c) => {
      let saida = c;
      if (c.condicao) {
        const ctrl = vistos.get(c.condicao.campo);
        const opcoes: readonly string[] = ctrl ? (ctrl.tipo === "sim-nao" ? OPCOES_SIM_NAO : (ctrl.opcoes ?? [])) : [];
        const igual = ctrl && TIPOS_CONTROLADORES.includes(ctrl.tipo) ? c.condicao.igual.filter((r) => opcoes.includes(r)) : [];
        if (igual.length === 0) {
          const { condicao: _descartada, ...resto } = c;
          void _descartada;
          saida = resto;
        } else if (igual.length !== c.condicao.igual.length) {
          saida = { ...c, condicao: { ...c.condicao, igual } };
        }
      }
      vistos.set(c.chave, saida);
      return saida;
    }),
  }));
}

/** Perguntas que podem controlar a de chave `chave`: de escolha e antes dela, na ordem do formulário. */
export function controladorasPossiveis(esquema: Esquema, chave: string): CampoBriefing[] {
  const todas = esquema.flatMap((s) => s.campos);
  const i = todas.findIndex((c) => c.chave === chave);
  // Sem opções (lista ainda incompleta) não há resposta para a condição apontar.
  return todas.slice(0, Math.max(i, 0)).filter((c) => TIPOS_CONTROLADORES.includes(c.tipo) && (c.tipo === "sim-nao" || (c.opcoes?.length ?? 0) >= 2));
}

const COM_LISTA: readonly CampoTipo[] = ["radio", "select", "checkbox"];

/** Marca cada opção salva como sua própria origem — chamado ao abrir o editor e depois de cada salvamento. */
export function comOrigens(esquema: Esquema): SecaoBriefing[] {
  return esquema.map((s) => ({
    ...s,
    campos: s.campos.map((c) => (COM_LISTA.includes(c.tipo) && c.opcoes ? { ...c, opcoesOrigem: [...c.opcoes] } : c)),
  }));
}

/** O esquema que vai ao servidor: sem o que é só do editor, e com o texto das opções aparado (o servidor apara). */
export function esquemaParaGravar(esquema: Esquema): SecaoBriefing[] {
  return esquema.map((s) => ({
    ...s,
    campos: s.campos.map((c) => {
      const { opcoesOrigem: _origem, ...resto } = c;
      void _origem;
      const aparado = resto.opcoes ? { ...resto, opcoes: resto.opcoes.map((o) => o.trim()) } : resto;
      return aparado.condicao ? { ...aparado, condicao: { ...aparado.condicao, igual: aparado.condicao.igual.map((r) => r.trim()) } } : aparado;
    }),
  }));
}

/** Renomeios do rascunho: toda opção cuja origem salva é outra de hoje. Opção nova, tipo trocado e opção removida não entram. */
export function renomeiosDoRascunho(esquema: Esquema): Renomeio[] {
  const saida: Renomeio[] = [];
  for (const c of esquema.flatMap((s) => s.campos)) {
    if (!COM_LISTA.includes(c.tipo) || !c.opcoes || !c.opcoesOrigem || c.opcoesOrigem.length !== c.opcoes.length) continue;
    c.opcoes.forEach((atual, i) => {
      // Aparado como o servidor grava: "Casa " é "Casa" (sem isto, o renomeio seria recusado por não existir).
      const origem = c.opcoesOrigem![i]?.trim() ?? null;
      const para = atual.trim();
      if (origem !== null && origem !== para) saida.push({ chave: c.chave, de: origem, para });
    });
  }
  return saida;
}
