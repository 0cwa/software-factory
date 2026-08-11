# Pi — Research Prompts v2
## Practical Learning Roadmap for Building a Personal AI Operating System on Top of Pi

This is a revised version of the original research prompt set.

The original file was ambitious and strategically rich, but too easy to approach as a large top-down architecture exercise. This v2 version is designed to produce faster learning, tighter feedback loops, and a much higher chance of yielding a real productivity system instead of an elegant but overbuilt meta-framework.

The core shift in v2 is:

- **Learn Pi as it actually works first**
- **Prototype core primitives before formalizing protocol theory**
- **Build only the few loops that can create immediate leverage**
- **Use theory to refine proven patterns, not replace them**

---

## North Star

Build a personal, local-first, CLI-native AI operating system on top of Pi that:

- compresses repeated workflows
- supports deterministic and agentic routing
- preserves context across sessions and projects
- compounds through reusable packages
- remains inspectable, reversible, and git-backed

The target is not maximal conceptual sophistication.
The target is **trustworthy compounding leverage**.

---

## The Rule of v2

Before inventing Pi-pe as a full protocol, prove these five things in real Pi prototypes:

1. **A deterministic router feels good to use**
2. **Handoff between focused sessions meaningfully reduces context loss**
3. **Subagents improve certain tasks without creating chaos**
4. **A lightweight knowledge layer is actually queried in daily work**
5. **Git-backed observability makes the system more trustworthy, not more annoying**

If these are not true in practice, do not expand the architecture.

---

# Learning Strategy

## Learn in 3 lanes at once

### Lane A — Pi Fluency
Understand Pi's real extension/runtime model.

### Lane B — Primitive Prototypes
Build tiny working systems for routing, handoff, knowledge, and evaluation.

### Lane C — Protocol Design
Only after A+B, formalize Pi-pe as a protocol.

---

# Recommended Execution Order

```
Stage 0 — Pi fluency and substrate mapping
Stage 1 — Core primitive prototypes
Stage 2 — Observability and trust primitives
Stage 3 — Minimal Pi-pe protocol draft
Stage 4 — Knowledge layer and Telos
Stage 5 — First real package: Pi-cx
Stage 6 — Meta-coder and personal data systems
Stage 7 — Only then: high-risk / high-complexity packages
```

This is intentionally different from the original ordering.

---

# Stage 0 — Pi Fluency and Substrate Mapping
*Do this before serious theory work. Your protocol should be grounded in Pi's native grammar.*

## Goal
Understand what Pi already gives you so you do not reinvent or fight the platform.

## Read these docs in full
- `docs/extensions.md`
- `docs/sdk.md`
- `docs/skills.md`
- `docs/packages.md`

## Study these examples closely
- `examples/extensions/input-transform.ts`
- `examples/extensions/event-bus.ts`
- `examples/extensions/plan-mode/index.ts`
- `examples/extensions/handoff.ts`
- `examples/extensions/dynamic-tools.ts`
- `examples/extensions/tools.ts`
- `examples/extensions/preset.ts`
- `examples/extensions/subagent/index.ts`

## Learn these Pi concepts
- `input` event
- `before_agent_start`
- `tool_call`
- `tool_result`
- `context`
- `setActiveTools()`
- `sendMessage()`
- `sendUserMessage()`
- `appendEntry()`
- session tree, branching, forking
- extension event bus: `pi.events`
- packages and resource discovery

## Deliverables
By the end of Stage 0 you should be able to explain, from memory:

1. What extensions can do vs skills vs prompts vs packages
2. How deterministic routing can be implemented in Pi today
3. How state survives restarts and branching
4. How a subagent can be implemented in Pi
5. Where a future Pi-pe layer should live without forking Pi itself

## Exit criteria
Do **not** move on until you can sketch a Pi-native architecture in one page.

---

## Prompt A1 — Map Pi as the Substrate

```
I want a deep but practical explanation of Pi (pi.dev) as a substrate for building a modular personal AI operating system.

Please explain Pi in terms of actual implementation affordances, not marketing:

1. What are the core runtime primitives Pi already gives me?
2. What belongs in extensions vs skills vs prompt templates vs packages?
3. Which hooks/events are the most important for deterministic routing, agentic routing, safety, context shaping, and orchestration?
4. How do session trees, branching, forking, compaction, and follow-up/steering messages change the design space compared to a simple chat agent?
5. What are the sharp edges or limitations of Pi if I try to build a workflow framework on top of it?

I want the answer framed as: “If you were building a layer-2 protocol on top of Pi, what would you treat as stable substrate, what would you wrap, and what would you avoid fighting?”
```

