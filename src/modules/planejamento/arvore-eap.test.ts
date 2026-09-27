import { describe, expect, it } from "vitest";
import {
  MOTIVO_DENTRO_DELA_MESMA,
  MOTIVO_PRIMEIRA_DO_NIVEL,
  MOTIVO_ULTIMA_DO_NIVEL,
  irmaVizinha,
  planoDeAvanco,
  planoDeInsercaoAcima,
  planoDeMoverNoNivel,
  planoDeMovimento,
  planoDeRecuo,
  type Movimento,
  type NoArvore,
} from "./arvore-eap";

const no = (id: string, parentId: string | null, ordem: number, tipoEap = "atv"): NoArvore => ({ id, parentId, ordem, tipoEap });

// 1 Projeto
//   2 Estrutural
//     3 Lançamento   4 Fôrmas   5 Armaduras
//   6 Hidráulica
// 7 Entrega (marco, raiz)
const nos = [
  no("proj", null, 0),
  no("est", "proj", 1),
  no("lanc", "est", 2),
  no("form", "est", 3),
  no("arm", "est", 4),
  no("hid", "proj", 5),
  no("ent", null, 6, "mrc"),
];

describe("planoDeRecuo", () => {
  it("vira subtarefa da irmã que está logo acima", () => {
    expect(planoDeRecuo(nos, "form")).toEqual({ ok: true, novoPaiId: "lanc" });
    expect(planoDeRecuo(nos, "hid")).toEqual({ ok: true, novoPaiId: "est" });
  });

  it("a primeira do nível não tem quem a receba", () => {
    expect(planoDeRecuo(nos, "lanc")).toMatchObject({ ok: false });
    expect(planoDeRecuo(nos, "est")).toMatchObject({ ok: false });
    expect(planoDeRecuo(nos, "proj")).toMatchObject({ ok: false });
  });

  it("marco não recebe subtarefa", () => {
    const comMarco = [no("a", null, 0, "mrc"), no("b", null, 1)];
    expect(planoDeRecuo(comMarco, "b")).toEqual({ ok: false, motivo: "A tarefa acima é um marco e não pode ter subtarefas." });
  });

  it("a irmã de cima é a do MESMO nível, não a de cima na tela", () => {
    // "hid" está logo abaixo de "arm" na tela (que é de outro nível): quem a recebe é "est".
    expect(planoDeRecuo(nos, "hid")).toEqual({ ok: true, novoPaiId: "est" });
  });

  it("ordem embaralhada na lista não muda o resultado", () => {
    const embaralhado = [...nos].reverse();
    expect(planoDeRecuo(embaralhado, "form")).toEqual({ ok: true, novoPaiId: "lanc" });
  });

  it("tarefa inexistente", () => {
    expect(planoDeRecuo(nos, "x")).toEqual({ ok: false, motivo: "Tarefa não encontrada." });
  });
});

describe("planoDeAvanco", () => {
  it("sobe um nível, logo depois do pai antigo, levando as irmãs de baixo como filhas", () => {
    const r = planoDeAvanco(nos, "form");
    expect(r).toEqual({ ok: true, novoPaiId: "proj", depoisDeId: "est", reparentarIds: ["arm"] });
  });

  it("a última irmã avança sem levar ninguém", () => {
    expect(planoDeAvanco(nos, "arm")).toEqual({ ok: true, novoPaiId: "proj", depoisDeId: "est", reparentarIds: [] });
  });

  it("a primeira irmã leva todas as outras", () => {
    expect(planoDeAvanco(nos, "lanc")).toEqual({ ok: true, novoPaiId: "proj", depoisDeId: "est", reparentarIds: ["form", "arm"] });
  });

  it("do segundo nível vai para a raiz", () => {
    expect(planoDeAvanco(nos, "est")).toEqual({ ok: true, novoPaiId: null, depoisDeId: "proj", reparentarIds: ["hid"] });
  });

  it("quem já está na raiz não avança", () => {
    expect(planoDeAvanco(nos, "proj")).toEqual({ ok: false, motivo: "Esta tarefa já está no nível mais alto." });
    expect(planoDeAvanco(nos, "ent")).toMatchObject({ ok: false });
  });

  it("linha órfã (pai que não existe) conta como raiz", () => {
    expect(planoDeAvanco([no("x", "fantasma", 0)], "x")).toMatchObject({ ok: false });
  });
});

