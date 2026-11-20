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
  pisoY: number;
  localIds: number[];
};

export type PavimentoUnido = {
  chave: string;
  nome: string;
  pisoY: number;
  porModelo: Map<string, number[]>;
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

/**
 * Une pavimentos de vários modelos por nome normalizado (sem acento/caixa/espaço extra).
 * Piso = o menor `pisoY`; ordem crescente de piso; sem nome → "Sem pavimento", sempre por último.
 */
export function unirPavimentos(
  lista: readonly PavimentoDoModelo[],
): PavimentoUnido[] {
  const porChave = new Map<string, PavimentoUnido>();

  for (const p of lista) {
    const normalizado = p.nome ? normalizarNome(p.nome) : "";
    const semNome = normalizado === "" || normalizado === CHAVE_SEM_PAVIMENTO;
    const chave = semNome ? CHAVE_SEM_PAVIMENTO : normalizado;

    let item = porChave.get(chave);
    if (!item) {
      item = {
        chave,
        nome: semNome ? NOME_SEM_PAVIMENTO : (p.nome as string).trim().replace(/\s+/g, " "),
        pisoY: p.pisoY,
        porModelo: new Map(),
      };
      porChave.set(chave, item);
    } else if (p.pisoY < item.pisoY) {
      item.pisoY = p.pisoY;
    }

    const ids = item.porModelo.get(p.modeloId);
    if (ids) ids.push(...p.localIds);
    else item.porModelo.set(p.modeloId, [...p.localIds]);
  }

  const todos = [...porChave.values()];
  const comNome = todos
    .filter((p) => p.chave !== CHAVE_SEM_PAVIMENTO)
    .sort((a, b) => a.pisoY - b.pisoY || a.nome.localeCompare(b.nome, "pt-BR"));
  const sem = todos.filter((p) => p.chave === CHAVE_SEM_PAVIMENTO);
  return [...comNome, ...sem];
}