---

# Stage 1 — Core Primitive Prototypes
*Before protocol design, build the smallest systems that validate the core idea.*

## Goal
Prove that the central loops feel useful in real work.

## Build these 4 prototypes first

### Prototype 1 — Deterministic router
A small extension that:
- inspects raw input
- routes among `plan`, `execute`, `review`, `research`
- activates different tool sets
- injects route-specific instructions

### Prototype 2 — Handoff flow
A focused session transfer that:
- summarizes current branch
- opens a new session
- places a generated handoff prompt into the editor

### Prototype 3 — Subagent delegation
A bounded multi-agent setup with:
- planner
- executor
- reviewer

### Prototype 4 — Knowledge tool
A tiny note/knowledge tool that can:
- search notes
- read notes
- create/update notes
- create links between notes

## Required constraint
These must be useful before they are elegant.

## Exit criteria
Do not proceed until at least two of the four prototypes become part of your real workflow.

---

## Prompt B1 — Design the First Router

```
I am building a first practical routing layer on top of Pi.

I do not want a grand framework yet. I want the smallest Pi-native routing architecture that can support a personal workflow system.

Help me design a deterministic-first router extension with an agentic fallback.

Constraints:
- Pi-native: must use the extension/event/tool/session model Pi already supports
- local-first and inspectable
- route types should initially be: plan, execute, review, research
- deterministic routing should happen first when possible
- agentic routing should only be used when intent is ambiguous
- route selection should change tool availability, system instructions, and possibly hand off to a subagent

Please give me:
1. the architecture
2. the event hooks to use
3. the route state model
4. the failure modes
5. a minimal implementation plan

Keep it concrete and grounded in Pi, not generic agent theory.
```

---

## Prompt B2 — Handoff and Session Transfer

```
I want to design a Pi-native handoff system for transferring work from one focused session to another without relying entirely on compaction.

Please help me design a handoff flow that:
- extracts the relevant context from the current branch
- creates a new session
- generates a focused startup prompt for the new thread
- preserves traceability to the source session
- works well with git-backed development work

I want the answer grounded in Pi concepts like session branching, forking, custom commands, extension events, and prompt generation.

Please include:
1. what data should be transferred
2. what should be omitted
3. when to fork vs when to start a new session
4. how to preserve trust and inspectability
5. how this should evolve into a reusable package later
```

---

## Prompt B3 — Bounded Subagents on Top of Pi

```
I want to understand the best way to implement bounded, useful subagent behavior on top of Pi without turning the system into an uncontrollable swarm.

Please help me design a Pi-native subagent architecture for only three specialist roles:
- planner
- executor
- reviewer

I want to know:
1. when subagents are genuinely useful vs unnecessary complexity
2. how to keep context isolation strong
3. how to structure handoff between subagents
4. how deterministic routing should decide when to invoke them
5. what observability and review mechanisms are required so the system stays trustworthy

Frame the answer as an implementation strategy for a personal CLI workflow system, not as a generic multi-agent essay.
```

---

# Stage 2 — Observability, Evaluation, and Git Trust
*If the system is not inspectable, it will never become a trusted productivity layer.*

## Goal
Make the system trustworthy before making it more powerful.

## Build these primitives
- route/run log per meaningful operation
- git-backed checkpoints or commits for important writes
- a small `DECISIONS.md` pattern
- one trace format for “what input the node saw / what it emitted / why it routed there”

## What to avoid
- expensive benchmark theatre
- synthetic eval suites before real usage exists
- metrics that do not change decisions

## Exit criteria
You can inspect a run after the fact and answer:
- what happened
- why it happened
- what changed
- how to revert it

---

## Prompt C1 — Minimal Observability for Pi-pe

```
I am building a local-first workflow layer on top of Pi. Before expanding capabilities, I want a minimal but serious observability and trust model.

Help me design the smallest useful observability layer that supports:
- deterministic and agentic routing traces
- git-backed reviewability
- minimal token waste
- post-hoc debugging of runs
- a DECISIONS.md style institutional memory

Please answer concretely:
1. what events every run should emit
2. what should be stored in session state vs files vs git history
3. how to record route decisions without overwhelming the system
4. what a lightweight CLI trace format should look like
5. how to make agent writes reviewable and reversible by default

This should be for a single-developer local TypeScript/CLI system, not enterprise infrastructure.
```

