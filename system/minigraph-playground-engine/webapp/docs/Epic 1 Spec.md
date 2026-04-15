# Epic 1 Spec - Graph View Visual Authoring

Status: Draft for manager review  
Date: April 15, 2026  
Area: `system/minigraph-playground-engine/webapp`

## 1. Summary

Epic 1 adds visual graph authoring to Minigraph Playground. Users should be able to create nodes, edit nodes, delete nodes, and connect nodes from the Graph tab instead of typing every Minigraph command manually.

The implementation should stay command-driven. The frontend should collect temporary UI input, generate existing Minigraph commands, send those commands through the current WebSocket flow, and refresh from the backend graph model after mutation.

## 2. Problem Statement

Today the Graph tab is mostly a read-only visualization of the backend graph model. Users can inspect graph structure visually, but authoring still happens through text commands in the console.

This creates friction for common workflows:

| Workflow | Current behavior | Problem |
| --- | --- | --- |
| Create node | User manually types `create node ...`. | Requires command grammar knowledge. |
| Edit node | User manually types `update node ...`. | Hard to edit properties from the visual graph. |
| Delete node | User manually types delete command if supported. | Risky and disconnected from the selected node. |
| Connect nodes | User manually types `connect source to target with relation`. | Visual graph already shows nodes, but cannot use them as interaction targets. |

Epic 1 should make these actions available from GraphView while preserving the backend as the source of truth.

## 3. Goals

| Goal | Description |
| --- | --- |
| Visual node creation | User can right-click empty graph canvas, open a create-node dialog, submit, and see the graph refresh. |
| Visual node editing | User can right-click a node, open an edit-node dialog prefilled from current graph data, submit, and see the graph refresh. |
| Visual node deletion | User can right-click a node, choose delete, confirm inline, submit, and see the graph refresh. |
| Visual edge creation | User can drag/connect from one node to another, choose a relation type, submit, and see the graph refresh. |
| Shared UI primitives | Modal shell, context menu, and popover behavior should be reusable instead of duplicated per feature. |
| Command-driven implementation | UI actions generate Minigraph commands and reuse the existing WebSocket/protocol refresh pipeline. |
| Architecture cleanup before choreography | Reduce pressure on `GraphView.tsx` and avoid turning it into a god component. |

## 4. Non-Goals For First Release

| Non-goal | Reason |
| --- | --- |
| Persistent frontend graph store | The backend graph model remains canonical. Frontend state should only hold temporary UI workflow state. |
| Optimistic graph mutation | The first release should wait for backend mutation and refresh before changing canonical graph data. |
| Saved visual coordinates | Current graph layout is derived in the frontend. Canvas click position may not persist after refresh unless backend support is added later. |
| Replacing the console | Text commands remain supported and useful for advanced users. |
| Neo4j or durable graph persistence | Epic 1 is about UI authoring over the current Minigraph backend session, not changing storage architecture. |
| Full edge management | Edge creation is in scope. Edge edit/delete can be separate backlog unless explicitly included. |

## 5. Current Architecture

The current app already has most of the infrastructure needed for command-driven visual authoring.

| Area | Current code | Current role |
| --- | --- | --- |
| Page orchestration | `src/components/Playground.tsx` | Owns WebSocket hook, graph state hook, toast hook, protocol bus, right panel composition, clipboard integration. |
| WebSocket commands | `src/hooks/useWebSocket.ts` | Sends user commands and stores console messages/history. |
| Protocol classification | `src/protocol/useProtocolKernel.ts` and `src/protocol/bus.ts` | Converts raw backend messages into typed protocol events. |
| Auto graph refresh | `src/hooks/useAutoGraphRefresh.ts` | Listens for graph mutations, sends `describe graph`, and updates the pinned graph path. |
| Graph fetching | `src/hooks/useGraphData.ts` | Fetches graph JSON from the pinned API path and stores `graphData`. |
| Graph rendering | `src/components/GraphView/GraphView.tsx` | Transforms `graphData` into React Flow state, renders graph, owns current context menu state. |
| Graph transformation | `src/utils/graphTransformer.ts` | Converts Minigraph nodes/connections into React Flow nodes/edges. |
| Node rendering | `src/components/GraphView/NodeTypes.tsx` | Renders visual node content, properties, and React Flow handles. |
| Existing command builder | `src/clipboard/commandBuilder.ts` | Builds create/update node commands and connect commands for clipboard workflows. |

Current flow:

