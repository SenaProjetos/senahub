import { describe, expect, it } from "vitest";
import { CATALOGO_SENA, EXTENSOES_SENA } from "@/test/catalogo-nomenclatura";
import { CONFIANCA_ALTA, confiavel, interpretarNomeArquivo, type ContextoNomenclatura } from "./interpretar";
import { montarVocabulario } from "./vocabulario";

const vocabulario = montarVocabulario(CATALOGO_SENA, null);

/** Projeto 260020 (ano 2026, sequencial 20) — o mais presente no acervo de produção. */
function ctx(extra: Partial<ContextoNomenclatura> = {}): ContextoNomenclatura {
  return {
    projeto: { codigo: "260020", ano: 2026, sequencial: 20 },
    vocabulario,
    extensoes: EXTENSOES_SENA,
    ...extra,
  };
}

const ler = (nome: string, extra?: Partial<ContextoNomenclatura>) => interpretarNomeArquivo(nome, ctx(extra));

describe("interpretarNomeArquivo — leitura básica", () => {
  it("lê o padrão SENA completo", () => {
    const r = ler("260020-EST-EX-4000-DET-R00.dwg");
    expect(r.projeto).toMatchObject({ ano: 26, sequencial: 20, bateComAtual: true });
    expect(r.disciplina?.valor).toBe("d-est");
    expect(r.fase?.valor).toBe("f-ex");
    expect(r.tipo?.valor).toBe("t-det");
    expect(r.numero?.valor).toBe(4000);
    expect(r.revisao?.valor).toBe(0);
    expect(r.extensao).toBe("dwg");
    expect([r.fase, r.tipo, r.numero].every((c) => (c?.confianca ?? 0) >= CONFIANCA_ALTA)).toBe(true);
  });

  it("separador diferente dá o mesmo resultado", () => {
    const esperado = { disciplina: "d-est", fase: "f-ex", tipo: "t-det", numero: 4003 };
    for (const nome of [
      "26019_EST_EX_DTC_4003_R00.dwg",
      "26019-EST-EX-DTC-4003-R00.dwg",
      "26019.EST.EX.DTC.4003.R00.dwg",
      "26019 EST EX DTC 4003 R00.dwg",
    ]) {
      const r = ler(nome);
      expect({
        disciplina: r.disciplina?.valor,
        fase: r.fase?.valor,
        tipo: r.tipo?.valor,
        numero: r.numero?.valor,
      }).toEqual(esperado);
    }
  });

  it("lê partes coladas com confiança menor", () => {
    const r = ler("EST001R02.dwg");
    expect(r.disciplina?.valor).toBe("d-est");
    expect(r.revisao?.valor).toBe(2);
    expect(r.disciplina?.confianca).toBeLessThan(CONFIANCA_ALTA);
  });

  it("aceita as escritas de revisão", () => {
    expect(ler("260020-EST-EX-4000-DET-REV-02.pdf").revisao?.valor).toBe(2);
    expect(ler("260020-EST-EX-4000-DET-RV3.pdf").revisao?.valor).toBe(3);
  });

  it("sinônimo do catálogo resolve a família que hoje fica sem fase e sem tipo", () => {
    const r = ler("260020-HDR-EX-6011-DTC.DWG");
    expect(r.disciplina?.valor).toBe("d-hid");
    expect(r.tipo?.valor).toBe("t-det");
    expect(r.tipo?.fonte).toBe("sinonimo");
    expect(confiavel(r.tipo)).toBe(true);
  });

  it("não inventa campo sem evidência", () => {
    const r = ler("planta.pdf");
    expect(r.fase).toBeUndefined();
    expect(r.tipo).toBeUndefined();
    expect(r.numero).toBeUndefined();
    expect(r.revisao).toBeUndefined();
  });
});

describe("interpretarNomeArquivo — nome livre", () => {
  it("não lê preposição como tipo nem sigla de estado como fase", () => {
    expect(ler("ATA DE REUNIÃO.pdf").tipo).toBeUndefined();
    expect(ler("Memória de quantitativos - Ponte Surubim PE.doc").fase).toBeUndefined();
  });

  it("marca o nome como livre e ignora número solto", () => {
    const r = ler("Laudo de Exigência_06.07.2026.pdf");
    expect(r.nomeLivre).toBe(true);
    expect(r.numero).toBeUndefined();
    expect(r.datas).toEqual(["2026-07-06"]);
  });

  it("espaço ao redor do hífen não transforma nome codificado em livre", () => {
    const r = ler("260018-EST-EX-4004-DTC - R01.dwg");
    expect(r.nomeLivre).toBe(false);
    expect(r.tipo?.valor).toBe("t-det");
    expect(r.revisao?.valor).toBe(1);
  });
});

