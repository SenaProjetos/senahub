import { describe, expect, it } from "vitest";
import { catalogoNaVersao, chaveAlvo, type CardSnap, type CatalogoSnap, type ItemListaSnap, type SiglaSnap, type SubSnap } from "./versao";
import {
  catalogoTodasVersoes,
  filtrarLinhasTodas,
  filtrarTodas,
  fraseCardEmUso,
  fraseFaseEmUso,
  fraseSubEmUso,
  fraseVinculos,
  motivoExclusao,
  rotuloExisteEm,
  rotuloSiglas,
  versaoParaAbrir,
} from "./todas";

let seq = 0;
const linha = (sigla: string, oficial: boolean, versaoDesde: number, versaoAte: number | null): SiglaSnap => ({
  id: `l${++seq}`,
  sigla,
  oficial,
  versaoDesde,
  versaoAte,
});
const card = (
  id: string,
  nome: string,
  faixa: [number, number | null],
  siglas: SiglaSnap[],
  extra: Partial<CardSnap> = {},
): CardSnap => ({
  id,
  nome,
  ativo: true,
  ordem: 0,
  versaoDesde: faixa[0],
  versaoAte: faixa[1],
  siglas,
  codigo: null,
  sinonimos: [],
  categoria: null,
  ...extra,
});
const sub = (id: string, cardId: string, nome: string, faixa: [number, number | null], siglas: SiglaSnap[], ativo = true): SubSnap => ({
  id,
  cardId,
  nome,
  ativo,
  ordem: 0,
  versaoDesde: faixa[0],
  versaoAte: faixa[1],
  siglas,
});
const item = (id: string, categoria: "fase" | "tipo", nome: string, faixa: [number, number | null], siglas: SiglaSnap[]): ItemListaSnap => ({
  id,
  categoria,
  nome,
  ativo: true,
  ordem: 0,
  versaoDesde: faixa[0],
  versaoAte: faixa[1],
  siglas,
  sigla: siglas[0]?.sigla ?? "",
  sinonimos: [],
});

function snapBase(): CatalogoSnap {
  return {
    cards: [
      card("hid", "Hidrossanitário", [1, null], [linha("HID", true, 1, null), linha("HDR", false, 1, null), linha("ESG", false, 1, 1)], {
        categoria: "CIVIL",
        ordem: 1,
      }),
      card("orc", "Orçamento", [1, null], [linha("ORÇ", true, 1, 1), linha("ORC", true, 2, null)], { ordem: 2 }),
      card("cab", "Cabeamento", [1, 1], [linha("CAB", true, 1, null)], { categoria: "ELÉTRICA", ordem: 3 }),
      card("seg", "Segurança e Alarme", [2, null], [linha("SEG", true, 2, null)], { categoria: "ELÉTRICA", ordem: 4 }),
      card("acu", "Acústica", [1, 1], [linha("ACU", true, 1, null)], { categoria: "ARQUITETURA", ordem: 5, ativo: false }),
    ],
    subs: [
      sub("agf", "hid", "Água fria", [2, null], [linha("AGF", true, 2, null)]),
      sub("esg", "hid", "Esgoto", [2, null], [linha("ESG", true, 2, null)]),
      sub("rede", "cab", "Rede", [1, null], [linha("RED", true, 1, null)]),
      sub("velha", "hid", "Pluvial", [1, null], [linha("PLU", true, 1, null)], false),
    ],
    itens: [item("ex", "fase", "Projeto Executivo", [1, null], [linha("EX", true, 1, null)]), item("det", "tipo", "Desenho Técnico", [2, null], [linha("DET", true, 2, null)])],
  };
}

describe("rotuloExisteEm", () => {
  it("fala a faixa como no mockup", () => {
    expect(rotuloExisteEm({ versaoDesde: 1, versaoAte: null })).toBe("v1 em diante");
    expect(rotuloExisteEm({ versaoDesde: 2, versaoAte: null })).toBe("a partir da v2");
    expect(rotuloExisteEm({ versaoDesde: 1, versaoAte: 1 })).toBe("só v1");
    expect(rotuloExisteEm({ versaoDesde: 1, versaoAte: 2 })).toBe("até a v2");
    expect(rotuloExisteEm({ versaoDesde: 2, versaoAte: 3 })).toBe("da v2 à v3");
    expect(rotuloExisteEm(null)).toBe("em nenhuma versão");
  });
});