```text
User types command
        |
        v
useWebSocket sends command over WebSocket
        |
        v
Backend mutates session graph
        |
        v
ProtocolBus emits graph.mutation / graph.link
        |
        v
useAutoGraphRefresh sends describe graph
        |
        v
useGraphData fetches graph JSON
        |
        v
GraphView re-renders from graphData
```

Epic 1 should reuse this flow. The only new part should be visual UI that produces the command.

## 6. Target Architecture

Target flow:

```text
User performs visual action in GraphView
        |
        v
Temporary UI state captures intent
context menu, modal draft, delete confirm, connection popover
        |
        v
Graph command action layer validates and builds command
        |
        v
Playground sends command through existing WebSocket path
        |
        v
Backend mutates graph session
        |
        v
Existing auto-refresh reloads graphData
        |
        v
GraphView re-renders from backend graph model
```

The main boundary:

| Layer | Should do | Should not do |
| --- | --- | --- |
| `GraphView` | Render graph, capture gestures, show context menu/popover, emit typed UI events upward. | Send WebSocket commands, show global toasts, mutate canonical graph data. |
| Dialogs/popovers | Own draft form state and local validation display. | Know backend transport details. |
| Command action layer | Validate action input and build command strings. | Render UI or call WebSocket directly. |
| `Playground` or graph authoring controller | Receive graph actions, send commands, coordinate toasts and refresh behavior. | Duplicate command string templates inside UI components. |
| Backend | Own actual graph mutation and graph model response. | Depend on frontend React Flow state. |

## 7. Feature Requirements

### 7.1 Shared Modal Shell

Requirement:

Create a reusable modal shell component for create/edit node workflows.

Expected behavior:

| Behavior | Requirement |
| --- | --- |
| Open/close | Modal opens from parent state and closes on cancel, successful submit, or Escape. |
| Layout | Shell provides title, body, footer/action area, and close button. |
| Accessibility | Uses dialog semantics, focus behavior, and keyboard close behavior. |
| Styling | Uses CSS Modules. No CSS-in-JS except dynamic coordinates if unavoidable. |
| Reuse | Create and Edit node dialogs should use the same shell. |

Implementation expectation:

| Area | Expected change |
| --- | --- |
| New component | `src/components/ModalShell/ModalShell.tsx` or equivalent. |
| New styles | `src/components/ModalShell/ModalShell.module.css`. |
| Tests | Basic render and close behavior if test infrastructure exists. |

### 7.2 Extend GraphView Context Menu

Requirement:

Extract current context menu logic so GraphView can support more than "Clip to Clipboard".

Current behavior:

| Trigger | Current result |
| --- | --- |
| Right-click node | Opens inline menu with "Clip to Clipboard". |
| Right-click empty canvas | No create menu. |
| Right-click edge | No action. |

Target behavior:

| Trigger | Target result |
| --- | --- |
| Right-click node | Opens node context menu with Edit, Delete, Clip to Clipboard, and future extension points. |
| Right-click empty canvas | Opens canvas context menu with Create Node. |
| Escape or outside click | Closes context menu. |
| Action click | Closes menu or transitions into the next UI state. |

Expected context menu state:

| Field | Purpose |
| --- | --- |
| `targetType` | `node`, `canvas`, or future `edge`. |
| `screenPosition` | Fixed menu position in viewport coordinates. |
| `nodeAlias` | Present for node menus. |
| `flowPosition` | Optional projected canvas position for future position persistence. |
| `confirmingAction` | Supports inline delete confirmation. |

Implementation expectation:

| Area | Expected change |
| --- | --- |
| Extract component | `GraphContextMenu.tsx` or equivalent. |
| Extract hook | `useGraphContextMenu.ts` if state transitions become non-trivial. |
| GraphView props | Add callbacks such as `onCreateNodeRequest`, `onEditNodeRequest`, `onDeleteNodeRequest`. |

### 7.3 Create Node Dialog

Requirement:

User can create a node through the visual graph.

User flow:

```text
Right-click empty canvas
        |
        v
Select "Create Node"
        |
        v
Create Node modal opens
        |
        v
User enters alias, type, and properties
        |
        v
Submit
        |
        v
Frontend builds create-node command
        |
        v
Playground sends command and graph refreshes
```

Form fields:

| Field | Requirement |
| --- | --- |
| Alias | Required. Must not duplicate an existing node alias in current `graphData`. |
| Type | Select/dropdown. Initial list can use known node types already rendered by `NodeTypes.tsx`, but backend source should be clarified. |
| Properties | Key-value builder. Initial v1 can support string values first unless product requires JSON values. |

