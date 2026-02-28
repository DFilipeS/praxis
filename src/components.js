// Keep in sync with the core skills in .agents/skills/ in this repository.
const CORE_SKILLS = new Set([
  "brainstorming",
  "planning",
  "implementing",
  "reviewing",
  "retrospective",
]);

/**
 * Returns the optional component a file belongs to, or null for core files.
 *
 * Convention:
 *   .agents/skills/{name}/**  → optional skill "{name}" (if not in CORE_SKILLS)
 *   .agents/agents/reviewers/{name}.md → optional reviewer "{name}"
 *   everything else           → core (null)
 */
export function getComponentForFile(relativePath) {
  const skillMatch = relativePath.match(
    /^\.agents\/skills\/([^/]+)(\/|$)/
  );
  if (skillMatch) {
    const name = skillMatch[1];
    if (!CORE_SKILLS.has(name)) {
      return { name, type: "skill" };
    }
    return null;
  }

  const reviewerMatch = relativePath.match(
    /^\.agents\/agents\/reviewers\/([^/]+)\.md$/
  );
  if (reviewerMatch) {
    return { name: reviewerMatch[1], type: "reviewer" };
  }

  return null;
}

/**
 * Returns all files from templates that belong to a specific optional component.
 */
export function getComponentFiles(templates, componentName, componentType) {
  const result = new Map();
  for (const [relativePath, content] of templates) {
    const component = getComponentForFile(relativePath);
    if (component && component.name === componentName && component.type === componentType) {
      result.set(relativePath, content);
    }
  }
  return result;
}

/**
 * Returns all files from templates that are NOT part of any optional component.
 */
export function getCoreFiles(templates) {
  const result = new Map();
  for (const [relativePath, content] of templates) {
    if (!getComponentForFile(relativePath)) {
      result.set(relativePath, content);
    }
  }
  return result;
}

/**
 * Scans the templates Map and returns an array of { name, type, description }
 * for every optional component found. Grouped by type (skill before reviewer).
 */
export function discoverOptionalComponents(templates) {
  const seen = new Map(); // encoded "type:name" key → { name, type }

  for (const relativePath of templates.keys()) {
    const component = getComponentForFile(relativePath);
    if (component) {
      const key = encodeComponentValue(component.type, component.name);
      if (!seen.has(key)) {
        seen.set(key, component);
      }
    }
  }

  const components = [];
  for (const component of seen.values()) {
    const description = getComponentDescription(templates, component.name, component.type);
    components.push({ ...component, description });
  }

  // Sort: skills first, then reviewers; alphabetically within each type
  components.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "skill" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return components;
}

/**
 * Extracts the description from a component's primary file frontmatter.
 * Falls back to the component name if unparseable.
 */
export function getComponentDescription(templates, componentName, componentType) {
  let primaryPath;
  if (componentType === "reviewer") {
    primaryPath = `.agents/agents/reviewers/${componentName}.md`;
  } else {
    primaryPath = `.agents/skills/${componentName}/SKILL.md`;
  }

  const content = templates.get(primaryPath);
  if (!content) return componentName;

  const match = content.match(/^description:\s*"?(.+?)"?\s*$/m);
  return match ? match[1] : componentName;
}

/**
 * Returns the selectedComponents object from the manifest, or falls back to
 * all discovered optional component names (grouped by type) for backward
 * compatibility when the field is absent.
 */
export function getSelectedComponents(manifest, templates) {
  if (manifest.selectedComponents) {
    return manifest.selectedComponents;
  }

  // Backward compat: treat as all selected
  const allComponents = discoverOptionalComponents(templates);
  const result = { skills: [], reviewers: [] };
  for (const { name, type } of allComponents) {
    if (type === "skill") {
      result.skills.push(name);
    } else {
      result.reviewers.push(name);
    }
  }
  return result;
}

/**
 * Encodes a component type+name into a single string value safe for use as a
 * multiselect option value.
 */
export function encodeComponentValue(type, name) {
  return `${type}:${name}`;
}

/**
 * Decodes a component value string back into { type, name }.
 * Uses indexOf to correctly handle names that contain colons.
 */
export function decodeComponentValue(value) {
  const colonIndex = value.indexOf(":");
  return {
    type: value.slice(0, colonIndex),
    name: value.slice(colonIndex + 1),
  };
}

/**
 * Builds the groupOptions object and allValues array for p.groupMultiselect
 * from a list of optional components.
 */
export function buildGroupOptions(optionalComponents) {
  const groupOptions = {};
  const allValues = [];
  for (const { name, type, description } of optionalComponents) {
    const groupLabel = type === "skill" ? "Skills" : "Reviewers";
    if (!groupOptions[groupLabel]) groupOptions[groupLabel] = [];
    const value = encodeComponentValue(type, name);
    groupOptions[groupLabel].push({ value, label: name, hint: description });
    allValues.push(value);
  }
  return { groupOptions, allValues };
}
