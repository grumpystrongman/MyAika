/** @typedef {import("./types.js").ToolDefinition} ToolDefinition */

export class ToolRegistry {
  constructor() {
    /** @type {Map<string, {def: ToolDefinition, handler: Function}>} */
    this.tools = new Map();
  }

  /**
   * @param {ToolDefinition} def
   * @param {(params: any, context: any) => Promise<any>} handler
   */
  register(def, handler) {
    if (!def?.name) throw new Error("tool_name_required");
    if (this.tools.has(def.name)) throw new Error(`tool_already_registered:${def.name}`);
    this.tools.set(def.name, { def, handler });
  }

  list() {
    return Array.from(this.tools.values()).map(t => t.def);
  }

  get(name) {
    return this.tools.get(name) || null;
  }
}

