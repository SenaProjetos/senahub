export type SinoAutomacaoInput = {
  titulo: string;
  corpo: string;
  href: string;
};

export type AutomacaoComercialTx = {
  notificacao: {
    create(args: {
      data: SinoAutomacaoInput & { userId: string };
    }): Promise<{ id: string }>;
  };
  automacaoComercialEnviada: {
    create(args: {
      data: { userId: string; chave: string; notificacaoId: string };
    }): Promise<unknown>;
  };
};

export type TransacionarAutomacao = (
  operacao: (tx: AutomacaoComercialTx) => Promise<string>,
) => Promise<string>;

export type ResultadoAutomacao =
  | { criado: true; notificacaoId: string }
  | { criado: false; notificacaoId: null };

function ehConflitoUnico(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

/**
 * Cria o sino e a marca de dedup no mesmo commit. Se dois workers disputarem a mesma chave, a
 * constraint `@@unique([userId, chave])` deixa um vencer e o rollback remove o sino do perdedor.
 */
export async function persistirAutomacaoUmaVez(
  transacionar: TransacionarAutomacao,
  userId: string,
  chave: string,
  sino: SinoAutomacaoInput,
): Promise<ResultadoAutomacao> {
  try {
    const notificacaoId = await transacionar(async (tx) => {
      const notificacao = await tx.notificacao.create({ data: { userId, ...sino } });
      await tx.automacaoComercialEnviada.create({
        data: { userId, chave, notificacaoId: notificacao.id },
      });
      return notificacao.id;
    });
    return { criado: true, notificacaoId };
  } catch (erro) {
    if (ehConflitoUnico(erro)) return { criado: false, notificacaoId: null };
    throw erro;
  }
}

/** Push é um canal secundário: falhar não desfaz o sino já confirmado. */
export async function entregarPushBestEffort(
  entregar: () => Promise<void>,
  aoFalhar: (erro: unknown) => void,
): Promise<boolean> {
  try {
    await entregar();
    return true;
  } catch (erro) {
    aoFalhar(erro);
    return false;
  }
}
