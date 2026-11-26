/**
 * Conta de obra do portal (spec docs/superpowers/specs/2026-11-25-portal-conta-obra-design.md). Puro, testado; a leitura do
 * banco fica em `acesso.ts` / `queries.ts` e a escrita em `service.ts`.
 *
 * Uma conta de obra é `User.tipo = externo` + `User.clienteId = null` + uma linha `ContaObra`. Ela NUNCA tem cliente na
 * conta: é isso que mantém fechadas, sem mudar nada nelas, todas as áreas do cliente (financeiro, contratos, conversa…).
 * Daqui só sai a regra de quais obras a conta vê e quem entra nos arquivos da pasta "Liberado para obra".
 */
import { MSG_PORTAL, type DecisaoAcessoPortal } from "../acesso-regras";

export const MOTIVO_CONTA_OBRA = "Conta de obra não recebe cliente, perfil de acesso nem permissões.";
export const MOTIVO_OBRA_DE_OUTRO_CLIENTE = "Conta do cliente só recebe obras desse cliente.";
export const MOTIVO_OBRA_NAO_ENCONTRADA = "Obra não encontrada.";
export const MOTIVO_EMPRESA = "Informe a empresa (até 120 caracteres).";
export const MOTIVO_ACESSO_ATE_PASSADO = "A data de acesso não pode ser anterior a hoje.";
export const MOTIVO_CONTA_OBRA_MUDOU = "A conta mudou enquanto você editava. Atualize a página.";
export const MOTIVO_CLIENTE_DA_CONTA = "Escolha um cliente ativo, ou deixe em branco para empresa de fora.";

export const LIMITE_EMPRESA = 120;

export type EntradaAcessoObra = {
  temSessao: boolean;
  tipo: "interno" | "externo" | null;
  /** `User.clienteId` — numa conta de obra é sempre nulo. */
  clienteIdDaConta: string | null;
  temContaObra: boolean;
  /** `ContaObra.clienteId` ("é do cliente") e se esse cliente está ativo. */
  contaClienteId: string | null;
  contaClienteAtivo: boolean;
  /** O projeto está na lista da conta (`ContaObraProjeto`). */
  naLista: boolean;
  /** Cliente dono do projeto; null = o projeto não existe. */
  projetoClienteId: string | null;
  projetoClienteAtivo: boolean;
  mustChangePassword: boolean;
  termoPendente: boolean;
};

/**
 * A obra está liberada para a conta? Na lista, cliente do projeto ativo e, na conta "do cliente", esse cliente ativo e dono do
 * projeto. Sem filtro pela situação do projeto (obra concluída ainda precisa das pranchas).
 */
export function obraLiberadaParaConta(
  e: Pick<EntradaAcessoObra, "contaClienteId" | "contaClienteAtivo" | "naLista" | "projetoClienteId" | "projetoClienteAtivo">,
): boolean {
  if (!e.naLista || e.projetoClienteId === null || !e.projetoClienteAtivo) return false;
  if (e.contaClienteId !== null && (!e.contaClienteAtivo || e.contaClienteId !== e.projetoClienteId)) return false;
  return true;
}

/**
 * Quem entra nos arquivos de uma obra. Fora da regra é o mesmo 404 neutro do portal (não revela se o projeto existe); senha e
 * termo só são cobrados depois de saber que a obra é da pessoa, como no portal do cliente.
 */
export function decidirAcessoObra(e: EntradaAcessoObra): DecisaoAcessoPortal {
  if (!e.temSessao) return { ok: false, status: 401, erro: MSG_PORTAL.semSessao };
  const ehContaObra = e.tipo === "externo" && e.clienteIdDaConta === null && e.temContaObra;
  if (!ehContaObra || !obraLiberadaParaConta(e)) return { ok: false, status: 404, erro: MSG_PORTAL.indisponivel };
  if (e.mustChangePassword) return { ok: false, status: 403, erro: MSG_PORTAL.senha };
  if (e.termoPendente) return { ok: false, status: 403, erro: MSG_PORTAL.termo };
  return { ok: true };
}

export type ObraDaLista = { projetoId: string; clienteId: string; clienteAtivo: boolean };

/** As obras da lista que a conta vê hoje (a mesma regra de `obraLiberadaParaConta`, em lote). */
export function obrasValidas<T extends ObraDaLista>(conta: { clienteId: string | null; clienteAtivo: boolean }, itens: readonly T[]): T[] {
  return itens.filter((i) =>
    obraLiberadaParaConta({
      contaClienteId: conta.clienteId,
      contaClienteAtivo: conta.clienteAtivo,
      naLista: true,
      projetoClienteId: i.clienteId,
      projetoClienteAtivo: i.clienteAtivo,
    }),
  );
}

/** A lista pedida pode ser gravada? Todo projeto existe e, na conta "do cliente", é desse cliente. */
export function motivoListaDeObras(
  contaClienteId: string | null,
  projetos: readonly { id: string; clienteId: string }[],
  pedidos: readonly string[],
): string | null {
  const porId = new Map(projetos.map((p) => [p.id, p]));
  for (const id of pedidos) {
    const p = porId.get(id);
    if (!p) return MOTIVO_OBRA_NAO_ENCONTRADA;
    if (contaClienteId !== null && p.clienteId !== contaClienteId) return MOTIVO_OBRA_DE_OUTRO_CLIENTE;
  }
  return null;
}

/**
 * `editarUsuario` numa conta de obra: a entrada pede cliente, perfil, superusuário, permissão extra ou sócio? Qualquer texto
 * não vazio conta — inclusive só espaços, que a escrita gravaria como veio.
 */
export function pedeAcessoDeCliente(i: {
  clienteId?: string;
  perfilId?: string;
  superUsuario?: boolean;
  gereRh?: boolean;
  moderaChat?: boolean;
  ehSocio?: boolean;
}): boolean {
  return !!i.clienteId || !!i.perfilId || i.superUsuario === true || i.gereRh === true || i.moderaChat === true || i.ehSocio === true;
}

/** "Acesso até" (dias `YYYY-MM-DD`): data NOVA no passado é recusada; a mesma já gravada (mesmo vencida) passa. */
export function motivoAcessoAte(o: { novo: string | null; anterior: string | null; hoje: string }): string | null {
  if (o.novo === null || o.novo === o.anterior) return null;
  return o.novo < o.hoje ? MOTIVO_ACESSO_ATE_PASSADO : null;
}

/** Nome da empresa aparado, 1–120 caracteres; fora disso `null`. */
export function normalizarEmpresa(s: string): string | null {
  const t = s.trim();
  return t.length >= 1 && t.length <= LIMITE_EMPRESA ? t : null;
}

/**
 * "Obra que atrasou": a conta foi desligada porque o "Acesso até" venceu, e a equipe grava uma data de hoje em diante → volta a
 * valer, guardando a data nova. Conta desativada à mão (sem data vencida) continua só pelo "Reativar". Dias `YYYY-MM-DD`.
 */
export function deveReativarPorAcessoAte(o: {
  ativo: boolean;
  acessoAteAntes: string | null;
  acessoAteNovo: string | null;
  hoje: string;
}): boolean {
  if (o.ativo || o.acessoAteAntes === null || o.acessoAteNovo === null) return false;
  return o.acessoAteAntes < o.hoje && o.acessoAteNovo >= o.hoje;
}
