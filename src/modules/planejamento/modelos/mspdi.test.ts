import { describe, expect, it } from "vitest";
import { horasIso, lerMspdi } from "./mspdi";

/**
 * XML sintético de propósito: o arquivo real da casa (`docs/samples/`) está fora do git, e um teste
 * que depende dele não roda em máquina nenhuma. O que o arquivo real cobre é o
 * `verify:modelo-mspdi`, que lê o de verdade quando ele existe.
 */
function arquivo(tarefas: string, projeto = "<MinutesPerDay>480</MinutesPerDay>") {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Title>EAP de teste</Title>
  ${projeto}
  <Tasks>
    <Task><UID>0</UID><Name>Resumo do projeto</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
    ${tarefas}
  </Tasks>
</Project>`;
}

const tarefa = (uid: string, o: Partial<Record<string, string>> = {}) => `
  <Task>
    <UID>${uid}</UID>
    <Name>${o.nome ?? `Tarefa ${uid}`}</Name>
    <WBS>${o.wbs ?? `1.${uid}`}</WBS>
    <OutlineLevel>${o.nivel ?? "2"}</OutlineLevel>
    <Duration>${o.duracao ?? "PT40H0M0S"}</Duration>
    <DurationFormat>${o.formato ?? "7"}</DurationFormat>
    <Summary>${o.resumo ?? "0"}</Summary>
    <Milestone>${o.marco ?? "0"}</Milestone>
    ${o.extra ?? ""}
    ${o.links ?? ""}
  </Task>`;

const link = (pred: string, tipo = "1", lag = "0", formato = "7") => `
  <PredecessorLink>
    <PredecessorUID>${pred}</PredecessorUID>
    <Type>${tipo}</Type>
    <LinkLag>${lag}</LinkLag>
    <LagFormat>${formato}</LagFormat>
  </PredecessorLink>`;

describe("horasIso", () => {
  it("lê o período do MSPDI", () => {
    expect(horasIso("PT800H0M0S")).toBe(800);
    expect(horasIso("PT8H30M0S")).toBe(8.5);
    expect(horasIso("PT0H0M0S")).toBe(0);
  });

  it("vazio e formato estranho valem zero, em vez de NaN", () => {
    expect(horasIso(null)).toBe(0);
    expect(horasIso("40 horas")).toBe(0);
  });
});

describe("lerMspdi — o que vem do arquivo", () => {
  it("hora vira dia pela jornada do arquivo (800 h a 8 h/dia = 100 dias)", () => {
    const r = lerMspdi(arquivo(tarefa("1", { duracao: "PT800H0M0S" })));
    expect(r.linhas[0].duracaoDias).toBe(100);
  });

  it("jornada de 6 h muda a conta — importar sem olhar isso daria 800 dias", () => {
    const r = lerMspdi(arquivo(tarefa("1", { duracao: "PT60H0M0S" }), "<MinutesPerDay>360</MinutesPerDay>"));
    expect(r.minutosPorDia).toBe(360);
    expect(r.linhas[0].duracaoDias).toBe(10);
  });

  it("sem jornada no arquivo, assume 8 h e AVISA", () => {
    const r = lerMspdi(arquivo(tarefa("1", { duracao: "PT16H0M0S" }), ""));
    expect(r.minutosPorDia).toBe(480);
    expect(r.linhas[0].duracaoDias).toBe(2);
    expect(r.avisos.join(" ")).toContain("8 horas por dia");
  });

  it("meia jornada vira duração fracionária (4 h = 0,5 dia)", () => {
    expect(lerMspdi(arquivo(tarefa("1", { duracao: "PT4H0M0S" }))).linhas[0].duracaoDias).toBe(0.5);
  });

  it("resumo e marco não têm duração própria", () => {
    const r = lerMspdi(
      arquivo(tarefa("1", { resumo: "1", duracao: "PT800H0M0S" }) + tarefa("2", { marco: "1", duracao: "PT0H0M0S" })),
    );
    expect(r.linhas.map((l) => [l.uid, l.resumo, l.marco, l.duracaoDias])).toEqual([
      ["1", true, false, 0],
      ["2", false, true, 0],
    ]);
  });

  it("guarda o nível, o nome e o WBS, na ordem do arquivo", () => {
    const r = lerMspdi(arquivo(tarefa("1", { nivel: "1", nome: "BÁSICO", wbs: "1.1" }) + tarefa("2", { nivel: "2" })));
    expect(r.linhas.map((l) => [l.uid, l.nivel, l.nome, l.wbs])).toEqual([
      ["1", 1, "BÁSICO", "1.1"],
      ["2", 2, "Tarefa 2", "1.2"],
    ]);
  });

  it("o título do arquivo vira a sugestão de nome do modelo", () => {
    expect(lerMspdi(arquivo(tarefa("1"))).titulo).toBe("EAP de teste");
  });
});

describe("lerMspdi — o que NÃO vem", () => {
  it("o resumo do projeto (UID 0) não é tarefa", () => {
    expect(lerMspdi(arquivo(tarefa("1"))).linhas.map((l) => l.uid)).toEqual(["1"]);
  });

  it("linha em branco e tarefa inativa ficam fora, com aviso", () => {
    const r = lerMspdi(
      arquivo(
        tarefa("1") + tarefa("2", { extra: "<IsNull>1</IsNull>" }) + tarefa("3", { extra: "<Active>0</Active>" }),
      ),
    );
    expect(r.linhas.map((l) => l.uid)).toEqual(["1"]);
    expect(r.avisos.join(" ")).toContain("em branco");
    expect(r.avisos.join(" ")).toContain("inativa");
  });
});

describe("lerMspdi — dependências", () => {
  it("traduz os quatro tipos do Project", () => {
    const r = lerMspdi(
      arquivo(
        tarefa("1") +
          tarefa("2", { links: link("1", "0") }) +
          tarefa("3", { links: link("1", "1") }) +
          tarefa("4", { links: link("1", "2") }) +
          tarefa("5", { links: link("1", "3") }),
      ),
    );
    expect(r.linhas.slice(1).map((l) => l.predecessoras[0].tipo)).toEqual(["ff", "fs", "sf", "ss"]);
  });

  it("atraso em décimos de minuto vira dia útil (4800 = 1 dia)", () => {
    const r = lerMspdi(arquivo(tarefa("1") + tarefa("2", { links: link("1", "1", "4800") })));
    expect(r.linhas[1].predecessoras[0].lagDias).toBe(1);
  });

  it("atraso negativo é adiantamento, e vem negativo", () => {
    const r = lerMspdi(arquivo(tarefa("1") + tarefa("2", { links: link("1", "1", "-9600") })));
    expect(r.linhas[1].predecessoras[0].lagDias).toBe(-2);
  });

  it("atraso em PORCENTAGEM não existe no motor: entra como zero e avisa", () => {
    const r = lerMspdi(arquivo(tarefa("1") + tarefa("2", { links: link("1", "1", "500", "19") })));
    expect(r.linhas[1].predecessoras[0].lagDias).toBe(0);
    expect(r.avisos.join(" ")).toContain("PORCENTAGEM");
  });

  it("vínculo para tarefa que não veio, ou para si mesma, é descartado com aviso", () => {
    const r = lerMspdi(arquivo(tarefa("1", { links: link("1") }) + tarefa("2", { links: link("99") })));
    expect(r.linhas.every((l) => l.predecessoras.length === 0)).toBe(true);
    expect(r.avisos.join(" ")).toContain("não vieram");
  });

  it("uma tarefa pode ter várias predecessoras", () => {
    const r = lerMspdi(arquivo(tarefa("1") + tarefa("2") + tarefa("3", { links: link("1") + link("2", "3", "2400") })));
    expect(r.linhas[2].predecessoras).toEqual([
      { uid: "1", tipo: "fs", lagDias: 0 },
      { uid: "2", tipo: "ss", lagDias: 0.5 },
    ]);
  });
});

describe("lerMspdi — recusas", () => {
  it("arquivo vazio", () => {
    expect(() => lerMspdi("")).toThrow("está vazio");
  });

  it("XML que não é do Project", () => {
    expect(() => lerMspdi("<Coisa><A>1</A></Coisa>")).toThrow("MS Project");
  });

  it("arquivo sem tarefa nenhuma", () => {
    expect(() => lerMspdi(arquivo(""))).toThrow("nenhuma tarefa");
  });

  it("DOCTYPE/ENTITY é recusado — expansão de entidade derruba o servidor", () => {
    const bomba = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><Project><Tasks/></Project>`;
    expect(() => lerMspdi(bomba)).toThrow("segurança");
  });
});
