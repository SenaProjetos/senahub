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
  type FragmentsModel,
  type ItemData,
} from "@thatopen/fragments";
import {
  extrairAtributos,
  type AtributoItem,
  type PsetItem,
} from "@/modules/coordenacao/viewer/item-data";
import { threeParaIfc, ifcParaThree, type Vec3 } from "@/modules/coordenacao/viewer/coords";
import { arrastePlanoParaIfc } from "@/modules/coordenacao/realinhamento";
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
  formatarMetros,
  formatarAngulo,
  formatarArea,
  type Ponto3D,
} from "@/modules/coordenacao/medicao";

CameraControls.install({ THREE });

const COR_SELECAO = 0x2563eb; // primário (azul) — highlight de seleção

export type { AtributoItem, PsetItem };

export type SelecaoInfo = {
  modeloId: string;
  localId: number;
  guid: string | null;
  atributos: AtributoItem[];
  psets: PsetItem[];
};

export type EixoCorte = "x" | "y" | "z";

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
  private medicao: EstadoMedicao | null = null;
  private selecao = new Map<string, Set<number>>(); // modeloId → localIds
  private planosCorte: THREE.Plane[] = [];
  private raf = 0;
  private resizeObs: ResizeObserver;
  private destruido = false;
  private opts: EngineOpts;
  private frameCallbacks = new Set<() => void>();

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

    const loop = () => {
      if (this.destruido) return;
      this.raf = requestAnimationFrame(loop);
      const delta = this.clock.getDelta();
      this.controls.update(delta);
      void this.fragments.update(); // a lib limita a taxa internamente (maxUpdateRate)
      this.renderer.render(this.scene, this.camera);
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

  /** Mostra só a seleção (nos modelos sem seleção, esconde tudo). */
  async isolarSelecao(): Promise<void> {
    if (!this.temSelecao) return;
    for (const [modeloId, model] of this.modelos) {
      const ids = this.selecao.get(modeloId);
      await model.setVisible(undefined, false);
      if (ids && ids.size > 0) await model.setVisible([...ids], true);
    }
    await this.fragments.update(true);
  }

  async ocultarSelecao(): Promise<void> {
    for (const [modeloId, ids] of this.selecao) {
      const model = this.modelos.get(modeloId);
      if (model && ids.size > 0) await model.setVisible([...ids], false);
    }
    await this.limparSelecao();
  }

  async mostrarTudo(): Promise<void> {
    for (const model of this.modelos.values()) {
      await model.setVisible(undefined, true);
    }
    await this.fragments.update(true);
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
        const eixo = config.eixo;
        const min = box.min[eixo];
        const max = box.max[eixo];
        const pos = min + (max - min) * config.posicao;
        const normal = new THREE.Vector3(
          eixo === "x" ? -1 : 0,
          eixo === "y" ? -1 : 0,
          eixo === "z" ? -1 : 0,
        );
        if (config.invertido) normal.negate();
        // O lado onde normal·p + constant ≥ 0 é mantido; o resto é cortado.
        const ponto = new THREE.Vector3().setComponent(
          eixo === "x" ? 0 : eixo === "y" ? 1 : 2,
          pos,
        );
        this.planosCorte.push(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, ponto));
      }
    }
    this.renderer.clippingPlanes = this.planosCorte;
  }

  // ── Câmera ─────────────────────────────────────────────────

  async enquadrar(): Promise<void> {
    const box = this.bboxGlobal();
    if (!box) return;
    const esfera = box.getBoundingSphere(new THREE.Sphere());
    await this.controls.fitToSphere(esfera, true);
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

  /** Índice de elementos do modelo, com pavimento resolvido (nome real, não só a categoria). */
  async indiceDoModelo(modeloId: string): Promise<ElementoIndex[]> {
    const cache = this.indiceCache.get(modeloId);
    if (cache) return cache;
    const model = this.modelos.get(modeloId);
    if (!model) return [];

    const bruto = (await model.getSpatialStructure()) as unknown as NoArvoreBruto;
    const raiz = normalizarNo(bruto);
    let elementos = listarElementos(raiz);

    // A árvore só traz a CATEGORIA do pavimento (ex.: "IFCBUILDINGSTOREY"); resolve o
    // Name real (ex.: "Pavimento 2") via getItemsData, igual ao painel de propriedades.
    const pavIds = [...new Set(elementos.map((e) => e.pavimentoLocalId).filter((id): id is number => id != null))];
    if (pavIds.length > 0) {
      const dados = await model.getItemsData(pavIds, { attributesDefault: true }).catch(() => []);
      const nomes = new Map<number, string>();
      pavIds.forEach((id, i) => {
        const { atributos } = extrairAtributos(dados[i]);
        const nome = atributos.find((a) => a.nome === "Name")?.valor;
        if (nome) nomes.set(id, nome);
      });
      if (nomes.size > 0) {
        elementos = elementos.map((e) =>
          e.pavimentoLocalId != null && nomes.has(e.pavimentoLocalId)
            ? { ...e, pavimentoNome: nomes.get(e.pavimentoLocalId)! }
            : e,
        );
      }
    }

    this.indiceCache.set(modeloId, elementos);
    return elementos;
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
    for (const model of this.modelos.values()) await model.setVisible(undefined, false);
    const model = this.modelos.get(modeloId);
    if (model && localIds.length > 0) await model.setVisible(localIds, true);
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
    if (completo) {
      if (m.tipo === "distancia" && m.pontos.length >= 2) {
        rotulo = formatarMetros(distancia(m.pontos[0], m.pontos[1]));
      } else if (m.tipo === "angulo" && m.pontos.length >= 3) {
        const a = angulo(m.pontos[0], m.pontos[1], m.pontos[2]);
        rotulo = a != null ? formatarAngulo(a) : null;
      } else if (m.tipo === "area" && m.pontos.length >= 3) {
        rotulo = formatarArea(areaPoligono(m.pontos));
      }
    }
    return { tipo: m.tipo, pontos: m.pontos.length, completo, rotulo };
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

  /** Raycast (ponto 3D exato, não o item) contra todos os modelos carregados; mais próximo vence. */
  private async raycastPonto(clientX: number, clientY: number): Promise<THREE.Vector3 | null> {
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
  }

  // ── Realinhamento (offset) — prévia ao vivo ─────────────────
  //
  // Move UM modelo na cena por um vetor (espaço IFC, metros) sem tocar no .frag: só
  // desloca model.object.position. O arraste é sobre o plano horizontal (raycast) →
  // dá dx,dy; a altura (dz) vem de campo. Enquanto ativo, o botão esquerdo do mouse
  // ARRASTA o modelo (orbitar passa para o direito); ao sair, a posição volta a zero
  // (a persistência real é o novo IFC gerado no servidor, não esta translação visual).

  private realinhar: {
    modeloId: string;
    vetor: Vec3; // IFC (Z-up), metros — estado atual da prévia
    planeY: number; // altura (three, mundo) do plano de arraste
    onVetor: (v: Vec3) => void;
    arrastando: boolean;
    origem: THREE.Vector3 | null; // ponto no plano no início do movimento atual
    leftAcaoAntes: CameraControls["mouseButtons"]["left"];
    rightAcaoAntes: CameraControls["mouseButtons"]["right"];
    down: (e: PointerEvent) => void;
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null = null;

  get realinhamentoAtivo(): boolean {
    return this.realinhar != null;
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

  /** Aplica a prévia (translação visual) do vetor IFC ao model.object. */
  private aplicarPreview(modeloId: string, v: Vec3): void {
    const m = this.modelos.get(modeloId);
    if (!m) return;
    const [x, y, z] = ifcParaThree(v);
    m.object.position.set(x, y, z);
    m.object.updateWorldMatrix(true, false);
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
    const dom = this.renderer.domElement;

    const down = (e: PointerEvent) => {
      const r = this.realinhar;
      if (!r || e.button !== 0) return;
      const p = this.pontoNoPlano(e.clientX, e.clientY, r.planeY);
      if (!p) return;
      r.arrastando = true;
      r.origem = p;
      dom.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const r = this.realinhar;
      if (!r?.arrastando || !r.origem) return;
      const p = this.pontoNoPlano(e.clientX, e.clientY, r.planeY);
      if (!p) return;
      const { dx, dy } = arrastePlanoParaIfc(p.x - r.origem.x, p.z - r.origem.z);
      r.vetor = [r.vetor[0] + dx, r.vetor[1] + dy, r.vetor[2]];
      r.origem = p; // incremental: nova origem a cada movimento
      this.aplicarPreview(r.modeloId, r.vetor);
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
      planeY,
      onVetor,
      arrastando: false,
      origem: null,
      leftAcaoAntes,
      rightAcaoAntes,
      down,
      move,
      up,
    };
    this.aplicarPreview(modeloId, vetorInicial);
  }

  /** Define o vetor da prévia a partir dos campos numéricos (não dispara onVetor). */
  definirVetorRealinhamento(v: Vec3): void {
    const r = this.realinhar;
    if (!r) return;
    r.vetor = [...v] as Vec3;
    this.aplicarPreview(r.modeloId, r.vetor);
  }

  /** Sai do modo realinhamento: restaura câmera/listeners e zera a translação visual. */
  sairRealinhamento(): void {
    const r = this.realinhar;
    if (!r) return;
    const dom = this.renderer.domElement;
    dom.removeEventListener("pointerdown", r.down);
    dom.removeEventListener("pointermove", r.move);
    dom.removeEventListener("pointerup", r.up);
    this.controls.mouseButtons.left = r.leftAcaoAntes;
    this.controls.mouseButtons.right = r.rightAcaoAntes;
    this.aplicarPreview(r.modeloId, [0, 0, 0]); // volta o modelo à posição original
    this.realinhar = null;
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
    this.destruido = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.controls.dispose();
    await this.fragments.dispose().catch(() => {});
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.modelos.clear();
    this.selecao.clear();
    this.indiceCache.clear();
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
