const registry = new Map();

export function registerResolver(resolver) {
  if (!resolver || typeof resolver.type !== 'string' || !resolver.type) {
    throw new Error('Resolver must declare a string type.');
  }
  registry.set(resolver.type, resolver);
}

export function getResolver(type) {
  return registry.get(type);
}

export function listResolvers() {
  return [...registry.values()];
}

export function clearResolvers() {
  registry.clear();
}