---

# Stage 3 — Minimal Pi-pe Protocol Draft
*Only now formalize the protocol.*

## Goal
Write the smallest protocol that explains the systems you already proved useful.

## Scope of the first protocol draft
Define only:
- canonical node categories
- runtime contract shape
- data envelope
- package manifest/interface
- observability contract
- routing semantics

Do **not** overdesign:
- distributed execution
- universal graph semantics
- enterprise governance abstractions
- self-modification protocols

## Exit criteria
A package author can build a useful Pi-pe-compliant package from the protocol without talking to you.

---

## Prompt D1 — Minimal Pi-pe Protocol Spec

```
I am now ready to draft a minimal Pi-pe protocol on top of Pi.

This protocol should be informed by working prototypes I already built for:
- deterministic routing with an agentic fallback
- session handoff
- bounded subagents
- a small knowledge tool
- lightweight observability and git-backed review

I do NOT want a maximal future-proof architecture. I want the smallest protocol that captures what has already proven useful.

Help me define:
1. the canonical node categories
2. the minimal input/output contract every node must expose
3. the standard data envelope shape
4. the package registration/discovery model
5. how routing decisions are represented and observed
6. what belongs in core protocol vs optional packages

Be opinionated and biased toward simplicity.
```

---

# Stage 4 — Knowledge Layer and Telos
*Build the persistent substrate in parallel with the protocol, but start simple.*

## Goal
Create a knowledge layer that is useful immediately and can evolve later.

## Start with
- markdown notes
- git-backed storage
- a small query/update/link toolset
- conventions before databases

## Defer unless needed
- full graph runtime semantics
- complex ontology design
- large RAG infrastructure
- belief systems with no operational use

## Exit criteria
The knowledge layer is queried during real work and changes decisions.

---

## Prompt E1 — Minimal Knowledge Layer for Pi

```
I want to design the smallest useful knowledge layer for a personal AI operating system built on Pi.

I do not want to start with a grand knowledge graph. I want something I can use this month.

Constraints:
- markdown-based or similarly open/local-first
- git-backed
- easy for a Pi tool or extension to query and update
- supports note creation, linking, search, and retrieval of personal/project context
- can evolve later into a richer graph or RAG substrate if warranted

Please help me design:
1. the minimal file structure
2. the minimal API for read/search/create/update/link
3. how PARA and Zettelkasten should be treated initially: first-class structure or conventions on top
4. what metadata is actually worth storing from day one
5. how this can later become a retrieval layer for Pi-pe packages without overbuilding now
```

---

## Prompt E2 — Telos as an Operational Policy Layer

```
I want to design Telos as a real operational S5/policy component for a personal AI operating system on top of Pi.

I do not want a poetic mission statement. I want a queryable, updateable, runtime-consultable object.

Please help me define a minimal Telos component that includes:
- long-term priorities
- non-negotiables / guardrails
- decision principles
- veto conditions
- preferred tradeoffs
- a way to evolve over time with human review

Please answer concretely:
1. what fields it should have
2. what file/object format it should take initially
3. when pipelines or routes should consult it
4. how it should interact with the knowledge layer
5. what should remain human-controlled vs agent-updatable
```

---

# Stage 5 — First Real Package: Pi-cx
*Commissioning is likely the best first package because it has hard boundaries and immediate payoff.*

## Goal
Dogfood the protocol on a package that creates obvious leverage.

## Why Pi-cx first
It directly improves:
- project startup
- repo hygiene
- standardization
- folder scaffolding
- initial docs/spec generation
- git discipline

## Exit criteria
You use Pi-cx for real project creation more than once and prefer it to your manual process.

---

## Prompt F1 — Pi-cx as the First Dogfood Package

```
I am building Pi-cx as the first real package on top of my Pi-pe protocol.

Its purpose is project commissioning: removing the cold-start problem when a new project begins.

I want a practical package design, not a conceptual one. It should:
- intake a project description
- classify the project type
- load the right standards/templates
- scaffold folders/files
- generate an initial spec package
- initialize git conventions and first commit

Please help me design:
1. the commissioning pipeline end-to-end
2. which steps should be deterministic vs agentic
3. what standards should look like as reusable artifacts
4. how git should be integrated from day one
5. what the smallest lovable implementation looks like

Assume the protocol is still intentionally minimal and local-first.
```

