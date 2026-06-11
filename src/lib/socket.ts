import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { auth } from "@/lib/auth";

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

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    presenca.set(userId, (presenca.get(userId) ?? 0) + 1);
    io!.emit("presenca", { userId, online: true });

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
