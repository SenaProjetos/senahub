/**
 * Coordenação BIM — organização PURA da lista de conflitos para a tela: rótulo da
 * categoria IFC em português, agrupamento por elemento e combinações de categorias
 * que o usuário pode ignorar. Sem three/fragments — recebe o resultado do clash já
 * com categoria e nome de cada lado.
 *
 * Motivo: no IFC real ARQ × EST a detecção devolve milhares de pares e a lista antiga
 * ("Conflito #N, penetração X") não dizia o que bate em quê. Agrupar por elemento e
 * deixar ignorar uma combinação inteira (ex.: laje do ARQ × laje do EST) é o que torna
 * o resultado revisável.
 */

/** Um lado do conflito: o item de um modelo. */
export type LadoConflito = {
  modeloId: string;
  localId: number;
  categoria: string | null;
  nome: string | null;
};

export type ConflitoListavel = {
  a: LadoConflito;
  b: LadoConflito;
  /** Menor penetração entre os 3 eixos (metros). */
  profundidade: number;
};

const ROTULOS: Record<string, string> = {
  IFCWALL: "Parede",
  IFCWALLSTANDARDCASE: "Parede",
  IFCCURTAINWALL: "Pele de vidro",
  IFCSLAB: "Laje",
  IFCROOF: "Cobertura",
  IFCBEAM: "Viga",
  IFCCOLUMN: "Pilar",
  IFCMEMBER: "Perfil",
  IFCPLATE: "Placa",
  IFCFOOTING: "Fundação",
  IFCPILE: "Estaca",
  IFCDOOR: "Porta",
  IFCWINDOW: "Janela",
  IFCSTAIR: "Escada",
  IFCSTAIRFLIGHT: "Lance de escada",
  IFCRAMP: "Rampa",
  IFCRAMPFLIGHT: "Lance de rampa",
  IFCRAILING: "Guarda-corpo",
  IFCCOVERING: "Revestimento",
  IFCFURNISHINGELEMENT: "Mobiliário",
  IFCBUILDINGELEMENTPROXY: "Elemento genérico",
  IFCFLOWSEGMENT: "Tubo/duto",
  IFCPIPESEGMENT: "Tubo",
  IFCDUCTSEGMENT: "Duto",
  IFCCABLECARRIERSEGMENT: "Eletrocalha",
  IFCFLOWFITTING: "Conexão",
  IFCPIPEFITTING: "Conexão de tubo",
  IFCDUCTFITTING: "Conexão de duto",
  IFCFLOWTERMINAL: "Terminal",
  IFCFLOWCONTROLLER: "Registro/válvula",
  IFCFLOWMOVINGDEVICE: "Bomba/ventilador",
  IFCFLOWSTORAGEDEVICE: "Reservatório",
  IFCENERGYCONVERSIONDEVICE: "Equipamento",
  IFCDISTRIBUTIONELEMENT: "Instalação",
  IFCREINFORCINGBAR: "Armadura",
  IFCSPACE: "Ambiente",
};

/** "IFCBEAM" → "Viga"; desconhecida → a própria classe sem o prefixo "IFC". */
export function rotuloCategoria(categoria: string | null | undefined): string {
  if (!categoria) return "Elemento";
  const chave = categoria.toUpperCase();
  return ROTULOS[chave] ?? chave.replace(/^IFC/, "");
}

/** Chave estável da combinação de categorias (A do modelo A, B do modelo B). */
export function chaveParCategorias(c: ConflitoListavel): string {
  return `${c.a.categoria ?? "?"}|${c.b.categoria ?? "?"}`;
}

export type ParCategorias = {
  chave: string;
  categoriaA: string | null;
  categoriaB: string | null;
  total: number;
};

/** Combinações de categorias presentes, da mais frequente para a menos. */
export function paresDeCategorias(conflitos: readonly ConflitoListavel[]): ParCategorias[] {
  const pares = new Map<string, ParCategorias>();
  for (const c of conflitos) {
    const chave = chaveParCategorias(c);
    const par = pares.get(chave);
    if (par) par.total += 1;
    else pares.set(chave, { chave, categoriaA: c.a.categoria, categoriaB: c.b.categoria, total: 1 });
  }
  return [...pares.values()].sort(
    (x, y) => y.total - x.total || x.chave.localeCompare(y.chave),
  );
}

export type GrupoConflitos<T extends ConflitoListavel> = {
  /** Elemento do modelo A que concentra os conflitos do grupo. */
  elemento: LadoConflito;
  /** Conflitos do elemento, da maior penetração para a menor. */
  conflitos: T[];
  /** Maior penetração do grupo (metros) — ordena grupos empatados. */
  maiorProfundidade: number;
};

/**
 * Tira as combinações ignoradas e agrupa por elemento do modelo A. Grupos com mais
 * conflitos primeiro (uma laje que bate em 40 vigas é UM problema de modelagem, não
 * 40); empate pela maior penetração.
 */
export function agruparConflitos<T extends ConflitoListavel>(
  conflitos: readonly T[],
  ignorados: ReadonlySet<string> = new Set(),
): GrupoConflitos<T>[] {
  const grupos = new Map<string, GrupoConflitos<T>>();
  for (const c of conflitos) {
    if (ignorados.has(chaveParCategorias(c))) continue;
    const chave = `${c.a.modeloId}:${c.a.localId}`;
    const grupo = grupos.get(chave);
    if (grupo) {
      grupo.conflitos.push(c);
      grupo.maiorProfundidade = Math.max(grupo.maiorProfundidade, c.profundidade);
    } else {
      grupos.set(chave, { elemento: c.a, conflitos: [c], maiorProfundidade: c.profundidade });
    }
  }
  const lista = [...grupos.values()];
  for (const g of lista) g.conflitos.sort((x, y) => y.profundidade - x.profundidade);
  return lista.sort(
    (x, y) => y.conflitos.length - x.conflitos.length || y.maiorProfundidade - x.maiorProfundidade,
  );
}

/** Nome para a tela: o Name do IFC quando existe, senão o rótulo da categoria + id. */
export function nomeDoLado(lado: LadoConflito): string {
  const nome = lado.nome?.trim();
  return nome ? nome : `${rotuloCategoria(lado.categoria)} #${lado.localId}`;
}
