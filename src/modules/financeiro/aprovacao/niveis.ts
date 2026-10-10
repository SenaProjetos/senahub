/**
 * Níveis de alçada por faixa de valor (puro, testável). Roteamento por faixa:
 * cada faixa cobre valores até `ate` (null = sem teto / catch-all) e define quem pode aprovar.
 * Faixa com `papeis` vazio = aprovação automática (sem alçada).
 *
 * `papeis` guarda CHAVES DE PERFIL DE ACESSO (Onda F — eram papéis do enum `Role`), mais o token
 * `admin`, que quer dizer "superusuário": faixa só com ele exige aprovação e só ele decide. O nome
 * do campo ficou para não reescrever o JSON salvo; a migração `20261010170000_alcada_por_perfil`
 * troca `supervisor` por `coordenador`.
 */
export type FaixaAlcada = { ate: number | null; papeis: string[] };

/** Token de "superusuário" dentro de `papeis`. */
export const TOKEN_SUPERUSUARIO = "admin";

/** Quem pode ser escolhido como aprovador de alçada: superusuário + os perfis com poder de decisão. */
export const APROVADORES_ALCADA = [
  { chave: TOKEN_SUPERUSUARIO, nome: "Superusuário" },
  { chave: "coordenador", nome: "Coordenador" },
  { chave: "administrativo", nome: "Administrativo" },
] as const;

/** Faixa que cobre o valor: a de menor teto cujo `ate` >= valor; `ate=null` é catch-all. */
export function faixaPara(valor: number, faixas: FaixaAlcada[]): FaixaAlcada | null {
  const ordenadas = [...faixas].sort((a, b) => (a.ate ?? Infinity) - (b.ate ?? Infinity));
  for (const f of ordenadas) {
    if (f.ate == null || valor <= f.ate) return f;
  }
  return null;
}

/** Despesa precisa de aprovação quando a faixa do valor exige papéis aprovadores. */
export function precisaAprovacao(tipo: "receita" | "despesa", valor: number, faixas: FaixaAlcada[]): boolean {
  if (tipo !== "despesa") return false;
  const f = faixaPara(valor, faixas);
  return !!f && f.papeis.length > 0;
}

/** Papéis aptos a aprovar uma despesa do valor informado (vazio = nenhum / automático). */
export function papeisAprovadores(valor: number, faixas: FaixaAlcada[]): string[] {
  return faixaPara(valor, faixas)?.papeis ?? [];
}

/*
 * ── Alçada única (N3 do núcleo do Financeiro, decisões do dono de 2026-10-02) ──────────────────────
 *
 * - Isenta por origem: folha CLT, projetistas, ART, serviços, recorrência, parcelas de documento e
 *   distribuição de lucros já foram aprovados onde nasceram e gravam a despesa direto, sem passar
 *   por aqui. Passa pela alçada o lançamento manual (`criarLancamentoNoTx`) e qualquer despesa cujo
 *   VALOR mude pela edição no Financeiro.
 * - O valor que conta é o TOTAL do parcelamento: 60 × R$ 900 com faixa automática até R$ 1.000 passava
 *   inteiro sem ninguém olhar.
 * - Só o admin aprova a própria despesa (o escritório não trava); os demais aprovadores, não.
 * - A faixa inclui o teto: faixa "até R$ 1.000" cobre exatamente R$ 1.000. O antigo "limite de
 *   alçada" (≥ limite exige aprovação) saiu — duas regras com fronteiras diferentes.
 */

export const MOTIVO_SEM_ALCADA = "Você não tem alçada para aprovar este valor.";
export const MOTIVO_PROPRIA_DESPESA = "Quem lançou a despesa não a aprova: peça a outro aprovador.";

/** Valor que a alçada avalia: o total das ocorrências (centavos, sem erro de ponto flutuante). */
export function valorDaAlcada(valor: number, ocorrencias = 1): number {
  return (Math.round(valor * 100) * Math.max(1, ocorrencias)) / 100;
}

/** Por que este aprovador não pode decidir esta despesa; `null` = pode. Superusuário decide tudo. */
export function motivoParaNaoAprovar(p: {
  valorAlcada: number;
  faixas: FaixaAlcada[];
  aprovador: { id: string; perfilChave: string | null; superUsuario: boolean };
  autorId: string;
}): string | null {
  if (p.aprovador.superUsuario) return null;
  if (p.aprovador.id === p.autorId) return MOTIVO_PROPRIA_DESPESA;
  const chave = p.aprovador.perfilChave;
  if (!chave || !papeisAprovadores(p.valorAlcada, p.faixas).includes(chave)) return MOTIVO_SEM_ALCADA;
  return null;
}

/**
 * Situação de uma despesa em aberto depois que o VALOR mudou pela edição; `null` = não muda. Acima da
 * alçada volta (ou fica) em aprovação, mesmo já aprovada antes — aprovaram outro valor. Abaixo, uma
 * que esperava aprovação é liberada.
 */
export function situacaoAposMudarValor(p: {
  tipo: string;
  status: string;
  valorAlcada: number;
  faixas: FaixaAlcada[];
}): "aguardando_aprovacao" | "previsto" | null {
  if (p.tipo !== "despesa") return null;
  if (p.status !== "previsto" && p.status !== "aguardando_aprovacao") return null;
  if (precisaAprovacao("despesa", p.valorAlcada, p.faixas)) return "aguardando_aprovacao";
  return p.status === "aguardando_aprovacao" ? "previsto" : null;
}
