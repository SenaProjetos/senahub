/**
 * Cor do projeto nas telas de recursos (pool de recursos, decisão 6 do planejamento, 25/11/2026): todo projeto tem cor
 * AUTOMÁTICA, e quem pode editar o projeto pode trocar por outra da paleta (para separar dois projetos parecidos).
 *
 * A automática é CALCULADA do id — nunca gravada —, então projeto antigo ou novo já tem cor sem rodar carga. O banco
 * guarda só a troca manual (`Projeto.cor`), e só o NOME do token: o hex vive em `globals.css` (`--projeto-N`, claro e
 * escuro). PURO e seguro no cliente.
 */
export const CORES_PROJETO = ["projeto-1", "projeto-2", "projeto-3", "projeto-4", "projeto-5", "projeto-6", "projeto-7", "projeto-8"] as const;
export type CorProjeto = (typeof CORES_PROJETO)[number];

/** Nome de cada cor para a tela (leitor de tela e title). */
export const NOME_COR_PROJETO: Record<CorProjeto, string> = {
  "projeto-1": "Azul",
  "projeto-2": "Verde",
  "projeto-3": "Roxo",
  "projeto-4": "Terracota",
  "projeto-5": "Petróleo",
  "projeto-6": "Vinho",
  "projeto-7": "Oliva",
  "projeto-8": "Grafite",
};

/** Classes estáticas (o Tailwind só gera a classe que aparece escrita inteira no código). */
export const FUNDO_COR_PROJETO: Record<CorProjeto, string> = {
  "projeto-1": "bg-projeto-1",
  "projeto-2": "bg-projeto-2",
  "projeto-3": "bg-projeto-3",
  "projeto-4": "bg-projeto-4",
  "projeto-5": "bg-projeto-5",
  "projeto-6": "bg-projeto-6",
  "projeto-7": "bg-projeto-7",
  "projeto-8": "bg-projeto-8",
};

export function ehCorProjeto(v: unknown): v is CorProjeto {
  return typeof v === "string" && (CORES_PROJETO as readonly string[]).includes(v);
}

/** A cor automática: um hash estável do id (FNV-1a), o mesmo em qualquer tela e em qualquer dia. */
export function corAutomatica(projetoId: string): CorProjeto {
  let h = 0x811c9dc5;
  for (let i = 0; i < projetoId.length; i++) {
    h ^= projetoId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return CORES_PROJETO[h % CORES_PROJETO.length];
}

/** A cor do projeto: a escolhida, se for da paleta; senão a automática (valor antigo ou inválido também cai nela). */
export function corDoProjeto(p: { id: string; cor: string | null | undefined }): CorProjeto {
  return ehCorProjeto(p.cor) ? p.cor : corAutomatica(p.id);
}