describe("interpretarNomeArquivo — disciplina, faixa e projeto", () => {
  it("sigla no nome vence a faixa de numeração, e a divergência vira aviso", () => {
    const r = ler("260020-ELE-EX-5104-DET.pdf");
    expect(r.disciplina?.valor).toBe("d-ele");
    expect(r.avisos.map((a) => a.tipo)).toContain("faixa_divergente");
  });

  it("sem sigla, a faixa sugere a disciplina — só como sugestão", () => {
    const r = ler("5000-Elétrico.zip");
    expect(r.disciplina).toMatchObject({ valor: "d-ele", fonte: "faixa_numeracao" });
    expect(confiavel(r.disciplina)).toBe(false);
  });

  it("escolhe a disciplina imediatamente antes da fase", () => {
    const r = ler("CGA_GAS-SPD-PE-004-GER-PLAEXE-R00.dwg");
    expect(r.disciplina?.valor).toBe("d-spd");
    expect(r.fase?.valor).toBe("f-ex");
    expect(r.numero?.valor).toBe(4);
  });

  it("avisa quando a disciplina do nome difere da escolhida no envio", () => {
    const r = ler("260020-DRE-EX-6100-LME.pdf", { disciplinaCatalogoId: "d-hid" });
    expect(r.avisos.map((a) => a.tipo)).toContain("disciplina_divergente");
    expect(r.disciplina?.valor).toBe("d-dre");
  });

  it("projeto divergente vira aviso + sugestão de renumerar, preservando o resto do nome", () => {
    const r = interpretarNomeArquivo("26027-EST-EX-4005-M3D-R00.ifc", {
      projeto: { codigo: "260032", ano: 2026, sequencial: 32 },
      vocabulario,
      extensoes: EXTENSOES_SENA,
    });
    expect(r.projeto?.bateComAtual).toBe(false);
    expect(r.avisos.map((a) => a.tipo)).toContain("projeto_divergente");
    expect(r.sugestoes).toContainEqual(
      expect.objectContaining({ tipo: "renumerar", nome: "260032-EST-EX-4005-M3D-R00.ifc" }),
    );
  });

  it("não sugere renumerar quando o nome não tem disciplina nem fase (desenho de elemento)", () => {
    const r = interpretarNomeArquivo("253-PIL-VIG-010-R00.DXF", {
      projeto: { codigo: "260007", ano: 2026, sequencial: 7 },
      vocabulario,
      extensoes: EXTENSOES_SENA,
    });
    // O aviso continua (o número do começo não bate com o projeto), mas sem botão de renomear.
    expect(r.avisos.map((a) => a.tipo)).toContain("projeto_divergente");
    expect(r.sugestoes.filter((s) => s.tipo === "renumerar")).toEqual([]);
  });

  it("subprojeto é preservado na renumeração", () => {
    const r = interpretarNomeArquivo("26001.1-EST-EX-4001-DTC.pdf", {
      projeto: { codigo: "260004", ano: 2026, sequencial: 4 },
      vocabulario,
    });
    expect(r.projeto).toMatchObject({ sequencial: 1, subprojeto: 1 });
    expect(r.sugestoes).toContainEqual(expect.objectContaining({ nome: "260004.1-EST-EX-4001-DTC.pdf" }));
  });

  it("projeto que bate não gera aviso nem sugestão", () => {
    const r = ler("260020-EST-EX-4000-DET.pdf");
    expect(r.avisos).toEqual([]);
    expect(r.sugestoes).toEqual([]);
  });
});

