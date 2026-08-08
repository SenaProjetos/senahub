/**
 * Regras das contas bancárias do colaborador. **Sem `server-only`** — compartilhado por Server
 * Actions, jobs e scripts, como os demais `service.ts`.
 *
 * Duas responsabilidades que não podem morar na action:
 *  1. normalizar/validar a chave PIX (a mesma função que o formulário usa, p/ a mensagem bater);
 *  2. manter `User.contaBancariaPrincipalId` apontando só para conta DAQUELA pessoa.
 */
import { ActionError } from "@/lib/action-error";
import type { Prisma } from "@/generated/prisma/client";
import { validarChavePix, type TipoPix } from "./pix";

type Db = Prisma.TransactionClient;

export type EntradaConta = {
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  tipoConta?: string | null;
  titular?: string | null;
  pixTipo?: TipoPix | null;
  pixChave?: string | null;
};

/** Campos prontos para gravar: strings em branco viram `null`, chave PIX normalizada. */
export type ContaNormalizada = {
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipoConta: string | null;
  titular: string | null;
  pixTipo: TipoPix | null;
  pixChave: string | null;
};

const vazio = (v: string | null | undefined) => (v ?? "").trim() || null;

/**
 * Valida e normaliza. Uma conta precisa ter **ou** dados bancários **ou** PIX — cadastro
 * totalmente vazio não é conta, é ruído na lista.
 */
export function normalizarConta(e: EntradaConta): ContaNormalizada {
  const banco = vazio(e.banco);
  const agencia = vazio(e.agencia);
  const conta = vazio(e.conta);
  const tipoConta = vazio(e.tipoConta);
  const titular = vazio(e.titular);
  const chaveBruta = vazio(e.pixChave);
  const tipo = e.pixTipo ?? null;

  if (chaveBruta && !tipo) throw new ActionError("Escolha o tipo da chave PIX.");
  if (tipo && !chaveBruta) throw new ActionError("Informe a chave PIX ou remova o tipo.");

  let pixChave: string | null = null;
  if (tipo && chaveBruta) {
    const r = validarChavePix(tipo, chaveBruta);
    if (!r.ok) throw new ActionError(r.erro);
    pixChave = r.chave;
  }

  if (!banco && !agencia && !conta && !pixChave) {
    throw new ActionError("Informe ao menos os dados bancários ou uma chave PIX.");
  }

  return { banco, agencia, conta, tipoConta, titular, pixTipo: tipo, pixChave };
}

/**
 * Aponta a conta principal do usuário. Confere a posse antes: sem isso, um id de conta de
 * outra pessoa entraria no ponteiro (o `@unique` impede duplicar, não impede apontar errado).
 */
export async function definirContaPrincipal(db: Db, userId: string, contaId: string): Promise<void> {
  const c = await db.contaBancariaColaborador.findUnique({
    where: { id: contaId },
    select: { userId: true, ativo: true },
  });
  if (!c || c.userId !== userId) throw new ActionError("Conta não encontrada para esta pessoa.");
  if (!c.ativo) throw new ActionError("Conta inativa não pode ser a principal.");
  await db.user.update({ where: { id: userId }, data: { contaBancariaPrincipalId: contaId } });
}

/**
 * Se a pessoa ficou sem principal (removeu justamente a que era), elege a conta ativa mais
 * antiga. Evita o estado "tem conta mas nenhuma principal", que a folha teria de adivinhar.
 */
export async function garantirPrincipal(db: Db, userId: string): Promise<void> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { contaBancariaPrincipalId: true } });
  if (u?.contaBancariaPrincipalId) return;
  const primeira = await db.contaBancariaColaborador.findFirst({
    where: { userId, ativo: true },
    orderBy: { criadoEm: "asc" },
    select: { id: true },
  });
  if (primeira) {
    await db.user.update({ where: { id: userId }, data: { contaBancariaPrincipalId: primeira.id } });
  }
}
