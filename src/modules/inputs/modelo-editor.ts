/**
 * Operações do editor de modelos de formulário — puras e imutáveis (a tela guarda o rascunho em
 * estado e aplica estas funções). Chaves e ids novos vêm de `modelo-schema.ts` e nunca mudam depois.
 */
import { OPCOES_SIM_NAO, type CampoBriefing, type CampoTipo, type SecaoBriefing } from "./briefing-schema";
import { novaChave, novoIdSecao, tipoUsaOpcoes } from "./modelo-schema";

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
  return esquema.filter((s) => s.id !== id);
}

export function atualizarSecao(
  esquema: Esquema,
  id: string,
  patch: Partial<Pick<SecaoBriefing, "titulo" | "descricao" | "disciplinas">>,
): SecaoBriefing[] {
  return esquema.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export function reordenarSecoes(esquema: Esquema, deId: string, paraId: string): SecaoBriefing[] {
  return moverItem(esquema, esquema.findIndex((s) => s.id === deId), esquema.findIndex((s) => s.id === paraId));
}

export function adicionarCampo(esquema: Esquema, secaoId: string, sorteio?: Sorteio): SecaoBriefing[] {
  const campo: CampoBriefing = { chave: novaChave(sorteio), label: "Nova pergunta", tipo: "text", obrigatorio: false };
  return esquema.map((s) => (s.id === secaoId ? { ...s, campos: [...s.campos, campo] } : s));
}

export function atualizarCampo(esquema: Esquema, chave: string, patch: Partial<Omit<CampoBriefing, "chave">>): SecaoBriefing[] {
  return esquema.map((s) => ({
    ...s,
    campos: s.campos.map((c) => {
      if (c.chave !== chave) return c;
      const novo = { ...c, ...patch };
      if (patch.tipo && patch.tipo !== c.tipo) {
        novo.opcoes = opcoesPara(patch.tipo, c.opcoes, novo.label);
        if (patch.tipo !== "text") delete novo.formato;
        if (patch.tipo !== "text" && patch.tipo !== "textarea") delete novo.placeholder;
      }
      return novo;
    }),
  }));
}

export function removerCampo(esquema: Esquema, chave: string): SecaoBriefing[] {
  return esquema.map((s) => ({ ...s, campos: s.campos.filter((c) => c.chave !== chave) }));
}

/** Cópia logo abaixo do original, com chave própria (resposta própria). */
export function duplicarCampo(esquema: Esquema, chave: string, sorteio?: Sorteio): SecaoBriefing[] {
  return esquema.map((s) => {
    const i = s.campos.findIndex((c) => c.chave === chave);
    if (i < 0) return s;
    const original = s.campos[i];
    const copia: CampoBriefing = { ...original, chave: novaChave(sorteio), label: `${original.label} (cópia)` };
    delete copia.importarDoCadastro;
    return { ...s, campos: [...s.campos.slice(0, i + 1), copia, ...s.campos.slice(i + 1)] };
  });
}

/** Leva a pergunta para o fim de outra seção. */
export function moverCampoParaSecao(esquema: Esquema, chave: string, secaoId: string): SecaoBriefing[] {
  const campo = esquema.flatMap((s) => s.campos).find((c) => c.chave === chave);
  if (!campo || !esquema.some((s) => s.id === secaoId)) return [...esquema];
  return esquema.map((s) => {
    const sem = s.campos.filter((c) => c.chave !== chave);
    return s.id === secaoId ? { ...s, campos: [...sem, campo] } : { ...s, campos: sem };
  });
}

export function reordenarCampos(esquema: Esquema, secaoId: string, deChave: string, paraChave: string): SecaoBriefing[] {
  return esquema.map((s) =>
    s.id !== secaoId
      ? s
      : { ...s, campos: moverItem(s.campos, s.campos.findIndex((c) => c.chave === deChave), s.campos.findIndex((c) => c.chave === paraChave)) },
  );
}

export function reordenarOpcoes(esquema: Esquema, chave: string, de: number, para: number): SecaoBriefing[] {
  return esquema.map((s) => ({
    ...s,
    campos: s.campos.map((c) => (c.chave === chave && c.opcoes ? { ...c, opcoes: moverItem(c.opcoes, de, para) } : c)),
  }));
}