Validation:

| Case | Expected behavior |
| --- | --- |
| Empty alias | Block submit and show local validation error. |
| Duplicate alias | Block submit based on current `graphData`. |
| Empty property key | Block submit or remove empty row before command generation. |
| Empty property value | Clarify if allowed. Existing command builder serializes null/undefined to empty string. |
| Disconnected WebSocket | Disable submit or show connection error before send. |

Command output:

```text
create node foo
with type Fetcher
with properties
skill[]=demo
description[]=Demo node
```

### 7.4 Edit Node Dialog

Requirement:

User can edit an existing node from the node context menu.

User flow:

```text
Right-click node
        |
        v
Select "Edit Node"
        |
        v
Edit Node modal opens with current node data
        |
        v
User changes type/properties
        |
        v
Submit
        |
        v
Frontend builds update-node command
        |
        v
Playground sends command and graph refreshes
```

Prefill source:

| Data | Source |
| --- | --- |
| Alias | Current `graphData.nodes[].alias`. |
| Type | First value from current `graphData.nodes[].types`. |
| Properties | Current `graphData.nodes[].properties`. |

Open decision:

| Decision | Recommendation |
| --- | --- |
| Can alias be edited? | Keep alias read-only in v1 unless backend rename semantics are confirmed. |

Reason:

Connections reference node aliases. Renaming a node may require relationship rewiring, not just a normal update.

Command output:

```text
update node foo
with type Fetcher
with properties
skill[]=updated-demo
description[]=Updated node
```

### 7.5 Delete Node

Requirement:

User can delete a node from the node context menu with inline confirmation.

User flow:

```text
Right-click node
        |
        v
Select "Delete Node"
        |
        v
Menu changes to confirm state
        |
        v
User confirms
        |
        v
Frontend builds delete-node command
        |
        v
Playground sends command and graph refreshes
```

Expected behavior:

| Case | Expected behavior |
| --- | --- |
| Initial delete click | Does not immediately delete. Shows confirm/cancel state. |
| Confirm | Sends delete command. |
| Cancel | Returns to normal menu or closes menu. |
| Escape/outside click | Cancels confirmation and closes menu. |
| Disconnected WebSocket | Delete action is disabled. |

Open decision:

| Decision | Why it matters |
| --- | --- |
| Exact backend delete grammar | The command builder should not guess. Confirm whether syntax is `delete node alias`, `remove node alias`, or another command. |
| Relationship cleanup behavior | UI copy should warn if deleting also removes connected relationships, or if backend blocks deletion with active edges. |

### 7.6 Visual Edge Creation

Requirement:

User can visually connect two nodes and choose a relation type.

User flow:

```text
Drag from source node handle to target node
        |
        v
React Flow emits connection intent
        |
        v
Relation type popover opens near connection target
        |
        v
User enters or selects relation type
        |
        v
Submit
        |
        v
Frontend builds connect command
        |
        v
Playground sends command and graph refreshes
```

Expected behavior:

| Case | Expected behavior |
| --- | --- |
| Valid source and target | Show relation popover. |
| Missing source or target | Cancel connection. |
| Empty relation type | Block submit. |
| Cancel/Escape | Close popover and do not send command. |
| Duplicate relation | Clarify whether to block client-side or allow backend to decide. |
| Self-connection | Clarify whether allowed. If not, block client-side. |
| Disconnected WebSocket | Disable connection interactions or block submit. |

Command output:

```text
connect root to foo with next
```

Implementation note:

React Flow should be used for interaction capture, not as the source of truth. After a successful command, the edge should appear only after backend mutation and graph refresh.

## 8. Command Action Layer

Current command generation lives in `src/clipboard/commandBuilder.ts`. It is currently named for clipboard usage, but it already provides useful command serialization.

Current functions:

| Function | Current purpose |
| --- | --- |
| `buildNodeCommand('create', node)` | Builds create-node command text. |
| `buildNodeCommand('update', node)` | Builds update-node command text. |
| `buildConnectCommand(source, target, relationType)` | Builds connect command text. |

Epic 1 should introduce a graph command action layer so UI components do not build command strings directly.

Recommended type shape:

```ts
export type GraphCommandAction =
  | { type: 'create-node'; node: MinigraphNode }
  | { type: 'update-node'; node: MinigraphNode }
  | { type: 'delete-node'; alias: string }
  | { type: 'connect-nodes'; source: string; target: string; relationType: string };

export type GraphCommandResult =
  | { ok: true; command: string }
  | { ok: false; code: string; message: string };
```

