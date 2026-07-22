import { describe, expect, it } from "vitest";
import { montarTopicosDoZip } from "@/modules/coordenacao/bcf/importar";
import { markupXml, viewpointXml } from "@/modules/coordenacao/bcf/writer";
import { bcfVersionXml } from "@/modules/coordenacao/bcf/writer";

const encoder = new TextEncoder();

describe("montarTopicosDoZip", () => {
  it("monta um tópico a partir de markup+viewpoint numa pasta", () => {
    const markup = markupXml({
      guid: "t1",
      title: "Conflito",
      description: "",
      status: "aberta",
      creationDate: "2026-07-22T10:00:00Z",
      creationAuthor: "x",
      temViewpoint: true,
      temSnapshot: true,
      viewpointGuid: "vp1",
    });
    const vp = viewpointXml({ guid: "vp1", guids: ["g1"], camera: { position: [0, 0, 0], target: [0, 0, -1] } });
    const arquivos = {
      "bcf.version": encoder.encode(bcfVersionXml()),
      "t1/markup.bcf": encoder.encode(markup),
      "t1/viewpoint.bcfv": encoder.encode(vp),
      "t1/snapshot.png": new Uint8Array([1, 2, 3]),
    };
    const topicos = montarTopicosDoZip(arquivos);
    expect(topicos).toHaveLength(1);
    expect(topicos[0].guid).toBe("t1");
    expect(topicos[0].title).toBe("Conflito");
    expect(topicos[0].guids).toEqual(["g1"]);
    expect(topicos[0].snapshotBytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("pasta sem markup.bcf é ignorada", () => {
    const arquivos = { "vazia/viewpoint.bcfv": encoder.encode("<x/>") };
    expect(montarTopicosDoZip(arquivos)).toEqual([]);
  });

  it("markup sem viewpoint.bcfv → tópico sem câmera/snapshot", () => {
    const markup = markupXml({
      guid: "t2",
      title: "Sem vista",
      description: "",
      status: "fechada",
      creationDate: "2026-07-22T10:00:00Z",
      creationAuthor: "x",
      temViewpoint: false,
      temSnapshot: false,
      viewpointGuid: "",
    });
    const topicos = montarTopicosDoZip({ "t2/markup.bcf": encoder.encode(markup) });
    expect(topicos).toHaveLength(1);
    expect(topicos[0].camera).toBeNull();
    expect(topicos[0].snapshotBytes).toBeNull();
  });

  it("arquivo na raiz (sem pasta) é ignorado, não vira tópico", () => {
    expect(montarTopicosDoZip({ "bcf.version": encoder.encode("x") })).toEqual([]);
  });

  it("múltiplas pastas → múltiplos tópicos", () => {
    const m1 = markupXml({
      guid: "a",
      title: "A",
      description: "",
      status: "aberta",
      creationDate: "",
      creationAuthor: "",
      temViewpoint: false,
      temSnapshot: false,
      viewpointGuid: "",
    });
    const m2 = markupXml({
      guid: "b",
      title: "B",
      description: "",
      status: "aberta",
      creationDate: "",
      creationAuthor: "",
      temViewpoint: false,
      temSnapshot: false,
      viewpointGuid: "",
    });
    const topicos = montarTopicosDoZip({
      "a/markup.bcf": encoder.encode(m1),
      "b/markup.bcf": encoder.encode(m2),
    });
    expect(topicos.map((t) => t.guid).sort()).toEqual(["a", "b"]);
  });
});