describe("planoDeInsercaoAcima", () => {
  it("nasce no mesmo nível, no lugar da linha, empurrando as de ordem igual ou maior", () => {
    expect(planoDeInsercaoAcima(nos, "form")).toEqual({ ok: true, paiId: "est", aPartirDeOrdem: 3 });
    expect(planoDeInsercaoAcima(nos, "proj")).toEqual({ ok: true, paiId: null, aPartirDeOrdem: 0 });
  });

  it("tarefa inexistente", () => {
    expect(planoDeInsercaoAcima(nos, "x")).toEqual({ ok: false, motivo: "Tarefa não encontrada." });
  });
});

/** Aplica o movimento e devolve a tela: cada linha como "pai>id", em ordem de árvore. */
function aplicar(lista: NoArvore[], id: string, m: Movimento): string[] {
  if (!m.ok) throw new Error(m.motivo);
  const nova = lista.map((n) => {
    const o = m.ordens.find((x) => x.id === n.id);
    return { ...n, parentId: n.id === id ? m.novoPaiId : n.parentId, ordem: o ? o.ordem : n.ordem };
  });
  const saida: string[] = [];
  const descer = (pai: string | null) => {
    for (const n of nova.filter((x) => x.parentId === pai).sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id))) {
      saida.push(`${pai ?? "·"}>${n.id}`);
      descer(n.id);
    }
  };
  descer(null);
  return saida;
}

describe("planoDeMovimento", () => {
  it("move no mesmo nível, levando as subtarefas junto", () => {
    // Hidráulica para antes de Estrutural: o Estrutural vai inteiro (com as 3 filhas) para baixo dela.
    expect(aplicar(nos, "hid", planoDeMovimento(nos, "hid", "est", "antes"))).toEqual([
      "·>proj", "proj>hid", "proj>est", "est>lanc", "est>form", "est>arm", "·>ent",
    ]);
  });

  it("muda de nível: vira irmã da linha de referência", () => {
    expect(aplicar(nos, "hid", planoDeMovimento(nos, "hid", "form", "depois"))).toEqual([
      "·>proj", "proj>est", "est>lanc", "est>form", "est>hid", "est>arm", "·>ent",
    ]);
    // um agrupamento inteiro para a raiz, depois do marco
    expect(aplicar(nos, "est", planoDeMovimento(nos, "est", "ent", "depois"))).toEqual([
      "·>proj", "proj>hid", "·>ent", "·>est", "est>lanc", "est>form", "est>arm",
    ]);
  });

  it("não vai para dentro dela mesma", () => {
    expect(planoDeMovimento(nos, "est", "form", "antes")).toEqual({ ok: false, motivo: MOTIVO_DENTRO_DELA_MESMA });
    expect(planoDeMovimento(nos, "proj", "lanc", "depois")).toEqual({ ok: false, motivo: MOTIVO_DENTRO_DELA_MESMA });
    expect(planoDeMovimento(nos, "est", "est", "antes").ok).toBe(false);
  });

  it("renumera as irmãs em sequência mesmo com ordem empatada", () => {
    const empatadas = [no("a", null, 5), no("b", null, 5), no("c", null, 5)];
    expect(aplicar(empatadas, "c", planoDeMovimento(empatadas, "c", "a", "antes"))).toEqual(["·>c", "·>a", "·>b"]);
  });

  it("só devolve as ordens que mudam", () => {
    const m = planoDeMovimento(nos, "arm", "form", "antes");
    expect(m.ok && m.ordens.map((o) => o.id).sort()).toEqual(["arm", "form"]);
  });
});

describe("mover para cima e para baixo", () => {
  it("troca com a irmã vizinha do mesmo nível", () => {
    expect(irmaVizinha(nos, "form", -1)).toBe("lanc");
    expect(irmaVizinha(nos, "form", 1)).toBe("arm");
    expect(aplicar(nos, "form", planoDeMoverNoNivel(nos, "form", -1))).toEqual([
      "·>proj", "proj>est", "est>form", "est>lanc", "est>arm", "proj>hid", "·>ent",
    ]);
    expect(aplicar(nos, "proj", planoDeMoverNoNivel(nos, "proj", 1))).toEqual([
      "·>ent", "·>proj", "proj>est", "est>lanc", "est>form", "est>arm", "proj>hid",
    ]);
  });

  it("a primeira não sobe e a última não desce", () => {
    expect(planoDeMoverNoNivel(nos, "lanc", -1)).toEqual({ ok: false, motivo: MOTIVO_PRIMEIRA_DO_NIVEL });
    expect(planoDeMoverNoNivel(nos, "arm", 1)).toEqual({ ok: false, motivo: MOTIVO_ULTIMA_DO_NIVEL });
    expect(planoDeMoverNoNivel(nos, "ent", 1)).toEqual({ ok: false, motivo: MOTIVO_ULTIMA_DO_NIVEL });
  });
});
