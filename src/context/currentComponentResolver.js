// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { findOwningComponent } from './nodeTree.js';
import { toProjectRelativePath } from './projectPaths.js';

function resolveOwner(appState) {
  if (!appState.selectedNode) return null;
  return findOwningComponent(appState.nodeTree || [], appState.selectedNode.id, appState.componentDefinitions || []);
}

// Keys staleness on the owning component's identity (name/path) *and* its
// other live-scanned fields (schema, slots, extendsTag, instances,
// isLayout). All of this is already synchronously available on the
// definition object in appState.componentDefinitions — the same
// project-scanner data Task 5/6's resolvers hash from — so there's no cost
// to including it. Without this, a rescan that adds/removes a prop or slot
// on the *same* component (name/path unchanged, e.g. the user edited the
// component's own frontmatter and the app rescanned) would leave a
// previously captured chip silently pointing at stale schema/slots data,
// since resolve()'s next call would return different `data` while
// computeStaleKey kept reporting "unchanged".
//
// This deliberately does NOT try to detect edits to the component's *file
// content* on disk: that content lives on disk, not in live appState, and
// computeStaleKey must stay synchronous (no re-read per check) — matching
// selectedFilesResolver's established precedent of never auto-staling on
// later on-disk edits the app hasn't itself rescanned.
function definitionRevisionKey(definition) {
  if (!definition) return null;
  const { name, path, schema, slots, extendsTag, instances, isLayout } = definition;
  const rest = JSON.stringify({ schema, slots, extendsTag, instances, isLayout });
  return `${name}:${path}:${rest}`;
}

export const currentComponentResolver = {
  type: CONTEXT_CHIP_TYPES.CURRENT_COMPONENT,
  label: 'Current component',

  isAvailable(appState) {
    return !!resolveOwner(appState);
  },

  getDefaultOptions() {
    return {};
  },

  async resolve(appState) {
    const owner = resolveOwner(appState);
    if (!owner) throw new Error('The selection is not inside a known component.');
    const rel = toProjectRelativePath(appState.projectPath, owner.definition.path);
    const file = await appState.readProjectFile(rel);
    const data = {
      name: owner.definition.name,
      path: rel,
      isLayout: !!owner.definition.isLayout,
      schema: owner.definition.schema || [],
      slots: owner.definition.slots || [],
      extendsTag: owner.definition.extendsTag || null,
      instances: owner.definition.instances ?? null,
      source: file.content,
    };
    return {
      data,
      estimatedCharacters: file.content.length,
      sourceRevision: `${rel}:${file.content.length}`,
    };
  },

  computeStaleKey(appState) {
    const owner = resolveOwner(appState);
    return owner ? definitionRevisionKey(owner.definition) : null;
  },

  renderMarkdown(snapshot) {
    const { name, path, isLayout, schema, slots, extendsTag, instances, source } = snapshot.data;
    const lines = ['### Current component', ''];
    lines.push(`- Name: ${name}${isLayout ? ' (layout)' : ''}`);
    lines.push(`- File: \`${path}\``);
    if (typeof instances === 'number') {
      lines.push(`- Used ${instances} time${instances === 1 ? '' : 's'} in this project`);
    }
    if (extendsTag) lines.push(`- Extends: built-in \`<${extendsTag}>\` attributes`);
    if (slots.length > 0) lines.push(`- Slots: ${slots.join(', ')}`);
    if (schema.length > 0) {
      lines.push(
        `- Props: ${schema.map((f) => `${f.name} (${f.type}${f.optional ? ', optional' : ''})`).join(', ')}`,
      );
    }
    lines.push('', '```astro', source.trim(), '```');
    return lines.join('\n');
  },
};
