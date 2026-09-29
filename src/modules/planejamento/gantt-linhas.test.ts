import { describe, expect, it } from "vitest";
import {
  contextoDaLinha,
  formatarLag,
  compararCodigos,
  formatarPredecessoras,
  idsComFilhos,
  lerDuracao,
  lerPercentual,
  lerPredecessoras,
  linhasVisiveis,
  montarGrade,
  soAsDoFiltro,
  textoRecursos,
} from "./gantt-linhas";

const no = (id: string, parentId: string | null, ordem: number) => ({ id, parentId, ordem });

// 1 Projeto
//   2 Estrutural
//     3 Lançamento
//     4 Fôrmas
//   5 Hidráulica
// 6 Entrega (raiz)
const linhas = [
  no("proj", null, 0),
  no("est", "proj", 1),
  no("lanc", "est", 2),
  no("form", "est", 3),
  no("hid", "proj", 4),
  no("ent", null, 5),
];

describe("montarGrade", () => {
  const g = montarGrade(linhas);

  it("numera na ordem da árvore, com código e nível", () => {
    expect(g.map((l) => [l.numero, l.t.id, l.codigo, l.nivel])).toEqual([
      [1, "proj", "1", 1],
      [2, "est", "1.1", 2],
      [3, "lanc", "1.1.1", 3],
      [4, "form", "1.1.2", 3],
      [5, "hid", "1.2", 2],
      [6, "ent", "2", 1],
    ]);
  });

  it("filho depois do pai mesmo com `ordem` embaralhada na lista", () => {
    const g2 = montarGrade([no("b", "a", 9), no("a", null, 1), no("c", "a", 3)]);
    expect(g2.map((l) => l.t.id)).toEqual(["a", "c", "b"]);
  });

  it("sabe quem tem filhos", () => {
    expect(g.filter((l) => l.temFilhos).map((l) => l.t.id)).toEqual(["proj", "est"]);
    expect(idsComFilhos(g)).toEqual(["proj", "est"]);
  });

  it("linha órfã (pai que não existe) vira raiz em vez de sumir", () => {
    const g3 = montarGrade([no("x", "fantasma", 0)]);
    expect(g3).toHaveLength(1);
    expect(g3[0].nivel).toBe(1);
  });
});

describe("recolher e filtrar", () => {
  const g = montarGrade(linhas);

  it("recolher um nível esconde os descendentes e mantém os números", () => {
    const v = linhasVisiveis(g, new Set(["est"]));
    expect(v.map((l) => [l.numero, l.t.id])).toEqual([[1, "proj"], [2, "est"], [5, "hid"], [6, "ent"]]);
  });

  it("recolher o de cima esconde tudo o que está dentro, mesmo o que já estava recolhido", () => {
    const v = linhasVisiveis(g, new Set(["proj", "est"]));
    expect(v.map((l) => l.t.id)).toEqual(["proj", "ent"]);
  });

  it("nada recolhido = tudo", () => {
    expect(linhasVisiveis(g, new Set())).toHaveLength(6);
  });

  it("recolher linha sem filhos não faz nada", () => {
    expect(linhasVisiveis(g, new Set(["hid"]))).toHaveLength(6);
  });

  it("o filtro mostra só as escolhidas, sem esconder nível", () => {
    const v = soAsDoFiltro(g, new Set(["lanc", "ent"]));
    expect(v.map((l) => [l.numero, l.t.id])).toEqual([[3, "lanc"], [6, "ent"]]);
  });
});

describe("compararCodigos", () => {
  it("ordem natural: 1.2 antes de 1.10, e o pai antes dos filhos", () => {
    const cods = ["1.10", "1", "2", "1.2", "1.2.1", "10", "1.1"];
    expect([...cods].sort(compararCodigos)).toEqual(["1", "1.1", "1.2", "1.2.1", "1.10", "2", "10"]);
  });
});

