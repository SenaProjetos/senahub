/**
 * Coordenação BIM — adapter do viewer 3D (CLIENT-ONLY, nunca importar no servidor).
 *
 * TODO o contato com three.js / @thatopen/fragments fica confinado AQUI (e no
 * scripts/converter-ifc.ts, lado Node). Componentes React falam só com esta
 * classe — contenção de churn de API do ThatOpen (histórico 1.x→2.x→3.x).
 *
 * Worker: public/fragments-worker.mjs é CÓPIA de
 * node_modules/@thatopen/fragments/dist/Worker/worker.mjs — a versão do worker
 * DEVE casar com a da lib; recopiar ao atualizar o pacote (mesmo padrão do
 * pdf.worker.min.mjs).
 *
 * Convenção de eixos: o fragments converte IFC (Z-up) para o espaço do three
 * (Y-up) ao importar — "altura"/pavimentos = eixo Y aqui dentro.
 */
import * as THREE from "three";
import CameraControls from "camera-controls";
import {
  FragmentsModels,
  RenderedFaces,
  SnappingClass,
  type FragmentsModel,
  type ItemData,
  type MeshData,
} from "@thatopen/fragments";
import {
  extrairAtributos,
  type AtributoItem,
  type PsetItem,
} from "@/modules/coordenacao/viewer/item-data";
import {
  threeParaIfc,
  ifcParaThree,
  planoCorteIfcParaThree,
  type EixoIfc,
  type Vec3,
} from "@/modules/coordenacao/viewer/coords";
import {
  alinharPorDoisPares,
  arrastePlanoParaIfc,
  pivoDoMundo,
  type PivoPlanta,
} from "@/modules/coordenacao/realinhamento";
import { cameraDaVistaParaCaixa, vistaDoEixo, type VistaPadrao } from "@/modules/coordenacao/viewer/vistas";
import {
  normalizarNo,
  listarElementos,
  type ElementoIndex,
  type NoArvoreBruto,
} from "@/modules/coordenacao/indice-elementos";
import {
  distancia,
  angulo,
  areaPoligono,
  deltaComponentes,
  formatarMetros,
  formatarAngulo,
  formatarArea,
  type Ponto3D,
} from "@/modules/coordenacao/medicao";
import { detectarConflitos, entraNoClash, type Caixa, type Conflito } from "@/modules/coordenacao/clash";
import {
  criarCederPorTempo,
  refinarComponentesTriangulos,
  triangulosDaMalha,
  type ComponenteTriangulosClash,
  type TrianguloClash,
} from "@/modules/coordenacao/clash-malha";
import { diffVersoes, type CentroPorGuid, type ResultadoDiff } from "@/modules/coordenacao/diff";

CameraControls.install({ THREE });

const COR_SELECAO = 0x2563eb; // primário (azul) — highlight de seleção
const COR_CONFLITO = 0xdc2626; // destrutivo (vermelho) — realce dos 2 elementos em conflito
const COR_DIFF_ADICIONADO = 0x22c55e; // verde — elemento novo na versão atual
const COR_DIFF_MOVIDO = 0xeab308; // âmbar — mesmo guid, centro deslocou > tolerância
const LOTE_GEOMETRIAS_CLASH = 25;
const LIMITE_TRIANGULOS_CLASH_POR_ITEM = 20_000;
/** Lado (px CSS) do indicador de eixos no canto inferior direito. */
const TAMANHO_GIZMO = 96;
const LOTE_PSETS = 100;
const LIMITE_PROPRIEDADES_POR_ELEMENTO = 256;
const LIMITE_PROPRIEDADES_POR_MODELO = 100_000;
const LIMITE_CARACTERES_PROPRIEDADES_MODELO = 20_000_000;
const LIMITE_CARACTERES_CAMPO_PSET = 512;

export type { AtributoItem, PsetItem };

export type SelecaoInfo = {
  modeloId: string;
  localId: number;
  guid: string | null;
  atributos: AtributoItem[];
  psets: PsetItem[];
};

export type EixoCorte = EixoIfc;

export type CorteConfig = {
  eixo: EixoCorte;
  /** Posição normalizada 0..1 ao longo do bbox global no eixo. */
  posicao: number;
  /** Inverte o lado mantido do corte. */
  invertido: boolean;
} | null;

export type EngineOpts = {
  /** Chamado após clique: item selecionado (ou null ao clicar no vazio). */
  onSelecionar?: (info: SelecaoInfo | null) => void;
};

/** Câmera do Apontamento — persistida em espaço IFC (Z-up, metros). */
export type CameraApontamento = { position: Vec3; target: Vec3 };

/**
 * Etapa do "mover por pontos" / "alinhar por 2 pares" do realinhamento: qual clique
 * falta (null = desligado).
 */
export type EtapaPontos = "origem" | "destino" | "origem2" | "destino2" | null;

/** Modo de pontos do realinhamento: 1 par só desloca; 2 pares deslocam e giram. */
export type ModoPontos = "um-par" | "dois-pares";

/** Resultado do alinhamento por 2 pares, para a tela atualizar o giro e avisar escala. */
export type ResultadoAlinhamento = { graus: number; razaoDistancias: number } | { erro: string };

const ETAPAS: readonly Exclude<EtapaPontos, null>[] = ["origem", "destino", "origem2", "destino2"];

/** Um conflito (clash) entre um elemento do modelo A e um do modelo B. */
export type ConflitoView = {
  modeloIdA: string;
  localIdA: number;
  modeloIdB: string;
  localIdB: number;
  /** Menor penetração entre os 3 eixos (metros). */
  profundidade: number;
  /** Centro do volume de interseção, espaço three (mundo) — âncora de câmera/pin. */
  centro: { x: number; y: number; z: number };
  /** `malha` quando o par foi confirmado por triângulos; `aabb` inclui fallback sem geometria. */
  metodo: "aabb" | "malha";
  /** Classe IFC de cada lado (ex.: "IFCBEAM"), do índice do modelo; null se desconhecida. */
  categoriaA: string | null;
  categoriaB: string | null;
  /** Atributo Name do IFC de cada lado, quando o modelo informa. */
  nomeA: string | null;
  nomeB: string | null;
};

export type OpcoesClash = {
  /** Penetração mínima em metros (broadphase AABB). */
  tolerancia?: number;
  /** Refina os pares AABB por interseção de triângulos quando a geometria está disponível. */
  refinarPorMalha?: boolean;
  /** Progresso do refino por malha (pares conferidos / total) — o refino pode levar minutos. */
  onProgresso?: (feitos: number, total: number) => void;
};

// ── Medição ──────────────────────────────────────────────────
export type TipoMedicao = "distancia" | "angulo" | "area";

/** Estado exposto ao componente de UI a cada ponto capturado. */
export type ResultadoMedicaoView = {
  tipo: TipoMedicao;
  /** Quantidade de pontos capturados na medição atual. */
  pontos: number;
  /** True quando já dá para calcular (2 p/ distância, 3 p/ ângulo, área após finalizarArea()). */
  completo: boolean;
  /** Valor formatado pt-BR (metros/graus/m²), ou null se ainda não dá pra calcular. */
  rotulo: string | null;
  /** Componentes ΔX/ΔY/ΔZ (espaço IFC, Z-up) — só para "distancia" completa; senão null. */
  componentes: { dx: string; dy: string; dz: string } | null;
};

type EstadoMedicao = {
  tipo: TipoMedicao;
  pontos: Ponto3D[]; // espaço three (mundo)
  grupo: THREE.Group; // marcadores + linhas na cena
  onAtualizar: (r: ResultadoMedicaoView) => void;
  finalizado: boolean; // só relevante p/ "area" (fecha o polígono)
};

