import { describe, expect, it } from "vitest";
import { lerTopico, statusDeBcf, bcfParaCamera } from "@/modules/coordenacao/bcf/reader";
import { markupXml, viewpointXml } from "@/modules/coordenacao/bcf/writer";

describe("statusDeBcf", () => {
  it("mapeia status conhecidos (case-insensitive)", () => {
    expect(statusDeBcf("Open")).toBe("aberta");
    expect(statusDeBcf("resolved")).toBe("resolvida");
    expect(statusDeBcf("Closed")).toBe("fechada");
    expect(statusDeBcf("In Progress")).toBe("aberta");
  });
  it("desconhecido/null → aberta", () => {
    expect(statusDeBcf("Whatever")).toBe("aberta");
    expect(statusDeBcf(null)).toBe("aberta");
  });
});

describe("bcfParaCamera", () => {
  it("position = viewpoint; target ao longo da direção normalizada", () => {
    const { position, target } = bcfParaCamera([1, 2, 3], [0, 0, -2]); // direção -Z, não unitária
    expect(position).toEqual([1, 2, 3]);
    // normalize([0,0,-2]) = [0,0,-1]; target = [1,2,3] + [0,0,-10]
    expect(target).toEqual([1, 2, -7]);
  });
});

describe("lerTopico", () => {
  it("markup sem viewpoint: extrai campos, sem câmera/guids", () => {
    const markup = markupXml({
      guid: "abc-123",
      title: "Viga colidindo",
      description: "Conflito estrutural × hidráulica",
      status: "aberta",
      creationDate: "2026-07-22T10:00:00Z",
      creationAuthor: "fulano@sena",
      temViewpoint: false,
      temSnapshot: false,
      viewpointGuid: "vp-1",
    });
    const t = lerTopico(markup, null)!;
    expect(t.guid).toBe("abc-123");
    expect(t.title).toBe("Viga colidindo");
    expect(t.description).toBe("Conflito estrutural × hidráulica");
    expect(t.status).toBe("aberta");
    expect(t.creationAuthor).toBe("fulano@sena");
    expect(t.camera).toBeNull();
    expect(t.guids).toEqual([]);
  });

  it("round-trip com o writer: markup + viewpoint", () => {
    const markup = markupXml({
      guid: "topic-guid-1",
      title: "Título com <tag> & 'aspas'",
      description: "Descrição",
      status: "resolvida",
      creationDate: "2026-07-22T12:00:00Z",
      creationAuthor: "autor",
      temViewpoint: true,
      temSnapshot: true,
      viewpointGuid: "vp-guid-1",
    });
    const vp = viewpointXml({
      guid: "vp-guid-1",
      guids: ["1a2b3c", "4d5e6f"],
      camera: { position: [10, 20, 30], target: [10, 20, 0] }, // olhando pra baixo (−Z)
    });

    const t = lerTopico(markup, vp)!;
    expect(t.guid).toBe("topic-guid-1");
    expect(t.title).toBe("Título com <tag> & 'aspas'"); // escape → desescape ok
    expect(t.status).toBe("resolvida"); // Resolved → resolvida
    expect(t.snapshotFile).toBe("snapshot.png");
    expect(t.guids).toEqual(["1a2b3c", "4d5e6f"]);
    // Câmera: position preservada; direção do writer era normalize(target-position) = [0,0,-1].
    expect(t.camera!.position).toEqual([10, 20, 30]);
    expect(t.camera!.target[0]).toBeCloseTo(10, 6);
    expect(t.camera!.target[1]).toBeCloseTo(20, 6);
    expect(t.camera!.target[2]).toBeCloseTo(20, 6); // 30 + (-1)*10
  });

  it("markup sem Guid → null (inutilizável)", () => {
    expect(lerTopico("<Markup><Topic><Title>x</Title></Topic></Markup>", null)).toBeNull();
  });

  it("tolera prefixo de namespace nas tags", () => {
    const markup =
      '<bcf:Markup><bcf:Topic Guid="ns-1" TopicStatus="Closed"><bcf:Title>Com NS</bcf:Title></bcf:Topic></bcf:Markup>';
    const t = lerTopico(markup, null)!;
    expect(t.guid).toBe("ns-1");
    expect(t.title).toBe("Com NS");
    expect(t.status).toBe("fechada");
  });

  it("extrai IfcGuids mesmo com atributos extras no Component", () => {
    const vp =
      '<VisualizationInfo><Components><Selection>' +
      '<Component IfcGuid="g1" OriginatingSystem="Revit" />' +
      '<Component AuthoringToolId="42" IfcGuid="g2" />' +
      "</Selection></Components>" +
      "<PerspectiveCamera>" +
      "<CameraViewPoint><X>0</X><Y>0</Y><Z>5</Z></CameraViewPoint>" +
      "<CameraDirection><X>0</X><Y>0</Y><Z>-1</Z></CameraDirection>" +
      "<CameraUpVector><X>0</X><Y>1</Y><Z>0</Z></CameraUpVector>" +
      "</PerspectiveCamera></VisualizationInfo>";
    const markup = '<Markup><Topic Guid="g" TopicStatus="Open"><Title>t</Title></Topic></Markup>';
    const t = lerTopico(markup, vp)!;
    expect(t.guids).toEqual(["g1", "g2"]);
    expect(t.camera!.position).toEqual([0, 0, 5]);
  });
});
