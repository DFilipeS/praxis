# Praxis

![Praxis](assets/hero.png)

_From Greek: the process of putting ideas into practice._

A complete AI-assisted development workflow, packaged as portable agent skills. Praxis implements a structured development cycle — from idea to production code to documented learnings — designed to make each cycle of work improve the next. The name reflects what this workflow is about: not just thinking or just doing, but the disciplined cycle of idea → practice → reflection that makes each iteration better than the last.

Inspired by [Every's Compound Engineering guide](https://every.to/guides/compound-engineering) and its core principle: **every unit of engineering work should make subsequent units easier, not harder.**

### Why Praxis?

**Project and technology agnostic.** Praxis is not tied to any language, framework, or tech stack. It works with any codebase — drop it into an Elixir project, a React app, a Rust CLI, or a Rails monolith. The skills describe _how to work_, not _what to work on_.

**Context window efficient.** Every design decision respects the limited context window of AI agents. Templates are loaded on demand through progressive disclosure, not upfront. Research prompts are embedded in skills and delegated to sub-agents that return summaries. Shared conventions live in one file, referenced by many. The goal: spend tokens on the real work, not on infrastructure.

**Tool agnostic.** No dependency on a specific AI coding tool. Skills use standard markdown with YAML frontmatter, compatible with [Amp](https://ampcode.com), [Claude Code](https://code.claude.com), [Cursor](https://cursor.com), [OpenCode](https://opencode.ai), and [40+ other tools](https://agentskills.io).

## The Cycle

```
px-brainstorm → px-plan → px-implement → px-review → px-retrospect
       ↑                                                   │
       └────────────────── learnings feed back ────────────┘
```

1. **px-brainstorm** — Explore ideas through conversation. No code, no technical details. Output: idea files.
2. **px-plan** — Turn an idea into concrete, actionable implementation plans. Inline research prompts gather codebase context, past learnings, and external best practices in parallel. Output: plan files.
3. **px-implement** — Execute a plan step by step, committing meaningful units of work. Output: code on a feature branch.
4. **px-review** — Run configurable reviewer agents in parallel against the changed code. Findings are presented, not auto-fixed. Output: prioritized review findings.
5. **px-retrospect** — Analyze completed work, capture specific learnings. Output: learning files that feed back into future brainstorming and planning sessions.

## Skills

Core skills implement the full development cycle.

| Skill           | Description                                                                          |
| --------------- | ------------------------------------------------------------------------------------ |
| `px-brainstorm` | Explore ideas through open-ended conversation before any planning or implementation  |
| `px-plan`       | Turn a brainstormed idea into a concrete, phased implementation plan                 |
| `px-implement`  | Execute a plan step by step, committing meaningful units of work                     |
| `px-review`     | Run configurable reviewer agents in parallel; findings are presented, not auto-fixed |
| `px-retrospect` | Capture specific learnings from completed work to improve future cycles              |

Optional skills are project-specific.

| Skill           | Description                                                                              |
| --------------- | ---------------------------------------------------------------------------------------- |
| `agent-browser` | Browser automation via CLI — navigate pages, fill forms, extract data, and test web apps |
| `figma-to-code` | Fetch Figma designs via MCP and implement them as React components                       |
| `mobile-mcp`    | Automate iOS simulators and Android emulators for mobile app testing                     |

## Reviewers

All reviewers are optional. They run in parallel during the px-review skill. Customize by adding or removing `.md` files in your project's `.praxis/reviewers/` directory.

| Reviewer              | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `agent-accessibility` | Ensures code stays readable and navigable for AI agents                         |
| `architecture`        | Checks for layer violations and design pattern consistency                      |
| `code-quality`        | Reviews for bugs, logic errors, and general correctness                         |
| `data-integrity`      | Flags unsafe migrations, missing constraints, and transaction risks             |
| `pattern-recognition` | Checks for deviations from established codebase patterns and naming conventions |
| `performance`         | Flags N+1 queries, unnecessary allocations, and performance anti-patterns       |
| `security`            | Reviews against OWASP Top 10 and other common vulnerabilities                   |
| `simplicity`          | Flags over-engineering and unnecessary complexity                               |

## Getting Started

### Prerequisites

- An AI coding agent that supports skills (e.g., [Amp](https://ampcode.com), [Claude Code](https://code.claude.com), [Cursor](https://cursor.com), [OpenCode](https://opencode.ai))
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) 18+ (for the setup CLI)

### Installation

Run the setup CLI in your project directory:

```bash
npx github:DFilipeS/praxis init
```

This will:
1. Copy all skills to `.agents/skills/`
2. Ask which additional coding agents to support and create symlinks (e.g., `.claude/skills/`, `.cursor/skills/`)
3. Copy shared conventions and reviewer output format to `.praxis/`
4. Copy default reviewers to `.praxis/reviewers/`
5. Create `.ai-workflow/` directories

#### Options

```bash
# Use a local source instead of GitHub
npx github:DFilipeS/praxis init --source ./path/to/praxis

# Skip interactive tool selection
npx github:DFilipeS/praxis init --no-tools
npx github:DFilipeS/praxis init --tools claude-code,cursor
npx github:DFilipeS/praxis init --all-tools
```

#### Alternative: npx skills

If you prefer, you can install skills using [npx skills](https://github.com/vercel-labs/skills) and only use the Praxis CLI for scaffolding:

```bash
npx skills add DFilipeS/praxis
npx github:DFilipeS/praxis init --no-tools
```

### Usage

Invoke skills by name through your AI agent:

```
/skill px-brainstorm a better way to handle user onboarding
/skill px-plan .ai-workflow/ideas/20260222-user-onboarding.md
/skill px-implement .ai-workflow/plans/20260222-user-onboarding-phase-1.md
/skill px-review staged
/skill px-retrospect .ai-workflow/plans/20260222-user-onboarding-phase-1.md
```

## Project Structure

```
praxis/
├── conventions.md                        # Shared conventions (directories, naming, tags, statuses)
├── reviewer-output-format.md             # Shared output format for all reviewers
├── bin/
│   └── praxis.js                         # Setup CLI
├── reviewers/                            # Add/remove reviewers to customize
│   ├── agent-accessibility.md
│   ├── architecture.md
│   ├── code-quality.md
│   ├── data-integrity.md
│   ├── pattern-recognition.md
│   ├── performance.md
│   ├── security.md                       # Includes OWASP Top 10:2025
│   └── simplicity.md
└── skills/
    ├── px-brainstorm/
    │   ├── SKILL.md
    │   └── reference/template.md         # Idea file template
    ├── px-plan/
    │   ├── SKILL.md
    │   └── reference/template.md         # Plan file template
    ├── px-implement/
    │   └── SKILL.md
    ├── agent-browser/
    │   ├── SKILL.md
    │   ├── references/                   # Deep-dive docs (commands, sessions, auth, etc.)
    │   └── templates/                    # Ready-to-use shell scripts
    ├── mobile-mcp/
    │   ├── SKILL.md
    │   └── mcp.json                      # Bundles @mobilenext/mobile-mcp
    ├── figma-to-code/
    │   ├── SKILL.md
    │   └── mcp.json                      # Bundles figma-developer-mcp
    ├── px-review/
    │   └── SKILL.md
    └── px-retrospect/
        ├── SKILL.md
        └── reference/template.md         # Learning file template

# Created by praxis init in your project:
.agents/skills/                            # Skills (source of truth)
.claude/skills/                            # Symlinks (if Claude Code selected)
.cursor/skills/                            # Symlinks (if Cursor selected)
.praxis/
├── conventions.md                         # Shared conventions
├── reviewer-output-format.md              # Reviewer output format
└── reviewers/                             # Customizable reviewers
.ai-workflow/                              # Created automatically during use
├── tags                                   # Shared tag registry
├── ideas/                                 # Brainstormed ideas
├── plans/                                 # Implementation plans
└── learnings/                             # Documented insights from retrospectives
```

## Customization

### Adding project-specific reviewers

Drop a `.md` file into `.praxis/reviewers/` in your project. The px-review skill discovers and runs all reviewers in that directory automatically. Follow the output format in `.praxis/reviewer-output-format.md`.

Example: create `.praxis/reviewers/elixir-conventions.md` for Elixir-specific checks.

### Removing default reviewers

Delete any reviewer file from `.praxis/reviewers/` you don't need.

### Tags

All documents (ideas, plans, learnings) share a single tag registry at `.ai-workflow/tags`. Tags are maintained automatically — the skills read existing tags before assigning new ones to keep vocabulary consistent.

### Environment variables

Some skills require environment variables to connect to external services:

| Variable        | Required by     | Description                                                                                                                                                                     |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FIGMA_API_KEY` | `figma-to-code` | [Figma personal access token](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens) with read permissions on _File content_ and _Dev resources_ |

## Design Principles

- **Compounding knowledge** — px-retrospect learnings feed back into px-brainstorm and px-plan, so the system gets smarter with each cycle.
- **Traceability** — Every plan links to its idea, every learning links to its plan. Status fields track documents through the full lifecycle.
- **Configurability** — Reviewers are discoverable by convention. Add or remove them per project without changing any configuration.
- **Skills-only** — No sub-agents, no tool-specific features. Everything is a standard markdown skill compatible with any agent that supports the Agent Skills specification.

## License

MIT
