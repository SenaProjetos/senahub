import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * IMPORTANTE: o `server.ts` (rodado por tsx) e o código do Next (Server Actions,
 * rotas — bundle do webpack) carregam ESTE módulo em instâncias SEPARADAS. Se
 * guardássemos `io`/`presenca` em variáveis de módulo comuns, o `initSocket`
 * (contexto tsx) populava uma cópia e as Server Actions liam OUTRA (sempre vazia)
 * → `emitParaCanal` virava no-op e `usuarioOnline` sempre retornava false.
 * A ponte entre os dois contextos é o `globalThis` (mesmo processo Node).
 */
const estadoGlobal = globalThis as unknown as {
  __senahubIo?: SocketServer | null;
  __senahubPresenca?: Map<string, number>;
};

function getIoInterno(): SocketServer | null {
  return estadoGlobal.__senahubIo ?? null;
}

/** Presença em memória (single-instance). userId → nº de conexões. */
function presencaMap(): Map<string, number> {
  return (estadoGlobal.__senahubPresenca ??= new Map<string, number>());
}

/**
 * Inicializa o Socket.io sobre o servidor HTTP, autenticando cada conexão
 * pela sessão do better-auth (mesmo login do HTTP). Canais de chat e
 * mensagens entram na Onda 3; aqui fica a base autenticada + presença.
 */
export function initSocket(server: HttpServer): SocketServer {
  const existente = getIoInterno();
  if (existente) return existente;

  const io = new SocketServer(server, {
    path: "/socket.io",
    serveClient: false,
  });
  estadoGlobal.__senahubIo = io;

  io.use(async (socket, nextFn) => {
    try {
      const cookie = socket.handshake.headers.cookie ?? "";
      const session = await auth.api.getSession({
        headers: new Headers({ cookie }),
      });
      if (!session) return nextFn(new Error("não autenticado"));
      socket.data.userId = session.user.id;
      socket.data.role = (session.user as { role?: string }).role;
      socket.data.nome = session.user.name;
      nextFn();
    } catch (err) {
      nextFn(err instanceof Error ? err : new Error("falha de autenticação"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.data.userId as string;
    const presenca = presencaMap();
    presenca.set(userId, (presenca.get(userId) ?? 0) + 1);
    io.emit("presenca", { userId, online: true });

    // Entra no room próprio e nos rooms dos canais de que é membro.
    socket.join(`user:${userId}`);

    // Snapshot de quem já está online (inclui o próprio, já inserido acima).
    socket.emit("presenca-inicial", usuariosOnline());
    try {
      const canais = await prisma.canalMembro.findMany({
        where: { userId },
        select: { canalId: true },
      });
      for (const c of canais) socket.join(`canal:${c.canalId}`);
    } catch {
      // sem DB no contexto → ignora (live cai para refresh)
    }

    // Cliente pede para entrar em um canal recém-criado (ex.: nova DM).
    socket.on("entrar-canal", (canalId: string) => {
      if (typeof canalId === "string") socket.join(`canal:${canalId}`);
    });

    // Cliente (re)montou e pede o snapshot atual de quem está online. Resolve a
    // corrida em que o listener `presenca-inicial` é registrado DEPOIS da conexão
    // (o socket é singleton, criado pelo provider antes do ChatView montar).
    socket.on("solicitar-presenca", () => {
      socket.emit("presenca-inicial", usuariosOnline());
    });

    // Relay efêmero de "está digitando" para o room do canal — sem persistir (C5-1).
    socket.on("digitando", (p: { canalId: string; digitando: boolean }) => {
      if (typeof p.canalId !== "string" || typeof p.digitando !== "boolean") return;
      socket.to(`canal:${p.canalId}`).emit("digitando", {
        canalId: p.canalId,
        userId,
        nome: socket.data.nome as string,
        digitando: p.digitando,
      });
    });

    socket.on("disconnect", () => {
      const n = (presenca.get(userId) ?? 1) - 1;
      if (n <= 0) {
        presenca.delete(userId);
        io.emit("presenca", { userId, online: false });
      } else {
        presenca.set(userId, n);
      }
    });
  });

  console.log("[socket.io] iniciado.");
  return io;
}

export function getIo(): SocketServer | null {
  return getIoInterno();
}

export function usuariosOnline(): string[] {
  return [...presencaMap().keys()];
}

export function usuarioOnline(userId: string): boolean {
  return presencaMap().has(userId);
}

/** Emite um evento para todos no room de um canal. */
export function emitParaCanal(canalId: string, evento: string, payload: unknown) {
  getIoInterno()?.to(`canal:${canalId}`).emit(evento, payload);
}

/** Emite um evento para um usuário específico (todos os dispositivos). */
export function emitParaUsuario(userId: string, evento: string, payload: unknown) {
  getIoInterno()?.to(`user:${userId}`).emit(evento, payload);
}

/**
 * Avisa cada usuário recém-adicionado a um canal para entrar no room ao vivo (C3-2).
 * Usuários offline são no-op — ao reconectarem entram pelo handler de `connection`.
 */
export function notificarNovosMembros(novos: { canalId: string; userId: string }[]) {
  for (const { canalId, userId } of novos) {
    emitParaUsuario(userId, "entrar-canal-novo", { canalId });
  }
}
