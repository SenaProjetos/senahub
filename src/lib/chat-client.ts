"use client";

import { io, type Socket } from "socket.io-client";
import { canalDoPush } from "@/modules/chat/sincronia";

let socket: Socket | null = null;
/** Quantas vezes o socket conectou nesta aba — a partir da 2ª é reconexão. */
let conexoes = 0;
/** canalId → quando chegou a última mensagem dele pelo socket (ms). */
const ultimaAoVivo = new Map<string, number>();

/** Singleton do socket do chat (mesma origem, cookie de sessão). */
export function getSocket(): Socket {
  if (!socket) {
    const s = io({ path: "/socket.io", withCredentials: true });
    socket = s;
    // Registrados antes de qualquer tela, então rodam antes dos listeners delas.
    s.on("connect", () => {
      conexoes += 1;
    });
    s.on("mensagem", (p: { canalId?: string }) => {
      if (p?.canalId) ultimaAoVivo.set(p.canalId, Date.now());
    });
    // Recusa no handshake (o middleware de auth do servidor falhou) desliga a reconexão
    // automática do socket.io-client: o chat ficava mudo até o F5, só com push e sino. Uma
    // falha passageira (banco lento ao validar a sessão) não pode matar o chat da aba.
    // Sessão encerrada de fato ("não autenticado") não insiste: o próximo clique leva ao login.
    s.on("connect_error", (err) => {
      if (s.active || err.message === "não autenticado") return;
      setTimeout(() => {
        if (!s.connected) s.connect();
      }, 5000 + Math.random() * 5000);
    });
  }
  return socket;
}

/**
 * Chama `cb` a cada RECONEXÃO do socket (não na primeira conexão). O socket.io não reenvia o
 * que foi emitido enquanto a conexão estava caída: quem mostra dados ao vivo rebusca aqui.
 */
export function aoReconectar(cb: () => void): () => void {
  const s = getSocket();
  const h = () => {
    if (conexoes > 1) cb();
  };
  s.on("connect", h);
  return () => {
    s.off("connect", h);
  };
}

/** Chegou mensagem deste canal pelo socket nos últimos `janelaMs`? */
export function chegouAoVivo(canalId: string, janelaMs: number): boolean {
  const t = ultimaAoVivo.get(canalId);
  return t !== undefined && Date.now() - t <= janelaMs;
}

/**
 * Chama `cb(canalId)` quando chega um push de mensagem do chat que o socket NÃO entregou.
 *
 * O servidor emite no socket ANTES de mandar o push, então, com o socket saudável, a mensagem
 * já está na tela quando o push chega. Se não chegou nada daquele canal pelo socket, a conexão
 * está caída ou pendurada (rede trocou e o socket ainda não percebeu) — e é justamente o caso
 * do "ouvi a notificação e a mensagem não apareceu". Espera um pouco antes de decidir, para o
 * evento do socket que estiver a caminho chegar primeiro.
 */
export function aoPushSemSocket(cb: (canalId: string) => void): () => void {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (!sw) return () => {};
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function onMessage(e: MessageEvent) {
    if (e.data?.type !== "notificacao") return;
    const canalId = canalDoPush(e.data?.payload?.tag);
    if (!canalId) return;
    const t = setTimeout(() => {
      timers.delete(t);
      if (!chegouAoVivo(canalId, 10_000)) cb(canalId);
    }, 1500);
    timers.add(t);
  }
  sw.addEventListener("message", onMessage);
  return () => {
    sw.removeEventListener("message", onMessage);
    for (const t of timers) clearTimeout(t);
  };
}

let audioCtx: AudioContext | null = null;

/** Beep curto via WebAudio — evita asset binário e funciona offline. */
export function tocarSom() {
  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {
    // silêncio se o navegador bloquear áudio
  }
}