Recommended behavior:

| Action | Validation |
| --- | --- |
| Create node | Alias required, no duplicate alias, type valid if list is known. |
| Update node | Alias exists, type valid if list is known. |
| Delete node | Alias exists, delete grammar confirmed. |
| Connect nodes | Source exists, target exists, relation type required. |

Potential file location:

| Option | Tradeoff |
| --- | --- |
| Keep under `src/clipboard/commandBuilder.ts` | Smallest diff, but name is misleading for graph authoring. |
| Move to `src/graphActions/commandBuilder.ts` | Clearer ownership, requires updating clipboard imports. |
| Add wrapper under `src/graphActions` that reuses clipboard builder | Good transition path with low risk. |

Recommendation:

Add `src/graphActions/commandBuilder.ts` or `src/graphActions/buildGraphCommand.ts` and keep clipboard usage working through imports or wrappers. This makes Epic 1 commands a first-class concept instead of a clipboard side effect.

## 9. State Ownership

| State | Owner | Reason |
| --- | --- | --- |
| `graphData` | `useGraphData` in `Playground` | It is the fetched backend graph snapshot. |
| React Flow nodes/edges | `GraphView` | They are derived presentation state. |
| Context menu position/target | `GraphView` or `useGraphContextMenu` | It is local interaction state. |
| Create/edit modal open state | `Playground` or graph authoring controller hook | Submit needs command send and toast orchestration. |
| Create/edit form draft | Dialog component or dialog hook | Draft is temporary and should be discarded on close. |
| Delete confirm phase | Context menu component or hook | Confirmation is temporary UI state. |
| Pending edge connection | `GraphView` or `useVisualConnection` | Comes from React Flow gesture state. |
| WebSocket send | `Playground` through `useWebSocket` | Existing architecture keeps transport orchestration there. |
| Toasts | Current toast system | UI feedback should stay centralized. |

Key rule:

Do not mutate `graphData` directly for create/edit/delete/connect. Send a command, then refresh from the backend.

## 10. Component and File Plan

Proposed new or changed files:

| File | Purpose |
| --- | --- |
| `src/components/GraphView/GraphView.tsx` | Keep rendering and React Flow event capture. Remove inline menu complexity over time. |
| `src/components/GraphView/GraphContextMenu.tsx` | Render node/canvas menu actions and delete confirmation. |
| `src/components/GraphView/useGraphContextMenu.ts` | Own context menu state transitions if needed. |
| `src/components/ModalShell/ModalShell.tsx` | Shared modal frame for create/edit workflows. |
| `src/components/ModalShell/ModalShell.module.css` | Modal shell styling. |
| `src/components/NodeDialog/NodeDialog.tsx` | Shared create/edit node form. |
| `src/components/NodeDialog/NodeDialog.module.css` | Node dialog styling. |
| `src/components/GraphView/RelationPopover.tsx` | Relation type popover for visual edge creation. |
| `src/graphActions/buildGraphCommand.ts` | Validates graph actions and returns command strings. |
| `src/graphActions/buildGraphCommand.test.ts` | Unit tests for command generation and validation. |

Potential controller hook:

| File | Purpose |
| --- | --- |
| `src/hooks/useGraphAuthoring.ts` | Coordinates modal state, selected node, command building, WebSocket send, and toasts. |

This hook is optional, but it may keep `Playground.tsx` from growing more temporal complexity.

## 11. Acceptance Criteria

### Create Node

| Scenario | Expected result |
| --- | --- |
| User right-clicks empty canvas | Context menu shows Create Node. |
| User submits valid node | Command is sent through WebSocket, graph refresh starts, new node appears after refresh. |
| User submits duplicate alias | Submit is blocked with validation message. |
| User cancels modal | No command is sent. |

### Edit Node

| Scenario | Expected result |
| --- | --- |
| User right-clicks node | Context menu shows Edit Node. |
| User opens edit | Modal is prefilled from current `graphData`. |
| User submits valid update | Update command is sent, graph refreshes, changed properties appear after refresh. |
| User cancels modal | No command is sent. |

### Delete Node

| Scenario | Expected result |
| --- | --- |
| User clicks Delete Node | Menu changes to confirm state. |
| User confirms | Delete command is sent and graph refreshes. |
| User cancels or presses Escape | No command is sent. |

### Connect Nodes

