export type SourceLocation = {
  fileName: string;
  lineNumber?: number;
  columnNumber?: number;
  componentName?: string;
};

export function sourceLocationFromVisualAttribute(value: string | null): SourceLocation | null {
  if (!value) return null;

  const match = /^(.*):(\d+):(\d+)$/.exec(value);
  if (!match) return null;

  return {
    fileName: match[1],
    lineNumber: Number(match[2]),
    columnNumber: Number(match[3]),
  };
}

type FiberRecord = Record<string, unknown>;

function asRecord(value: unknown): FiberRecord | null {
  return typeof value === "object" && value !== null ? (value as FiberRecord) : null;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function componentNameFromType(value: unknown): string | undefined {
  if (typeof value === "string") return value;

  if (typeof value === "function") {
    const component = value as { displayName?: unknown; name?: unknown };
    if (typeof component.displayName === "string" && component.displayName) return component.displayName;
    if (typeof component.name === "string" && component.name) return component.name;
  }

  const component = asRecord(value);
  const displayName = component?.displayName;
  if (typeof displayName === "string" && displayName) return displayName;

  const name = component?.name;
  if (typeof name === "string" && name) return name;

  return undefined;
}

function sourceLocationFrom(value: unknown, componentName?: string): SourceLocation | null {
  const source = asRecord(value);
  const fileName = source?.fileName;
  if (typeof fileName !== "string" || !fileName) return null;

  return {
    fileName,
    lineNumber: numberOrUndefined(source.lineNumber),
    columnNumber: numberOrUndefined(source.columnNumber),
    componentName,
  };
}

function sourceFromFiber(fiber: FiberRecord): SourceLocation | null {
  const componentName = componentNameFromType(fiber.type) ?? componentNameFromType(fiber.elementType);
  const direct = sourceLocationFrom(fiber._debugSource, componentName);
  if (direct) return direct;

  const pendingProps = asRecord(fiber.pendingProps);
  const pending = sourceLocationFrom(pendingProps?.__source, componentName);
  if (pending) return pending;

  const memoizedProps = asRecord(fiber.memoizedProps);
  return sourceLocationFrom(memoizedProps?.__source, componentName);
}

/**
 * React guarda estes campos apenas no build de desenvolvimento. O formato não é
 * uma API pública, por isso esta função é confinada ao POC e falha com null.
 */
export function sourceLocationFromReactFiber(fiber: unknown): SourceLocation | null {
  let current = asRecord(fiber);
  const visited = new Set<FiberRecord>();

  while (current && !visited.has(current)) {
    visited.add(current);

    const source = sourceFromFiber(current);
    if (source) return source;

    const owner = asRecord(current._debugOwner);
    if (owner && !visited.has(owner)) {
      current = owner;
      continue;
    }

    current = asRecord(current.return);
  }

  return null;
}

/** Busca a Fiber que o React associa a um host DOM em modo desenvolvimento. */
export function reactFiberForElement(element: Element): unknown | null {
  const record = element as unknown as FiberRecord;
  const fiberKey = Object.keys(record).find((key) => key.startsWith("__reactFiber$"));
  return fiberKey ? record[fiberKey] : null;
}