describe("catalogoTodasVersoes", () => {
  it("sub com faixa maior que a do card-mãe mostra a faixa efetiva", () => {
    const t = catalogoTodasVersoes(snapBase(), [1, 2]);
    const rede = t.cards.find((c) => c.alvo.id === "cab")!.subs.find((s) => s.alvo.id === "rede")!;
    expect(rede.faixa).toEqual({ versaoDesde: 1, versaoAte: 1 });
    expect(rede.existeEm).toBe("só v1");
    expect(rede.versoes).toEqual([1]);
  });

  it("siglas com a faixa efetiva, rótulo só quando difere da do item", () => {
    const t = catalogoTodasVersoes(snapBase(), [1, 2]);
    const hid = t.cards.find((c) => c.alvo.id === "hid")!;
    expect(hid.siglas.map((s) => [s.sigla, s.oficial, s.rotulo])).toEqual([
      ["HID", true, null],
      ["ESG", false, "só v1"],
      ["HDR", false, null],
    ]);
    const orc = t.cards.find((c) => c.alvo.id === "orc")!;
    expect(orc.siglas.map((s) => [s.sigla, s.rotulo])).toEqual([
      ["ORÇ", "só v1"],
      ["ORC", "a partir da v2"],
    ]);
  });

  it("linha toda fora da faixa do item não aparece", () => {
    const s = snapBase();
    s.cards.push(card("x", "X", [1, 2], [linha("XX", true, 1, 2), linha("XN", true, 3, null)]));
    const x = catalogoTodasVersoes(s, [1, 2, 3]).cards.find((c) => c.alvo.id === "x")!;
    expect(x.siglas.map((l) => l.sigla)).toEqual(["XX"]);
  });

  it("arquivados entram, marcados como inativos", () => {
    const t = catalogoTodasVersoes(snapBase(), [1, 2]);
    expect(t.cards.find((c) => c.alvo.id === "acu")).toMatchObject({ ativo: false, existeEm: "só v1" });
    expect(t.cards.find((c) => c.alvo.id === "hid")!.subs.find((s) => s.alvo.id === "velha")).toMatchObject({ ativo: false });
  });

  it("ordem dos cards é a do catálogo; fases e tipos separados", () => {
    const t = catalogoTodasVersoes(snapBase(), [1, 2]);
    expect(t.cards.map((c) => c.alvo.id)).toEqual(["hid", "orc", "cab", "seg", "acu"]);
    expect(t.fases.map((f) => f.nome)).toEqual(["Projeto Executivo"]);
    expect(t.tipos.map((f) => f.existeEm)).toEqual(["a partir da v2"]);
  });

  it("A3: cada item ativo aparece na lente vN exatamente nas versões que a lente Todas diz", () => {
    const s = snapBase();
    const numeros = [1, 2, 3];
    const t = catalogoTodasVersoes(s, numeros);
    const ativosTodas: { chave: string; versoes: number[] }[] = [];
    for (const c of t.cards) {
      if (c.ativo) ativosTodas.push({ chave: chaveAlvo(c.alvo), versoes: c.versoes });
      for (const sb of c.subs) if (sb.ativo && c.ativo) ativosTodas.push({ chave: chaveAlvo(sb.alvo), versoes: sb.versoes });
    }
    for (const l of [...t.fases, ...t.tipos]) if (l.ativo) ativosTodas.push({ chave: chaveAlvo(l.alvo), versoes: l.versoes });

    for (const n of numeros) {
      const vn = catalogoNaVersao(s, n);
      const naLente = new Set(
        [...vn.cards, ...vn.cards.flatMap((c) => c.subs), ...vn.fases, ...vn.tipos].map((l) => chaveAlvo(l.alvo)),
      );
      const peloTodas = new Set(ativosTodas.filter((a) => a.versoes.includes(n)).map((a) => a.chave));
      expect([...naLente].sort()).toEqual([...peloTodas].sort());
    }
  });
});

describe("versaoParaAbrir", () => {
  it("a última versão em que o item existe; sem nenhuma, a mais nova", () => {
    expect(versaoParaAbrir({ versoes: [1, 2] }, [1, 2, 3])).toBe(2);
    expect(versaoParaAbrir({ versoes: [] }, [1, 2, 3])).toBe(3);
    expect(versaoParaAbrir({ versoes: [] }, [])).toBe(1);
  });
});

