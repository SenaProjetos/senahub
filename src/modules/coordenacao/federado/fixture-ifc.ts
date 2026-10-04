/**
 * IFC4 mínimo e VÁLIDO para testes e smoke do federado: projeto → site → edifício → pavimento → uma parede
 * extrudada. Os GlobalIds saem da `semente` (mesma semente em dois arquivos = GlobalIds repetidos de propósito).
 * O nome da parede tem `''`, `;`, `#` e parênteses dentro da string — o pior caso para o leitor STEP.
 */
export function ifcDeTeste(o: { semente?: string; schema?: string; unidade?: "MILLI" | "METRE" | "FOOT"; dx?: number } = {}): string {
  const semente = o.semente ?? "A";
  const schema = o.schema ?? "IFC4";
  const unidade = o.unidade ?? "MILLI";
  const dx = (o.dx ?? 0).toFixed(1);
  // GlobalId de verdade começa com 0–3 (o analisador só aceita esses).
  const guid = (n: number) => `0${semente}${n}`.padEnd(22, "A").slice(0, 22);

  const unidades =
    unidade === "FOOT"
      ? [
          "#4=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);",
          "#5=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#6);",
          "#6=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", // solto: NÃO é a unidade do projeto
          "#2=IFCCONVERSIONBASEDUNIT(#4,.LENGTHUNIT.,'FOOT',#5);",
        ]
      : [`#2=IFCSIUNIT(*,.LENGTHUNIT.,${unidade === "MILLI" ? ".MILLI." : "$"},.METRE.);`];

  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME('teste-${semente}.ifc','2026-10-04T00:00:00',(''),(''),'','','');`,
    `FILE_SCHEMA(('${schema}'));`,
    "ENDSEC;",
    "DATA;",
    `#1=IFCPROJECT('${guid(1)}',$,'Projeto ${semente}',$,$,$,$,(#11),#7);`,
    ...unidades,
    "#3=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);",
    // Revit põe moeda e unidades derivadas na atribuição, ANTES da de comprimento: o analisador tem de pular.
    "#13=IFCMONETARYUNIT('BRL');",
    "#7=IFCUNITASSIGNMENT((#13,#2,#3));",
    "#8=IFCCARTESIANPOINT((0.,0.,0.));",
    "#9=IFCDIRECTION((0.,0.,1.));",
    "#10=IFCAXIS2PLACEMENT3D(#8,$,$);",
    "#11=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#10,$);",
    "#12=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#11,$,.MODEL_VIEW.,$);",
    `#20=IFCSITE('${guid(20)}',$,'Terreno',$,$,#21,$,$,.ELEMENT.,$,$,$,$,$);`,
    "#21=IFCLOCALPLACEMENT($,#10);",
    `#22=IFCRELAGGREGATES('${guid(22)}',$,$,$,#1,(#20));`,
    `#23=IFCBUILDING('${guid(23)}',$,'Edificio',$,$,#24,$,$,.ELEMENT.,$,$,$);`,
    "#24=IFCLOCALPLACEMENT(#21,#10);",
    `#25=IFCRELAGGREGATES('${guid(25)}',$,$,$,#20,(#23));`,
    `#26=IFCBUILDINGSTOREY('${guid(26)}',$,'Terreo',$,$,#27,$,$,.ELEMENT.,0.);`,
    "#27=IFCLOCALPLACEMENT(#24,#10);",
    `#28=IFCRELAGGREGATES('${guid(28)}',$,$,$,#23,(#26));`,
    `#30=IFCWALL('${guid(30)}',$,'Parede ''A''; com #99 e (parenteses)',$,$,#31,#35,$,$);`,
    "#31=IFCLOCALPLACEMENT(#27,#32);",
    "#32=IFCAXIS2PLACEMENT3D(#33,$,$);",
    `#33=IFCCARTESIANPOINT((${dx},0.,0.));`,
    "#34=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,4000.,200.);",
    "#36=IFCEXTRUDEDAREASOLID(#34,$,#9,3000.);",
    "#37=IFCSHAPEREPRESENTATION(#12,'Body','SweptSolid',(#36));",
    "#35=IFCPRODUCTDEFINITIONSHAPE($,$,(#37));",
    `#40=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(40)}',$,$,$,(#30),#26);`,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}
