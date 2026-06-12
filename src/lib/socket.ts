import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

let io: SocketServer | null = null;

/** Presença em memória (single-instance). userId → nº de conexões. */
const presenca = new Map<string, number>();

/**
 * Inicializa o Socket.io sobre o servidor HTTP, autenticando cada conexão
 * pela sessão do better-auth (mesmo login do HTTP). Canais de chat e
 * mensagens entram na Onda 3; aqui fica a base autenticada + presença.
 */
export function initSocket(server: HttpServer): SocketServer {
  if (io) return io;

  io = new SocketServer(server, {
    path: "/socket.io",
    serveClient: false,
  });

  io.use(async (socket, nextFn) => {
    try {
      const cookie = socket.handshake.headers.cookie ?? "";
      const session = await auth.api.getSession({
        headers: new Headers({ cookie }),
      });
      if (!session) return nextFn(new Error("não autenticado"));
      socket.data.userId = session.user.id;
      socket.data.role = (session.user as { role?: string }).role;
      nextFn();
    } catch (err) {
      nextFn(err instanceof Error ? err : new Error("falha de autenticação"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.data.userId as string;
    presenca.set(userId, (presenca.get(userId) ?? 0) + 1);
    io!.emit("presenca", { userId, online: true });

    // Entra no room próprio e nos rooms dos canais de que é membro.
    socket.join(`user:${userId}`);
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

    socket.on("disconnect", () => {
      const n = (presenca.get(userId) ?? 1) - 1;
      if (n <= 0) {
        presenca.delete(userId);
        io!.emit("presenca", { userId, online: false });
      } else {
        presenca.set(userId, n);
      }
    });
  });

  console.log("[socket.io] iniciado.");
  return io;
}

export function getIo(): SocketServer | null {
  return io;
}

export function usuariosOnline(): string[] {
  return [...presenca.keys()];
}

export function usuarioOnline(userId: string): boolean {
  return presenca.has(userId);
}

/** Emite um evento para todos no room de um canal. */
export function emitParaCanal(canalId: string, evento: string, payload: unknown) {
  io?.to(`canal:${canalId}`).emit(evento, payload);
}

/** Emite um evento para um usuário específico (todos os dispositivos). */
export function emitParaUsuario(userId: string, evento: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(evento, payload);
}
