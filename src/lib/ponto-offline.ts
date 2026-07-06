"use client";

// Fila offline de batidas de ponto (camada app — independente do Service Worker).
// Cobre "página aberta e a conexão caiu": as batidas vão para o localStorage e
// são reenviadas quando a rede volta (evento `online`) ou no mount.
//
// v2 (Ponto v2): a jornada agora é por batidas (entrada → descansos → saída). A
// fila guarda o `tipo` da batida + o timestamp do cliente (`ts`), reenviado à
// action para preservar o horário real da batida feita offline (o servidor
// valida `ts` com salvaguardas anti-fraude). Itens legados da v1
// (bater/trocar/encerrar) são migrados na leitura.

const CHAVE = "ponto:fila";

export type TipoBatida = "entrada" | "inicio_descanso" | "fim_descanso" | "saida";
export type Geo = { lat: number; lng: number; accuracy?: number } | null;

export type ItemFila = {
  /** id local para idempotência de UI e remoção precisa da fila. */
  id: string;
  /** batida da jornada ou troca de projeto (não gera batida). */
  kind: "batida" | "troca";
  /** tipo da batida (quando kind === "batida"). */
  tipo?: TipoBatida;
  payload: { projetoId?: string; geo?: Geo };
  /** Timestamp (ms) de quando foi enfileirado — vira o horário real da batida. */
  ts: number;
};

type ActionResult = { ok: true; data: unknown } | { ok: false; error: string };

export type ActionsPonto = {
  registrarBatida: (i: {
    tipo: TipoBatida;
    projetoId?: string;
    geo?: Geo;
    ts?: number;
  }) => Promise<ActionResult>;
  trocar: (i: { projetoId?: string }) => Promise<ActionResult>;
};

function novoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Migra um item legado v1 (tipo bater/trocar/encerrar) para o formato v2. */
function migrarLegado(raw: unknown): ItemFila | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "batida" || o.kind === "troca") return o as unknown as ItemFila;
  // v1: { id, tipo: "bater"|"trocar"|"encerrar", payload, ts }
  const id = typeof o.id === "string" ? o.id : novoId();
  const ts = typeof o.ts === "number" ? o.ts : Date.now();
  const payload = (o.payload && typeof o.payload === "object" ? o.payload : {}) as ItemFila["payload"];
  if (o.tipo === "bater") return { id, kind: "batida", tipo: "entrada", payload, ts };
  if (o.tipo === "encerrar") return { id, kind: "batida", tipo: "saida", payload, ts };
  if (o.tipo === "trocar") return { id, kind: "troca", payload, ts };
  return null;
}

/** Lê a fila do localStorage (resiliente a JSON corrompido / SSR / itens legados). */
export function lerFila(): ItemFila[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAVE);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(migrarLegado).filter((i): i is ItemFila => i !== null);
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

/** Enfileira uma batida pendente e devolve o item criado. */
export function enfileirarBatida(tipo: TipoBatida, payload: ItemFila["payload"]): ItemFila {
  const item: ItemFila = { id: novoId(), kind: "batida", tipo, payload, ts: Date.now() };
  const fila = lerFila();
  fila.push(item);
  escrever(fila);
  return item;
}

/** Enfileira uma troca de projeto pendente. */
export function enfileirarTroca(payload: ItemFila["payload"]): ItemFila {
  const item: ItemFila = { id: novoId(), kind: "troca", payload, ts: Date.now() };
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
 * Reenvia cada item da fila chamando a action correspondente, na ordem em que
 * foram enfileirados. Remove os que derem `ok`.
 *
 * - Erro de aplicação (`ok: false`): remove o item (reenviar não resolve) e
 *   registra em `falhas`.
 * - Erro de rede (Promise rejeita): para e MANTÉM o item para tentar depois.
 */
export async function sincronizar(
  actions: ActionsPonto,
): Promise<{ sincronizados: number; restantes: number; falhas: string[] }> {
  let sincronizados = 0;
  const falhas: string[] = [];

  const fila = lerFila();
  for (const item of fila) {
    try {
      const r: ActionResult =
        item.kind === "batida"
          ? await actions.registrarBatida({
              tipo: item.tipo!,
              projetoId: item.payload.projetoId,
              geo: item.payload.geo,
              ts: item.ts,
            })
          : await actions.trocar({ projetoId: item.payload.projetoId });

      if (r.ok) {
        limparItem(item.id);
        sincronizados++;
      } else {
        limparItem(item.id);
        falhas.push(r.error);
      }
    } catch {
      break; // erro de rede — mantém este e os próximos
    }
  }

  return { sincronizados, restantes: contarPendentes(), falhas };
}

/** Heurística: o navegador reporta offline? (best-effort — `onLine` não é 100% confiável.) */
export function estaOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
