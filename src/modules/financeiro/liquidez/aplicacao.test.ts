import { describe, expect, it } from "vitest";
import { ActionError } from "@/lib/action-error";
import type { AjusteSimulado } from "@/modules/financeiro/liquidez/ajustes";
import {
  executarPlano,
  mensagemDivergentes,
  validarAplicacao,
  type AlvoAtual,
  type DadosAtualizacao,
  type MovimentoParaCriar,
  type PortaAplicacao,
} from "@/modules/financeiro/liquidez/aplicacao";
import { MOTIVO_APROVACAO, MOTIVO_ART, MOTIVO_P1, MOTIVO_PREVISAO } from "@/modules/financeiro/liquidez/eventos";
import { dia, reais } from "@/modules/financeiro/liquidez/fixtures";
import type { Observado } from "@/modules/financeiro/liquidez/tipos";

function alvo(p: Partial<AlvoAtual> & Pick<AlvoAtual, "id">): AlvoAtual {
  return {
    tipo: "despesa",
    natureza: "resultado",
    descricao: p.id,
    ehTaxaArt: false,
    prioridadeEfetiva: "p3",
    status: "previsto",
    excluido: false,
    data: dia(9),
    valor: reais(15_000),
    prioridade: null,
    confianca: null,
    caixinhaId: null,
    ...p,
  };
}
const foto = (a: AlvoAtual): Observado => ({
  status: a.status,
  excluido: a.excluido,
  data: a.data,
  valor: a.valor,
  prioridade: a.prioridade,
  confianca: a.confianca,
  caixinhaId: a.caixinhaId,
});
const mapa = (...as: AlvoAtual[]) => new Map(as.map((a) => [a.id, a]));

const fornecedor = alvo({ id: "fornecedor", descricao: "Topografia" });
const cliente = alvo({ id: "cliente", tipo: "receita", descricao: "Construtora", prioridadeEfetiva: null });
const imposto = alvo({ id: "imposto", descricao: "DAS", prioridadeEfetiva: "p1" });

const reprogramar: AjusteSimulado = { tipo: "REPROGRAMAR_DATA", eventoId: "fornecedor", data: dia(19), antes: foto(fornecedor) };
const confirmarCliente: AjusteSimulado = { tipo: "ALTERAR_CONFIANCA", eventoId: "cliente", confianca: "confirmada_cliente", antes: foto(cliente) };
const incluir: AjusteSimulado = {
  tipo: "INCLUIR",
  id: "d1",
  movimento: { tipo: "despesa", natureza: "fora_do_resultado", valor: reais(20_000), data: dia(15), descricao: "Distribuição", categoriaId: "cat" },
};

