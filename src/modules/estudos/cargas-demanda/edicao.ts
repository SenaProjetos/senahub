import {
  MAX_AMBIENTES,
  MAX_LEVANTAMENTOS,
  MAX_PAVIMENTOS,
  MAX_PONTOS_POR_AMBIENTE,
  ambientesDoLevantamento,
  type AmbienteEstudo,
  type ConteudoCargasDemanda,
  type LevantamentoEstudo,
  type LuminariaEstudo,
  type PavimentoEstudo,
  type PontoEstudo,
  type TipoPonto,
} from "./conteudo";

/**
 * Edições do levantamento (etapa 1) — **puras**: cada função recebe o documento e devolve outro (nunca muta). A tela
 * só liga botão a função. Toda cópia ganha identificadores novos (o esquema exige ids únicos no documento todo).
 */

export function novoId(prefixo: string): string {
  return `${prefixo}${Math.random().toString(36).slice(2, 10)}`;
}

/** Move o item de `de` para `para` (índices fora da lista não mudam nada). */
export function mover<T>(lista: readonly T[], de: number, para: number): T[] {
  if (de < 0 || de >= lista.length || para < 0 || para >= lista.length || de === para) return [...lista];
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

export function totalDeAmbientes(c: Pick<ConteudoCargasDemanda, "levantamentos">): number {
  return c.levantamentos.reduce((s, l) => s + ambientesDoLevantamento(l).length, 0);
}

// ─── Fábricas ────────────────────────────────────────────────────────────────────────────────────────────────────

/** FP já adotado no levantamento (o primeiro preenchido), para o ambiente novo e a cópia herdarem. */
export function fpsDoLevantamento(
  l: Pick<LevantamentoEstudo, "pavimentos"> & Partial<Pick<LevantamentoEstudo, "fpIluminacao" | "fpTomadas">>,
): { iluminacao: number | null; tug: number | null } {
  let iluminacao: number | null = l.fpIluminacao ?? null;
  let tug: number | null = l.fpTomadas ?? null;
  for (const a of ambientesDoLevantamento(l)) {
    if (iluminacao == null && a.iluminacao.fp != null) iluminacao = a.iluminacao.fp;
    if (tug == null) tug = a.pontos.find((p) => p.tipo === "tug" && p.fp != null)?.fp ?? null;
  }
  return { iluminacao, tug };
}

export function novoPonto(tipo: TipoPonto, fp: number | null = null): PontoEstudo {
  // TUE e "outro" vêm com FP 1,00 (a W de um equipamento específico é a própria VA); a tela deixa mudar na etapa 2.
  return { id: novoId("pt_"), tipo, descricao: "", quantidade: tipo === "tug" ? null : 1, vaPorPonto: null, fp: tipo === "tug" ? fp : 1 };
}

export function novoAmbiente(nome: string, fps: { iluminacao: number | null; tug: number | null }): AmbienteEstudo {
  return {
    id: novoId("amb_"),
    nome,
    atividadeId: null,
    tipo: null,
    areaM2: null,
    perimetroM: null,
    alturaPlanoM: null,
    tomadasAlternativa: false,
    iluminacao: { vaAdotado: null, fp: fps.iluminacao, emLux: null, fu: null, fm: null, luminariaId: null, luminaria: { fluxoLm: null, potenciaW: null, fp: null }, quantidade: null },
    // Todo ambiente nasce com o ponto de TUG (é nele que a habitação aplica o sugerido).
    pontos: [novoPonto("tug", fps.tug)],
  };
}

export function novoPavimento(nome: string): PavimentoEstudo {
  return { id: novoId("pav_"), nome, ambientes: [] };
}

export function novoLevantamento(nome: string): LevantamentoEstudo {
  return { id: novoId("lev_"), nome, fpIluminacao: null, fpTomadas: null, pavimentos: [novoPavimento("Térreo")] };
}

// ─── Cópias com ids novos ────────────────────────────────────────────────────────────────────────────────────────

const copiaNome = (nome: string, max: number) => `${nome.slice(0, max - 8)} (cópia)`;

export function copiarPonto(p: PontoEstudo): PontoEstudo {
  return { ...p, id: novoId("pt_") };
}

export function copiarAmbiente(a: AmbienteEstudo): AmbienteEstudo {
  return { ...a, id: novoId("amb_"), nome: copiaNome(a.nome, 80), iluminacao: { ...a.iluminacao, luminaria: { ...a.iluminacao.luminaria } }, pontos: a.pontos.map(copiarPonto) };
}

export function copiarPavimento(p: PavimentoEstudo): PavimentoEstudo {
  return { ...p, id: novoId("pav_"), nome: copiaNome(p.nome, 80), ambientes: p.ambientes.map(copiarAmbiente) };
}

export function copiarLevantamento(l: LevantamentoEstudo): LevantamentoEstudo {
  return { ...l, id: novoId("lev_"), nome: copiaNome(l.nome, 120), pavimentos: l.pavimentos.map(copiarPavimento) };
}

// ─── Atualização por identificador ───────────────────────────────────────────────────────────────────────────────

export function mapLevantamento(c: ConteudoCargasDemanda, id: string, f: (l: LevantamentoEstudo) => LevantamentoEstudo): ConteudoCargasDemanda {
  return { ...c, levantamentos: c.levantamentos.map((l) => (l.id === id ? f(l) : l)) };
}

export function mapPavimento(l: LevantamentoEstudo, id: string, f: (p: PavimentoEstudo) => PavimentoEstudo): LevantamentoEstudo {
  return { ...l, pavimentos: l.pavimentos.map((p) => (p.id === id ? f(p) : p)) };
}

export function mapAmbiente(p: PavimentoEstudo, id: string, f: (a: AmbienteEstudo) => AmbienteEstudo): PavimentoEstudo {
  return { ...p, ambientes: p.ambientes.map((a) => (a.id === id ? f(a) : a)) };
}

export function mapPonto(a: AmbienteEstudo, id: string, f: (p: PontoEstudo) => PontoEstudo): AmbienteEstudo {
  return { ...a, pontos: a.pontos.map((p) => (p.id === id ? f(p) : p)) };
}

/** Aplica o FP a todos os ambientes do levantamento: iluminação e/ou TODOS os pontos de TUG. */
export function definirFp(l: LevantamentoEstudo, qual: "iluminacao" | "tug", fp: number | null): LevantamentoEstudo {
  return {
    ...l,
    ...(qual === "iluminacao" ? { fpIluminacao: fp } : { fpTomadas: fp }),
    pavimentos: l.pavimentos.map((p) => ({
      ...p,
      ambientes: p.ambientes.map((a) =>
        qual === "iluminacao"
          ? { ...a, iluminacao: { ...a.iluminacao, fp } }
          : { ...a, pontos: a.pontos.map((pt) => (pt.tipo === "tug" ? { ...pt, fp } : pt)) },
      ),
    })),
  };
}

// ─── Luminárias do estudo ────────────────────────────────────────────────────────────────────────────────────────

/** Luminária nova com o próximo código livre ("L1", "L2"…). */
export function novaLuminaria(existentes: readonly Pick<LuminariaEstudo, "codigo">[]): LuminariaEstudo {
  const usados = new Set(existentes.map((l) => l.codigo));
  let n = existentes.length + 1;
  while (usados.has(`L${n}`)) n += 1;
  return { id: novoId("lum_"), codigo: `L${n}`, descricao: "", fluxoLm: null, potenciaW: null, fp: null };
}

/** Tira a luminária do catálogo e a solta dos ambientes que a usavam (o esquema recusa citar uma que sumiu). */
export function removerLuminaria(c: ConteudoCargasDemanda, id: string): ConteudoCargasDemanda {
  return {
    ...c,
    luminarias: c.luminarias.filter((l) => l.id !== id),
    levantamentos: c.levantamentos.map((l) => ({
      ...l,
      pavimentos: l.pavimentos.map((p) => ({
        ...p,
        ambientes: p.ambientes.map((a) => (a.iluminacao.luminariaId === id ? { ...a, iluminacao: { ...a.iluminacao, luminariaId: null } } : a)),
      })),
    })),
  };
}

/** Quantos ambientes usam a luminária (a exclusão avisa antes). */
export function ambientesQueUsam(c: Pick<ConteudoCargasDemanda, "levantamentos">, luminariaId: string): number {
  return c.levantamentos.flatMap(ambientesDoLevantamento).filter((a) => a.iluminacao.luminariaId === luminariaId).length;
}

// ─── Remoções que mantêm o documento coerente ────────────────────────────────────────────────────────────────────

/** Tira o levantamento e o cita fora do escopo de todo cálculo (o esquema recusa escopo para um levantamento que sumiu). */
export function removerLevantamento(c: ConteudoCargasDemanda, id: string): ConteudoCargasDemanda {
  return {
    ...c,
    levantamentos: c.levantamentos.filter((l) => l.id !== id),
    calculos: c.calculos.map((k) => ({
      ...k,
      escopo: { ...k.escopo, levantamentoIds: k.escopo.levantamentoIds.filter((x) => x !== id) },
      apartamentos: k.apartamentos.map((t) => (t.levantamentoId === id ? { ...t, levantamentoId: null } : t)),
    })),
  };
}

// ─── Limites (o motivo é a frase que o menu mostra) ──────────────────────────────────────────────────────────────

export const MOTIVO_LEVANTAMENTOS_CHEIO = `O estudo já tem o máximo de ${MAX_LEVANTAMENTOS} levantamentos.`;
export const MOTIVO_PAVIMENTOS_CHEIO = `O levantamento já tem o máximo de ${MAX_PAVIMENTOS} pavimentos.`;
export const MOTIVO_AMBIENTES_CHEIO = `O estudo já tem o máximo de ${MAX_AMBIENTES} ambientes.`;
export const MOTIVO_PONTOS_CHEIO = `O ambiente já tem o máximo de ${MAX_PONTOS_POR_AMBIENTE} pontos de tomada.`;
export const MOTIVO_COPIA_PASSA_DO_LIMITE = `A cópia passaria do máximo de ${MAX_AMBIENTES} ambientes do estudo.`;

/** O levantamento ainda é citado por algum cálculo? (a exclusão avisa antes). */
export function calculosQueCitam(c: Pick<ConteudoCargasDemanda, "calculos">, levantamentoId: string): string[] {
  return c.calculos.filter((k) => k.escopo.levantamentoIds.includes(levantamentoId)).map((k) => k.nome);
}
