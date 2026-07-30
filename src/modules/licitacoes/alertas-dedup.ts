export type SinoLicitacaoInput = {
  titulo: string;
  corpo?: string;
  href?: string;
};

export type AlertaLicitacaoTx = {
  notificacao: {
    create(args: {
      data: {
        userId: string;
        titulo: string;
        corpo?: string;
        href?: string;
      };
    }): Promise<{ id: string }>;
  };
  alertaLicitacaoEnviado: {
    create(args: {
      data: {
        userId: string;
        chave: string;
        notificacaoId: string;
      };
    }): Promise<unknown>;
  };
};

export type TransacionarAlertaLicitacao = (
  operacao: (tx: AlertaLicitacaoTx) => Promise<string>,
) => Promise<string>;

export type ResultadoSinoLicitacao =
  | { criado: true; notificacaoId: string }
  | { criado: false; notificacaoId: null };

function ehConflitoUnico(erro: unknown): boolean {
  return (
    typeof erro === "object"
    && erro !== null
    && "code" in erro
    && erro.code === "P2002"
  );
}

/**
 * Persiste o sino e a marca de deduplicação na MESMA transação.
 *
 * A notificação é criada primeiro para obter seu id; se a chave já existir ou
 * o processo/conexão falhar antes do commit, a transação desfaz também o sino.
 * Um retry posterior cria exatamente um sino ou encontra a chave já confirmada.
 */
export async function persistirSinoLicitacaoUmaVez(
  transacionar: TransacionarAlertaLicitacao,
  userId: string,
  chave: string,
  sino: SinoLicitacaoInput,
): Promise<ResultadoSinoLicitacao> {
  try {
    const notificacaoId = await transacionar(async (tx) => {
      const notificacao = await tx.notificacao.create({
        data: {
          userId,
          titulo: sino.titulo,
          corpo: sino.corpo,
          href: sino.href,
        },
      });
      await tx.alertaLicitacaoEnviado.create({
        data: {
          userId,
          chave,
          notificacaoId: notificacao.id,
        },
      });
      return notificacao.id;
    });
    return { criado: true, notificacaoId };
  } catch (erro) {
    if (ehConflitoUnico(erro)) return { criado: false, notificacaoId: null };
    throw erro;
  }
}

/**
 * Canal secundário: uma falha de push nunca desfaz nem reprocessa o sino já
 * confirmado. Retorna se a entrega ocorreu apenas para observabilidade.
 */
export async function entregarBestEffort(
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
