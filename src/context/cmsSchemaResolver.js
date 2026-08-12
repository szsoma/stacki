// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { collectionOf, fieldsOf, labelize } from '../cmsSchema.js';

const JSON_IMPORT_RE = /\.json$/i;

function cmsImportPaths(pageInfo) {
  if (!pageInfo?.imports) return [];
  return pageInfo.imports.filter((i) => JSON_IMPORT_RE.test(i.path)).map((i) => i.path);
}

function declaredType(meta, collectionRel, fieldKey) {
  const declared = meta?.[collectionRel];
  if (!declared) return null;
  const config = declared[fieldKey];
  if (typeof config === 'object' && config.type) return config.type;
  return typeof config === 'string' ? config : null;
}

export const cmsSchemaResolver = {
  type: CONTEXT_CHIP_TYPES.CMS_SCHEMA,
  label: 'CMS schema',

  isAvailable(_appState) {
    return true;
  },

  getDefaultOptions() {
    return { mode: 'relevant' };
  },

  async resolve(appState, options) {
    const mode = options?.mode || 'relevant';
    const { files } = await window.avb.listCms(appState.projectPath);
    if (!files || files.length === 0) throw new Error('No CMS collections exist in this project.');

    let targetRels;
    if (mode === 'relevant' && appState.pageInfo) {
      targetRels = cmsImportPaths(appState.pageInfo);
      if (targetRels.length === 0) throw new Error('No CMS collections match the selected mode.');
    } else {
      targetRels = files.map((f) => f.rel);
    }

    const targetFiles = files.filter((f) => targetRels.includes(f.rel));
    if (targetFiles.length === 0) throw new Error('No CMS collections match the selected mode.');

    const { meta } = await window.avb.cmsMeta(appState.projectPath);

    const collections = [];
    let totalChars = 0;
    for (const file of targetFiles) {
      const collection = collectionOf(file);
      const rawFields = fieldsOf(collection.items);

      const enrichedFields = rawFields.map((f) => {
        const declared = declaredType(meta, file.rel, f.key);
        return { key: f.key, label: f.label, type: declared || f.type };
      });

      const sampleItem = collection.items.length > 0 ? (() => {
        const it = collection.items.find((i) => i && typeof i === 'object' && !Array.isArray(i));
        if (!it) return collection.items[0];
        const preview = {};
        enrichedFields.slice(0, 5).forEach((f) => {
          if (it[f.key] !== undefined) preview[f.key] = it[f.key];
        });
        return preview;
      })() : null;

      const data = {
        rel: file.rel, label: collection.label, single: collection.single,
        itemCount: collection.items.length, fields: enrichedFields, sampleItem,
      };
      collections.push(data);
      totalChars += JSON.stringify(data).length;
    }

    return {
      data: { mode, collections },
      estimatedCharacters: totalChars,
      sourceRevision: `${mode}:${collections.length}:${collections.reduce((sum, c) => sum + c.itemCount, 0)}`,
    };
  },

  renderMarkdown(snapshot) {
    const { collections } = snapshot.data;
    const lines = ['### CMS schema', ''];
    for (const col of collections) {
      lines.push(`#### ${col.label}`, '');
      lines.push(`- File: \`${col.rel}\``);
      lines.push(`- Mode: ${col.single ? 'single item' : `${col.itemCount} item${col.itemCount === 1 ? '' : 's'}`}`);
      if (col.fields.length > 0) {
        lines.push('- Fields:');
        for (const f of col.fields) lines.push(`  - **${f.label}** (${f.type})`);
      } else {
        lines.push('- _(no fields)_');
      }
      if (col.sampleItem) {
        lines.push('', 'Sample item:', '', '```json', JSON.stringify(col.sampleItem, null, 2), '```');
      }
      lines.push('');
    }
    return lines.join('\n');
  },
};
