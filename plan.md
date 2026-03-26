# AI Browser Agent Extension - Implementation Plan

## 1. File Structure

Proposed structure based on the current webpack boilerplate:

```text
src/
  manifest.json
  popup.html
  sidepanel.html
  options.html
  css/
    popup.css
    sidepanel.css
    options.css
  js/
    background.js                 # orchestration + chrome API bridge
    popup.js                      # user input + quick actions
    sidepanel.js                  # main execution UI
    content/
      executor.js                 # execute DOM actions in page context
      observer.js                 # DOM snapshots + state collection
    core/
      planner.js                  # LLM prompt + plan parsing
      validator.js                # step validation logic
      replanner.js                # failure recovery
      memory.js                   # storage-backed memory
      schemas.js                  # JSON schema for plan/steps/results
      actionRegistry.js           # mapping action -> handler
    api/
      llmClient.js                # OpenAI/LLM request wrapper
      promptTemplates.js          # planner/validator prompts
    utils/
      selectors.js                # robust selector utilities
      logger.js                   # structured logs + debug toggles
      timing.js                   # delays/retries/timeouts
```

## 2. Code Structure

Main modules and responsibilities:

1. `UI Layer` (`popup.js`, `sidepanel.js`)
- Accept natural-language instruction.
- Display generated plan.
- Handle approval modes: all, per-step, edit, cancel.
- Stream run status (running/success/fail/replan).

2. `Orchestrator` (`background.js`)
- Single source of truth for run lifecycle.
- Runs state machine: `idle -> planning -> awaiting_approval -> executing -> validating -> done/failed`.
- Sends messages between UI and content scripts.

3. `Planner` (`core/planner.js`)
- Converts instruction + tab context to structured step list.
- Enforces strict schema (action, target, args, expected outcome).
- Adds safety constraints (domain checks, max step count).

4. `Executor` (`content/executor.js` + `core/actionRegistry.js`)
- Executes supported actions:
  - `navigate`, `click`, `type`, `scroll`, `wait`, `extract`, `screenshot`.
- Uses selector fallback strategy: CSS -> text match -> coordinate fallback.

5. `Validator` (`core/validator.js`)
- Verifies whether each step succeeded using DOM + optional screenshot reasoning.
- Produces `pass/fail + confidence + reason`.

6. `Replanner` (`core/replanner.js`)
- On failure, takes current state + history + error and generates revised steps.
- Re-enters approval flow when plan changes significantly.

7. `Memory` (`core/memory.js`)
- Stores reusable site patterns in `chrome.storage.local`:
  - successful selectors
  - failed selectors
  - domain-specific strategies

## 3. Algo

Execution algorithm (MVP):

```pseudo
input = user_instruction
tabContext = getActiveTabContext()

plan = planner.generate(input, tabContext, memoryHints)
ui.showPlan(plan)

approval = ui.getApproval()
if approval.cancelled: stop
if approval.editedPlan: plan = approval.editedPlan

for step in plan:
  result = executor.run(step)
  state = observer.capture()
  validation = validator.check(step, result, state)

  ui.updateStep(step, result, validation)

  if validation.failed:
    revisedPlan = replanner.replan(input, step, result, state, planHistory)
    ui.showReplan(revisedPlan)
    reapproval = ui.getApproval()
    if reapproval.cancelled: stop
    plan = mergeRemainingStepsWith(revisedPlan)
    continue

saveRunSummaryToMemory()
ui.showComplete()
```

Reliability rules:

1. Every action gets timeout + retry budget.
2. Every step logs pre-state and post-state.
3. Hard stop on risky actions unless explicit user confirmation.
4. Max replan depth to avoid infinite loops.

## 4. How To Research (If Needed)

Research checklist before implementation details are finalized:

1. Chrome extension APIs (must verify exact behavior)
- `chrome.sidePanel`
- `chrome.scripting.executeScript`
- `chrome.tabs`, `chrome.storage`, optional `chrome.webNavigation`

2. Planner/validator prompt quality
- Build a small prompt test set (10-20 tasks across 3-5 websites).
- Measure plan correctness and failure categories.

3. Robust element targeting
- Compare:
  - semantic text search
  - CSS selectors
  - XPath fallback
- Track success rate on dynamic pages.

4. Vision fallback feasibility
- Benchmark screenshot capture + LLM latency.
- Define threshold for when to switch from DOM to vision mode.

5. Safety and anti-abuse constraints
- Require explicit confirmation for sensitive actions (submit/payment/delete).
- Add allowlist/denylist policy per domain/action.

Suggested research workflow:

1. Create a spike branch per topic (API, selector strategy, vision).
2. Run controlled experiments and log metrics in `docs/research-notes.md`.
3. Convert findings into implementation constraints (timeouts, retry count, schema fields).
4. Lock MVP defaults and start build.

## 5. Delivery Phases

1. Phase 1 (MVP)
- Planner, approval UI, core executor actions, validation, basic replan.

2. Phase 2 (Hardening)
- Better selector robustness, memory improvements, detailed observability.

3. Phase 3 (V2)
- Multi-agent flow, session replay/export, iframe handling, voice input.
