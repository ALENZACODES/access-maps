import type { ReactElement, ReactNode } from "react";
import { Fragment, isValidElement } from "react";

/** A host element after every stateless component has been expanded. */
export interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[];
}

/**
 * Expands stateless function components into plain host elements so tests
 * can read the markup without a browser. Components that keep state cannot
 * be expanded this way.
 */
export function expand(node: ReactNode): (HostNode | string)[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap((item) => expand(item as ReactNode));
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.type === Fragment) return expand(element.props.children as ReactNode);
  if (typeof element.type === "function") {
    const render = element.type as (props: unknown) => ReactNode;
    return expand(render(element.props));
  }
  return [
    {
      type: element.type as string,
      props: element.props,
      children: expand(element.props.children as ReactNode),
    },
  ];
}

export function all(nodes: (HostNode | string)[]): HostNode[] {
  const found: HostNode[] = [];
  for (const node of nodes) {
    if (typeof node === "string") continue;
    found.push(node, ...all(node.children));
  }
  return found;
}

export function text(node: HostNode | string | (HostNode | string)[]): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  return node.type === "br" ? " " : node.children.map(text).join("");
}

export function byType(nodes: (HostNode | string)[], type: string): HostNode[] {
  return all(nodes).filter((node) => node.type === type);
}

export function byId(nodes: (HostNode | string)[], id: string): HostNode | undefined {
  return all(nodes).find((node) => node.props.id === id);
}
