/**
 * Minimal element factory for the markup tests. This package's tests run
 * from the repository root, where no React runtime is installed, so the
 * stateless views are evaluated against this stand-in instead. It builds
 * plain element objects only; it is not a renderer. Components that keep
 * state cannot be evaluated with it.
 */
const ELEMENT = Symbol.for("conditions.test.element");
export const Fragment = Symbol.for("conditions.test.fragment");

export interface StandInElement {
  $$typeof: symbol;
  type: unknown;
  key: string | null;
  props: Record<string, unknown>;
}

function create(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: unknown,
): StandInElement {
  return {
    $$typeof: ELEMENT,
    type,
    key: key === undefined || key === null ? null : String(key),
    props: props ?? {},
  };
}

export const jsx = create;
export const jsxs = create;
export const jsxDEV = create;

export function isValidElement(value: unknown): value is StandInElement {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === ELEMENT
  );
}

export function useState(): never {
  throw new Error("Stateful components cannot be evaluated by the stand-in");
}
