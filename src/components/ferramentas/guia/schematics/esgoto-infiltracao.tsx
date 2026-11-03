/**
 * Esquema do sumidouro (corte): esgoto chega pela tubulação, infiltra pela parede lateral e o fundo precisa
 * ficar a pelo menos a distância mínima do lençol freático (nível d'água da sondagem). À direita, o furo do
 * teste de percolação (tempo e rebaixamento). Os badges ligam o desenho aos grupos de campos.
 */

import { Schematic, Dim, Anchor, Connector, Tag } from "../schematic-kit";

export function EsgotoInfiltracaoSchematic() {
  const solo1 = 60;
  const solo2 = 660;
  const terreno = 60;
  const cx = 250;
  const largura = 70;
  const x1 = cx - largura / 2;
  const x2 = cx + largura / 2;
  const topo = 100;
  const fundo = 205;
  const lencol = 258;
  return (
    <Schematic viewBox="0 0 720 300">
      {/* solo */}
      <rect x={solo1} y={terreno} width={solo2 - solo1} height={220} className="fill-muted/35 stroke-foreground/30" strokeWidth={1} />
      <line x1={solo1 - 6} y1={terreno} x2={solo2 + 6} y2={terreno} className="stroke-foreground/70" strokeWidth={1.3} />

      {/* lençol freático */}
      <line x1={solo1} y1={lencol} x2={solo2} y2={lencol} className="stroke-primary" strokeWidth={1.6} strokeDasharray="7 4" />
      <Tag x={solo2 - 6} y={lencol + 12} anchor="end" muted size={11} italic>
        nível d&apos;água (sondagem)
      </Tag>

      {/* tubulação de entrada */}
      <line x1={90} y1={topo - 8} x2={x1 - 2} y2={topo - 8} className="stroke-primary" strokeWidth={1.8} markerEnd="url(#gf-arrow)" />
      <Tag x={92} y={topo - 24} anchor="start" muted size={11} italic>
        V (L/dia)
      </Tag>

      {/* sumidouro */}
      <rect x={x1} y={topo - 20} width={largura} height={fundo - topo + 20} className="fill-card stroke-foreground/70" strokeWidth={1.4} />
      <Dim x1={x1} y1={fundo + 20} x2={x2} y2={fundo + 20} label="D" />

      {/* cotas: topo, H e distância ao lençol */}
      <Dim x1={x1 - 22} y1={terreno} x2={x1 - 22} y2={topo} label="topo" />
      <Dim x1={x2 + 22} y1={topo} x2={x2 + 22} y2={fundo} label="H" />
      <Dim x1={x2 + 22} y1={fundo} x2={x2 + 22} y2={lencol} label="≥ 1,5 m" />

      {/* infiltração pela parede lateral */}
      <g className="stroke-primary" strokeWidth={1.2}>
        {[130, 160, 190].map((y) => (
          <g key={y}>
            <line x1={x2} y1={y} x2={x2 + 14} y2={y} markerEnd="url(#gf-arrow)" />
            <line x1={x1} y1={y} x2={x1 - 14} y2={y} markerEnd="url(#gf-arrow)" />
          </g>
        ))}
      </g>

      {/* furo do teste de percolação */}
      <rect x={520} y={terreno} width={26} height={92} className="fill-card stroke-foreground/70" strokeWidth={1.3} />
      <rect x={521} y={terreno + 12} width={24} height={80} className="fill-primary/15" />
      <Dim x1={566} y1={terreno + 12} x2={566} y2={terreno + 44} label="rebaixamento" />
      <Tag x={533} y={terreno + 108} muted size={11} italic>
        furo: tempo (min)
      </Tag>

      {/* badges → grupos */}
      {/* 1. Contribuição */}
      <Connector x1={120} y1={150} x2={120} y2={topo - 14} />
      <Anchor x={120} y={162} n={1} />
      {/* 2. Coeficiente de infiltração (teste de percolação) */}
      <Connector x1={470} y1={104} x2={518} y2={104} />
      <Anchor x={458} y={104} n={2} />
      {/* 3. Sumidouro e sondagem */}
      <Connector x1={x1 - 36} y1={228} x2={x1 + 4} y2={204} />
      <Anchor x={x1 - 48} y={232} n={3} />
    </Schematic>
  );
}
