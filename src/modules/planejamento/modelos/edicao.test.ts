import { describe, expect, it } from "vitest";
import type { LinhaModelo } from "./estrutura";
import {
  MOTIVO_CICLO,
  MOTIVO_ULTIMA_LINHA,
  adicionarNoFim,
  avancar,
  definirPredecessoras,
  excluir,
  idParaLinhaNova,
  inserirAcima,
  mudarDuracao,
  mudarInformacoes,
  mover,
  moverNoNivel,
  recuar,
  renomear,
  validarIntegridade,
} from "./edicao";
import { emOrdemDeArvore } from "./aplicar";

const l = (id: string, parentId: string | null, ordem: number, extra: Partial<LinhaModelo> = {}): LinhaModelo => ({
  id,
  parentId,
  ordem,
  nome: `T${id}`,
  tipoEap: "atv",
  duracaoDias: 2,
  disciplinaCatalogoId: null,
  etapaId: null,
  deTerceiro: false,
  predecessoras: [],
  ...extra,
});

// 1 Fase (resumo)
//   2 A
//   3 B
//   4 C
// 5 Marco
const base = (): LinhaModelo[] => [
  l("1", null, 0, { tipoEap: "fas", duracaoDias: 0, disciplinaCatalogoId: "d-arq", etapaId: "f-bas" }),
  l("2", "1", 1, { disciplinaCatalogoId: "d-arq", etapaId: "f-bas" }),
  l("3", "1", 2, { predecessoras: [{ id: "2", tipo: "fs", lagDias: 0 }] }),
  l("4", "1", 3, { predecessoras: [{ id: "3", tipo: "fs", lagDias: 1 }] }),
  l("5", null, 4, { tipoEap: "mrc", duracaoDias: 0, predecessoras: [{ id: "4", tipo: "fs", lagDias: 0 }] }),
];