| Scenario | Expected result |
| --- | --- |
| User connects source to target | Relation popover opens. |
| User submits relation | Connect command is sent and graph refreshes. |
| User cancels popover | No command is sent. |
| Relation is empty | Submit is blocked. |

### Architecture

| Requirement | Expected result |
| --- | --- |
| GraphView transport boundary | No direct WebSocket send inside `GraphView.tsx`. |
| Command generation | No ad hoc command strings inside UI components. |
| Styling | New visual components use CSS Modules. |
| Source of truth | Graph re-renders from refreshed backend `graphData`. |

## 12. Implementation Order

| Step | Work | Reason |
| --- | --- | --- |
| 1 | Extract GraphView context menu state/component with no behavior change. | Safe architecture cleanup before adding actions. |
| 2 | Add graph command action layer and tests. | Prevents command string duplication. |
| 3 | Add shared modal shell. | Required by create/edit workflows. |
| 4 | Add create/edit node dialog UI without backend send. | Lets form behavior be reviewed independently. |
| 5 | Wire create node from canvas context menu. | First complete visual mutation path. |
| 6 | Wire edit node from node context menu. | Reuses dialog and command action layer. |
| 7 | Wire delete node with inline confirmation. | Adds destructive action after menu pattern is stable. |
| 8 | Add visual edge creation and relation popover. | Most complex interaction, should be last. |

## 13. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `GraphView.tsx` becomes too large | Harder to reason about event flow and state transitions. | Extract context menu, relation popover, and authoring hooks early. |
| Frontend becomes a second graph store | State divergence from backend graph model. | Keep visual actions command-driven and refresh after backend mutation. |
| Backend command grammar is assumed incorrectly | UI sends invalid commands. | Confirm delete grammar and command variants before implementation. |
| Property editor scope expands | Create/edit dialog becomes too complex. | Start with strings and arrays if sufficient; explicitly defer JSON object editing if needed. |
| Visual edge creation has too much choreography | Bugs around drag state, popover placement, and cancellation. | Implement after simpler node actions are stable. |
| Error handling is unclear | Modal may close even when command fails. | Decide whether command failures should keep modal open in v1. |

## 14. Open Questions For Review

| Question | Recommended default |
| --- | --- |
| Should Edit allow alias rename? | No for v1. Keep alias read-only until rename semantics are confirmed. |
| Where should node type options come from? | Start with existing known visual types, but confirm if backend can expose supported types. |
| Which property value types are required? | Start with string values, then add arrays/multiline if required by existing graph examples. |
| What is the official delete command syntax? | Confirm with backend before adding command builder support. |
| Does delete remove connected relationships? | Confirm backend behavior and show appropriate confirmation copy. |
| Should canvas create preserve click position? | No for v1 unless backend supports persisted coordinates. |
| Should duplicate edges be blocked client-side? | Prefer client-side warning if exact source-target-relation already exists. |
| Should self-connections be allowed? | Block by default unless a valid use case exists. |
| Should failed command submit keep modal open? | Prefer keeping modal open if failure can be associated with the active workflow. |

## 15. Draft PR Plan

| PR | Scope | Validation |
| --- | --- | --- |
| PR 1 | Extract context menu component/hook, keep Clip to Clipboard working. | Manual test existing node context menu. |
| PR 2 | Add graph command action layer and tests. | Unit tests for create/update/connect/delete command generation. |
| PR 3 | Add modal shell component. | Manual test open/close, Escape, CSS Modules styling. |
| PR 4 | Add NodeDialog UI. | Manual test create/edit draft state and validation. |
| PR 5 | Wire create/edit/delete commands. | Manual test backend mutation and graph refresh. |
| PR 6 | Add visual edge creation. | Manual test connect/cancel/submit and graph refresh. |

## 16. Recommendation

Epic 1 is feasible without changing the backend architecture if we keep the implementation command-driven.

The main technical requirement is not a large frontend graph store. The main requirement is separation of responsibilities:

| Responsibility | Owner |
| --- | --- |
| Render graph and capture visual interactions | `GraphView` |
| Hold temporary dialog/menu/popover state | Extracted UI components or authoring hooks |
| Validate and build Minigraph commands | Graph command action layer |
| Send commands and coordinate refresh/toasts | `Playground` or a controller hook using existing hooks |
| Persist and return canonical graph model | Backend Minigraph session |

This approach gives users visual authoring while preserving the current app model: commands mutate the backend, and the frontend renders the refreshed graph.
