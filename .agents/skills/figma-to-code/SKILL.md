---
name: figma-to-code
description: "Fetches Figma designs via MCP and implements them as React components. Use when asked to build, implement, or code a UI from a Figma link or design."
---

# Implementing Figma Designs

Translate Figma designs into React components by fetching design data through the Figma MCP server and generating production-ready code.

## Prerequisites

Set the `FIGMA_API_KEY` environment variable with a Figma personal access token before using this skill. The token needs read permissions on _File content_ and _Dev resources_.

## Workflow

### 1. Get the Figma link

Ask the user for a Figma link if one wasn't provided. Links can point to a file, frame, or group. Prefer links to specific frames or groups over full-file links — smaller selections produce better results.

### 2. Fetch design data

Call the `get_figma_data` tool with the Figma link. This returns simplified layout and styling metadata (not a screenshot). The data includes:

- Layer hierarchy and names
- Dimensions, positions, and spacing
- Colors, typography, and borders
- Component structure and variants

### 3. Understand the codebase

Before writing code, check the project for:

- **Component library** — look in common locations like `src/components/`, `src/ui/`, or `app/components/`
- **Styling approach** — identify whether the project uses CSS modules, Tailwind, styled-components, or another method
- **Existing patterns** — match naming conventions, file structure, and prop patterns already in use

### 4. Implement the components

Build the React components following these guidelines:

- **Reuse existing components.** If the design uses elements that already exist in the codebase (buttons, inputs, cards), use them instead of creating duplicates.
- **Match the styling approach.** Use whatever CSS/styling method the project already uses.
- **Use semantic HTML.** Choose appropriate elements (`nav`, `section`, `button`, `input`) over generic `div` wrappers.
- **Handle responsiveness.** If the design shows multiple breakpoints, implement them. If not, make reasonable responsive choices based on the layout.
- **Name things after their purpose, not their Figma layer names.** Figma layers like `Frame 427` should become meaningful component and class names like `ProductCard` or `pricing-section`.

### 5. Verify the result

After implementation:

- Check that the component renders without errors
- Verify the layout matches the design structure
- Confirm all design tokens (colors, spacing, typography) are correctly applied
- Run any existing linters or type checks

## Tips for better results

- **Work in sections.** If the design is complex, implement one section at a time rather than the whole page at once.
- **Ask about interactions.** Figma data is static — ask the user about hover states, animations, click handlers, and data fetching.
- **Clarify placeholder content.** Images and text in designs are often placeholders. Ask whether content is dynamic or static.
