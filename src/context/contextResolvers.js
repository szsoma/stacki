/**
 * A context source the prompt composer can pull from. Resolvers are
 * registered by type and looked up by the chip that references them.
 *
 * @typedef {{
 *   type: string,
 *   label?: string,
 *   isAvailable?: Function,
 *   getDefaultOptions?: Function,
 *   resolve?: Function,
 *   renderMarkdown?: Function,
 *   computeStaleKey?: Function,
 *   [key: string]: any,
 * }} ContextResolver
 */

/** @type {Map<string, ContextResolver>} */
const registry = new Map();

/** @param {ContextResolver} resolver */
export function registerResolver(resolver) {
  if (!resolver || typeof resolver.type !== 'string' || !resolver.type) {
    throw new Error('Resolver must declare a string type.');
  }
  registry.set(resolver.type, resolver);
}

/** @param {string} type */
export function getResolver(type) {
  return registry.get(type);
}

export function listResolvers() {
  return [...registry.values()];
}

export function clearResolvers() {
  registry.clear();
}
