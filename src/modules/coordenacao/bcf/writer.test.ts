import { describe, it, expect } from "vitest";
import {
  escaparXml,
  fmtNum,
  statusParaBcf,
  cameraParaBcf,
  bcfVersionXml,
  markupXml,
  viewpointXml,
  type Vec3,
} from "@/modules/coordenacao/bcf/writer";

describe("escaparXml", () => {
  it("escapa os cinco reservados", () => {
    expect(escaparXml(`a & b < c > d " e ' f`)).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &apos; f",
    );
  });
});

describe("fmtNum", () => {
  it("sem zeros supérfluos, sem -0, sem notação científica", () => {
    expect(fmtNum(1.5)).toBe("1.5");
    expect(fmtNum(2)).toBe("2");
    expect(fmtNum(-0)).toBe("0");
    expect(fmtNum(0.0000001)).toBe("0");
    expect(fmtNum(1e-7)).toBe("0");
    expect(fmtNum(1234.5)).toBe("1234.5");
  });
});

describe("statusParaBcf", () => {
  it("mapeia status internos para TopicStatus do BCF", () => {
    expect(statusParaBcf("aberta")).toBe("Open");
    expect(statusParaBcf("resolvida")).toBe("Resolved");
    expect(statusParaBcf("fechada")).toBe("Closed");
    expect(statusParaBcf("descartada")).toBe("Closed");
    expect(statusParaBcf("qualquer")).toBe("Open");
  });
});

describe("cameraParaBcf", () => {
  it("direction = normalize(target - position)", () => {
    const { viewpoint, direction } = cameraParaBcf([0, 0, 0], [0, 0, 10]);
    expect(viewpoint).toEqual([0, 0, 0]);
    expect(direction).toEqual([0, 0, 1]);
  });

  it("up é ortogonal à direção e unitário (câmera olhando no plano)", () => {
    const { direction, up } = cameraParaBcf([0, 0, 5], [10, 0, 5]); // olha +X, altura Z=5
    // direção horizontal → up deve apontar para +Z (Z-up global)
    expect(up[2]).toBeCloseTo(1, 5);
    const dot = direction[0] * up[0] + direction[1] * up[1] + direction[2] * up[2];
    expect(dot).toBeCloseTo(0, 6);
    expect(Math.hypot(...up)).toBeCloseTo(1, 6);
  });

  it("direção vertical cai no up alternativo", () => {
    const { up } = cameraParaBcf([0, 0, 10], [0, 0, 0]); // olhando reto para baixo
    expect(Math.hypot(...up)).toBeCloseTo(1, 6);
    expect(up).toEqual([0, 1, 0]);
  });
});

describe("bcfVersionXml", () => {
  it("declara VersionId 2.1", () => {
    const xml = bcfVersionXml();
    expect(xml).toContain('<Version VersionId="2.1">');
    expect(xml).toContain("<DetailedVersion>2.1</DetailedVersion>");
  });
});

describe("markupXml", () => {
  const base = {
    guid: "abc-123",
    title: "#1 Viga cruza duto",
    description: "Interferência entre EST e HID.",
    status: "aberta",
    creationDate: "2026-07-11T04:42:40.992Z",
    creationAuthor: "Tádrio",
    temViewpoint: true,
    temSnapshot: true,
    viewpointGuid: "vp-1",
  };

  it("monta Topic com Guid/status/título e referência a viewpoint+snapshot", () => {
    const xml = markupXml(base);
    expect(xml).toContain('<Topic Guid="abc-123" TopicType="Issue" TopicStatus="Open">');
    expect(xml).toContain("<Title>#1 Viga cruza duto</Title>");
    expect(xml).toContain("<CreationAuthor>Tádrio</CreationAuthor>");
    expect(xml).toContain("<Description>Interferência entre EST e HID.</Description>");
    expect(xml).toContain('<Viewpoints Guid="vp-1">');
    expect(xml).toContain("<Viewpoint>viewpoint.bcfv</Viewpoint>");
    expect(xml).toContain("<Snapshot>snapshot.png</Snapshot>");
  });

  it("omite Snapshot quando não há; omite Description vazia", () => {
    const xml = markupXml({ ...base, temSnapshot: false, description: "  " });
    expect(xml).not.toContain("<Snapshot>");
    expect(xml).not.toContain("<Description>");
    expect(xml).toContain("<Viewpoint>viewpoint.bcfv</Viewpoint>");
  });

  it("omite bloco Viewpoints quando não há viewpoint", () => {
    const xml = markupXml({ ...base, temViewpoint: false });
    expect(xml).not.toContain("<Viewpoints");
  });
});

describe("viewpointXml", () => {
  it("lista Components/Selection por IfcGuid e a PerspectiveCamera", () => {
    const xml = viewpointXml({
      guid: "vp-1",
      guids: ["3xR2mF7g5ABesdgYQ2gsMe", "1AaGF2s0v6zRUqle2f3nP1"],
      camera: { position: [1, 2, 3], target: [4, 2, 3] },
    });
    expect(xml).toContain('<VisualizationInfo Guid="vp-1">');
    expect(xml).toContain('<Component IfcGuid="3xR2mF7g5ABesdgYQ2gsMe" />');
    expect(xml).toContain('<Component IfcGuid="1AaGF2s0v6zRUqle2f3nP1" />');
    expect(xml).toContain("<PerspectiveCamera>");
    expect(xml).toContain("<CameraViewPoint>");
    expect(xml).toContain("<FieldOfView>55</FieldOfView>");
    expect(xml).toContain('<Visibility DefaultVisibility="true" />');
  });

  it("inclui ClippingPlanes quando fornecidos", () => {
    const planos: { location: Vec3; direction: Vec3 }[] = [
      { location: [0, 0, 5], direction: [0, 0, -1] },
    ];
    const xml = viewpointXml({
      guid: "vp-2",
      guids: [],
      camera: { position: [0, 0, 0], target: [1, 0, 0] },
      clippingPlanes: planos,
    });
    expect(xml).toContain("<ClippingPlanes>");
    expect(xml).toContain("<ClippingPlane>");
    expect(xml).toContain("<Location>");
    expect(xml).toContain("<Direction>");
  });
});