describe("interpretarNomeArquivo — extensão, backup e cópia", () => {
  it("extensão desconhecida avisa, mas não impede nada", () => {
    const r = ler("260020-EST-EX-4000-DET.novoformato");
    expect(r.extensaoConhecida).toBe(false);
    expect(r.categoria).toBeNull();
    expect(r.software).toBeNull();
    expect(r.fase?.valor).toBe("f-ex");
    expect(r.avisos.map((a) => a.tipo)).toContain("extensao_desconhecida");
  });

  it("backup do Revit numerado não é revisão de projeto", () => {
    const r = ler("modelo.0001.rvt");
    expect(r.extensao).toBe("0000.rvt");
    expect(r.ehBackup).toBe(true);
    expect(r.revisao).toBeUndefined();
  });

  it("temporário do AutoCAD avisa", () => {
    expect(ler("260020-EST-EX-4000-DET-R00.bak").avisos.map((a) => a.tipo)).toContain("arquivo_temporario");
  });

  it("qibzip sugere o pacote Backup; zip sozinho não", () => {
    expect(ler("BELA BEACH [cópia 2026-09-14_05].qibzip").sugestoes.map((s) => s.tipo)).toContain("enviar_backup");
    expect(ler("ENTREGA BÁSICO.zip").sugestoes.map((s) => s.tipo)).not.toContain("enviar_backup");
  });

  it("zip com pista de backup no nome sugere o pacote Backup", () => {
    expect(ler("260020 - BACKUP TQS.zip").sugestoes.map((s) => s.tipo)).toContain("enviar_backup");
  });

  it("sugere nova versão quando só o sufixo de cópia mudou", () => {
    const r = ler("BELA BEACH [cópia 2026-09-14_05].qibzip", {
      documentosExistentes: [
        { id: "doc-1", nomeArquivo: "BELA BEACH [cópia 2026-09-10_01].qibzip" },
        { id: "doc-2", nomeArquivo: "OUTRA OBRA [cópia 2026-09-10_01].qibzip" },
      ],
    });
    expect(r.sugestoes).toContainEqual(expect.objectContaining({ tipo: "nova_versao_de", documentoId: "doc-1" }));
    expect(r.sugestoes.filter((s) => s.tipo === "nova_versao_de")).toHaveLength(1);
  });

  it("não sugere nova versão quando o nome é idêntico (a versão normal já cobre)", () => {
    const r = ler("260020-EST-EX-4000-DET.pdf", {
      documentosExistentes: [{ id: "doc-1", nomeArquivo: "260020-EST-EX-4000-DET.pdf" }],
    });
    expect(r.sugestoes.filter((s) => s.tipo === "nova_versao_de")).toEqual([]);
  });
});

describe("interpretarNomeArquivo — padrão do projeto", () => {
  const padrao = "{proj}-{disc}-{fase}-{nº}-{tipo}[-{Rnn}]";

  it("padrão do projeto lê com confiança maior que a heurística", () => {
    const r = ler("260020-EST-EX-4000-DET-R00.pdf", { padrao });
    expect(r.casouPadrao).toBe(true);
    expect(r.fase).toMatchObject({ fonte: "padrao_projeto", confianca: 0.95 });
    expect(r.numero?.valor).toBe(4000);
  });

  it("nome fora do padrão cai na heurística, sem perder o que dá para ler", () => {
    const r = ler("26019_EST_EX_DTC_4003_R00.dwg", { padrao });
    expect(r.casouPadrao).toBe(false);
    expect(r.fase?.valor).toBe("f-ex");
    expect(r.fase?.fonte).not.toBe("padrao_projeto");
  });

  it("sigla fora do catálogo no padrão avisa em vez de inventar", () => {
    const r = ler("260020-EST-EX-4000-XYZ.pdf", { padrao });
    expect(r.casouPadrao).toBe(true);
    expect(r.tipo).toBeUndefined();
    expect(r.avisos.map((a) => a.tipo)).toContain("sigla_desconhecida");
  });

  it("sem padrão configurado, casouPadrao é nulo", () => {
    expect(ler("260020-EST-EX-4000-DET.pdf").casouPadrao).toBeNull();
  });
});

/**
 * CRITÉRIO DE ACEITE DA F1 (spec §4): as famílias de nome do diagnóstico de produção de
 * 2026-09-15, ponderadas pela quantidade real de documentos. Nomes recriados com a mesma
 * estrutura, sem nome de cliente real. O denominador é o acervo inteiro (536 documentos vivos),
 * então o que não está nas famílias conta como não reconhecido.
 */
