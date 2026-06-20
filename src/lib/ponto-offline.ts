"use client";

// Fila offline de batidas de ponto (camada app — independente do Service Worker).
// Cobre o caso "página aberta e a conexão caiu": as batidas vão para o
// localStorage e são reenviadas quando a rede volta (evento `online`) ou no mount.

const CHAVE = "ponto:fila";

export type TipoBatida = "bater" | "trocar" | "encerrar";

export type ItemFila = {
  /** id local para idempotência de UI e remoção precisa da fila. */
  id: string;
  tipo: TipoBatida;
  /** Payload já no formato esperado pela server action. */
  payload: { projetoId?: string };
  /** Timestamp (ms) de quando foi enfileirado — usado p/ ordenar e exibir. */
  ts: number;
};

/** Resultado padrão das server actions de ponto (ver lib/with-action). */
type ActionResult = { ok: true; data: unknown } | { ok: false; error: string };

/** Mapa tipo → server action correspondente. */
export type ActionsPonto = {
  bater: (i: { projetoId?: string }) => Promise<ActionResult>;
  trocar: (i: { projetoId?: string }) => Promise<ActionResult>;
  encerrar: (i: Record<string, never>) => Promise<ActionResult>;
};

function novoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Lê a fila do localStorage (resiliente a JSON corrompido / SSR). */
export function lerFila(): ItemFila[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAVE);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ItemFila[]) : [];
  } catch {
    return [];
  }
}

function escrever(fila: ItemFila[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(fila));
  } catch {
    // localStorage cheio/indisponível — ignora silenciosamente.
  }
}

/** Adiciona uma batida pendente ao fim da fila e devolve o item criado. */
export function enfileirar(tipo: TipoBatida, payload: { projetoId?: string }): ItemFila {
  const item: ItemFila = { id: novoId(), tipo, payload, ts: Date.now() };
  const fila = lerFila();
  fila.push(item);
  escrever(fila);
  return item;
}

/** Remove um item da fila pelo id local. */
export function limparItem(id: string): void {
  escrever(lerFila().filter((i) => i.id !== id));
}

/** Quantidade de batidas pendentes na fila. */
export function contarPendentes(): number {
  return lerFila().length;
}

/**
 * Tenta reenviar cada item da fila chamando a server action correspondente,
 * na ordem em que foram enfileirados. Remove os que derem `ok`.
 *
 * - Erro de aplicação (`ok: false`, ex.: "Jornada já iniciada"): remove o item
 *   da fila (não adianta reenviar) — fica registrado em `falhas`.
 * - Erro de rede (a Promise rejeita): para a sincronização e MANTÉM o item, para
 *   tentar de novo no próximo evento `online`.
 *
 * Retorna quantos sincronizaram, quantos restaram e as mensagens de falha de app.
 */
export async function sincronizar(
  actions: ActionsPonto,
): Promise<{ sincronizados: number; restantes: number; falhas: string[] }> {
  let sincronizados = 0;
  const falhas: string[] = [];

  // Snapshot da fila no início; processa em ordem.
  const fila = lerFila();
  for (const item of fila) {
    try {
      let r: ActionResult;
      if (item.tipo === "bater") r = await actions.bater(item.payload);
      else if (item.tipo === "trocar") r = await actions.trocar(item.payload);
      else r = await actions.encerrar({});

      if (r.ok) {
        limparItem(item.id);
        sincronizados++;
      } else {
        // Erro de aplicação — reenviar não resolve; descarta e registra.
        limparItem(item.id);
        falhas.push(r.error);
      }
    } catch {
      // Erro de rede — interrompe e mantém este e os próximos itens na fila.
      break;
    }
  }

  return { sincronizados, restantes: contarPendentes(), falhas };
}

/** Heurística: o navegador reporta offline? (best-effort — `onLine` não é 100% confiável.) */
export function estaOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