describe("formatarPredecessoras", () => {
  const codigos = new Map([["a", "1.3"], ["b", "1.5"], ["c", "2.12"]]);

  it("término→início sem atraso é só o código", () => {
    expect(formatarPredecessoras([{ predecessoraId: "a", tipo: "fs", lagDias: 0 }], codigos)).toBe("1.3");
  });

  it("com atraso ou outro tipo, mostra a sigla (em português por padrão)", () => {
    expect(formatarPredecessoras([{ predecessoraId: "a", tipo: "fs", lagDias: 2 }], codigos)).toBe("1.3TI+2d");
    expect(formatarPredecessoras([{ predecessoraId: "b", tipo: "ss", lagDias: 0 }], codigos)).toBe("1.5II");
    expect(formatarPredecessoras([{ predecessoraId: "c", tipo: "ff", lagDias: -1 }], codigos)).toBe("2.12TT-1d");
    expect(formatarPredecessoras([{ predecessoraId: "a", tipo: "sf", lagDias: 0 }], codigos)).toBe("1.3IT");
  });

  it("em inglês", () => {
    expect(formatarPredecessoras([{ predecessoraId: "a", tipo: "fs", lagDias: 2 }], codigos, "en")).toBe("1.3FS+2d");
  });

  it("vários, em ordem de código (1.10 depois de 1.9); predecessora sem código é ignorada", () => {
    const v = [
      { predecessoraId: "c", tipo: "fs" as const, lagDias: 0 },
      { predecessoraId: "fantasma", tipo: "fs" as const, lagDias: 0 },
      { predecessoraId: "a", tipo: "ss" as const, lagDias: 1.5 },
    ];
    expect(formatarPredecessoras(v, codigos)).toBe("1.3II+1,5d;2.12");
    const dezenas = new Map([["x", "1.10"], ["y", "1.9"]]);
    const ordem = [
      { predecessoraId: "x", tipo: "fs" as const, lagDias: 0 },
      { predecessoraId: "y", tipo: "fs" as const, lagDias: 0 },
    ];
    expect(formatarPredecessoras(ordem, dezenas)).toBe("1.9;1.10");
  });

  it("lag: zero some, decimal usa vírgula", () => {
    expect(formatarLag(0)).toBe("");
    expect(formatarLag(2)).toBe("+2d");
    expect(formatarLag(-0.5)).toBe("-0,5d");
  });
});