describe("famílias de produção (aceite da F1)", () => {
  const DOCUMENTOS_VIVOS_EM_PRODUCAO = 536;

  type Familia = { qtd: number; nome: string; projeto?: { codigo: string; ano: number; sequencial: number }; fase?: string; tipo?: string };

  const familias: Familia[] = [
    { qtd: 103, nome: "26001.1-EST-EX-4001-DTC.pdf", fase: "f-ex", tipo: "t-det" },
    { qtd: 91, nome: "260020-HDR-EX-6011-DTC.DWG", fase: "f-ex", tipo: "t-det" },
    { qtd: 52, nome: "260020-EST-EX-4000-DE-R00.dwg", fase: "f-ex", tipo: "t-det" },
    { qtd: 51, nome: "CGA_GAS-SPD-PE-004-GER-PLAEXE-R00.dwg", fase: "f-ex" },
    { qtd: 32, nome: "EM-LUC11-HID-PB-001-R02.dwg", fase: "f-bs" },
    { qtd: 21, nome: "26013-ELE-EX-5003-MD-R00.docx", fase: "f-ex", tipo: "t-mem" },
    { qtd: 15, nome: "PICTS-ELE-EX-000-MED-R00.pdf", fase: "f-ex", tipo: "t-mem" },
    { qtd: 14, nome: "26001.2-EST-EX-4005-M3D.IFC", fase: "f-ex", tipo: "t-m3d" },
    { qtd: 10, nome: "260020-HDR-EX-6015-M3D.ifc", fase: "f-ex", tipo: "t-m3d" },
    { qtd: 10, nome: "26001.4-ELE-EX-5003_MED.pdf", fase: "f-ex", tipo: "t-mem" },
    { qtd: 7, nome: "26027-EST-EX-4005-M3D-R00", fase: "f-ex", tipo: "t-m3d" },
    { qtd: 6, nome: "26019_EST_EX_DTC_4003_R00.dwg", fase: "f-ex", tipo: "t-det" },
    { qtd: 6, nome: "PICTS-ELE-EX-001-ALI-PV1-R00.dwg", fase: "f-ex" },
    { qtd: 6, nome: "ESTR. CONC. - Pousada Cap. Thomas  R02.IFC.log.html" },
    { qtd: 5, nome: "2631-ARC-ARQ-BS-DE-304.pdf", fase: "f-bs", tipo: "t-det" },
    { qtd: 5, nome: "Laudo de Exigência_06.07.2026.pdf" },
    { qtd: 5, nome: "laudo_surubim_revisado.docx" },
    { qtd: 4, nome: "26001-4-EST-EX-4004-DTC.dwg", fase: "f-ex", tipo: "t-det" },
    { qtd: 4, nome: "DETALHAMENTOESCADA-qnt2-331940.png" },
    { qtd: 3, nome: "ATA DE REUNIÃO.pdf" },
    { qtd: 3, nome: "26013_ELE-QI [cópia 2026-05-29_02].qibzip" },
    { qtd: 3, nome: "plot.log" },
    { qtd: 2, nome: "BFF_S LOUNGE - ELÉTRICA-TELECOM [cópia 2026-08-20_02].qibzip" },
    { qtd: 2, nome: "Memória de quantitativos - Ponte Surubim PE.doc" },
    { qtd: 2, nome: "ENTREGA BÁSICO - 26.08.26.zip" },
  ];

  const lidos = familias.map((f) => ({
    familia: f,
    r: interpretarNomeArquivo(f.nome, {
      projeto: f.projeto ?? { codigo: "260020", ano: 2026, sequencial: 20 },
      vocabulario,
      extensoes: EXTENSOES_SENA,
    }),
  }));

  it.each(lidos)("$familia.nome", ({ familia, r }) => {
    // Alta confiança é o que o envio grava sozinho (D7) — o esperado da família tem que caber aí.
    expect(confiavel(r.fase) ? r.fase?.valor : undefined).toBe(familia.fase);
    expect(confiavel(r.tipo) ? r.tipo?.valor : undefined).toBe(familia.tipo);
  });

  it("reconhece fase em ≥ 70% e tipo em ≥ 60% do acervo", () => {
    const somar = (campo: "fase" | "tipo") =>
      lidos.reduce((total, { familia, r }) => total + (confiavel(r[campo]) ? familia.qtd : 0), 0);
    const pctFase = somar("fase") / DOCUMENTOS_VIVOS_EM_PRODUCAO;
    const pctTipo = somar("tipo") / DOCUMENTOS_VIVOS_EM_PRODUCAO;
    expect({ fase: pctFase >= 0.7, tipo: pctTipo >= 0.6 }).toEqual({ fase: true, tipo: true });
  });
});