export class ViewerEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: CameraControls;
  private clock = new THREE.Clock();
  private fragments: FragmentsModels;
  private modelos = new Map<string, FragmentsModel>();
  /** Índice de elementos por modelo (Onda 0) — computado sob demanda, invalidado ao descarregar. */
  private indiceCache = new Map<string, ElementoIndex[]>();
  /** Mesmo índice enriquecido com Psets, carregado só quando o painel de filtros pede. */
  private indicePsetsCache = new Map<string, ElementoIndex[]>();
  /**
   * Visibilidade é assíncrona no worker. Serializa e coalesce pedidos para uma
   * resposta antiga de filtro/árvore nunca sobrescrever a escolha mais recente.
   */
  private filaVisibilidade: Promise<void> = Promise.resolve();
  private revisaoVisibilidade = 0;
  private medicao: EstadoMedicao | null = null;
  /** Marcador visual do snap (vértice/aresta) sob o mouse — medição e arraste de realinhamento. */
  private snapMarker: THREE.Mesh | null = null;
  /** Evita raycasts de snap concorrentes (pointermove dispara mais rápido que a resposta assíncrona). */
  private snapHoverOcupado = false;
  private selecao = new Map<string, Set<number>>(); // modeloId → localIds
  private planosCorte: THREE.Plane[] = [];
  private raf = 0;
  private resizeObs: ResizeObserver;
  private destruido = false;
  private opts: EngineOpts;
  private frameCallbacks = new Set<() => void>();
  /** UploadIds que o próprio rodarDiff trouxe à cena (não estavam carregados) — descarregados de verdade ao sair do diff. */
  private diffCarregados = new Set<string>();
  // Gizmo de eixos (canto inferior-direito) — cena/câmera próprias, rotulado em
  // convenção IFC (Z para cima), como no AutoCAD. Ver criarGizmoEixos/renderGizmo.
  private gizmoScene: THREE.Scene | null = null;
  private gizmoCamera: THREE.OrthographicCamera | null = null;
  private gizmoRoot: THREE.Group | null = null;

  constructor(container: HTMLElement, opts: EngineOpts = {}) {
    this.container = container;
    this.opts = opts;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(10, 30, 20);
    this.scene.add(dir);

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      5000,
    );
    this.camera.position.set(25, 20, 25);
    this.controls = new CameraControls(this.camera, this.renderer.domElement);
    this.controls.dollyToCursor = true;

    this.fragments = new FragmentsModels("/fragments-worker.mjs");

    this.resizeObs = new ResizeObserver(() => this.redimensionar());
    this.resizeObs.observe(container);

    this.criarGizmoEixos();

    const loop = () => {
      if (this.destruido) return;
      this.raf = requestAnimationFrame(loop);
      const delta = this.clock.getDelta();
      this.controls.update(delta);
      void this.fragments.update(); // a lib limita a taxa internamente (maxUpdateRate)
      this.renderer.render(this.scene, this.camera);
      this.renderGizmo();
      for (const cb of this.frameCallbacks) cb();
    };
    loop();
  }

  // ── Modelos ────────────────────────────────────────────────

  get modelosCarregados(): string[] {
    return [...this.modelos.keys()];
  }

  /** Baixa o .frag (rota autenticada) e adiciona o modelo à cena. */
  async carregarModelo(modeloId: string, url: string): Promise<void> {
    if (this.modelos.has(modeloId) || this.destruido) return;
    const resp = await fetch(url);
    if (!resp.ok) {
      const corpo = (await resp.json().catch(() => null)) as { error?: string } | null;
      throw new Error(corpo?.error ?? `Falha ao baixar o modelo (${resp.status}).`);
    }
    const buffer = await resp.arrayBuffer();
    if (this.destruido) return;

    const model = await this.fragments.load(buffer, { modelId: modeloId, camera: this.camera });
    if (this.destruido) {
      await this.fragments.disposeModel(modeloId);
      return;
    }
    model.useCamera(this.camera);
    model.getClippingPlanesEvent = () => this.planosCorte;
    this.scene.add(model.object);
    this.modelos.set(modeloId, model);
    await this.fragments.update(true);
    if (this.modelos.size === 1) await this.enquadrar();
  }

  async descarregarModelo(modeloId: string): Promise<void> {
    const model = this.modelos.get(modeloId);
    if (!model) return;
    this.modelos.delete(modeloId);
    this.selecao.delete(modeloId);
    this.indiceCache.delete(modeloId);
    this.indicePsetsCache.delete(modeloId);
    this.scene.remove(model.object);
    await this.fragments.disposeModel(modeloId);
  }

  // ── Seleção ────────────────────────────────────────────────

  /**
   * Raycast no clique (coordenadas de client). Seleciona o item mais próximo
   * entre todos os modelos; `acumular` (shift) adiciona à seleção atual.
   */
  async selecionarEm(clientX: number, clientY: number, acumular = false): Promise<SelecaoInfo | null> {
    const mouse = new THREE.Vector2(clientX, clientY);
    const dom = this.renderer.domElement;

    let melhor: { modeloId: string; localId: number; distancia: number } | null = null;
    for (const [modeloId, model] of this.modelos) {
      const hit = await model.raycast({ camera: this.camera, mouse, dom });
      if (hit && (melhor === null || hit.distance < melhor.distancia)) {
        melhor = { modeloId, localId: hit.localId, distancia: hit.distance };
      }
    }

    if (!acumular) await this.limparSelecao(false);
    if (!melhor) {
      this.opts.onSelecionar?.(null);
      return null;
    }

    const ids = this.selecao.get(melhor.modeloId) ?? new Set<number>();
    ids.add(melhor.localId);
    this.selecao.set(melhor.modeloId, ids);

    const model = this.modelos.get(melhor.modeloId)!;
    await model.highlight([melhor.localId], {
      color: new THREE.Color(COR_SELECAO),
      renderedFaces: RenderedFaces.TWO,
      opacity: 1,
      transparent: false,
    });
    await this.fragments.update(true);

    const info = await this.montarInfo(melhor.modeloId, melhor.localId);
    this.opts.onSelecionar?.(info);
    return info;
  }

  async limparSelecao(notificar = true): Promise<void> {
    for (const [modeloId, ids] of this.selecao) {
      const model = this.modelos.get(modeloId);
      if (model && ids.size > 0) await model.resetHighlight([...ids]);
    }
    this.selecao.clear();
    await this.fragments.update(true);
    if (notificar) this.opts.onSelecionar?.(null);
  }

  get temSelecao(): boolean {
    for (const ids of this.selecao.values()) if (ids.size > 0) return true;
    return false;
  }

  /** GUIDs IFC de localIds explícitos de UM modelo — usado pelo clash (#1) pra virar apontamento. */
  async guidsPorLocalIds(modeloId: string, localIds: number[]): Promise<string[]> {
    const model = this.modelos.get(modeloId);
    if (!model || localIds.length === 0) return [];
    const res = await model.getGuidsByLocalIds(localIds);
    return res.filter((g): g is string => g != null);
  }

  /**
   * Resolve, entre os modelos CARREGADOS, qual contém mais dos guids informados —
   * usado pelo import BCF (#3) pra ancorar cada tópico automaticamente. Null se
   * nenhum modelo carregado tiver ao menos 1 guid em comum (o chamador cai pro
   * fallback escolhido pelo usuário).
   */
  async resolverModeloPorGuids(guids: string[]): Promise<{ modeloId: string; encontrados: number } | null> {
    if (guids.length === 0) return null;
    let melhor: { modeloId: string; encontrados: number } | null = null;
    for (const [modeloId, model] of this.modelos) {
      const ids = await model.getLocalIdsByGuids(guids);
      const encontrados = ids.filter((id) => id != null).length;
      if (encontrados > 0 && (!melhor || encontrados > melhor.encontrados)) {
        melhor = { modeloId, encontrados };
      }
    }
    return melhor;
  }

  /** GUIDs IFC da seleção atual (âncora dos apontamentos, F3). */
  async guidsDaSelecao(): Promise<string[]> {
    const guids: string[] = [];
    for (const [modeloId, ids] of this.selecao) {
      const model = this.modelos.get(modeloId);
      if (!model || ids.size === 0) continue;
      const res = await model.getGuidsByLocalIds([...ids]);
      for (const g of res) if (g) guids.push(g);
    }
    return guids;
  }

  /** modeloId (== uploadId) do primeiro elemento selecionado — usado para gravar o Apontamento. */
  modeloPrimarioDaSelecao(): string | null {
    for (const [modeloId, ids] of this.selecao) if (ids.size > 0) return modeloId;
    return null;
  }

  /**
   * Seleciona por GUID IFC (deep-link `?apontamento=N`, F3). Procura os GUIDs em
   * TODOS os modelos carregados no momento — por isso o chamador deve garantir
   * que o modelo âncora do apontamento já foi carregado antes de chamar isto.
   */
  async selecionarPorGuids(guids: string[], notificar = true): Promise<SelecaoInfo | null> {
    await this.limparSelecao(false);
    if (guids.length === 0) {
      if (notificar) this.opts.onSelecionar?.(null);
      return null;
    }
    let primeiraInfo: SelecaoInfo | null = null;
    for (const [modeloId, model] of this.modelos) {
      const localIds = (await model.getLocalIdsByGuids(guids)).filter((id): id is number => id != null);
      if (localIds.length === 0) continue;
      const ids = this.selecao.get(modeloId) ?? new Set<number>();
      for (const id of localIds) ids.add(id);
      this.selecao.set(modeloId, ids);
      await model.highlight(localIds, {
        color: new THREE.Color(COR_SELECAO),
        renderedFaces: RenderedFaces.TWO,
        opacity: 1,
        transparent: false,
      });
      if (!primeiraInfo) primeiraInfo = await this.montarInfo(modeloId, localIds[0]);
    }
    await this.fragments.update(true);
    if (notificar) this.opts.onSelecionar?.(primeiraInfo);
    return primeiraInfo;
  }

  // ── Visibilidade ───────────────────────────────────────────

  private enfileirarVisibilidade(operacao: () => Promise<void>): Promise<void> {
    const revisao = ++this.revisaoVisibilidade;
    const atual = this.filaVisibilidade
      .catch(() => {
        // Uma falha anterior é entregue ao seu chamador, mas não envenena a fila.
      })
      .then(async () => {
        if (this.destruido || revisao !== this.revisaoVisibilidade) return;
        await operacao();
      });
    this.filaVisibilidade = atual;
    return atual;
  }

  /** Mostra só a seleção (nos modelos sem seleção, esconde tudo). */
  async isolarSelecao(): Promise<void> {
    if (!this.temSelecao) return;
    const selecao = new Map([...this.selecao].map(([id, ids]) => [id, [...ids]]));
    await this.enfileirarVisibilidade(async () => {
      for (const [modeloId, model] of this.modelos) {
        const ids = selecao.get(modeloId);
        await model.setVisible(undefined, false);
        if (ids && ids.length > 0) await model.setVisible(ids, true);
      }
      await this.fragments.update(true);
    });
  }

  async ocultarSelecao(): Promise<void> {
    for (const [modeloId, ids] of this.selecao) {
      const model = this.modelos.get(modeloId);
      if (model && ids.size > 0) await model.setVisible([...ids], false);
    }
    await this.limparSelecao();
  }

  async mostrarTudo(): Promise<void> {
    await this.enfileirarVisibilidade(async () => {
      for (const model of this.modelos.values()) {
        await model.setVisible(undefined, true);
      }
      await this.fragments.update(true);
    });
  }

  /**
   * Destaca UMA disciplina (uploadId): deixa as demais translúcidas ("ghost"),
   * mantendo a cor original. `null` remove o destaque. A seleção (azul) é
   * reaplicada por cima para não sumir no fantasma.
   */
  async destacarModelo(focoId: string | null): Promise<void> {
    for (const [id, model] of this.modelos) {
      await model.resetHighlight();
      if (focoId && id !== focoId) {
        await model.highlight(undefined, {
          color: new THREE.Color(0xffffff),
          renderedFaces: RenderedFaces.TWO,
          opacity: 0.12,
          transparent: true,
          preserveOriginalMaterial: true,
          // Sem isto, preserveOriginalMaterial ignora TODOS os campos abaixo (a lib só
          // aplica os listados aqui) e o ghost nunca aparece — mantém o material original.
          _explicitProps: ["color", "opacity", "transparent", "renderedFaces"],
        });
      }
    }
    // Reaplica a seleção por cima do ghost.
    for (const [id, ids] of this.selecao) {
      const model = this.modelos.get(id);
      if (model && ids.size > 0) {
        await model.highlight([...ids], {
          color: new THREE.Color(COR_SELECAO),
          renderedFaces: RenderedFaces.TWO,
          opacity: 1,
          transparent: false,
        });
      }
    }
    await this.fragments.update(true);
  }

  // ── Corte ──────────────────────────────────────────────────

  /** Bbox união de todos os modelos carregados. */
  private bboxGlobal(): THREE.Box3 | null {
    let box: THREE.Box3 | null = null;
    for (const model of this.modelos.values()) {
      const b = model.box;
      if (b.isEmpty()) continue;
      box = box ? box.union(b) : b.clone();
    }
    return box;
  }

  /**
   * Define (ou remove, com null) UM plano de corte por eixo do bbox global.
   * O clipping GPU usa renderer.clippingPlanes; o worker corta tiles via
   * getClippingPlanesEvent (mesma lista).
   */
  definirCorte(config: CorteConfig): void {
    this.planosCorte.length = 0;
    if (config) {
      const box = this.bboxGlobal();
      if (box) {
        const plano = planoCorteIfcParaThree(
          config.eixo,
          config.posicao,
          [box.min.x, box.min.y, box.min.z],
          [box.max.x, box.max.y, box.max.z],
        );
        const normal = new THREE.Vector3(...plano.normal);
        if (config.invertido) normal.negate();
        // O lado onde normal·p + constant ≥ 0 é mantido; o resto é cortado.
        const ponto = new THREE.Vector3(...plano.ponto);
        this.planosCorte.push(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, ponto));
      }
    }
    this.renderer.clippingPlanes = this.planosCorte;
  }

  /**
   * Linhas onde o plano de corte ativo cruza cada modelo carregado (para exportar em
   * DXF), em espaço three/mundo, e as coordenadas-base do viewer para voltar ao
   * referencial do arquivo. Null quando não há corte. O fragments calcula a seção no
   * espaço do modelo; o plano vai e os pontos voltam pela matriz do objeto (que inclui
   * o deslocamento do realinhamento/coordenação).
   */
  async segmentosDoCorte(): Promise<{
    base: number[] | null;
    modelos: { modeloId: string; segmentos: [Vec3, Vec3][] }[];
  } | null> {
    const plano = this.planosCorte[0];
    if (!plano) return null;
    const modelos: { modeloId: string; segmentos: [Vec3, Vec3][] }[] = [];
    for (const [modeloId, model] of this.modelos) {
      model.object.updateWorldMatrix(true, false);
      const matriz = model.object.matrixWorld;
      const planoLocal = plano.clone().applyMatrix4(matriz.clone().invert());
      const secao = await model.getSection(planoLocal).catch(() => null);
      if (!secao) continue;
      const segmentos: [Vec3, Vec3][] = [];
      const p = new THREE.Vector3();
      const q = new THREE.Vector3();
      for (let i = 0; i + 1 < secao.index; i += 2) {
        p.fromArray(secao.buffer, i * 3).applyMatrix4(matriz);
        q.fromArray(secao.buffer, (i + 1) * 3).applyMatrix4(matriz);
        segmentos.push([
          [p.x, p.y, p.z],
          [q.x, q.y, q.z],
        ]);
      }
      if (segmentos.length > 0) modelos.push({ modeloId, segmentos });
    }
    return { base: this.fragments.baseCoordinates, modelos };
  }

  /** Caixa de cada modelo carregado no mundo do viewer (metros) — aviso de origem. */
  caixasDosModelos(): { modeloId: string; min: Vec3; max: Vec3 }[] {
    const caixas: { modeloId: string; min: Vec3; max: Vec3 }[] = [];
    for (const [modeloId, model] of this.modelos) {
      const b = model.box;
      if (b.isEmpty()) continue;
      caixas.push({ modeloId, min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] });
    }
    return caixas;
  }

  // ── Câmera ─────────────────────────────────────────────────

  async enquadrar(): Promise<void> {
    const box = this.bboxGlobal();
    if (!box) return;
    const esfera = box.getBoundingSphere(new THREE.Sphere());
    await this.controls.fitToSphere(esfera, true);
  }

  /**
   * Vai para uma vista padrão (superior, frontal, laterais…) enquadrando os modelos
   * carregados, com transição animada.
   */
  async irParaVista(vista: VistaPadrao): Promise<void> {
    const box = this.bboxGlobal();
    if (!box) return;
    const { posicao, alvo } = cameraDaVistaParaCaixa(
      vista,
      [box.min.x, box.min.y, box.min.z],
      [box.max.x, box.max.y, box.max.z],
      this.camera.fov,
      this.camera.aspect,
    );
    await this.controls.setLookAt(...posicao, ...alvo, true);
  }

  /**
   * Clique no indicador de eixos (canto inferior direito): devolve a vista da letra
   * clicada, ou null se o clique não caiu numa letra. Quem chama decide ir para ela.
   */
  vistaNoIndicador(clientX: number, clientY: number): VistaPadrao | null {
    if (!this.gizmoRoot || !this.gizmoCamera) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const dim = TAMANHO_GIZMO;
    const x = clientX - (rect.right - dim);
    const y = clientY - (rect.bottom - dim);
    if (x < 0 || y < 0 || x > dim || y > dim) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / dim) * 2 - 1, -(y / dim) * 2 + 1), this.gizmoCamera);
    const sprites = this.gizmoRoot.children.filter((o): o is THREE.Sprite => o instanceof THREE.Sprite);
    const acerto = ray.intersectObjects(sprites, false)[0];
    const letra = acerto?.object.userData.letra as string | undefined;
    return letra ? vistaDoEixo(letra) : null;
  }

  /** Captura a câmera atual em espaço IFC (Z-up) — o que o Apontamento persiste. */
  capturarCamera(): CameraApontamento {
    const pos = this.camera.position;
    const alvo = this.controls.getTarget(new THREE.Vector3());
    return {
      position: threeParaIfc([pos.x, pos.y, pos.z]),
      target: threeParaIfc([alvo.x, alvo.y, alvo.z]),
    };
  }

  /** Restaura uma câmera gravada (espaço IFC) — usado no deep-link `?apontamento=N`. */
  async restaurarCamera(camera: CameraApontamento): Promise<void> {
    const [px, py, pz] = ifcParaThree(camera.position);
    const [tx, ty, tz] = ifcParaThree(camera.target);
    await this.controls.setLookAt(px, py, pz, tx, ty, tz, true);
  }

  /**
   * Renderiza um frame e captura o canvas como PNG (snapshot do apontamento).
   * Funciona sem `preserveDrawingBuffer` porque o readback acontece na mesma
   * task síncrona do render, antes do navegador limpar o back buffer.
   */
  capturarSnapshot(): Promise<Blob | null> {
    this.renderer.render(this.scene, this.camera);
    return new Promise((resolve) => this.renderer.domElement.toBlob((b) => resolve(b), "image/png"));
  }

  // ── Índice de elementos (Onda 0) ─────────────────────────────
  //
  // Deriva do .frag já carregado (client fragments API) — sem persistência, sem
  // web-ifc (decisão do spike, ver docs/superpowers/plans/2026-07-21-…). Base para
  // filtros (#5), broadphase de clash (#1) e diff (#4). Cache por modelo — só
  // recalcula se o modelo for recarregado (descarregarModelo invalida).

  /**
   * Índice de itens que de fato têm geometria no .frag, com pavimento resolvido
   * quando a árvore espacial do IFC o informa.
   *
   * Alguns exportadores MEP deixam a árvore espacial vazia/incompleta, embora
   * as malhas e seus localIds estejam corretos. Por isso a geometria é a fonte
   * de verdade para a lista; a árvore só complementa o pavimento dos itens.
   */
  async indiceDoModelo(modeloId: string): Promise<ElementoIndex[]> {
    const cache = this.indiceCache.get(modeloId);
    if (cache) return cache;
    const model = this.modelos.get(modeloId);
    if (!model) return [];

    const [elementosEspaciais, idsComGeometria, categoriasComGeometria] = await Promise.all([
      model
        .getSpatialStructure()
        .then((bruto) => listarElementos(normalizarNo(bruto as unknown as NoArvoreBruto)))
        // A árvore é complementar: uma falha nela não pode esconder as malhas
        // já carregadas no viewer.
        .catch(() => [] as ElementoIndex[]),
      model.getItemsIdsWithGeometry(),
      // Categoria é apenas o rótulo de fallback para itens fora da árvore.
      model.getItemsWithGeometryCategories().catch(() => [] as (string | null)[]),
    ]);
    const espacialPorLocalId = new Map(elementosEspaciais.map((elemento) => [elemento.localId, elemento]));
    const vistos = new Set<number>();
    let elementos: ElementoIndex[] = [];

    for (let indice = 0; indice < idsComGeometria.length; indice += 1) {
      const localId = idsComGeometria[indice];
      if (vistos.has(localId)) continue;
      vistos.add(localId);

      // A hierarquia espacial, quando disponível, continua sendo a fonte do
      // pavimento e prevalece para a categoria já associada ao item.
      const espacial = espacialPorLocalId.get(localId);
      elementos.push(
        espacial ?? {
          localId,
          category: categoriasComGeometria[indice] ?? "IFCPRODUCT",
          pavimentoLocalId: null,
          pavimentoNome: null,
        },
      );
    }

    // A árvore só traz a CATEGORIA do pavimento (ex.: "IFCBUILDINGSTOREY"); resolve o
    // Name real (ex.: "Pavimento 2") e a cota (Elevation, ordena a lista) via
    // getItemsData, igual ao painel de propriedades.
    const pavIds = [...new Set(elementos.map((e) => e.pavimentoLocalId).filter((id): id is number => id != null))];
    if (pavIds.length > 0) {
      const dados = await model.getItemsData(pavIds, { attributesDefault: true }).catch(() => []);
      const nomes = new Map<number, string>();
      const elevacoes = new Map<number, number>();
      pavIds.forEach((id, i) => {
        const { atributos } = extrairAtributos(dados[i]);
        const nome = atributos.find((a) => a.nome === "Name")?.valor;
        if (nome) nomes.set(id, nome);
        const elevacao = Number(atributos.find((a) => a.nome === "Elevation")?.valor);
        if (Number.isFinite(elevacao)) elevacoes.set(id, elevacao);
      });
      if (nomes.size > 0 || elevacoes.size > 0) {
        elementos = elementos.map((e) =>
          e.pavimentoLocalId == null
            ? e
            : {
                ...e,
                pavimentoNome: nomes.get(e.pavimentoLocalId) ?? e.pavimentoNome,
                pavimentoElevacao: elevacoes.get(e.pavimentoLocalId) ?? null,
              },
        );
      }
    }

    this.indiceCache.set(modeloId, elementos);
    return elementos;
  }

  /**
   * Índice enriquecido com Property Sets IFC. A leitura é sob demanda e em lotes
   * para não criar uma mensagem gigante para o worker em modelos grandes.
   */
  async indiceComPsetsDoModelo(modeloId: string): Promise<ElementoIndex[]> {
    const cache = this.indicePsetsCache.get(modeloId);
    if (cache) return cache;
    const model = this.modelos.get(modeloId);
    if (!model) return [];

    const base = await this.indiceDoModelo(modeloId);
    // Anotação explícita evita `propriedades: never[]` em compilações incrementais
    // que ainda não contextualizaram o array vazio pelo tipo de ElementoIndex.
    const enriquecidos: ElementoIndex[] = base.map((elemento) => ({
      ...elemento,
      propriedades: [],
    }));
    const porLocalId = new Map(enriquecidos.map((elemento) => [elemento.localId, elemento]));
    const processados = new Set<number>();
    let totalPropriedades = 0;
    let totalCaracteres = 0;
    let limiteGlobalAtingido = false;

    const limitarCampo = (valor: string) => {
      if (valor.length <= LIMITE_CARACTERES_CAMPO_PSET) return { valor, parcial: false };
      return {
        valor: `${valor.slice(0, LIMITE_CARACTERES_CAMPO_PSET - 1)}…`,
        parcial: true,
      };
    };

    for (let inicio = 0; inicio < base.length && !limiteGlobalAtingido; inicio += LOTE_PSETS) {
      const ids = base.slice(inicio, inicio + LOTE_PSETS).map((elemento) => elemento.localId);
      const dados = await model
        .getItemsData(ids, {
          attributesDefault: false,
          relations: { IsDefinedBy: { attributes: true, relations: true } },
        })
        .catch(() => [] as ItemData[]);
      for (let indice = 0; indice < ids.length; indice++) {
        const localId = ids[indice];
        const alvo = porLocalId.get(localId);
        if (!alvo) continue;
        processados.add(localId);
        if (!dados[indice]) {
          alvo.propriedadesParciais = true;
          continue;
        }
        const { psets } = extrairAtributos(dados[indice]);
        let propriedadesDoElemento = 0;
        for (const pset of psets) {
          for (const propriedade of pset.props) {
            if (
              propriedadesDoElemento >= LIMITE_PROPRIEDADES_POR_ELEMENTO ||
              totalPropriedades >= LIMITE_PROPRIEDADES_POR_MODELO
            ) {
              alvo.propriedadesParciais = true;
              if (totalPropriedades >= LIMITE_PROPRIEDADES_POR_MODELO) limiteGlobalAtingido = true;
              break;
            }
            const psetLimitado = limitarCampo(pset.nome);
            const nomeLimitado = limitarCampo(propriedade.nome);
            const valorLimitado = limitarCampo(propriedade.valor);
            const caracteres =
              psetLimitado.valor.length + nomeLimitado.valor.length + valorLimitado.valor.length;
            if (totalCaracteres + caracteres > LIMITE_CARACTERES_PROPRIEDADES_MODELO) {
              alvo.propriedadesParciais = true;
              limiteGlobalAtingido = true;
              break;
            }
            alvo.propriedades!.push({
              pset: psetLimitado.valor,
              nome: nomeLimitado.valor,
              valor: valorLimitado.valor,
            });
            if (psetLimitado.parcial || nomeLimitado.parcial || valorLimitado.parcial) {
              alvo.propriedadesParciais = true;
            }
            propriedadesDoElemento += 1;
            totalPropriedades += 1;
            totalCaracteres += caracteres;
          }
          if (alvo.propriedadesParciais && (
            propriedadesDoElemento >= LIMITE_PROPRIEDADES_POR_ELEMENTO ||
            limiteGlobalAtingido
          )) break;
        }
        if (limiteGlobalAtingido) break;
      }
    }

    if (limiteGlobalAtingido) {
      for (const elemento of enriquecidos) {
        if (!processados.has(elemento.localId)) elemento.propriedadesParciais = true;
      }
    }
    if (this.modelos.get(modeloId) !== model) return [];
    this.indicePsetsCache.set(modeloId, enriquecidos);
    return enriquecidos;
  }

  /**
   * ItemData CRU de localIds (mesma relação `IsDefinedBy` de `indiceComPsetsDoModelo`, sem
   * achatar em Psets) — usado por custos/quantitativos (`quantidades-ifc.ts#extrairQuantidades`)
   * para ler `IfcElementQuantity`, que `item-data.ts#extrairAtributos` nunca leu (só lê
   * `HasProperties`/Pset). Aditivo de propósito: não reaproveita `indiceComPsetsDoModelo` porque
   * aquele já descarta a forma de Quantities ao achatar; sem cache (chamado sob demanda, um
   * conjunto de localIds por vez, não o modelo inteiro).
   */
  async dadosBrutosPorLocalIds(modeloId: string, localIds: number[]): Promise<unknown[]> {
    const model = this.modelos.get(modeloId);
    if (!model || localIds.length === 0) return [];

    const resultado: unknown[] = [];
    for (let inicio = 0; inicio < localIds.length; inicio += LOTE_PSETS) {
      const lote = localIds.slice(inicio, inicio + LOTE_PSETS);
      const dados = await model
        .getItemsData(lote, {
          attributesDefault: false,
          relations: { IsDefinedBy: { attributes: true, relations: true } },
        })
        .catch(() => lote.map(() => null));
      resultado.push(...dados);
    }
    return resultado;
  }

  /** Bounding boxes (espaço mundo, three) dos localIds informados — usado por clash/diff. */
  async bboxesDoModelo(modeloId: string, localIds: number[]): Promise<THREE.Box3[]> {
    const model = this.modelos.get(modeloId);
    if (!model || localIds.length === 0) return [];
    model.object.updateWorldMatrix(true, true);
    return model.getBoxes(localIds);
  }

  /**
   * Isola um conjunto explícito de elementos (por localId) de UM modelo — esconde
   * tudo nos modelos carregados e mostra só os informados. Independente da seleção
   * de clique (`this.selecao`); usado pela árvore de elementos/filtros. `mostrarTudo()`
   * reverte.
   */
  async isolarElementos(modeloId: string, localIds: number[]): Promise<void> {
    const ids = [...localIds];
    await this.enfileirarVisibilidade(async () => {
      for (const model of this.modelos.values()) await model.setVisible(undefined, false);
      const model = this.modelos.get(modeloId);
      if (model && ids.length > 0) await model.setVisible(ids, true);
      await this.fragments.update(true);
    });
  }

  /**
   * Isola elementos de VÁRIOS modelos de uma vez (filtro por pavimento entre
   * disciplinas): esconde tudo e mostra, em cada modelo, só os localIds informados.
   * Modelo carregado que não está no mapa fica todo escondido.
   */
  async isolarPorModelo(visiveis: ReadonlyMap<string, readonly number[]>): Promise<void> {
    const copia = new Map([...visiveis].map(([id, ids]) => [id, [...ids]]));
    await this.enfileirarVisibilidade(async () => {
      for (const model of this.modelos.values()) await model.setVisible(undefined, false);
      for (const [modeloId, ids] of copia) {
        const model = this.modelos.get(modeloId);
        if (model && ids.length > 0) await model.setVisible(ids, true);
      }
      await this.fragments.update(true);
    });
  }

  // ── Clash (detecção de conflitos) ────────────────────────────
  //
  // v1 = AABB + tolerância, client-side (decisão do F0, ver docs/superpowers/plans/
  // 2026-07-21-…). Junta os itens com geometria+boxes de cada modelo e roda o núcleo
  // puro de clash.ts. A árvore espacial não é usada: exportadores MEP podem omitir
  // produtos dessa hierarquia mesmo quando eles têm geometria renderizável.

  /** Número de triângulos declarados no buffer, antes de alocar vértices transformados. */
  private totalTriangulosDaMalha(malha: MeshData): number {
    if (malha.indices) return Math.floor(malha.indices.length / 3);
    return Math.floor((malha.positions?.length ?? 0) / 9);
  }

  /**
   * Extrai componentes em espaço-mundo, em lotes pequenos. Um item acima do
   * limite defensivo não é refinado (permanece AABB) para não congelar/alocar
   * centenas de MB na main thread.
   */
  private async componentesTriangulosPorItem(
    model: FragmentsModel,
    localIds: number[],
  ): Promise<Map<number, ComponenteTriangulosClash[]>> {
    const resultado = new Map<number, ComponenteTriangulosClash[]>();
    if (localIds.length === 0) return resultado;
    model.object.updateWorldMatrix(true, true);

    for (let inicio = 0; inicio < localIds.length; inicio += LOTE_GEOMETRIAS_CLASH) {
      const idsLote = localIds.slice(inicio, inicio + LOTE_GEOMETRIAS_CLASH);
      const geometrias = await model.getItemsGeometry(idsLote);

      idsLote.forEach((localId, indice) => {
        const malhas = (geometrias[indice] ?? []) as MeshData[];
        const totalDeclarado = malhas.reduce(
          (total, malha) => total + this.totalTriangulosDaMalha(malha),
          0,
        );
        if (totalDeclarado === 0 || totalDeclarado > LIMITE_TRIANGULOS_CLASH_POR_ITEM) return;

        const componentes: ComponenteTriangulosClash[] = [];
        for (const malha of malhas) {
          if (!malha.positions || malha.positions.length < 9) continue;
          const matrizMundo = model.object.matrixWorld.clone().multiply(malha.transform);
          const triangulos: TrianguloClash[] = triangulosDaMalha({
            positions: malha.positions,
            indices: malha.indices,
            matriz: matrizMundo.elements,
          });
          if (triangulos.length > 0) componentes.push(triangulos);
        }
        if (componentes.length > 0) resultado.set(localId, componentes);
      });

      // A conversão dos buffers acima é síncrona; uma task por lote mantém a UI viva.
      if (inicio + LOTE_GEOMETRIAS_CLASH < localIds.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    return resultado;
  }

  /**
   * Detecta conflitos entre todos os elementos de dois modelos carregados.
   * O AABB é sempre o broadphase. Quando solicitado, a malha confirma cada par;
   * se um item não expuser triângulos (LOD/IFC sem geometria), preserva o AABB.
   */
  async detectarConflitos(
    modeloIdA: string,
    modeloIdB: string,
    opcoes: OpcoesClash = {},
  ): Promise<ConflitoView[]> {
    const [modelA, modelB] = [this.modelos.get(modeloIdA), this.modelos.get(modeloIdB)];
    if (!modelA || !modelB) return [];
    // O índice já lista todo item com geometria, com a categoria — base para tirar do
    // clash o que não é físico (ambiente, abertura, terreno…) e rotular a lista.
    const [indiceA, indiceB] = await Promise.all([
      this.indiceDoModelo(modeloIdA),
      this.indiceDoModelo(modeloIdB),
    ]);
    const categoriaA = new Map(indiceA.map((e) => [e.localId, e.category]));
    const categoriaB = new Map(indiceB.map((e) => [e.localId, e.category]));
    const localIdsA = [...new Set(indiceA.map((e) => e.localId))].filter((id) => entraNoClash(categoriaA.get(id)));
    const localIdsB = [...new Set(indiceB.map((e) => e.localId))].filter((id) => entraNoClash(categoriaB.get(id)));
    const [boxesA, boxesB] = await Promise.all([
      this.bboxesDoModelo(modeloIdA, localIdsA),
      this.bboxesDoModelo(modeloIdB, localIdsB),
    ]);

    const caixasA: Caixa[] = localIdsA.map((localId, i) => ({
      localId,
      min: [boxesA[i].min.x, boxesA[i].min.y, boxesA[i].min.z],
      max: [boxesA[i].max.x, boxesA[i].max.y, boxesA[i].max.z],
    }));
    const caixasB: Caixa[] = localIdsB.map((localId, i) => ({
      localId,
      min: [boxesB[i].min.x, boxesB[i].min.y, boxesB[i].min.z],
      max: [boxesB[i].max.x, boxesB[i].max.y, boxesB[i].max.z],
    }));

    const conflitos: Conflito[] = detectarConflitos(caixasA, caixasB, opcoes.tolerancia);
    let metodoPorPar = new Map<string, "aabb" | "malha">();
    let conflitosFinais = conflitos;

    if (opcoes.refinarPorMalha && conflitos.length > 0) {
      const modelA = this.modelos.get(modeloIdA);
      const modelB = this.modelos.get(modeloIdB);
      if (modelA && modelB) {
        try {
          const idsA = [...new Set(conflitos.map((c) => c.localIdA))];
          const idsB = [...new Set(conflitos.map((c) => c.localIdB))];
          const [componentesA, componentesB] = await Promise.all([
            this.componentesTriangulosPorItem(modelA, idsA),
            this.componentesTriangulosPorItem(modelB, idsB),
          ]);
          const refinados: Conflito[] = [];
          // Uma cessão por tempo para a detecção inteira: a tela segue viva sem pagar
          // a espera do relógio a cada par.
          const ceder = criarCederPorTempo();
          for (let indice = 0; indice < conflitos.length; indice++) {
            const conflito = conflitos[indice];
            const chave = `${conflito.localIdA}:${conflito.localIdB}`;
            const a = componentesA.get(conflito.localIdA);
            const b = componentesB.get(conflito.localIdB);
            if (!a || !b) {
              metodoPorPar.set(chave, "aabb");
              refinados.push(conflito);
              continue;
            }
            const refino = await refinarComponentesTriangulos(a, b, { cederControle: ceder });
            if (refino.status === "intersecta") {
              metodoPorPar.set(chave, "malha");
              refinados.push(conflito);
            } else if (refino.status === "inconclusiva") {
              metodoPorPar.set(chave, "aabb");
              refinados.push(conflito);
            }
            if (indice % 50 === 0) opcoes.onProgresso?.(indice, conflitos.length);
            await ceder();
          }
          opcoes.onProgresso?.(conflitos.length, conflitos.length);
          conflitosFinais = refinados;
        } catch {
          // Falha de worker/LOD não pode apagar clashes: mantém todo o broadphase.
          metodoPorPar = new Map();
        }
      }
    }

    const [nomesA, nomesB] = await Promise.all([
      this.nomesDosItens(modeloIdA, [...new Set(conflitosFinais.map((c) => c.localIdA))]),
      this.nomesDosItens(modeloIdB, [...new Set(conflitosFinais.map((c) => c.localIdB))]),
    ]);

    return conflitosFinais.map((c) => ({
      modeloIdA,
      localIdA: c.localIdA,
      modeloIdB,
      localIdB: c.localIdB,
      profundidade: c.profundidade,
      centro: { x: c.centro[0], y: c.centro[1], z: c.centro[2] },
      metodo: metodoPorPar.get(`${c.localIdA}:${c.localIdB}`) ?? "aabb",
      categoriaA: categoriaA.get(c.localIdA) ?? null,
      categoriaB: categoriaB.get(c.localIdB) ?? null,
      nomeA: nomesA.get(c.localIdA) ?? null,
      nomeB: nomesB.get(c.localIdB) ?? null,
    }));
  }

  /** Atributo Name do IFC dos itens informados (em lotes); falha de leitura = sem nome. */
  private async nomesDosItens(modeloId: string, localIds: number[]): Promise<Map<number, string>> {
    const nomes = new Map<number, string>();
    const model = this.modelos.get(modeloId);
    if (!model) return nomes;
    for (let inicio = 0; inicio < localIds.length; inicio += LOTE_PSETS) {
      const lote = localIds.slice(inicio, inicio + LOTE_PSETS);
      const dados = await model.getItemsData(lote, { attributesDefault: true }).catch(() => [] as ItemData[]);
      lote.forEach((id, i) => {
        const nome = extrairAtributos(dados[i]).atributos.find((a) => a.nome === "Name")?.valor;
        if (nome) nomes.set(id, nome);
      });
    }
    return nomes;
  }

  /**
   * Realça os 2 elementos de um conflito (vermelho, opaco) — some qualquer realce
   * anterior de conflito primeiro. Independente de `this.selecao`/destaque de disciplina.
   */
  async realcarConflito(c: ConflitoView): Promise<void> {
    await this.limparRealceConflito();
    const modelA = this.modelos.get(c.modeloIdA);
    const modelB = this.modelos.get(c.modeloIdB);
    const material = {
      color: new THREE.Color(COR_CONFLITO),
      renderedFaces: RenderedFaces.TWO,
      opacity: 1,
      transparent: false,
    };
    if (modelA) await modelA.highlight([c.localIdA], material);
    if (modelB) await modelB.highlight([c.localIdB], material);
    await this.fragments.update(true);
  }

  /** Remove o realce de conflito — reset total é barato (1 par por vez, poucos modelos). */
  async limparRealceConflito(): Promise<void> {
    for (const model of this.modelos.values()) await model.resetHighlight();
    await this.fragments.update(true);
  }

  /** Enquadra a câmera no centro do conflito (usa o bbox dos 2 elementos, com folga). */
  async focarConflito(c: ConflitoView): Promise<void> {
    const box = new THREE.Box3();
    const [boxesA, boxesB] = await Promise.all([
      this.bboxesDoModelo(c.modeloIdA, [c.localIdA]),
      this.bboxesDoModelo(c.modeloIdB, [c.localIdB]),
    ]);
    if (boxesA[0]) box.union(boxesA[0]);
    if (boxesB[0]) box.union(boxesB[0]);
    if (box.isEmpty()) return;
    await this.controls.fitToBox(box, true, { paddingLeft: 1, paddingRight: 1, paddingTop: 1, paddingBottom: 1 });
  }

  // ── Diff de versões (#4) ─────────────────────────────────────
  //
  // v1 = por IfcGuid + centro do bbox (decisão do F0). Dual-load client-side: carrega
  // as 2 versões (se ainda não estiverem), compara pelo núcleo puro (diff.ts), e
  // coloriza — nova: adicionados (verde) + movidos (âmbar); antiga: escondida exceto
  // os removidos (vermelho, mesma cor do clash). `sairDiff` reverte tudo.

  /** guid → centro do bbox (espaço-mundo) de todo elemento "de obra" do modelo (via índice da Onda 0). */
  private async centrosPorGuid(modeloId: string): Promise<CentroPorGuid> {
    const mapa: CentroPorGuid = new Map();
    const model = this.modelos.get(modeloId);
    if (!model) return mapa;
    const elementos = await this.indiceDoModelo(modeloId);
    const localIds = elementos.map((e) => e.localId);
    if (localIds.length === 0) return mapa;
    const [guids, boxes] = await Promise.all([
      model.getGuidsByLocalIds(localIds),
      this.bboxesDoModelo(modeloId, localIds),
    ]);
    localIds.forEach((_, i) => {
      const guid = guids[i];
      const box = boxes[i];
      if (!guid || !box) return;
      mapa.set(guid, [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2]);
    });
    return mapa;
  }

  private async colorirDiff(uploadIdAntigo: string, uploadIdNovo: string, resultado: ResultadoDiff): Promise<void> {
    const modelNovo = this.modelos.get(uploadIdNovo);
    if (modelNovo) {
      await modelNovo.resetHighlight();
      const idsAdicionados = (await modelNovo.getLocalIdsByGuids(resultado.adicionados)).filter(
        (id): id is number => id != null,
      );
      const idsMovidos = (await modelNovo.getLocalIdsByGuids(resultado.movidos.map((m) => m.guid))).filter(
        (id): id is number => id != null,
      );
      if (idsAdicionados.length > 0) {
        await modelNovo.highlight(idsAdicionados, {
          color: new THREE.Color(COR_DIFF_ADICIONADO),
          renderedFaces: RenderedFaces.TWO,
          opacity: 1,
          transparent: false,
        });
      }
      if (idsMovidos.length > 0) {
        await modelNovo.highlight(idsMovidos, {
          color: new THREE.Color(COR_DIFF_MOVIDO),
          renderedFaces: RenderedFaces.TWO,
          opacity: 1,
          transparent: false,
        });
      }
    }

    const modelAntigo = this.modelos.get(uploadIdAntigo);
    if (modelAntigo) {
      await modelAntigo.resetHighlight();
      const idsRemovidos = (await modelAntigo.getLocalIdsByGuids(resultado.removidos)).filter(
        (id): id is number => id != null,
      );
      // Versão antiga: some tudo, mostra só os removidos (o que ela tinha e a nova não tem mais).
      await modelAntigo.setVisible(undefined, false);
      if (idsRemovidos.length > 0) {
        await modelAntigo.setVisible(idsRemovidos, true);
        await modelAntigo.highlight(idsRemovidos, {
          color: new THREE.Color(COR_CONFLITO),
          renderedFaces: RenderedFaces.TWO,
          opacity: 1,
          transparent: false,
        });
      }
    }
    await this.fragments.update(true);
  }

  /**
   * Roda o diff entre duas versões (uploadId antigo × novo, ambas já convertidas):
   * carrega as 2 (se preciso), compara por guid+centro e coloriza a cena.
   */
  async rodarDiff(uploadIdAntigo: string, uploadIdNovo: string): Promise<ResultadoDiff> {
    // Marca quem NÃO estava na cena: foi o diff que trouxe → descarregar de verdade ao sair
    // (senão a versão fica sobreposta à atual — o "modelo duplicado").
    if (!this.modelos.has(uploadIdAntigo)) {
      await this.carregarModelo(uploadIdAntigo, `/api/coordenacao/frag/${uploadIdAntigo}`);
      this.diffCarregados.add(uploadIdAntigo);
    }
    if (!this.modelos.has(uploadIdNovo)) {
      await this.carregarModelo(uploadIdNovo, `/api/coordenacao/frag/${uploadIdNovo}`);
      this.diffCarregados.add(uploadIdNovo);
    }
    const [centrosAntigo, centrosNovo] = await Promise.all([
      this.centrosPorGuid(uploadIdAntigo),
      this.centrosPorGuid(uploadIdNovo),
    ]);
    const resultado = diffVersoes(centrosAntigo, centrosNovo);
    await this.colorirDiff(uploadIdAntigo, uploadIdNovo, resultado);
    return resultado;
  }

  /** Enquadra a câmera num guid específico de um modelo carregado (item da lista de diff/clash). */
  async focarGuid(modeloId: string, guid: string): Promise<void> {
    const model = this.modelos.get(modeloId);
    if (!model) return;
    const [localId] = await model.getLocalIdsByGuids([guid]);
    if (localId == null) return;
    const [box] = await this.bboxesDoModelo(modeloId, [localId]);
    if (!box) return;
    await this.controls.fitToBox(box, true, { paddingLeft: 1, paddingRight: 1, paddingTop: 1, paddingBottom: 1 });
  }

  /**
   * Sai do diff. Para cada versão: se foi o próprio diff que a trouxe à cena,
   * descarrega de verdade (era só para comparar — evita duplicata na cena); se já
   * estava carregada como disciplina do usuário, só restaura highlight/visibilidade.
   */
  async sairDiff(uploadIdAntigo: string, uploadIdNovo: string): Promise<void> {
    for (const id of [uploadIdAntigo, uploadIdNovo]) {
      if (this.diffCarregados.has(id)) {
        this.diffCarregados.delete(id);
        await this.descarregarModelo(id);
        continue;
      }
      const model = this.modelos.get(id);
      if (model) {
        await model.resetHighlight();
        await model.resetVisible();
      }
    }
    await this.fragments.update(true);
  }

  // ── Medição (distância/ângulo/área) ─────────────────────────
  //
  // Clique-para-marcar: quem decide se um clique vira "ponto de medição" ou
  // "seleção normal" é o chamador (viewer-3d.tsx), consultando `medindo` antes de
  // chamar `selecionarEm` ou `registrarPontoMedicao` — evita listener duplicado e
  // reusa a distinção clique-vs-arraste (>5px) que o viewer-3d já faz.

  /** True enquanto uma medição está ativa (o chamador deve rotear cliques p/ registrarPontoMedicao). */
  get medindo(): boolean {
    return this.medicao != null;
  }

  private pontosNecessarios(tipo: TipoMedicao): number {
    return tipo === "distancia" ? 2 : tipo === "angulo" ? 3 : Infinity;
  }

  private calcularResultadoMedicao(): ResultadoMedicaoView {
    const m = this.medicao!;
    const completo = m.tipo === "area" ? m.finalizado : m.pontos.length >= this.pontosNecessarios(m.tipo);
    let rotulo: string | null = null;
    let componentes: ResultadoMedicaoView["componentes"] = null;
    if (completo) {
      if (m.tipo === "distancia" && m.pontos.length >= 2) {
        rotulo = formatarMetros(distancia(m.pontos[0], m.pontos[1]));
        // Componentes em espaço IFC (Z-up) — mesmo referencial do vetor de realinhamento.
        const [dx, dy, dz] = threeParaIfc(deltaComponentes(m.pontos[0], m.pontos[1]));
        componentes = { dx: formatarMetros(dx), dy: formatarMetros(dy), dz: formatarMetros(dz) };
      } else if (m.tipo === "angulo" && m.pontos.length >= 3) {
        const a = angulo(m.pontos[0], m.pontos[1], m.pontos[2]);
        rotulo = a != null ? formatarAngulo(a) : null;
      } else if (m.tipo === "area" && m.pontos.length >= 3) {
        rotulo = formatarArea(areaPoligono(m.pontos));
      }
    }
    return { tipo: m.tipo, pontos: m.pontos.length, completo, rotulo, componentes };
  }

  /** Descarta e recria o grupo de marcadores/linhas da medição atual, a partir de `m.pontos`. */
  private redesenharMedicao(): void {
    const m = this.medicao;
    if (!m) return;
    this.scene.remove(m.grupo);
    for (const obj of m.grupo.children) {
      const item = obj as THREE.Mesh | THREE.Line;
      item.geometry.dispose();
      (item.material as THREE.Material).dispose();
    }

    const grupo = new THREE.Group();
    const cor = 0xf59e0b; // aviso — chamativo sobre o modelo, não colide com a seleção (azul)
    const esferaGeo = new THREE.SphereGeometry(0.04, 12, 12);
    for (const [x, y, z] of m.pontos) {
      const esfera = new THREE.Mesh(esferaGeo, new THREE.MeshBasicMaterial({ color: cor, depthTest: false }));
      esfera.position.set(x, y, z);
      esfera.renderOrder = 999;
      grupo.add(esfera);
    }
    const linhaPontos = m.tipo === "area" && m.finalizado ? [...m.pontos, m.pontos[0]] : m.pontos;
    if (linhaPontos.length >= 2) {
      const geo = new THREE.BufferGeometry().setFromPoints(linhaPontos.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      const linha = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: cor, depthTest: false }));
      linha.renderOrder = 999;
      grupo.add(linha);
    }
    m.grupo = grupo;
    this.scene.add(grupo);
  }

  /**
   * Raycast (ponto 3D exato) contra todos os modelos carregados; mais próximo vence.
   * Prioriza SNAP em vértice/aresta (mesma precisão que o indicador visual mostra) —
   * só cai pro raycast puro na face se não houver vértice/aresta perto o bastante.
   */
  private async raycastPonto(clientX: number, clientY: number): Promise<THREE.Vector3 | null> {
    const snap = await this.raycastSnap(clientX, clientY);
    if (snap) return snap;
    const mouse = new THREE.Vector2(clientX, clientY);
    const dom = this.renderer.domElement;
    let melhor: { point: THREE.Vector3; distance: number } | null = null;
    for (const model of this.modelos.values()) {
      const hit = await model.raycast({ camera: this.camera, mouse, dom });
      if (hit && (melhor === null || hit.distance < melhor.distance)) {
        melhor = { point: hit.point, distance: hit.distance };
      }
    }
    return melhor?.point ?? null;
  }

  /** Raycast só de SNAP (vértice/aresta) contra todos os modelos; mais próximo vence, ou null. */
  private async raycastSnap(clientX: number, clientY: number): Promise<THREE.Vector3 | null> {
    const mouse = new THREE.Vector2(clientX, clientY);
    const dom = this.renderer.domElement;
    let melhor: { point: THREE.Vector3; distance: number } | null = null;
    for (const model of this.modelos.values()) {
      const hits = await model.raycastWithSnapping({
        camera: this.camera,
        mouse,
        dom,
        snappingClasses: [SnappingClass.POINT, SnappingClass.LINE],
      });
      const hit = hits?.[0];
      if (hit && (melhor === null || hit.distance < melhor.distance)) {
        melhor = { point: hit.point, distance: hit.distance };
      }
    }
    return melhor?.point ?? null;
  }

  private garantirSnapMarker(): THREE.Mesh {
    if (!this.snapMarker) {
      const geo = new THREE.SphereGeometry(0.06, 12, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, depthTest: false }); // ciano — distinto do laranja da medição
      this.snapMarker = new THREE.Mesh(geo, mat);
      this.snapMarker.renderOrder = 1000;
      this.snapMarker.visible = false;
      this.scene.add(this.snapMarker);
    }
    return this.snapMarker;
  }

  /**
   * Mostra/atualiza o indicador visual de snap (vértice/aresta mais próximo do mouse);
   * some se não houver nenhum por perto. Chamado em pointermove durante medição e
   * durante o arraste de realinhamento — puramente visual (não altera a matemática
   * do deslocamento por plano do realinhamento).
   */
  async atualizarSnapHover(clientX: number, clientY: number): Promise<void> {
    if (this.snapHoverOcupado) return; // evita respostas fora de ordem sobrescreverem uma mais nova
    this.snapHoverOcupado = true;
    try {
      const ponto = await this.raycastSnap(clientX, clientY);
      const marker = this.garantirSnapMarker();
      marker.visible = ponto != null;
      if (ponto) marker.position.copy(ponto);
    } finally {
      this.snapHoverOcupado = false;
    }
  }

  /** Esconde o indicador de snap (saída de modo medição/realinhamento). */
  ocultarSnapHover(): void {
    if (this.snapMarker) this.snapMarker.visible = false;
  }

  /** Entra em modo medição (`tipo`). `onAtualizar` é chamado a cada ponto capturado. */
  iniciarMedicao(tipo: TipoMedicao, onAtualizar: (r: ResultadoMedicaoView) => void): void {
    if (this.medicao) this.sairMedicao();
    const grupo = new THREE.Group();
    this.scene.add(grupo);
    this.medicao = { tipo, pontos: [], grupo, onAtualizar, finalizado: false };
    onAtualizar(this.calcularResultadoMedicao());
  }

  /**
   * Registra um clique como ponto de medição (chamado pelo viewer-3d quando `medindo`).
   * Sem hit na malha → ignora. Ao completar a contagem fixa (distância/ângulo), o
   * PRÓXIMO clique começa uma medição nova em vez de acumular pontos extras.
   */
  async registrarPontoMedicao(clientX: number, clientY: number): Promise<void> {
    const m = this.medicao;
    if (!m) return;
    const ponto = await this.raycastPonto(clientX, clientY);
    if (!ponto || this.medicao !== m) return; // saiu do modo enquanto o raycast rodava

    if (m.tipo !== "area" && m.pontos.length >= this.pontosNecessarios(m.tipo)) {
      m.pontos = [];
      m.finalizado = false;
    }
    m.pontos.push([ponto.x, ponto.y, ponto.z]);
    this.redesenharMedicao();
    m.onAtualizar(this.calcularResultadoMedicao());
  }

  /** Fecha a medição de ÁREA (mínimo 3 pontos): calcula e fecha o polígono no desenho. */
  finalizarArea(): void {
    const m = this.medicao;
    if (!m || m.tipo !== "area" || m.pontos.length < 3) return;
    m.finalizado = true;
    this.redesenharMedicao();
    m.onAtualizar(this.calcularResultadoMedicao());
  }

  /** Descarta os pontos da medição atual e recomeça do zero, no mesmo modo. */
  reiniciarMedicao(): void {
    const m = this.medicao;
    if (!m) return;
    m.pontos = [];
    m.finalizado = false;
    this.redesenharMedicao();
    m.onAtualizar(this.calcularResultadoMedicao());
  }

  /** Sai do modo medição: remove marcadores/linhas da cena e libera a geometria. */
  sairMedicao(): void {
    const m = this.medicao;
    if (!m) return;
    this.scene.remove(m.grupo);
    for (const obj of m.grupo.children) {
      const item = obj as THREE.Mesh | THREE.Line;
      item.geometry.dispose();
      (item.material as THREE.Material).dispose();
    }
    this.medicao = null;
    this.ocultarSnapHover();
  }

  // ── Realinhamento (offset) — prévia ao vivo ─────────────────
  //
  // Move UM modelo na cena por um vetor (espaço IFC, metros) e um giro em planta sem
  // tocar no .frag: só mexe em model.object.position/rotation. O giro é em torno do
  // centro do modelo (pivô, fixado ao entrar); o vetor é quanto esse centro anda. O
  // arraste é sobre o plano horizontal (raycast) → dá dx,dy; altura (dz) e ângulo vêm
  // de campo. Enquanto ativo, o botão esquerdo do mouse ARRASTA o modelo (orbitar passa
  // para o direito); ao sair, o modelo volta à posição de antes (a persistência real é
  // o novo IFC gerado no servidor, não esta transformação visual).

  private realinhar: {
    modeloId: string;
    vetor: Vec3; // IFC (Z-up), metros — estado atual da prévia
    graus: number; // giro em planta (anti-horário visto de cima, convenção IFC)
    posicaoBase: THREE.Vector3; // model.object.position ao entrar (o viewer já usa p/ coordenar modelos)
    pivo: THREE.Vector3; // centro do modelo (three, mundo) ao entrar — eixo do giro
    planeY: number; // altura (three, mundo) do plano de arraste
    onVetor: (v: Vec3) => void;
    arrastando: boolean;
    origem: THREE.Vector3 | null; // ponto no plano no início do movimento atual
    /** Pontos clicados (mundo three) no modo de pontos; null = desligado. */
    pontos: {
      modo: ModoPontos;
      cliques: THREE.Vector3[];
      grupo: THREE.Group;
      onEtapa: (e: EtapaPontos) => void;
      onAlinhado: (r: ResultadoAlinhamento) => void;
    } | null;
    leftAcaoAntes: CameraControls["mouseButtons"]["left"];
    rightAcaoAntes: CameraControls["mouseButtons"]["right"];
    down: (e: PointerEvent) => void;
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null = null;

  get realinhamentoAtivo(): boolean {
    return this.realinhar != null;
  }

  /** True enquanto "mover por pontos" espera um clique (o chamador roteia o clique p/ cá). */
  get pegandoPontoRealinhamento(): boolean {
    return this.realinhar?.pontos != null;
  }

  /**
   * Liga/desliga o modo de pontos. "um-par": o 1º clique marca um ponto (com snap em
   * vértice/aresta), o 2º o destino, e o vetor anda exatamente a diferença — o 1º
   * ponto cai em cima do 2º, nos três eixos. "dois-pares": mais 2 cliques (outro
   * ponto do modelo e o destino dele) e a direção entre os pontos do modelo gira, em
   * planta, até a direção entre os destinos. Ao terminar, desliga sozinho.
   */
  moverPorPontos(
    modo: ModoPontos | null,
    onEtapa: (e: EtapaPontos) => void = () => {},
    onAlinhado: (r: ResultadoAlinhamento) => void = () => {},
  ): void {
    const r = this.realinhar;
    if (!r) return;
    this.limparPontosRealinhamento();
    if (!modo) return;
    const grupo = new THREE.Group();
    this.scene.add(grupo);
    r.pontos = { modo, cliques: [], grupo, onEtapa, onAlinhado };
    onEtapa("origem");
  }

  /** Clique no modo de pontos (chamado pelo viewer-3d em vez de selecionar). */
  async registrarPontoRealinhamento(clientX: number, clientY: number): Promise<void> {
    const r = this.realinhar;
    if (!r?.pontos) return;
    const p = await this.raycastPonto(clientX, clientY);
    const pontos = this.realinhar?.pontos;
    if (!p || !pontos) return; // clique no vazio: segue esperando
    pontos.cliques.push(p.clone());
    const total = pontos.modo === "um-par" ? 2 : 4;
    if (pontos.cliques.length < total) {
      this.desenharPontosRealinhamento(p, pontos.cliques.length % 2 === 1);
      pontos.onEtapa(ETAPAS[pontos.cliques.length]);
      return;
    }

    const { onEtapa, onAlinhado, cliques, modo } = pontos;
    this.limparPontosRealinhamento();
    // Pontos e pivô na orientação IFC (Z para cima), mesmo referencial do mundo.
    const ifc = (v: THREE.Vector3) => threeParaIfc([v.x, v.y, v.z]);
    if (modo === "um-par") {
      // O vetor é somado DEPOIS do giro: somar o delta move o modelo inteiro exatamente
      // essa diferença (o 1º ponto cai sobre o 2º).
      const [dx, dy, dz] = threeParaIfc([
        cliques[1].x - cliques[0].x,
        cliques[1].y - cliques[0].y,
        cliques[1].z - cliques[0].z,
      ]);
      r.vetor = [r.vetor[0] + dx, r.vetor[1] + dy, r.vetor[2] + dz];
    } else {
      const alinhado = alinharPorDoisPares({
        vetorAtual: r.vetor,
        grausAtual: r.graus,
        pivo: ifc(r.pivo),
        a1: ifc(cliques[0]),
        b1: ifc(cliques[1]),
        a2: ifc(cliques[2]),
        b2: ifc(cliques[3]),
      });
      if (!alinhado.ok) {
        onAlinhado({ erro: alinhado.motivo });
        onEtapa(null);
        return;
      }
      r.vetor = alinhado.vetor;
      r.graus = alinhado.graus;
      onAlinhado({ graus: alinhado.graus, razaoDistancias: alinhado.razaoDistancias });
    }
    this.aplicarPreview(r);
    r.onVetor([...r.vetor] as Vec3);
    onEtapa(null);
  }

  /**
   * Marcador do ponto clicado. Ponto do MODELO (laranja) puxa uma linha elástica até
   * o cursor; ponto de DESTINO (verde) fecha a linha do par.
   */
  private desenharPontosRealinhamento(ponto: THREE.Vector3, doModelo: boolean): void {
    const grupo = this.realinhar?.pontos?.grupo;
    if (!grupo) return;
    const cor = doModelo ? 0xf59e0b : 0x22c55e;
    const esfera = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshBasicMaterial({ color: cor, depthTest: false }),
    );
    esfera.position.copy(ponto);
    esfera.renderOrder = 999;
    grupo.add(esfera);
    const anterior = grupo.getObjectByName("elastico");
    if (anterior) anterior.name = "par"; // a linha do par anterior fica fixa
    if (doModelo) {
      const linha = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([ponto, ponto]),
        new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }),
      );
      linha.renderOrder = 999;
      linha.name = "elastico";
      grupo.add(linha);
    }
  }

  /** Puxa a ponta da linha elástica para o snap (ou o ponto no plano) sob o cursor. */
  private atualizarElastico(clientX: number, clientY: number): void {
    const r = this.realinhar;
    const pontos = r?.pontos;
    // Só depois de um ponto do modelo (clique ímpar) há linha elástica a puxar.
    if (!r || !pontos || pontos.cliques.length % 2 === 0) return;
    const origem = pontos.cliques[pontos.cliques.length - 1];
    const linha = pontos.grupo.getObjectByName("elastico") as THREE.Line | undefined;
    if (!linha) return;
    const ponta =
      this.snapMarker?.visible ? this.snapMarker.position.clone() : this.pontoNoPlano(clientX, clientY, origem.y);
    if (!ponta) return;
    linha.geometry.setFromPoints([origem, ponta]);
  }

  /** Desliga "mover por pontos" e descarta marcadores (não mexe no vetor). */
  private limparPontosRealinhamento(): void {
    const r = this.realinhar;
    const pontos = r?.pontos;
    if (!r || !pontos) return;
    this.scene.remove(pontos.grupo);
    for (const obj of pontos.grupo.children) {
      const item = obj as THREE.Mesh | THREE.Line;
      item.geometry.dispose();
      (item.material as THREE.Material).dispose();
    }
    r.pontos = null;
  }

  /** Ponto de interseção do raio da câmera (no pixel) com o plano horizontal y=planeY. */
  private pontoNoPlano(clientX: number, clientY: number, planeY: number): THREE.Vector3 | null {
    const dom = this.renderer.domElement;
    const rect = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(plano, p) ? p : null;
  }

  /**
   * Aplica a prévia ao model.object: gira em torno do pivô (eixo vertical) e desloca
   * pelo vetor IFC, a partir da posição que o modelo tinha ao entrar — NÃO de zero: o
   * FragmentsModels desloca cada modelo depois do primeiro para o referencial comum, e
   * zerar a posição tiraria o modelo do lugar. Giro de θ em torno do Z do IFC = giro de
   * θ em torno do Y do three (ifcParaThree troca y por −z), então o sinal é o mesmo.
   * mundo' = R·(local + base − pivô) + pivô + T  ⇒  posição = R·(base − pivô) + pivô + T.
   */
  private aplicarPreview(r: NonNullable<ViewerEngine["realinhar"]>): void {
    const m = this.modelos.get(r.modeloId);
    if (!m) return;
    const rad = (r.graus * Math.PI) / 180;
    const [tx, ty, tz] = ifcParaThree(r.vetor);
    const pos = r.posicaoBase
      .clone()
      .sub(r.pivo)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), rad)
      .add(r.pivo)
      .add(new THREE.Vector3(tx, ty, tz));
    m.object.position.copy(pos);
    m.object.rotation.set(0, rad, 0);
    m.object.updateWorldMatrix(true, false);
  }

  /** Pivô do giro em espaço IFC do ARQUIVO (metros) — vai junto na action ao aplicar. */
  pivoRealinhamento(): PivoPlanta | null {
    const r = this.realinhar;
    if (!r) return null;
    return pivoDoMundo([r.pivo.x, r.pivo.y, r.pivo.z], this.fragments.baseCoordinates);
  }

  /**
   * Entra no modo realinhamento de um modelo. `onVetor` é chamado quando o ARRASTE
   * altera o vetor (para os campos numéricos acompanharem). O vetor inicial é aplicado
   * de imediato como prévia.
   */
  entrarRealinhamento(modeloId: string, vetorInicial: Vec3, onVetor: (v: Vec3) => void): void {
    if (this.realinhar) this.sairRealinhamento();
    const box = this.bboxGlobal();
    const planeY = box ? (box.min.y + box.max.y) / 2 : 0;
    const modelo = this.modelos.get(modeloId);
    const posicaoBase = modelo ? modelo.object.position.clone() : new THREE.Vector3();
    const caixaModelo = modelo?.box;
    const pivo = caixaModelo && !caixaModelo.isEmpty() ? caixaModelo.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    const dom = this.renderer.domElement;

    const down = (e: PointerEvent) => {
      const r = this.realinhar;
      if (!r || e.button !== 0 || r.pontos) return; // "mover por pontos": clique, não arraste
      const p = this.pontoNoPlano(e.clientX, e.clientY, r.planeY);
      if (!p) return;
      r.arrastando = true;
      r.origem = p;
      dom.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      // Indicador visual de snap, sempre (arrastando ou não); no "mover por pontos" a
      // linha elástica segue o snap depois que ele responde.
      void this.atualizarSnapHover(e.clientX, e.clientY).then(() => this.atualizarElastico(e.clientX, e.clientY));
      const r = this.realinhar;
      if (!r?.arrastando || !r.origem) return;
      const p = this.pontoNoPlano(e.clientX, e.clientY, r.planeY);
      if (!p) return;
      const { dx, dy } = arrastePlanoParaIfc(p.x - r.origem.x, p.z - r.origem.z);
      r.vetor = [r.vetor[0] + dx, r.vetor[1] + dy, r.vetor[2]];
      r.origem = p; // incremental: nova origem a cada movimento
      this.aplicarPreview(r);
      r.onVetor([...r.vetor] as Vec3);
    };
    const up = (e: PointerEvent) => {
      const r = this.realinhar;
      if (!r) return;
      r.arrastando = false;
      r.origem = null;
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        /* ponteiro já solto */
      }
    };

    const leftAcaoAntes = this.controls.mouseButtons.left;
    const rightAcaoAntes = this.controls.mouseButtons.right;
    // Esquerda deixa de orbitar (passa a arrastar o modelo); direita passa a orbitar
    // (por padrão faz pan) para o usuário ainda girar a câmera; a roda segue o zoom.
    this.controls.mouseButtons.left = CameraControls.ACTION.NONE;
    this.controls.mouseButtons.right = CameraControls.ACTION.ROTATE;
    dom.addEventListener("pointerdown", down);
    dom.addEventListener("pointermove", move);
    dom.addEventListener("pointerup", up);

    this.realinhar = {
      modeloId,
      vetor: [...vetorInicial] as Vec3,
      graus: 0,
      posicaoBase,
      pivo,
      planeY,
      onVetor,
      arrastando: false,
      origem: null,
      pontos: null,
      leftAcaoAntes,
      rightAcaoAntes,
      down,
      move,
      up,
    };
    this.aplicarPreview(this.realinhar);
  }

  /** Define o vetor da prévia a partir dos campos numéricos (não dispara onVetor). */
  definirVetorRealinhamento(v: Vec3): void {
    const r = this.realinhar;
    if (!r) return;
    r.vetor = [...v] as Vec3;
    this.aplicarPreview(r);
  }

  /** Define o giro em planta da prévia (graus, anti-horário visto de cima). */
  definirRotacaoRealinhamento(graus: number): void {
    const r = this.realinhar;
    if (!r || !Number.isFinite(graus)) return;
    r.graus = graus;
    this.aplicarPreview(r);
  }

  /** Sai do modo realinhamento: restaura câmera/listeners e zera a translação visual. */
  sairRealinhamento(): void {
    const r = this.realinhar;
    if (!r) return;
    const dom = this.renderer.domElement;
    dom.removeEventListener("pointerdown", r.down);
    dom.removeEventListener("pointermove", r.move);
    dom.removeEventListener("pointerup", r.up);
    this.limparPontosRealinhamento();
    this.controls.mouseButtons.left = r.leftAcaoAntes;
    this.controls.mouseButtons.right = r.rightAcaoAntes;
    const m = this.modelos.get(r.modeloId);
    if (m) {
      // Volta o modelo exatamente para onde estava ao entrar.
      m.object.position.copy(r.posicaoBase);
      m.object.rotation.set(0, 0, 0);
      m.object.updateWorldMatrix(true, false);
    }
    this.realinhar = null;
    this.ocultarSnapHover();
  }

  // ── Pins (marcadores 3D dos apontamentos) ───────────────────

  /** Registra um callback rodado a cada frame (após o render) — usado p/ reprojetar pins na tela. */
  onFrame(cb: () => void): () => void {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  /** Centroide (espaço three, mundo) da união dos bboxes dos GUIDs — âncora do pin do apontamento. */
  async ancoraDeGuids(modeloId: string, guids: string[]): Promise<{ x: number; y: number; z: number } | null> {
    const model = this.modelos.get(modeloId);
    if (!model || guids.length === 0) return null;
    const localIds = (await model.getLocalIdsByGuids(guids)).filter((id): id is number => id != null);
    if (localIds.length === 0) return null;
    // getBoxes multiplica pela model.object.matrixWorld — que só é atualizada no
    // render. Se a âncora for calculada logo após o load (antes do 1º frame), a
    // matriz estaria desatualizada e o box viria em coordenadas IFC cruas (pin
    // parava longe do modelo). Forçar a atualização aqui garante espaço-mundo.
    model.object.updateWorldMatrix(true, true);
    const boxes = await model.getBoxes(localIds);
    if (!boxes || boxes.length === 0) return null;
    const uniao = new THREE.Box3();
    for (const b of boxes) if (!b.isEmpty()) uniao.union(b);
    if (uniao.isEmpty()) return null;
    const centro = uniao.getCenter(new THREE.Vector3());
    if (!Number.isFinite(centro.x) || !Number.isFinite(centro.y) || !Number.isFinite(centro.z)) return null;
    return { x: centro.x, y: centro.y, z: centro.z };
  }

  /** Projeta um ponto do mundo (espaço three) para pixels do container. `dentro` = na frente da câmera. */
  projetar(pos: { x: number; y: number; z: number }): { x: number; y: number; dentro: boolean } | null {
    const v = new THREE.Vector3(pos.x, pos.y, pos.z).project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, dentro: v.z > -1 && v.z < 1 };
  }

  // ── Gizmo de eixos (guia X/Y/Z, canto inferior-direito) ─────
  //
  // Cena/câmera próprias renderizadas num viewport 96px no canto, girando com a
  // orientação da câmera (mesma técnica do ViewHelper do three). Rotulado em
  // convenção IFC (Z para cima) — o fragments importa IFC Z-up como three Y-up,
  // então mapeamos: three +X→"X", three +Y(cima)→"Z", three −Z→"Y".

  private criarGizmoEixos() {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);

    const L = 1;
    const origem = new THREE.Vector3(0, 0, 0);
    const eixos: { dir: THREE.Vector3; cor: number; letra: string }[] = [
      { dir: new THREE.Vector3(1, 0, 0), cor: 0xef4444, letra: "X" },
      { dir: new THREE.Vector3(0, 0, -1), cor: 0x22c55e, letra: "Y" },
      { dir: new THREE.Vector3(0, 1, 0), cor: 0x3b82f6, letra: "Z" },
    ];
    for (const { dir, cor, letra } of eixos) {
      root.add(new THREE.ArrowHelper(dir, origem, L, cor, 0.3, 0.18));
      const sprite = this.criarSpriteLetra(letra, cor);
      sprite.position.copy(dir).multiplyScalar(L + 0.28);
      sprite.userData.letra = letra; // clique na letra → vista daquele lado (vistaNoIndicador)
      root.add(sprite);
    }

    const cam = new THREE.OrthographicCamera(-2, 2, 2, -2, 0, 4);
    cam.position.set(0, 0, 2);

    this.gizmoScene = scene;
    this.gizmoCamera = cam;
    this.gizmoRoot = root;
  }

  private criarSpriteLetra(letra: string, cor: number): THREE.Sprite {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = `#${cor.toString(16).padStart(6, "0")}`;
    ctx.font = "bold 46px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letra, size / 2, size / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.setScalar(0.55);
    return sprite;
  }

  /** Renderiza o gizmo num viewport pequeno no canto, por cima da cena (chamado no fim do loop). */
  private renderGizmo() {
    if (!this.gizmoScene || !this.gizmoCamera || !this.gizmoRoot) return;
    // Gira o gizmo com a orientação atual da câmera (inverso do quaternion da câmera).
    this.gizmoRoot.quaternion.copy(this.camera.quaternion).invert();
    this.gizmoRoot.updateMatrixWorld();

    const dim = TAMANHO_GIZMO;
    const w = this.renderer.domElement.offsetWidth || this.container.clientWidth;
    const vp = new THREE.Vector4();
    this.renderer.getViewport(vp);
    // autoClear off só nesta passada: preserva a cor da cena principal já renderizada;
    // clearDepth garante que o gizmo fique por cima. Restaura tudo ao final.
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.setViewport(w - dim, 0, dim, dim); // canto inferior-direito (y=0 é o fundo em WebGL)
    this.renderer.render(this.gizmoScene, this.gizmoCamera);
    this.renderer.setViewport(vp.x, vp.y, vp.z, vp.w);
    this.renderer.autoClear = true;
  }

  private descartarGizmo() {
    this.gizmoScene?.traverse((o) => {
      const alvo = o as Partial<THREE.Mesh> & { material?: THREE.Material & { map?: THREE.Texture } };
      alvo.geometry?.dispose();
      if (alvo.material) {
        alvo.material.map?.dispose();
        alvo.material.dispose();
      }
    });
    this.gizmoScene = null;
    this.gizmoCamera = null;
    this.gizmoRoot = null;
  }

  // ── Ciclo de vida ──────────────────────────────────────────

  private redimensionar() {
    const w = this.container.clientWidth;
    const h = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  async dispose(): Promise<void> {
    if (this.destruido) return;
    if (this.realinhar) this.sairRealinhamento();
    if (this.medicao) this.sairMedicao();
    if (this.snapMarker) {
      this.snapMarker.geometry.dispose();
      (this.snapMarker.material as THREE.Material).dispose();
    }
    this.destruido = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.descartarGizmo();
    await this.fragments.dispose().catch(() => {});
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.modelos.clear();
    this.selecao.clear();
    this.indiceCache.clear();
    this.indicePsetsCache.clear();
    this.diffCarregados.clear();
  }

  // ── Dados do item ──────────────────────────────────────────

  private async montarInfo(modeloId: string, localId: number): Promise<SelecaoInfo> {
    const model = this.modelos.get(modeloId)!;
    const [guids, dados] = await Promise.all([
      model.getGuidsByLocalIds([localId]),
      model
        .getItemsData([localId], {
          attributesDefault: true,
          relations: { IsDefinedBy: { attributes: true, relations: true } },
        })
        .catch(() => [] as ItemData[]),
    ]);
    const { atributos, psets } = extrairAtributos(dados[0]);
    return { modeloId, localId, guid: guids[0] ?? null, atributos, psets };
  }
}
