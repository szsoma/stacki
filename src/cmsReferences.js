// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import { addressesAt, collectionOf, labelize, setAtAddress, titleOf } from './cmsSchema.js';

// Every reference/multi-reference field declared anywhere in the project,
// flattened with enough to find and clear one: which collection it lives in,
// the nesting path to the objects that carry it, the field's own key, and
// which collection it points at.
export function declaredReferenceFields(meta) {
  const fields = [];
  for (const [collectionRel, declared] of Object.entries(meta || {})) {
    for (const [dottedPath, config] of Object.entries(declared || {})) {
      if (!config || typeof config !== 'object') continue;
      if (config.type !== 'reference' && config.type !== 'multiReference') continue;
      const segments = dottedPath.split('.');
      const fieldKey = segments[segments.length - 1];
      fields.push({
        collectionRel,
        path: segments.slice(0, -1),
        fieldKey,
        fieldLabel: labelize(fieldKey),
        type: config.type,
        targetRel: config.collection,
      });
    }
  }
  return fields;
}

// Every item, anywhere in the project, whose reference/multi-reference field
// currently points at one of `targetIds` inside `targetRel`. Used to block a
// delete until every one of these is resolved.
export function findIncomingReferences({ files, meta, targetRel, targetIds }) {
  const ids = new Set(targetIds);
  if (!ids.size) return [];
  const byRel = new Map(files.map((f) => [f.rel, f]));
  const hits = [];
  for (const field of declaredReferenceFields(meta)) {
    if (field.targetRel !== targetRel) continue;
    const file = byRel.get(field.collectionRel);
    if (!file || file.error || file.data === undefined) continue;
    const collection = collectionOf(file);
    for (const address of addressesAt(collection.items, field.path)) {
      const value = address.obj[field.fieldKey];
      const matched =
        field.type === 'multiReference'
          ? Array.isArray(value)
            ? value.filter((v) => ids.has(v))
            : []
          : ids.has(value)
            ? [value]
            : [];
      if (!matched.length) continue;
      hits.push({
        collectionRel: field.collectionRel,
        collectionLabel: collection.label,
        itemIndex: address.itemIndex,
        itemId: collection.items[address.itemIndex]?._id ?? null,
        itemTitle: titleOf(collection.items[address.itemIndex], address.itemIndex),
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
        type: field.type,
        steps: address.steps,
        matchedIds: matched,
      });
    }
  }
  return hits;
}

// Clears one hit's reference — the whole value for a Reference field, or just
// the matched id(s) out of the array for a Multi-reference field.
export function clearIncomingReference(items, hit) {
  let node = items[hit.itemIndex];
  for (const step of hit.steps) node = node[step];
  const current = node[hit.fieldKey];
  const value =
    hit.type === 'multiReference'
      ? Array.isArray(current)
        ? current.filter((v) => !hit.matchedIds.includes(v))
        : []
      : '';
  return setAtAddress(items, hit.itemIndex, hit.steps, hit.fieldKey, value);
}