---

# Stage 6 — Meta-Coder and Personal Data Systems
*Only after the protocol and first package are real should you add self-reference and richer data layers.*

## Goal
Expand carefully into systems that can compound, but also destabilize.

## Build in this order
1. Pi-pi only after Pi-cx and the protocol are stable
2. Pi-qs only after you know which personal data actually influences decisions

## Exit criteria
The new package reduces work instead of increasing maintenance burden.

---

## Prompt G1 — Pi-pi After Protocol Stabilization

```
I am considering Pi-pi, a package that generates or modifies other Pi-pe packages and pipelines.

I only want to design this now that:
- my minimal Pi-pe protocol exists
- at least one real package (Pi-cx) exists
- I understand the package boundaries and observability model

Please help me design Pi-pi conservatively.

I want answers to:
1. what problems Pi-pi should solve first
2. how it should discover existing components and avoid duplication
3. how to prevent unsafe self-modification or recursive breakage
4. where human review must be mandatory
5. what the smallest actually useful CLI surface would be

Bias strongly toward safety, reviewability, and incremental leverage.
```

---

## Prompt G2 — Pi-qs as a Data Layer, Not a Dashboard

```
I am designing Pi-qs as a personal quantified-self data layer for other Pi-pe packages to query.

I do not want a dashboard product. I want a local-first context substrate that can influence other workflows.

Please help me design a minimal first version that answers:
1. what data model is sufficient for longitudinal personal data
2. what storage format should be used initially for local-first + git compatibility
3. what context API other packages should query
4. what derived signals are genuinely useful early on
5. what should be deferred to later integrations

Bias toward a first version I can use manually from the CLI before automating device ingestion.
```

---

# Stage 7 — Deferred / High-Risk Systems
*Only pursue these when the base system is already delivering real value.*

## Hold until later
- information-theory-based routing heuristics
- full graph execution semantics
- complex epistemic belief updating systems
- voice-first control plane
- autonomous trading systems

These may all become valuable later, but they should not shape the first architecture more than proven workflows do.

---

## Prompt H1 — Evaluate Whether a Complex Idea Is Ready

```
I am considering adding a more advanced capability to my Pi-based personal AI system.

Before I do, I want you to evaluate whether this idea should be:
- built now as a core primitive
- built now as an optional package
- deferred until more real usage exists
- rejected as elegance without leverage

The idea is: [INSERT IDEA HERE]

Please evaluate it against:
1. immediate user leverage
2. architectural cost
3. maintenance burden
4. observability/trust implications
5. whether simpler existing Pi-native patterns already solve most of the problem

I want an honest recommendation, not encouragement.
```

---

# Practical Reordering of the Original Topics

## Move earlier
- Pi substrate mapping
- routing
- handoff
- subagents
- observability
- commissioning

## Move later
- VSM formalization
- 20 agentic pattern mapping
- information theory routing
- knowledge graph formalization
- Telos/epistemics beyond a minimal operational version
- voice integration
- meta-coder
- quantified self automation
- trading

---

# What Success Looks Like

After completing the early stages, you should have:

## A real workflow loop that feels better than manual work
Such as:
- new project commissioning
- plan → execute → review cycle
- session handoff with retained context
- knowledge retrieval during work

## A system you trust
Meaning:
- route decisions are inspectable
- writes are reviewable
- failures are understandable
- changes are reversible

## A protocol that emerged from proof
Not one invented in a vacuum.

---

# Anti-Goals

Do not let this become:
- a philosophy thesis with no runtime consequences
- a graph system in search of a problem
- a self-modifying architecture before stable package boundaries exist
- a benchmark suite disconnected from real work
- a second-brain project that never influences action

---

# One-Sentence Principle

**Build the smallest Pi-native system that repeatedly saves you time in real work, then let the protocol crystallize around that.**

---

# Suggested Next Action

Start with Stage 0 and Stage 1 only.

Specifically:
1. map Pi as substrate
2. build the first deterministic router
3. build handoff
4. test subagents only where they clearly help
5. delay grand protocol formalization until after those feel real
