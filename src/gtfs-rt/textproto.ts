export type ProtoScalar = string | number;

export class ProtoNode {
  private readonly fields = new Map<string, (ProtoScalar | ProtoNode)[]>();

  add(key: string, value: ProtoScalar | ProtoNode): void {
    const list = this.fields.get(key);
    if (list) list.push(value);
    else this.fields.set(key, [value]);
  }

  node(key: string): ProtoNode | undefined {
    const value = this.fields.get(key)?.[0];
    return value instanceof ProtoNode ? value : undefined;
  }

  nodes(key: string): ProtoNode[] {
    return (this.fields.get(key) ?? []).filter((value): value is ProtoNode => value instanceof ProtoNode);
  }

  scalar(key: string): ProtoScalar | undefined {
    const value = this.fields.get(key)?.[0];
    return value instanceof ProtoNode ? undefined : value;
  }

  strings(key: string): string[] {
    return (this.fields.get(key) ?? []).filter((value): value is string => typeof value === "string");
  }
}

/** Parses the GTFS-RT textproto subset published by the TTC alerts endpoint. */
export function parseTextProto(input: string): ProtoNode {
  const parser = new Parser(input);
  return parser.parseMessage(input.length);
}

class Parser {
  private index = 0;

  constructor(private readonly source: string) {}

  parseMessage(end: number): ProtoNode {
    const node = new ProtoNode();
    while (this.index < end) {
      this.skip();
      if (this.index >= end || this.source[this.index] === "}") break;
      const key = this.readIdent();
      this.skip();
      const char = this.source[this.index];
      if (char === "{") {
        this.index += 1;
        const child = this.parseMessage(end);
        this.skip();
        if (this.source[this.index] !== "}") throw new Error(`unclosed message ${key} at ${this.index}`);
        this.index += 1;
        node.add(key, child);
        continue;
      }
      if (char !== ":") throw new Error(`expected ':' after ${key} at ${this.index}`);
      this.index += 1;
      this.skip();
      if (this.source[this.index] === '"') node.add(key, this.readString());
      else if (this.source[this.index] === "{") {
        this.index += 1;
        const child = this.parseMessage(end);
        this.skip();
        if (this.source[this.index] !== "}") throw new Error(`unclosed message ${key} at ${this.index}`);
        this.index += 1;
        node.add(key, child);
      } else node.add(key, this.readBare());
    }
    return node;
  }

  private skip(): void {
    while (this.index < this.source.length && /\s/.test(this.source[this.index] ?? "")) this.index += 1;
  }

  private readIdent(): string {
    const start = this.index;
    while (this.index < this.source.length && /[A-Za-z0-9_]/.test(this.source[this.index] ?? "")) this.index += 1;
    if (start === this.index) throw new Error(`expected a field name at ${this.index}`);
    return this.source.slice(start, this.index);
  }

  private readString(): string {
    if (this.source[this.index] !== '"') throw new Error(`expected a string at ${this.index}`);
    this.index += 1;
    let out = "";
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === '"') {
        this.index += 1;
        return out;
      }
      if (char === "\\") {
        const next = this.source[this.index + 1];
        if (next === "n") out += "\n";
        else if (next === "t") out += "\t";
        else if (next === undefined) throw new Error("truncated string escape");
        else out += next;
        this.index += 2;
        continue;
      }
      out += char;
      this.index += 1;
    }
    throw new Error("unterminated string");
  }

  private readBare(): ProtoScalar {
    const start = this.index;
    while (this.index < this.source.length && !/[\s}]/.test(this.source[this.index] ?? "")) this.index += 1;
    const token = this.source.slice(start, this.index);
    if (token === "") throw new Error(`expected a value at ${this.index}`);
    if (/^-?\d+$/.test(token)) return Number(token);
    return token;
  }
}
