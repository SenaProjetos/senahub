// Regras puras do 3D do portal: sem Prisma, sem React, sem server-only.

export type UploadDaCadeia = {
  id: string;
  realinhadoDeId: string | null;
  versao: number;
  convertido: boolean;
};

/** A cadeia inteira de descendentes de `origemId` (por `realinhadoDeId`), sem a origem. */
export function descendentesDe(
  origemId: string,
  uploads: readonly UploadDaCadeia[],
): Set<string> {
  const filhosDe = new Map<string, string[]>();
  for (const u of uploads) {
    if (!u.realinhadoDeId) continue;
    const lista = filhosDe.get(u.realinhadoDeId);
    if (lista) lista.push(u.id);
    else filhosDe.set(u.realinhadoDeId, [u.id]);
  }
  // `visitados` também protege de ciclo (A→B→A): cada id entra uma vez só.
  const visitados = new Set<string>([origemId]);
  const resultado = new Set<string>();
  const fila = [origemId];
  while (fila.length > 0) {
    const atual = fila.shift() as string;
    for (const filho of filhosDe.get(atual) ?? []) {
      if (visitados.has(filho)) continue;
      visitados.add(filho);
      resultado.add(filho);
      fila.push(filho);
    }
  }
  return resultado;
}

/** O descendente realinhado mais recente de `origemId` com conversão concluída; senão a origem. */
export function modeloServidoDaOrigem(
  origemId: string,
  uploads: readonly UploadDaCadeia[],
): string {
  const cadeia = descendentesDe(origemId, uploads);
  let melhor: UploadDaCadeia | null = null;
  for (const u of uploads) {
    if (!cadeia.has(u.id) || !u.convertido) continue;
    if (!melhor || u.versao > melhor.versao) melhor = u;
  }
  return melhor ? melhor.id : origemId;
}

export type PavimentoDoModelo = {
  modeloId: string;
  nome: string | null;
  /** Piso pela regra de `elementosDoPiso` (sem fundações, salvo pavimento só de fundação). */
  pisoY: number;
  localIds: number[];
  /** Neste modelo o pavimento só tem fundação (o piso saiu de sapatas/estacas). */
  soFundacao?: boolean;
};

export type PavimentoUnido = {
  chave: string;
  nome: string;
  pisoY: number;
  porModelo: Map<string, number[]>;
  /** Em todos os modelos o pavimento só tem fundação — o andar não entra nele sem escolha. */
  soFundacao: boolean;
};

const NOME_SEM_PAVIMENTO = "Sem pavimento";

/** Minúscula, sem acento e com espaços colapsados — a chave de comparação do nome. */
function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const CHAVE_SEM_PAVIMENTO = normalizarNome(NOME_SEM_PAVIMENTO);

/** O grupo "Sem pavimento" de `unirPavimentos` (elementos sem pavimento no IFC) — não conta como andar. */
export function ehSemPavimento(p: Pick<PavimentoUnido, "chave">): boolean {
  return p.chave === CHAVE_SEM_PAVIMENTO;
}

/**
 * Une pavimentos de vários modelos por nome normalizado (sem acento/caixa/espaço extra).
 * Piso = o menor `pisoY` das partes que não são só de fundação (se todas são, o menor de todas) — a mesma regra de
 * `elementosDoPiso` com os modelos juntos; ordem crescente de piso; sem nome → "Sem pavimento", sempre por último.
 */
export function unirPavimentos(
  lista: readonly PavimentoDoModelo[],
): PavimentoUnido[] {
  const porChave = new Map<string, PavimentoUnido>();
  const pisoDeTodas = new Map<string, number>();

  for (const p of lista) {
    const normalizado = p.nome ? normalizarNome(p.nome) : "";
    const semNome = normalizado === "" || normalizado === CHAVE_SEM_PAVIMENTO;
    const chave = semNome ? CHAVE_SEM_PAVIMENTO : normalizado;

    let item = porChave.get(chave);
    if (!item) {
      item = {
        chave,
        nome: semNome ? NOME_SEM_PAVIMENTO : (p.nome as string).trim().replace(/\s+/g, " "),
        pisoY: Number.POSITIVE_INFINITY,
        porModelo: new Map(),
        soFundacao: true,
      };
      porChave.set(chave, item);
    }
    pisoDeTodas.set(chave, Math.min(pisoDeTodas.get(chave) ?? Number.POSITIVE_INFINITY, p.pisoY));
    if (!p.soFundacao) {
      if (item.soFundacao) item.pisoY = p.pisoY;
      else item.pisoY = Math.min(item.pisoY, p.pisoY);
      item.soFundacao = false;
    }

    const ids = item.porModelo.get(p.modeloId);
    if (ids) ids.push(...p.localIds);
    else item.porModelo.set(p.modeloId, [...p.localIds]);
  }

  for (const item of porChave.values()) {
    if (item.soFundacao) item.pisoY = pisoDeTodas.get(item.chave) ?? Number.POSITIVE_INFINITY;
  }

  const todos = [...porChave.values()];
  const comNome = todos
    .filter((p) => p.chave !== CHAVE_SEM_PAVIMENTO)
    .sort((a, b) => a.pisoY - b.pisoY || a.nome.localeCompare(b.nome, "pt-BR"));
  const sem = todos.filter((p) => p.chave === CHAVE_SEM_PAVIMENTO);
  return [...comNome, ...sem];
}

/** Um pavimento lido do índice de UM modelo, ainda sem piso (o piso vem das caixas, no motor). */
export type GrupoDePavimento = { nome: string | null; localIds: number[] };