const ordemDeTela = (linhas: LinhaModelo[]) => emOrdemDeArvore(linhas).map((x) => `${x.parentId ?? "·"}>${x.id}`);
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`esperava ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

describe("renomear e duração", () => {
  it("renomeia com trim e recusa vazio", () => {
    expect(ok(renomear(base(), "2", "  Planta  ")).linhas.find((x) => x.id === "2")!.nome).toBe("Planta");
    expect(renomear(base(), "2", "   ")).toEqual({ ok: false, motivo: "Dê um nome à tarefa." });
  });

  it("duração 0 vira marco e o marco volta a atividade", () => {
    const m = ok(mudarDuracao(base(), "3", { marco: true }));
    expect(m.linhas.find((x) => x.id === "3")).toMatchObject({ tipoEap: "mrc", duracaoDias: 0 });
    const a = ok(mudarDuracao(m.linhas, "3", { marco: false, duracaoDias: 5 }));
    expect(a.linhas.find((x) => x.id === "3")).toMatchObject({ tipoEap: "atv", duracaoDias: 5 });
  });

  it("agrupamento não vira marco (mesma regra do projeto)", () => {
    const r = mudarDuracao(base(), "1", { marco: true });
    expect(r.ok).toBe(true); // `fas` não alterna — continua agrupamento
    expect(ok(r).linhas.find((x) => x.id === "1")!.tipoEap).toBe("fas");
    const comFilho = ok(recuar(base(), "3")).linhas; // 2 vira resumo
    expect(mudarDuracao(comFilho, "2", { marco: true }).ok).toBe(false);
  });
});

describe("predecessoras", () => {
  it("grava o conjunto e recusa ciclo, a própria linha e linha inexistente", () => {
    const r = ok(definirPredecessoras(base(), "4", [{ predecessoraId: "2", tipo: "ss", lagDias: -1 }]));
    expect(r.linhas.find((x) => x.id === "4")!.predecessoras).toEqual([{ id: "2", tipo: "ss", lagDias: -1 }]);
    expect(definirPredecessoras(base(), "2", [{ predecessoraId: "4", tipo: "fs", lagDias: 0 }])).toEqual({ ok: false, motivo: MOTIVO_CICLO });
    expect(definirPredecessoras(base(), "2", [{ predecessoraId: "2", tipo: "fs", lagDias: 0 }]).ok).toBe(false);
    expect(definirPredecessoras(base(), "2", [{ predecessoraId: "99", tipo: "fs", lagDias: 0 }]).ok).toBe(false);
  });

  it("vazio limpa", () => {
    expect(ok(definirPredecessoras(base(), "4", [])).linhas.find((x) => x.id === "4")!.predecessoras).toEqual([]);
  });
});

describe("árvore", () => {
  it("inserir acima: mesma posição e nível, herda disciplina e fase", () => {
    const r = ok(inserirAcima(base(), "2"));
    expect(r.novaId).toBe("novo-1");
    expect(ordemDeTela(r.linhas)).toEqual(["·>1", "1>novo-1", "1>2", "1>3", "1>4", "·>5"]);
    expect(r.linhas.find((x) => x.id === "novo-1")).toMatchObject({ nome: "Nova tarefa", tipoEap: "atv", duracaoDias: 1, disciplinaCatalogoId: "d-arq", etapaId: "f-bas" });
    expect(ok(inserirAcima(r.linhas, "5")).novaId).toBe("novo-2");
  });

  it("adicionar no fim entra na raiz, depois de tudo", () => {
    const r = ok(adicionarNoFim(base()));
    expect(ordemDeTela(r.linhas).at(-1)).toBe(`·>${r.novaId}`);
  });

  it("recuar vira a última subtarefa da de cima; não recua sem irmã acima nem para dentro de marco", () => {
    expect(ordemDeTela(ok(recuar(base(), "3")).linhas)).toEqual(["·>1", "1>2", "2>3", "1>4", "·>5"]);
    expect(recuar(base(), "2").ok).toBe(false);
    const comDepoisDoMarco = [...base(), l("6", null, 5)];
    expect(recuar(comDepoisDoMarco, "6").ok).toBe(false);
  });

  it("avançar sobe um nível logo depois do pai; as irmãs de baixo viram filhas", () => {
    const r = ok(avancar(base(), "3"));
    expect(ordemDeTela(r.linhas)).toEqual(["·>1", "1>2", "·>3", "3>4", "·>5"]);
    expect(avancar(base(), "1").ok).toBe(false);
  });

  it("recuar e avançar desfaz", () => {
    const ida = ok(recuar(base(), "3")).linhas;
    expect(ordemDeTela(ok(avancar(ida, "3")).linhas)).toEqual(["·>1", "1>2", "1>3", "1>4", "·>5"]);
  });

  it("excluir leva as subtarefas e limpa os vínculos para elas", () => {
    const r = ok(excluir(base(), "1"));
    expect(r.linhas.map((x) => x.id)).toEqual(["5"]);
    expect(r.linhas[0].predecessoras).toEqual([]);
    expect(excluir(r.linhas, "5")).toEqual({ ok: false, motivo: MOTIVO_ULTIMA_LINHA });
  });
});

describe("informações da linha", () => {
  it("muda só o que foi pedido", () => {
    const r = ok(mudarInformacoes(base(), "2", { etapaId: null, deTerceiro: true }));
    expect(r.linhas.find((x) => x.id === "2")).toMatchObject({ disciplinaCatalogoId: "d-arq", etapaId: null, deTerceiro: true });
  });
});

describe("idParaLinhaNova", () => {
  it("continua a numeração, sem colidir com o UID do arquivo", () => {
    expect(idParaLinhaNova(base())).toBe("novo-1");
    expect(idParaLinhaNova([...base(), l("novo-7", null, 9)])).toBe("novo-8");
  });
});

describe("validarIntegridade", () => {
  it("modelo coerente passa", () => {
    expect(validarIntegridade(base())).toEqual({ ok: true });
  });

  it("recusa pai inexistente, filho de marco, predecessora inexistente, ciclo e id repetido", () => {
    expect(validarIntegridade([...base(), l("6", "99", 9)]).ok).toBe(false);
    expect(validarIntegridade([...base(), l("6", "5", 9)]).ok).toBe(false);
    expect(validarIntegridade([...base(), l("6", null, 9, { predecessoras: [{ id: "99", tipo: "fs", lagDias: 0 }] })]).ok).toBe(false);
    const ciclo = base().map((x) => (x.id === "2" ? { ...x, predecessoras: [{ id: "4", tipo: "fs" as const, lagDias: 0 }] } : x));
    expect(validarIntegridade(ciclo)).toEqual({ ok: false, motivo: MOTIVO_CICLO });
    expect(validarIntegridade([...base(), l("2", null, 9)]).ok).toBe(false);
    const arvoreEmCiclo = base().map((x) => (x.id === "1" ? { ...x, parentId: "2" } : x));
    expect(validarIntegridade(arvoreEmCiclo).ok).toBe(false);
    expect(validarIntegridade([]).ok).toBe(false);
  });

  it("o que as operações produzem continua íntegro", () => {
    let linhas = base();
    for (const passo of [
      (x: LinhaModelo[]) => inserirAcima(x, "3"),
      (x: LinhaModelo[]) => recuar(x, "4"),
      (x: LinhaModelo[]) => avancar(x, "4"),
      (x: LinhaModelo[]) => excluir(x, "2"),
      (x: LinhaModelo[]) => adicionarNoFim(x),
    ]) {
      linhas = ok(passo(linhas)).linhas;
      expect(validarIntegridade(linhas)).toEqual({ ok: true });
    }
  });
});

describe("mover", () => {
  it("move uma fase inteira para depois do marco, com as subtarefas e os vínculos", () => {
    const r = ok(mover(base(), "1", "5", "depois"));
    expect(ordemDeTela(r.linhas)).toEqual(["·>5", "·>1", "1>2", "1>3", "1>4"]);
    // o marco continua dependendo da 4, que agora vem depois dele na tela — a dependência não muda com a posição
    expect(r.linhas.find((x) => x.id === "5")!.predecessoras).toEqual([{ id: "4", tipo: "fs", lagDias: 0 }]);
    expect(validarIntegridade(r.linhas)).toEqual({ ok: true });
  });

  it("muda de nível e recusa ir para dentro dela mesma", () => {
    expect(ordemDeTela(ok(mover(base(), "5", "3", "antes")).linhas)).toEqual(["·>1", "1>2", "1>5", "1>3", "1>4"]);
    expect(mover(base(), "1", "3", "depois").ok).toBe(false);
  });

  it("mover para cima e para baixo no mesmo nível", () => {
    expect(ordemDeTela(ok(moverNoNivel(base(), "4", -1)).linhas)).toEqual(["·>1", "1>2", "1>4", "1>3", "·>5"]);
    expect(ordemDeTela(ok(moverNoNivel(base(), "1", 1)).linhas)).toEqual(["·>5", "·>1", "1>2", "1>3", "1>4"]);
    expect(moverNoNivel(base(), "2", -1).ok).toBe(false);
  });
});
