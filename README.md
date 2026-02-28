# Praxis

![Praxis](assets/hero.png)

_From Greek: the process of putting ideas into practice._

A complete AI-assisted development workflow, packaged as portable agent skills and sub-agents. Praxis implements a structured development cycle — from idea to production code to documented learnings — designed to make each cycle of work improve the next. The name reflects what this workflow is about: not just thinking or just doing, but the disciplined cycle of idea → practice → reflection that makes each iteration better than the last.

This workflow mirrors how I personally develop software — brainstorm until the idea is clear, plan concretely before touching code, implement with discipline, review rigorously, and always look back to learn. Praxis encodes that process so AI agents can follow it consistently.

Inspired by [Every's Compound Engineering guide](https://every.to/guides/compound-engineering) and its core principle: **every unit of engineering work should make subsequent units easier, not harder.**

### Why Praxis?

**Project and technology agnostic.** Praxis is not tied to any language, framework, or tech stack. It works with any codebase — drop it into an Elixir project, a React app, a Rust CLI, or a Rails monolith. The skills describe _how to work_, not _what to work on_.

**Context window efficient.** Every design decision respects the limited context window of AI agents. Templates are loaded on demand through progressive disclosure, not upfront. Research runs in parallel sub-agents that return summaries instead of polluting the main thread. Shared conventions live in one file, referenced by many. The goal: spend tokens on the real work, not on infrastructure.

**Tool agnostic.** No dependency on a specific AI coding tool. Skills and agents use standard markdown with YAML frontmatter, compatible with [Amp](https://ampcode.com), [Claude Code](https://code.claude.com), and similar tools.

## The Cycle

```
brainstorming → planning → implementing → reviewing → retrospective
      ↑                                                      │
      └──────────────── learnings feed back ─────────────────┘
```

1. **Brainstorming** — Explore ideas through conversation. No code, no technical details. Output: idea files.
2. **Planning** — Turn an idea into concrete, actionable implementation plans. Parallel sub-agents research the codebase, past learnings, and external best practices. Output: plan files.
3. **Implementing** — Execute a plan step by step, committing meaningful units of work. Output: code on a feature branch.
4. **Reviewing** — Run configurable reviewer agents in parallel against the changed code. Findings are presented, not auto-fixed. Output: prioritized review findings.
5. **Retrospective** — Analyze completed work, capture specific learnings. Output: learning files that feed back into future brainstorming and planning sessions.

## Components

### Skills

Core skills implement the full development cycle and are always installed.

| Skill           | Description                                                                          |
| --------------- | ------------------------------------------------------------------------------------ |
| `brainstorming` | Explore ideas through open-ended conversation before any planning or implementation  |
| `planning`      | Turn a brainstormed idea into a concrete, phased implementation plan                 |
| `implementing`  | Execute a plan step by step, committing meaningful units of work                     |
| `reviewing`     | Run configurable reviewer agents in parallel; findings are presented, not auto-fixed |
| `retrospective` | Capture specific learnings from completed work to improve future cycles              |

Optional skills are project-specific. Select them during `praxis init` or change your selection anytime with `praxis components`.

| Skill           | Description                                                                              |
| --------------- | ---------------------------------------------------------------------------------------- |
| `agent-browser` | Browser automation via CLI — navigate pages, fill forms, extract data, and test web apps |
| `figma-to-code` | Fetch Figma designs via MCP and implement them as React components                       |
| `mobile-mcp`    | Automate iOS simulators and Android emulators for mobile app testing                     |

### Reviewers

All reviewers are optional. They run in parallel during the reviewing skill. Add project-specific ones or remove built-in ones by editing `.agents/agents/reviewers/`.

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

- An AI coding agent that supports skills/agents (e.g., [Amp](https://ampcode.com), [Claude Code](https://code.claude.com))
- [Git](https://git-scm.com/)
- [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) — fast text search
- [ast-grep](https://github.com/ast-grep/ast-grep) (`sg`) — structural/AST-aware code search (optional, recommended)
- [agent-browser](https://github.com/vercel-labs/agent-browser) — browser automation CLI (optional, required by `agent-browser` skill): `npm install -g agent-browser && agent-browser install`
- [mobile-mcp](https://github.com/mobile-next/mobile-mcp) prerequisites (optional, required by `mobile-mcp` skill): Node.js v22+, Xcode CLI tools (iOS), Android SDK Platform Tools (Android)

### Installation

The recommended way to install Praxis is via the CLI (requires Node.js 18+):

```bash
npx github:DFilipeS/praxis init
```

This creates the `.agents/` directory with all Praxis skills and agents, sets up `.ai-workflow/` directories, and writes a `.praxis-manifest.json` file to track installed files. Commit `.praxis-manifest.json` to version control so the CLI can detect changes on future updates.

To update to the latest version:

```bash
npx github:DFilipeS/praxis update
```

The update command fetches the latest files from the Praxis repo's main branch, applies changes, and prompts you before overwriting any files you've locally modified.

To check the status of managed files:

```bash
npx github:DFilipeS/praxis status
```

#### Manual installation

If you don't use Node.js, copy the `.agents/` directory into your project:

```bash
cp -r path/to/praxis/.agents your-project/.agents
```

Note that manual copies won't receive automatic updates.

### Usage

Invoke skills by name through your AI agent:

```
/skill brainstorming a better way to handle user onboarding
/skill planning .ai-workflow/ideas/20260222-user-onboarding.md
/skill implementing .ai-workflow/plans/20260222-user-onboarding-phase-1.md
/skill reviewing staged
/skill retrospective .ai-workflow/plans/20260222-user-onboarding-phase-1.md
```

## Project Structure

```
.agents/
├── conventions.md                        # Shared conventions (directories, naming, tags, statuses)
├── reviewer-output-format.md             # Shared output format for all reviewers
├── agents/
│   ├── codebase-explorer.md              # Explores the repo for relevant code
│   ├── knowledge-reviewer.md             # Searches past learnings
│   ├── external-researcher.md            # Searches the web for best practices
│   └── reviewers/                        # Add/remove reviewers to customize
│       ├── agent-accessibility.md
│       ├── architecture.md
│       ├── code-quality.md
│       ├── data-integrity.md
│       ├── pattern-recognition.md
│       ├── performance.md
│       ├── security.md                   # Includes OWASP Top 10:2025
│       └── simplicity.md
└── skills/
    ├── brainstorming/
    │   ├── SKILL.md
    │   └── reference/template.md         # Idea file template
    ├── planning/
    │   ├── SKILL.md
    │   └── reference/template.md         # Plan file template
    ├── implementing/
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
    ├── reviewing/
    │   └── SKILL.md
    └── retrospective/
        ├── SKILL.md
        └── reference/template.md         # Learning file template

.ai-workflow/                             # Created automatically during use
├── tags                                  # Shared tag registry
├── ideas/                                # Brainstormed ideas
├── plans/                                # Implementation plans
└── learnings/                            # Documented insights from retrospectives
```

## Customization

### Adding project-specific reviewers

Drop a `.md` file into `.agents/agents/reviewers/`. The reviewing skill discovers and runs all reviewers in that directory automatically. Follow the output format in `.agents/reviewer-output-format.md`.

Example: create `.agents/agents/reviewers/elixir-conventions.md` for Elixir-specific checks.

### Removing default reviewers

Delete any reviewer file you don't need. For example, remove `data-integrity.md` if your project doesn't use a database.

### Tags

All documents (ideas, plans, learnings) share a single tag registry at `.ai-workflow/tags`. Tags are maintained automatically — the skills read existing tags before assigning new ones to keep vocabulary consistent.

### Environment variables

Some skills require environment variables to connect to external services:

| Variable        | Required by     | Description                                                                                                                                                                     |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FIGMA_API_KEY` | `figma-to-code` | [Figma personal access token](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens) with read permissions on _File content_ and _Dev resources_ |

### File templates

Templates for ideas, plans, and learnings live in `reference/template.md` under each skill directory. Modify them to match your team's preferences.

## Design Principles

- **Compounding knowledge** — Retrospective learnings feed back into brainstorming and planning, so the system gets smarter with each cycle.
- **Traceability** — Every plan links to its idea, every learning links to its plan. Status fields track documents through the full lifecycle.
- **Configurability** — Reviewers are discoverable by convention. Add or remove them per project without changing any configuration.

## License

MIT