describe("lerPredecessoras", () => {
  const idPorCodigo = new Map([["1", "a"], ["1.3", "c"], ["2", "e"], ["2.12", "l"]]);
  const ler = (t: string) => lerPredecessoras(t, idPorCodigo, "e");

  it("vazio = nenhuma predecessora", () => {
    expect(ler("")).toEqual({ ok: true, vinculos: [] });
    expect(ler("   ")).toEqual({ ok: true, vinculos: [] });
  });

  it("código puro é término→início sem atraso", () => {
    expect(ler("1.3")).toEqual({ ok: true, vinculos: [{ predecessoraId: "c", tipo: "fs", lagDias: 0 }] });
    expect(ler("1")).toEqual({ ok: true, vinculos: [{ predecessoraId: "a", tipo: "fs", lagDias: 0 }] });
  });

  it("aceita as siglas em português e em inglês, com atraso positivo, negativo e decimal", () => {
    expect(ler("1.3TI+2d")).toEqual({ ok: true, vinculos: [{ predecessoraId: "c", tipo: "fs", lagDias: 2 }] });
    expect(ler("1.3fs+2d")).toEqual({ ok: true, vinculos: [{ predecessoraId: "c", tipo: "fs", lagDias: 2 }] });
    expect(ler("1II-1 dia")).toEqual({ ok: true, vinculos: [{ predecessoraId: "a", tipo: "ss", lagDias: -1 }] });
    expect(ler("2.12 TT + 1,5d")).toEqual({ ok: true, vinculos: [{ predecessoraId: "l", tipo: "ff", lagDias: 1.5 }] });
    expect(ler("2.12TT+1.5d")).toEqual({ ok: true, vinculos: [{ predecessoraId: "l", tipo: "ff", lagDias: 1.5 }] });
    expect(ler("1.3IT")).toEqual({ ok: true, vinculos: [{ predecessoraId: "c", tipo: "sf", lagDias: 0 }] });
  });

  it("zeros à esquerda não mudam a tarefa", () => {
    expect(ler("01.03")).toEqual({ ok: true, vinculos: [{ predecessoraId: "c", tipo: "fs", lagDias: 0 }] });
  });

  it("vários separados por ponto e vírgula, ou por vírgula quando não há atraso decimal", () => {
    const esperado = { ok: true, vinculos: [{ predecessoraId: "a", tipo: "fs", lagDias: 0 }, { predecessoraId: "c", tipo: "ss", lagDias: 2 }] };
    expect(ler("1;1.3II+2d")).toEqual(esperado);
    expect(ler("1, 1.3II+2d")).toEqual(esperado);
    expect(ler("1.3,2.12")).toEqual({
      ok: true,
      vinculos: [{ predecessoraId: "c", tipo: "fs", lagDias: 0 }, { predecessoraId: "l", tipo: "fs", lagDias: 0 }],
    });
  });

  it("vírgula decimal no atraso não é separador", () => {
    expect(ler("1TI+1,5d")).toEqual({ ok: true, vinculos: [{ predecessoraId: "a", tipo: "fs", lagDias: 1.5 }] });
  });

  it("recusa com mensagem clara", () => {
    expect(ler("9.9")).toEqual({ ok: false, erro: "Não existe a tarefa 9.9." });
    expect(ler("2")).toEqual({ ok: false, erro: "Uma tarefa não pode ser predecessora de si mesma." });
    expect(ler("1.3;1.3")).toEqual({ ok: false, erro: "A tarefa 1.3 aparece duas vezes." });
    expect(ler("abc")).toMatchObject({ ok: false });
    expect(ler("1.")).toMatchObject({ ok: false });
    expect((ler("1.3TI+2h") as { erro: string }).erro).toMatch(/dias úteis/);
    expect((ler("1.3XX") as { erro: string }).erro).toMatch(/Não entendi/);
    expect((ler("x") as { erro: string }).erro).toMatch(/código da tarefa/);
  });

  it("o que a tela mostra, a leitura devolve", () => {
    const codigos = new Map([["a", "1"], ["c", "1.3"]]);
    const vinculos = [
      { predecessoraId: "a", tipo: "ff" as const, lagDias: -2 },
      { predecessoraId: "c", tipo: "fs" as const, lagDias: 0 },
    ];
    const texto = formatarPredecessoras(vinculos, codigos);
    const lido = lerPredecessoras(texto, idPorCodigo, "e");
    expect(lido).toEqual({ ok: true, vinculos });
  });
});

describe("textoRecursos", () => {
  it("pessoas separadas por ponto e vírgula; vaga sem pessoa entre parênteses", () => {
    expect(textoRecursos([{ nome: "Maria", rotuloPapel: "Projetista" }, { nome: null, rotuloPapel: "Revisor" }], false)).toBe("Maria; (Revisor)");
  });

  it("sem ninguém: vazio, ou 'terceiro' na etapa de terceiro", () => {
    expect(textoRecursos([], false)).toBe("");
    expect(textoRecursos([], true)).toBe("terceiro");
  });

  it('o recurso "Externo" não é escrito como perfil — a linha diz "terceiro"', () => {
    expect(textoRecursos([{ nome: null, papel: "ext", rotuloPapel: "Externo" }], true)).toBe("terceiro");
  });

  it("quem da casa acompanha a etapa de terceiro aparece depois da marca", () => {
    expect(
      textoRecursos(
        [
          { nome: null, papel: "ext", rotuloPapel: "Externo" },
          { nome: "Maria", papel: "coo", rotuloPapel: "Coordenador" },
        ],
        true,
      ),
    ).toBe("terceiro; Maria");
  });
});

describe("lerDuracao", () => {
  it("aceita número, com unidade e com vírgula decimal", () => {
    expect(lerDuracao("5")).toEqual({ ok: true, marco: false, dias: 5 });
    expect(lerDuracao("5d")).toEqual({ ok: true, marco: false, dias: 5 });
    expect(lerDuracao(" 12 dias ")).toEqual({ ok: true, marco: false, dias: 12 });
    expect(lerDuracao("1,5")).toEqual({ ok: true, marco: false, dias: 1.5 });
    expect(lerDuracao("0,5d")).toEqual({ ok: true, marco: false, dias: 0.5 });
  });

  it("zero e a palavra marco tornam a linha um marco", () => {
    expect(lerDuracao("0")).toEqual({ ok: true, marco: true });
    expect(lerDuracao("0d")).toEqual({ ok: true, marco: true });
    expect(lerDuracao("Marco")).toEqual({ ok: true, marco: true });
  });

  it("recusa o que não é duração, o negativo e o exagero", () => {
    expect(lerDuracao("")).toMatchObject({ ok: false });
    expect(lerDuracao("abc")).toMatchObject({ ok: false });
    expect(lerDuracao("-3")).toMatchObject({ ok: false });
    expect(lerDuracao("3h")).toMatchObject({ ok: false });
    expect(lerDuracao("10000")).toEqual({ ok: false, erro: "Duração grande demais — divida a atividade." });
  });
});