/**
 * Agrupa os elementos do índice do motor pelo pavimento (`pavimentoLocalId`), na ordem em que aparecem. Elemento sem
 * pavimento entra num grupo sem nome (vira "Sem pavimento" em `unirPavimentos`).
 */
export function gruposDePavimento(
  indice: readonly { localId: number; pavimentoLocalId: number | null; pavimentoNome: string | null }[],
): GrupoDePavimento[] {
  const porPavimento = new Map<number | "sem", GrupoDePavimento>();
  for (const e of indice) {
    const chave = e.pavimentoLocalId ?? "sem";
    const grupo = porPavimento.get(chave);
    if (grupo) {
      grupo.localIds.push(e.localId);
      if (!grupo.nome && e.pavimentoNome) grupo.nome = e.pavimentoNome;
    } else {
      porPavimento.set(chave, { nome: chave === "sem" ? null : e.pavimentoNome, localIds: [e.localId] });
    }
  }
  // Os sem pavimento por último, como na lista unida.
  const sem = porPavimento.get("sem");
  porPavimento.delete("sem");
  return sem ? [...porPavimento.values(), sem] : [...porPavimento.values()];
}

/**
 * O que fica visível no 3D do portal: "tudo" quando nenhum modelo carregado está desligado e não há pavimento
 * escolhido; senão um mapa modelo → elementos visíveis (o motor esconde o modelo carregado que não está no mapa).
 * Ligado = todos os elementos do índice dele, ou só os do pavimento escolhido.
 */
export function visibilidadeDoPortal(o: {
  carregados: readonly string[];
  desligados: ReadonlySet<string>;
  pavimento: PavimentoUnido | null;
  todosIds: ReadonlyMap<string, readonly number[]>;
}): "tudo" | Map<string, number[]> {
  const ligados = o.carregados.filter((id) => !o.desligados.has(id));
  if (!o.pavimento && ligados.length === o.carregados.length) return "tudo";
  const mapa = new Map<string, number[]>();
  for (const id of ligados) {
    const ids = o.pavimento ? o.pavimento.porModelo.get(id) : o.todosIds.get(id);
    mapa.set(id, ids ? [...ids] : []);
  }
  return mapa;
}

/**
 * Por que a página 3D não tem modelo para abrir: `vazio` = nenhum IFC; `erro` = todos os que não estão prontos falharam
 * na conversão; `preparando` = algum ainda está na fila/convertendo. `null` = há modelo pronto.
 */
export function motivoSemModelo(situacoes: readonly ("pronto" | "preparando" | "erro")[]): "vazio" | "preparando" | "erro" | null {
  if (situacoes.length === 0) return "vazio";
  if (situacoes.includes("pronto")) return null;
  return situacoes.includes("preparando") ? "preparando" : "erro";
}

const ehIfc = (nome: string) => /\.ifc$/i.test(nome);

/**
 * A versão IFC que o portal mostra de um documento recebido do cliente (spec D5, "última versão com conversão
 * concluída"): a IFC mais nova já convertida; sem nenhuma, a IFC mais nova (aparece "em preparação" ou "erro"). Assim a
 * versão nova ainda na fila não tira a anterior pronta da tela. `versoes` por número decrescente; `concluidas` = ids das
 * versões com conversão concluída. Sem IFC = null.
 */
export function versaoIfcDoRecebido<V extends { id: string; nomeArquivo: string }>(
  versoes: readonly V[],
  concluidas: ReadonlySet<string>,
): V | null {
  const ifcs = versoes.filter((v) => ehIfc(v.nomeArquivo));
  return ifcs.find((v) => concluidas.has(v.id)) ?? ifcs[0] ?? null;
}

/**
 * O atalho "Ver em 3D" das Entregas aparece? Um IFC das Entregas em qualquer situação (a página explica o que falta),
 * ou um IFC enviado pelo cliente pronto para abrir.
 */
export function temModelo3dNoPortal(modelos: readonly { origem: "entrega" | "cliente"; situacao: "pronto" | "preparando" | "erro" }[]): boolean {
  return modelos.some((m) => m.origem === "entrega" || m.situacao === "pronto");
}

// ─────────────────────────────────────────────────────────────
// Referencial da marcação 3D
// ─────────────────────────────────────────────────────────────

type V3 = [number, number, number];

/**
 * O mundo do visualizador é o do PRIMEIRO modelo aberto (o fragments desloca os outros até ele), então a mesma vista
 * tem números diferentes conforme a ordem de abertura. A marcação do cliente é gravada no referencial do PRÓPRIO
 * modelo — como se ele tivesse aberto primeiro, que é o que o link `?apontamento=N` da Coordenação faz (abre o modelo do
 * apontamento antes dos outros). `d` = deslocamento do modelo na cena (espaço IFC, `ViewerEngine.deslocamentoDoModelo`).
 */
export function pontoNoModelo(p: V3, d: V3): V3 {
  return [p[0] - d[0], p[1] - d[1], p[2] - d[2]];
}

export function pontoNaCena(p: V3, d: V3): V3 {
  return [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
}

export function vistaNoModelo(v: { position: V3; target: V3 }, d: V3): { position: V3; target: V3 } {
  return { position: pontoNoModelo(v.position, d), target: pontoNoModelo(v.target, d) };
}

export function vistaNaCena(v: { position: V3; target: V3 }, d: V3): { position: V3; target: V3 } {
  return { position: pontoNaCena(v.position, d), target: pontoNaCena(v.target, d) };
}
