import type { ItemRascunho, SituacaoPendencia } from "./regras";

/**
 * O que publicar uma versão da ata faz nas Tarefas e nas pendências do cliente — PURO. Compara os itens da versão
 * vigente (`anteriores`; vazio na 1ª publicação) com os do rascunho (`novos`) pela `chave`, que é a identidade estável:
 * só o que mudou é aplicado (uma edição feita à mão na Tarefa não é sobrescrita se a ata não mexeu naquele campo), e um
 * item que sai e volta reaproveita a mesma Tarefa (desarquivada) ou a mesma pendência (cancelada volta a aberta).
 * Pendência conferida nunca muda.
 */

export type ItemPublicado = ItemRascunho;
type CamposTarefa = Partial<{ titulo: string; descricao: string | null; responsavelId: string; prazo: string | null }>;
type CamposPendencia = Partial<{ titulo: string; descricao: string | null; prazo: string | null }>;

export type PlanoPublicacao = {
  tarefas: { criar: ItemRascunho[]; atualizar: { chave: string; campos: CamposTarefa }[]; arquivar: string[]; desarquivar: string[] };
  pendencias: { criar: ItemRascunho[]; atualizar: { chave: string; campos: CamposPendencia }[]; cancelar: string[]; reabrirCancelada: string[] };
};

function camposDaTarefa(i: ItemRascunho): CamposTarefa {
  return { titulo: i.titulo, descricao: i.descricao, responsavelId: i.responsavelId ?? undefined, prazo: i.prazo };
}

function camposDaPendencia(i: ItemRascunho): CamposPendencia {
  return { titulo: i.titulo, descricao: i.descricao, prazo: i.prazo };
}

/** Só as chaves cujo valor mudou de `antes` para `depois`. */
function diferenca<T extends Record<string, unknown>>(antes: T, depois: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(depois) as (keyof T)[]) {
    if (depois[k] === undefined) continue;
    if (antes[k] !== depois[k]) out[k] = depois[k];
  }
  return out;
}

export function planejarPublicacao(p: {
  anteriores: ItemPublicado[];
  novos: ItemRascunho[];
  tarefasExistentes: ReadonlySet<string>;
  pendenciasExistentes: ReadonlyMap<string, SituacaoPendencia>;
}): PlanoPublicacao {
  const plano: PlanoPublicacao = {
    tarefas: { criar: [], atualizar: [], arquivar: [], desarquivar: [] },
    pendencias: { criar: [], atualizar: [], cancelar: [], reabrirCancelada: [] },
  };
  const anteriores = new Map(p.anteriores.map((i) => [i.chave, i]));
  const chavesNovas = new Set(p.novos.map((i) => i.chave));
  const conferida = (chave: string) => p.pendenciasExistentes.get(chave) === "conferida";

  const encerrar = (a: ItemPublicado) => {
    if (a.tipo === "tarefa_equipe") plano.tarefas.arquivar.push(a.chave);
    if (a.tipo === "pendencia_cliente" && !conferida(a.chave)) plano.pendencias.cancelar.push(a.chave);
  };

  for (const n of p.novos) {
    const a = anteriores.get(n.chave);
    if (a && a.tipo !== n.tipo) encerrar(a);
    const mesmoTipo = a !== undefined && a.tipo === n.tipo;

    if (n.tipo === "tarefa_equipe") {
      if (mesmoTipo) {
        const campos = diferenca(camposDaTarefa(a), camposDaTarefa(n));
        if (Object.keys(campos).length > 0) plano.tarefas.atualizar.push({ chave: n.chave, campos });
      } else if (p.tarefasExistentes.has(n.chave)) {
        plano.tarefas.desarquivar.push(n.chave);
        plano.tarefas.atualizar.push({ chave: n.chave, campos: camposDaTarefa(n) });
      } else {
        plano.tarefas.criar.push(n);
      }
    } else if (n.tipo === "pendencia_cliente") {
      const situacao = p.pendenciasExistentes.get(n.chave);
      if (situacao === "conferida") continue;
      if (mesmoTipo) {
        const campos = diferenca(camposDaPendencia(a), camposDaPendencia(n));
        if (Object.keys(campos).length > 0) plano.pendencias.atualizar.push({ chave: n.chave, campos });
      } else if (situacao !== undefined) {
        if (situacao === "cancelada") plano.pendencias.reabrirCancelada.push(n.chave);
        plano.pendencias.atualizar.push({ chave: n.chave, campos: camposDaPendencia(n) });
      } else {
        plano.pendencias.criar.push(n);
      }
    }
  }

  for (const a of p.anteriores) if (!chavesNovas.has(a.chave)) encerrar(a);
  return plano;
}
