import { describe, expect, it, vi } from "vitest";
import {
  entregarBestEffort,
  persistirSinoLicitacaoUmaVez,
  type AlertaLicitacaoTx,
  type TransacionarAlertaLicitacao,
} from "./alertas-dedup";

type SinoMemoria = {
  id: string;
  userId: string;
  titulo: string;
  corpo?: string;
  href?: string;
};

function bancoTransacionalMemoria() {
  let sinos: SinoMemoria[] = [];
  let chaves = new Set<string>();
  let sequencia = 0;
  let falhaAntesDaMarcacao: unknown = null;

  const transacionar: TransacionarAlertaLicitacao = async (operacao) => {
    // Cópias privadas representam a transação: só viram estado visível no commit.
    const sinosTx = sinos.map((sino) => ({ ...sino }));
    const chavesTx = new Set(chaves);
    const tx: AlertaLicitacaoTx = {
      notificacao: {
        create: async ({ data }) => {
          const sino = { id: `sino-${++sequencia}`, ...data };
          sinosTx.push(sino);
          return { id: sino.id };
        },
      },
      alertaLicitacaoEnviado: {
        create: async ({ data }) => {
          if (falhaAntesDaMarcacao) throw falhaAntesDaMarcacao;
          const composta = `${data.userId}:${data.chave}`;
          if (chavesTx.has(composta)) throw { code: "P2002" };
          chavesTx.add(composta);
          return { id: `dedup-${composta}`, notificacaoId: data.notificacaoId };
        },
      },
    };

    const resultado = await operacao(tx);
    sinos = sinosTx;
    chaves = chavesTx;
    return resultado;
  };

  return {
    transacionar,
    sinos: () => sinos,
    chaves: () => chaves,
    falharAntesDaMarcacao: (erro: unknown) => {
      falhaAntesDaMarcacao = erro;
    },
  };
}

describe("persistirSinoLicitacaoUmaVez", () => {
  it("confirma sino e dedup juntos", async () => {
    const banco = bancoTransacionalMemoria();

    await expect(
      persistirSinoLicitacaoUmaVez(
        banco.transacionar,
        "user-1",
        "alerta-1",
        { titulo: "Vencimento", corpo: "Em 7 dias", href: "/licitacoes/1" },
      ),
    ).resolves.toEqual({ criado: true, notificacaoId: "sino-1" });

    expect(banco.sinos()).toEqual([
      {
        id: "sino-1",
        userId: "user-1",
        titulo: "Vencimento",
        corpo: "Em 7 dias",
        href: "/licitacoes/1",
      },
    ]);
    expect(banco.chaves()).toEqual(new Set(["user-1:alerta-1"]));
  });

  it("rollback após criar o sino permite retry sem deixar reserva ou duplicata", async () => {
    const banco = bancoTransacionalMemoria();
    const falha = new Error("conexão caiu antes do commit");
    banco.falharAntesDaMarcacao(falha);

    await expect(
      persistirSinoLicitacaoUmaVez(
        banco.transacionar,
        "user-1",
        "alerta-1",
        { titulo: "Vencimento" },
      ),
    ).rejects.toBe(falha);
    expect(banco.sinos()).toEqual([]);
    expect(banco.chaves()).toEqual(new Set());

    banco.falharAntesDaMarcacao(null);
    await expect(
      persistirSinoLicitacaoUmaVez(
        banco.transacionar,
        "user-1",
        "alerta-1",
        { titulo: "Vencimento" },
      ),
    ).resolves.toEqual({ criado: true, notificacaoId: "sino-2" });
    expect(banco.sinos()).toHaveLength(1);
    expect(banco.chaves()).toEqual(new Set(["user-1:alerta-1"]));
  });

  it("retry da mesma chave faz rollback do sino concorrente e permanece idempotente", async () => {
    const banco = bancoTransacionalMemoria();
    const dados = { titulo: "Vencimento" };

    await expect(
      persistirSinoLicitacaoUmaVez(banco.transacionar, "user-1", "alerta-1", dados),
    ).resolves.toMatchObject({ criado: true });
    await expect(
      persistirSinoLicitacaoUmaVez(banco.transacionar, "user-1", "alerta-1", dados),
    ).resolves.toEqual({ criado: false, notificacaoId: null });
    await expect(
      persistirSinoLicitacaoUmaVez(banco.transacionar, "user-2", "alerta-1", dados),
    ).resolves.toMatchObject({ criado: true });

    expect(banco.sinos()).toHaveLength(2);
    expect(banco.chaves()).toEqual(new Set([
      "user-1:alerta-1",
      "user-2:alerta-1",
    ]));
  });

  it("não engole falha diferente de chave duplicada", async () => {
    const banco = bancoTransacionalMemoria();
    const falha = new Error("banco indisponível");
    banco.falharAntesDaMarcacao(falha);

    await expect(
      persistirSinoLicitacaoUmaVez(
        banco.transacionar,
        "user-1",
        "alerta-1",
        { titulo: "Vencimento" },
      ),
    ).rejects.toBe(falha);
  });
});

describe("entregarBestEffort", () => {
  it("não rejeita nem desfaz o sino quando o push falha", async () => {
    const falha = new Error("push indisponível");
    const aoFalhar = vi.fn();

    await expect(
      entregarBestEffort(async () => {
        throw falha;
      }, aoFalhar),
    ).resolves.toBe(false);
    expect(aoFalhar).toHaveBeenCalledWith(falha);
  });

  it("confirma entrega bem-sucedida", async () => {
    await expect(
      entregarBestEffort(async () => undefined, vi.fn()),
    ).resolves.toBe(true);
  });
});
