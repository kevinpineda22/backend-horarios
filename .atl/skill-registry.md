# Skill Registry — backend-horarios

**Generated**: 2026-06-30
**Source**: user skills + project conventions

## User Skills

### ~/.claude/skills/

| Skill | Trigger |
|-------|---------|
| ai-sdk-5 | Vercel AI SDK 5 patterns — breaking changes from v4 |
| angular-architecture | Structuring Angular projects or deciding where to place components |
| angular-core | Creating Angular components, using signals, or setting up zoneless |
| angular-forms | Working with forms, validation, or form state in Angular |
| angular-performance | Optimizing Angular app performance, images, or lazy loading |
| branch-pr | Creating a pull request, opening a PR, or preparing changes for review |
| chained-pr | Splitting large changes into chained/stacked PRs > 400 lines |
| cognitive-doc-design | Writing guides, READMEs, RFCs, architecture docs, or review-facing docs |
| comment-writer | Drafting PR comments, review replies, or async collaboration messages |
| django-drf | Building REST APIs with Django — ViewSets, Serializers, Filters |
| github-pr | Creating PRs, writing PR descriptions, or using gh CLI |
| go-testing | Writing Go tests, using teatest, or adding test coverage |
| issue-creation | Creating a GitHub issue, reporting a bug, or requesting a feature |
| jira-epic | Creating epics for large features |
| jira-task | Creating Jira tasks, tickets, or issues |
| judgment-day | Adversarial review — "judgment day", "doble review", "juzgar" |
| nextjs-15 | Working with Next.js — routing, Server Actions, data fetching |
| playwright | Writing E2E tests — Page Objects, selectors |
| pytest | Writing Python tests — fixtures, mocking, markers |
| react-19 | Writing React components — no useMemo/useCallback needed |
| tailwind-4 | Styling with Tailwind — cn(), theme variables |
| typescript | Writing TypeScript code — types, interfaces, generics |
| work-unit-commits | Structuring commits as deliverable work units |
| zod-4 | Using Zod for validation — breaking changes from v3 |
| zustand-5 | Managing React state with Zustand |

### ~/.config/opencode/skills/

| Skill | Trigger |
|-------|---------|
| branch-pr | Creating a pull request, opening a PR, or preparing changes for review |
| chained-pr | Splitting large changes into chained/stacked PRs > 400 lines |
| cognitive-doc-design | Writing guides, READMEs, RFCs, architecture docs, or review-facing docs |
| comment-writer | Drafting PR comments, review replies, or async collaboration messages |
| go-testing | Writing Go tests, using teatest, or adding test coverage |
| issue-creation | Creating a GitHub issue, reporting a bug, or requesting a feature |
| judgment-day | Adversarial review — "judgment day", "doble review", "juzgar" |
| sdd-apply | Implementing code changes from task definitions |
| sdd-archive | Archiving completed change artifacts |
| sdd-design | Creating technical design from proposals |
| sdd-explore | Investigating codebase and thinking through ideas |
| sdd-init | Bootstrap SDD context and project configuration |
| sdd-onboard | Guided walkthrough of the SDD workflow |
| sdd-propose | Creating change proposals from explorations |
| sdd-spec | Writing detailed specifications from proposals |
| sdd-tasks | Breaking down specs and designs into implementation tasks |
| sdd-verify | Validating implementation against specs |
| skill-creator | Creating new AI agent skills |
| skill-registry | Creating or updating the skill registry |
| work-unit-commits | Structuring commits as deliverable work units |

### Project-level Skills

None found.

## Project Conventions

### AGENTS.md (project-level)
Not found at project root.

### AGENTS.md (opencode config)
- **Path**: `~/.config/opencode/AGENTS.md`
- **Persona**: Senior Architect, 15+ years, GDE & MVP
- **Style**: Passionate/direct, CAPS for emphasis, concepts over code
- **Rules**: Never build after changes, never add AI attribution, short answers by default, at most one question at a time
- **Language**: Match user's language (Rioplatense Spanish for Spanish, natural English for English)
- **Engram Protocol**: proactive save triggers, session close protocol, post-compaction recovery
- **Skill Loading**: check `<available_skills>` and load SKILL.md before responding

## Conventions Detected from Codebase

- **File naming**: kebab-case (.js), snake_case for DB
- **Imports**: ES modules (`import`/`export`)
- **Architecture**: Routes → Controllers → Services (layered)
- **DB access**: Supabase REST API via axios (supabaseAxios) + supabase-js for storage
- **Auth**: JWT Bearer tokens, Supabase JWT secret
- **Environment**: dotenv (.env)
- **Error handling**: try/catch with console.error logging
- **API prefix**: `/api/*`