describe("filtrarTodas", () => {
  const t = () => catalogoTodasVersoes(snapBase(), [1, 2]);
  const sem = { busca: "", categoria: null, arquivadas: true };

  it("busca por sinônimo acha o card", () => {
    expect(filtrarTodas(t().cards, { ...sem, busca: "hdr" }).map((c) => c.alvo.id)).toEqual(["hid"]);
  });

  it("busca pelo nome de uma sub mostra o card só com ela", () => {
    const r = filtrarTodas(t().cards, { ...sem, busca: "agua fria" });
    expect(r.map((c) => c.alvo.id)).toEqual(["hid"]);
    expect(r[0].subs.map((s) => s.nome)).toEqual(["Água fria"]);
  });

  it("busca pela categoria", () => {
    expect(filtrarTodas(t().cards, { ...sem, busca: "eletrica" }).map((c) => c.alvo.id)).toEqual(["cab", "seg"]);
  });

  it("sem arquivadas: some o card arquivado e a sub arquivada", () => {
    const r = filtrarTodas(t().cards, { ...sem, arquivadas: false });
    expect(r.map((c) => c.alvo.id)).not.toContain("acu");
    expect(r.find((c) => c.alvo.id === "hid")!.subs.map((s) => s.alvo.id)).toEqual(["agf", "esg"]);
  });

  it("categoria \"Outras\" pega card sem categoria", () => {
    expect(filtrarTodas(t().cards, { ...sem, categoria: "Outras" }).map((c) => c.alvo.id)).toEqual(["orc"]);
    expect(filtrarTodas(t().cards, { ...sem, categoria: "ELÉTRICA" }).map((c) => c.alvo.id)).toEqual(["cab", "seg"]);
  });

  it("listas planas: busca por sigla e corte de arquivados", () => {
    const fases = t().fases;
    expect(filtrarLinhasTodas(fases, { busca: "ex", arquivadas: true })).toHaveLength(1);
    expect(filtrarLinhasTodas([{ ...fases[0], ativo: false }], { busca: "", arquivadas: false })).toEqual([]);
  });
});

describe("frases de em uso (iguais às do servidor)", () => {
  it("plural e singular", () => {
    expect(fraseCardEmUso(4)).toBe("Em uso em 4 projetos — arquive em vez de excluir.");
    expect(fraseCardEmUso(1)).toBe("Em uso em 1 projeto — arquive em vez de excluir.");
    expect(fraseSubEmUso(3)).toBe("Em uso em 3 documentos — arquive em vez de excluir.");
    expect(fraseSubEmUso(1)).toBe("Em uso em 1 documento — arquive em vez de excluir.");
    expect(fraseFaseEmUso(2)).toBe("Usada por 2 etapas de disciplina — arquive em vez de excluir.");
    expect(fraseFaseEmUso(1)).toBe("Usada por 1 etapa de disciplina — arquive em vez de excluir.");
  });
});

describe("motivoExclusao (a mesma regra no menu e no servidor)", () => {
  it("o uso próprio vem primeiro, depois documentos, depois outros vínculos", () => {
    expect(motivoExclusao("disciplina", { uso: 2, documentos: 5, vinculos: 1 })).toBe(fraseCardEmUso(2));
    expect(motivoExclusao("disciplina", { uso: 0, documentos: 5, vinculos: 1 })).toBe(fraseSubEmUso(5));
    expect(motivoExclusao("disciplina", { uso: 0, documentos: 0, vinculos: 1 })).toBe(fraseVinculos(1));
    expect(motivoExclusao("subdisciplina", { uso: 3 })).toBe(fraseSubEmUso(3));
    expect(motivoExclusao("prancha", { uso: 2, documentos: 4 })).toBe(fraseFaseEmUso(2));
    expect(motivoExclusao("prancha", { uso: 0, documentos: 4 })).toBe(fraseSubEmUso(4));
    expect(motivoExclusao("prancha", { uso: 0, vinculos: 7 })).toBe(fraseVinculos(7));
  });

  it("nada usa: pode excluir", () => {
    expect(motivoExclusao("disciplina", { uso: 0 })).toBeNull();
    expect(motivoExclusao("prancha", { uso: 0, documentos: 0, vinculos: 0 })).toBeNull();
  });

  it("frase de vínculos no singular e no plural", () => {
    expect(fraseVinculos(1)).toBe("Ligado a 1 registro de outra área (proposta, norma, modelo de EAP…) — arquive em vez de excluir.");
    expect(fraseVinculos(3)).toBe("Ligado a 3 registros de outras áreas (propostas, normas, modelos de EAP…) — arquive em vez de excluir.");
  });
});

describe("rotuloSiglas (o que o leitor de tela ouve no botão das siglas)", () => {
  it("lê as siglas com papel e versão, e diz o que o botão faz", () => {
    const hid = catalogoTodasVersoes(snapBase(), [1, 2]).cards.find((c) => c.alvo.id === "hid")!;
    expect(rotuloSiglas("Hidrossanitário", hid.siglas)).toBe("Siglas de Hidrossanitário: HID; ESG (sinônimo), só v1; HDR (sinônimo). Ver histórico.");
  });

  it("sem sigla", () => {
    expect(rotuloSiglas("Água fria", [])).toBe("Água fria: sem sigla. Ver histórico de siglas.");
  });
});
