import "server-only";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";

const MAX_BUCKETS = 10_000;

type Bucket = {
  usado: number;
  expiraEm: number;
  bloqueioAuditado: boolean;
};

export type ConfiguracaoLimite = {
  chave: string;
  maximo: number;
  janelaMs: number;
};

export type ResultadoLimite = {
  permitido: boolean;
  restantes: number;
  limite: number;
  expiraEm: number;
  retryDepoisSegundos: number;
  primeiroBloqueio: boolean;
  ip: string | null;
};

type EstadoLimitador = { buckets: Map<string, Bucket> };

type GlobalComLimitador = typeof globalThis & {
  __senahubRateLimit?: EstadoLimitador;
};

/**
 * Limitador de janela fixa, isolado para facilitar teste. A instância de produção
 * vive em globalThis porque server.ts e os bundles do Next podem carregar este
 * módulo separadamente no mesmo processo.
 */
export function criarLimitador(
  buckets = new Map<string, Bucket>(),
  agora: () => number = Date.now,
) {
  return (config: ConfiguracaoLimite): Omit<ResultadoLimite, "ip"> => {
    const instante = agora();
    let bucket = buckets.get(config.chave);

    if (!bucket || bucket.expiraEm <= instante) {
      // Sob flood de chaves inéditas, concentra excedentes em um balde seguro em
      // vez de permitir crescimento ilimitado da memória.
      const usandoOverflow = !bucket && buckets.size >= MAX_BUCKETS;
      if (usandoOverflow && !buckets.has("__overflow__")) {
        const primeiraChave = buckets.keys().next().value;
        if (primeiraChave) buckets.delete(primeiraChave);
      }
      const chaveEfetiva = usandoOverflow ? "__overflow__" : config.chave;
      bucket = buckets.get(chaveEfetiva);
      if (!bucket || bucket.expiraEm <= instante) {
        bucket = { usado: 0, expiraEm: instante + config.janelaMs, bloqueioAuditado: false };
        buckets.set(chaveEfetiva, bucket);
      }
    }

    if (bucket.usado >= config.maximo) {
      const primeiroBloqueio = !bucket.bloqueioAuditado;
      bucket.bloqueioAuditado = true;
      return {
        permitido: false,
        restantes: 0,
        limite: config.maximo,
        expiraEm: bucket.expiraEm,
        retryDepoisSegundos: Math.max(1, Math.ceil((bucket.expiraEm - instante) / 1_000)),
        primeiroBloqueio,
      };
    }

    bucket.usado += 1;
    return {
      permitido: true,
      restantes: config.maximo - bucket.usado,
      limite: config.maximo,
      expiraEm: bucket.expiraEm,
      retryDepoisSegundos: 0,
      primeiroBloqueio: false,
    };
  };
}

function limitadorGlobal() {
  const global = globalThis as GlobalComLimitador;
  global.__senahubRateLimit ??= { buckets: new Map<string, Bucket>() };
  return criarLimitador(global.__senahubRateLimit.buckets);
}

export function ipDaRequisicao(req: Request): string | null {
  const cloudflare = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare.slice(0, 64);
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 64);
  return req.headers.get("x-real-ip")?.trim().slice(0, 64) || null;
}

export function limitarRequisicao(
  req: Request,
  config: Omit<ConfiguracaoLimite, "chave"> & { escopo: string; identificador: string },
): ResultadoLimite {
  const ip = ipDaRequisicao(req);
  const identificador = config.identificador.slice(0, 160);
  const resultado = limitadorGlobal()({
    chave: `${config.escopo}:${ip ?? "desconhecido"}:${identificador}`,
    maximo: config.maximo,
    janelaMs: config.janelaMs,
  });
  return { ...resultado, ip };
}

export function respostaLimiteRequisicoes(resultado: ResultadoLimite) {
  return NextResponse.json(
    { error: "Muitas solicitações. Aguarde um instante e tente novamente." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(resultado.retryDepoisSegundos),
        "X-RateLimit-Limit": String(resultado.limite),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(resultado.expiraEm / 1_000)),
      },
    },
  );
}

/** Registra somente o primeiro bloqueio da janela para não amplificar um flood no banco. */
export async function auditarBloqueioRateLimit(
  resultado: ResultadoLimite,
  input: { modulo: string; acao: string; userId?: string; entidade?: string; entidadeId?: string },
) {
  if (!resultado.primeiroBloqueio) return;
  await logAudit({
    ...input,
    resultado: "bloqueado",
    ip: resultado.ip,
    detalhe: { motivo: "rate_limit", limite: resultado.limite, retryDepoisSegundos: resultado.retryDepoisSegundos },
  });
}
