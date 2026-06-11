// Polyfill: o Next espera globalThis.AsyncLocalStorage definido. Em um servidor
// custom rodando via tsx, módulos internos do Next são carregados antes do seu
// próprio bootstrap, então definimos aqui — DEVE ser o primeiro import do server.
import { AsyncLocalStorage } from "node:async_hooks";

const g = globalThis as unknown as { AsyncLocalStorage?: unknown };
if (!g.AsyncLocalStorage) g.AsyncLocalStorage = AsyncLocalStorage;

export {};