describe("validarAplicacao (spec §6–§7)", () => {
  it("tudo confere: plano na ordem, uma linha 'aplica' por mudança", () => {
    const r = validarAplicacao([reprogramar, confirmarCliente, incluir], mapa(fornecedor, cliente));
    expect(r.divergentes).toEqual([]);
    expect(r.aplicaveis).toBe(3);
    expect(r.indices).toEqual([0, 1, 2]);
    expect(r.plano.map((p) => p.tipo)).toEqual(["atualizar", "atualizar", "criar"]);
    expect(r.plano[0]).toMatchObject({ lancamentoId: "fornecedor", dados: { vencimento: dia(19) }, condicao: foto(fornecedor) });
    expect(r.linhas[0].texto).toBe(`Mudar o vencimento de Topografia de ${dia(9).slice(8, 10)}/${dia(9).slice(5, 7)} para ${dia(19).slice(8, 10)}/${dia(19).slice(5, 7)}.`);
  });

  it("3 ajustes com 1 obsoleto ⇒ divergente listado e o resultado não deixa aplicar", () => {
    const mudou = { ...fornecedor, data: dia(11) };
    const r = validarAplicacao([reprogramar, confirmarCliente, incluir], mapa(mudou, cliente));
    expect(r.divergentes).toHaveLength(1);
    expect(r.divergentes[0]).toContain("Topografia: o vencimento mudou");
    // quem chama recusa tudo quando há divergente — a mensagem lista todos
    expect(mensagemDivergentes(r.divergentes)).toContain("nada foi aplicado");
  });

  it("todos os divergentes aparecem, não só o primeiro", () => {
    const r = validarAplicacao([reprogramar, confirmarCliente], mapa({ ...fornecedor, status: "confirmado" }));
    expect(r.divergentes).toEqual(["Topografia: já foi pago ou recebido.", "Um lançamento da simulação: não existe mais."]);
  });

  it("alvo que sumiu usa o rótulo guardado na simulação", () => {
    const r = validarAplicacao([{ ...reprogramar, rotulo: "Topografia Campos" }], mapa());
    expect(r.divergentes).toEqual(["Topografia Campos: não existe mais."]);
  });

  it("campos observados: valor, prioridade e confiança gravadas também invalidam", () => {
    for (const mudanca of [{ valor: reais(1) }, { prioridade: "p2" as const }, { confianca: "incerta" as const }, { excluido: true }]) {
      const r = validarAplicacao([reprogramar], mapa({ ...fornecedor, ...mudanca }));
      expect(r.divergentes).toHaveLength(1);
    }
  });

  it("programavel(): previsão, ART, aprovação e P1 ficam só na simulação (informativo, não bloqueia)", () => {
    const casos: [AlvoAtual, string][] = [
      [alvo({ id: "x", tipo: "receita", status: "previsao", prioridadeEfetiva: null }), MOTIVO_PREVISAO],
      [alvo({ id: "x", ehTaxaArt: true }), MOTIVO_ART],
      [alvo({ id: "x", status: "aguardando_aprovacao" }), MOTIVO_APROVACAO],
      [imposto, MOTIVO_P1],
    ];
    for (const [a, motivo] of casos) {
      const r = validarAplicacao([{ tipo: "REPROGRAMAR_DATA", eventoId: a.id, data: dia(20), antes: foto(a) }], mapa(a));
      expect(r.divergentes).toEqual([]);
      expect(r.plano).toEqual([]);
      expect(r.linhas[0]).toEqual({ tipo: "informativo", texto: `${a.descricao}: ${motivo} A nova data fica só na simulação.` });
    }
  });

  it("ALTERAR_CAIXINHA vai para o real: despesa em aberto, uma escrita com a nova caixinha", () => {
    const r = validarAplicacao(
      [{ tipo: "ALTERAR_CAIXINHA", eventoId: "fornecedor", caixinhaId: "cx1", caixinhaNome: "Impostos", antes: foto(fornecedor) }],
      mapa(fornecedor),
    );
    expect(r.plano).toHaveLength(1);
    expect(r.plano[0]).toMatchObject({ tipo: "atualizar", dados: { caixinhaId: "cx1" }, condicao: foto(fornecedor) });
    expect(r.linhas[0].texto).toBe("Pagar Topografia pela caixinha Impostos.");
  });

  it("tirar da caixinha grava null; já estar na caixinha não grava nada; receita não tem caixinha", () => {
    const naCaixinha = alvo({ id: "x", descricao: "X", caixinhaId: "cx1" });
    const tira = validarAplicacao([{ tipo: "ALTERAR_CAIXINHA", eventoId: "x", caixinhaId: null, antes: foto(naCaixinha) }], mapa(naCaixinha));
    expect(tira.plano[0]).toMatchObject({ dados: { caixinhaId: null } });
    const igual = validarAplicacao([{ tipo: "ALTERAR_CAIXINHA", eventoId: "x", caixinhaId: "cx1", caixinhaNome: "Impostos" }], mapa(naCaixinha));
    expect(igual.plano).toEqual([]);
    const receita = validarAplicacao([{ tipo: "ALTERAR_CAIXINHA", eventoId: "cliente", caixinhaId: "cx1" }], mapa(cliente));
    expect(receita.plano).toEqual([]);
    expect(receita.linhas[0].texto).toBe("Construtora: só conta a pagar sai de caixinha.");
  });

  it("caixinha trocada por outra pessoa depois da simulação barra a aplicação", () => {
    const r = validarAplicacao([{ ...reprogramar }], mapa({ ...fornecedor, caixinhaId: "cx9" }));
    expect(r.divergentes[0]).toContain("a caixinha mudou");
  });

  it("tirar da simulação e incluir à mão nunca vão para o real", () => {
    const r = validarAplicacao(
      [
        { tipo: "EXCLUIR", eventoId: "fornecedor", antes: foto(fornecedor) },
        { tipo: "FORCAR_INCLUSAO", eventoId: "cliente" },
      ],
      mapa(fornecedor),
    );
    expect(r.plano).toEqual([]);
    expect(r.aplicaveis).toBe(0);
    expect(r.indices).toEqual([]);
    expect(r.linhas.map((l) => l.tipo)).toEqual(["informativo", "informativo"]);
  });

  it("movimento sem categoria não é aplicável (fica só na simulação)", () => {
    const sem: AjusteSimulado = { ...incluir, movimento: { ...incluir.movimento, categoriaId: undefined } } as AjusteSimulado;
    const r = validarAplicacao([sem], mapa());
    expect(r.plano).toEqual([]);
    expect(r.linhas[0].tipo).toBe("informativo");
  });

  it("dois ajustes no mesmo lançamento viram UMA escrita (a segunda não acharia a data antiga)", () => {
    const r = validarAplicacao(
      [reprogramar, { tipo: "ALTERAR_PRIORIDADE", eventoId: "fornecedor", prioridade: "p4", antes: foto(fornecedor) }],
      mapa(fornecedor),
    );
    expect(r.plano).toHaveLength(1);
    expect(r.plano[0]).toMatchObject({ dados: { vencimento: dia(19), prioridade: "p4" } });
    expect(r.aplicaveis).toBe(2);
  });

  it("prioridade só em despesa, confiança só em receita; sem mudança real não grava", () => {
    const r = validarAplicacao(
      [
        { tipo: "ALTERAR_PRIORIDADE", eventoId: "cliente", prioridade: "p1" },
        { tipo: "ALTERAR_CONFIANCA", eventoId: "fornecedor", confianca: "incerta" },
        { tipo: "REPROGRAMAR_DATA", eventoId: "fornecedor", data: dia(9) },
      ],
      mapa(fornecedor, cliente),
    );
    expect(r.plano).toEqual([]);
    expect(r.linhas.every((l) => l.tipo === "informativo")).toBe(true);
  });

  it("rascunho antigo sem foto: a condição é o estado lido agora", () => {
    const { antes: _ignorado, ...semFoto } = reprogramar as Extract<AjusteSimulado, { tipo: "REPROGRAMAR_DATA" }>;
    void _ignorado;
    const r = validarAplicacao([semFoto], mapa(fornecedor));
    expect(r.plano[0]).toMatchObject({ condicao: foto(fornecedor) });
  });
});