describe("lerPercentual", () => {
  it("aceita 0 a 100, com ou sem o sinal", () => {
    expect(lerPercentual("0")).toEqual({ ok: true, valor: 0 });
    expect(lerPercentual("60%")).toEqual({ ok: true, valor: 60 });
    expect(lerPercentual(" 100 % ")).toEqual({ ok: true, valor: 100 });
  });

  it("recusa acima de 100, decimal e texto", () => {
    expect(lerPercentual("101")).toEqual({ ok: false, erro: "O % concluído vai de 0 a 100." });
    expect(lerPercentual("50,5")).toMatchObject({ ok: false });
    expect(lerPercentual("meio")).toMatchObject({ ok: false });
    expect(lerPercentual("")).toMatchObject({ ok: false });
  });
});

describe("contextoDaLinha", () => {
  // 1 proj / 2 est / 3 lanc / 4 form / 5 hid / 6 ent (marco, raiz)
  const nos = [
    { id: "proj", parentId: null, ordem: 0 },
    { id: "est", parentId: "proj", ordem: 1 },
    { id: "lanc", parentId: "est", ordem: 2 },
    { id: "form", parentId: "est", ordem: 3, marco: true },
    { id: "hid", parentId: "proj", ordem: 4 },
    { id: "ent", parentId: null, ordem: 5, marco: true },
  ];
  const g = montarGrade(nos);
  const ctx = (id: string) => contextoDaLinha(g, g.findIndex((l) => l.t.id === id));

  it("a primeira do nível não tem irmã acima, mesmo com outra linha logo acima na tela", () => {
    expect(ctx("lanc")).toMatchObject({ temIrmaAcima: false, nivel: 3 });
    expect(ctx("est")).toMatchObject({ temIrmaAcima: false, nivel: 2 });
    expect(ctx("proj")).toMatchObject({ temIrmaAcima: false, nivel: 1 });
  });

  it("a irmã de cima é a do MESMO nível, saltando as subtarefas dela", () => {
    expect(ctx("hid")).toMatchObject({ temIrmaAcima: true, irmaAcimaEMarco: false, nivel: 2 });
    expect(ctx("ent")).toMatchObject({ temIrmaAcima: true, irmaAcimaEMarco: false, nivel: 1 });
  });

  it("irmã abaixo: a próxima do mesmo nível depois das subtarefas, sem sair do agrupamento", () => {
    expect(ctx("est")).toMatchObject({ temIrmaAbaixo: true }); // hid, depois das filhas do est
    expect(ctx("form")).toMatchObject({ temIrmaAbaixo: false }); // última do est
    expect(ctx("hid")).toMatchObject({ temIrmaAbaixo: false }); // o próximo (ent) é de outro nível
    expect(ctx("proj")).toMatchObject({ temIrmaAbaixo: true }); // ent, na raiz
    expect(ctx("ent")).toMatchObject({ temIrmaAbaixo: false });
  });

  it("sabe quando a irmã de cima é um marco", () => {
    const g2 = montarGrade([{ id: "a", parentId: null, ordem: 0, marco: true }, { id: "b", parentId: null, ordem: 1 }]);
    expect(contextoDaLinha(g2, 1)).toMatchObject({ temIrmaAcima: true, irmaAcimaEMarco: true });
  });

  it("conta as subtarefas em todos os níveis abaixo", () => {
    expect(ctx("proj").subtarefas).toBe(4);
    expect(ctx("est").subtarefas).toBe(2);
    expect(ctx("hid").subtarefas).toBe(0);
  });
});