/** `tx` falso: registra as escritas e as descarta se o orquestrador lançar (como um rollback). */
function txFalso(opcoes: { falharNaEscrita?: number; contagem?: number } = {}) {
  const escritas: string[] = [];
  let n = 0;
  const porta: PortaAplicacao = {
    async atualizar(id: string, _c: Observado, d: DadosAtualizacao) {
      n++;
      if (opcoes.falharNaEscrita === n) throw new ActionError("Campo obrigatório: Centro de custo.");
      escritas.push(`atualizar:${id}:${JSON.stringify(d)}`);
      return opcoes.contagem ?? 1;
    },
    async criar(m: MovimentoParaCriar) {
      n++;
      if (opcoes.falharNaEscrita === n) throw new ActionError("Campo obrigatório: Centro de custo.");
      escritas.push(`criar:${m.descricao}`);
      return `novo-${n}`;
    },
  };
  return {
    porta,
    async emTransacao<T>(fn: (p: PortaAplicacao) => Promise<T>): Promise<T> {
      const antes = escritas.length;
      try {
        return await fn(porta);
      } catch (e) {
        escritas.splice(antes);
        throw e;
      }
    },
    escritas,
  };
}

describe("executarPlano: tudo ou nada (spec §7)", () => {
  const plano = validarAplicacao([reprogramar, confirmarCliente, incluir], mapa(fornecedor, cliente)).plano;

  it("grava na ordem e devolve o que mudou", async () => {
    const tx = txFalso();
    const r = await tx.emTransacao((p) => executarPlano(plano, p));
    expect(r).toEqual({ atualizados: ["fornecedor", "cliente"], criados: [{ ajusteId: "d1", id: "novo-3" }] });
    expect(tx.escritas).toHaveLength(3);
  });

  it("o 3º falha por regra (obrigatório) ⇒ lança, não segue, e os 2 primeiros são desfeitos", async () => {
    const tx = txFalso({ falharNaEscrita: 3 });
    await expect(tx.emTransacao((p) => executarPlano(plano, p))).rejects.toThrow("Campo obrigatório");
    expect(tx.escritas).toEqual([]);
  });

  it("alvo mudou entre a validação e a escrita (count ≠ 1) ⇒ lança com o nome e nada fica", async () => {
    const tx = txFalso({ contagem: 0 });
    await expect(tx.emTransacao((p) => executarPlano(plano, p))).rejects.toThrow(/Topografia mudou enquanto o cenário era aplicado/);
    expect(tx.escritas).toEqual([]);
  });

  it("o erro é ActionError (a mensagem chega à tela)", async () => {
    const tx = txFalso({ contagem: 0 });
    await expect(executarPlano(plano, tx.porta)).rejects.toBeInstanceOf(ActionError);
  });
});
