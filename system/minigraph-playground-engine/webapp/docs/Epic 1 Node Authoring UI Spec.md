# Epic 1 Spec: Create Node UI And Command Architecture

Status: Draft
Scope: architecture plan for the Create Node UI foundation and the first right-click Create Node command flow.

This spec intentionally keeps UI interaction, authoring workflow state, and backend command execution separate. Right-click context-menu actions should not build or send backend commands directly. They should call authoring callbacks, and the centralized graph command layer should build and send the backend command.

---

## 1. New Files

| File | Type | Purpose |
|---|---|---|
| `src/components/ModalShell/ModalShell.tsx` | Component | Shared modal layout for graph authoring dialogs. |
| `src/components/ModalShell/ModalShell.module.css` | CSS Module | Modal shell styling: backdrop, panel, header, body, footer, actions. |
| `src/components/GraphView/useGraphContextMenu.ts` | Hook | Owns temporary context-menu state for node and canvas right-clicks. |
| `src/components/GraphView/GraphContextMenu.tsx` | Component | Renders graph context-menu actions based on the current target. |
| `src/components/GraphAuthoring/useGraphAuthoring.ts` | Hook | Owns graph authoring workflow state, including the active create dialog. |
| `src/components/GraphAuthoring/GraphAuthoringModals.tsx` | Component | Renders the active graph authoring modal, starting with Create Node. |
| `src/components/NodeDialog/NodeDialog.tsx` | Component | Create node form with alias, type dropdown, and property key-value builder. |
| `src/components/NodeDialog/NodeDialog.module.css` | CSS Module | Node dialog form styling. |
| `src/graphActions/graphCommand.ts` | Utility | Centralized graph command layer for UI-originated graph actions. Builds backend command strings for create/edit/delete/connect. |
| `src/graphActions/useGraphCommandExecutor.ts` | Hook | Centralized command execution boundary. Guards websocket state, sends graph commands, and owns command-level toast feedback. |

---

## 2. Existing Files To Modify

| File | Required modification |
|---|---|
| `src/components/GraphView/GraphView.tsx` | Remove inline context-menu state/rendering. Use `useGraphContextMenu`. Render `GraphContextMenu`. Wire ReactFlow node and canvas context-menu events. |
| `src/components/GraphView/GraphView.module.css` | Keep existing context-menu classes or add menu-specific classes used by `GraphContextMenu`. If the menu grows further, split these styles into `GraphContextMenu.module.css`. |
| `src/components/RightPanel/RightPanel.tsx` | Add `onCreateNode?: () => void` prop and pass it into `GraphView`. |
| `src/components/Playground.tsx` | Wire `useGraphCommandExecutor` and `useGraphAuthoring`. Pass authoring callbacks through `RightPanel`. Render `GraphAuthoringModals`. Do not own create/edit/delete submit handlers inline. |
| `src/clipboard/commandBuilder.ts` | Remains the low-level formatter for node and connect command text. `graphCommand.ts` may delegate to it instead of duplicating formatting. |

---

## 3. New Hooks, Components, Functions, Props, And State

### 3.1 New Components

| Component | File | Responsibility |
|---|---|---|
| `ModalShell` | `src/components/ModalShell/ModalShell.tsx` | Provides a consistent modal frame, close behavior, title area, body area, and footer actions. |
| `GraphContextMenu` | `src/components/GraphView/GraphContextMenu.tsx` | Displays available actions for either a canvas target or a node target. |
| `GraphAuthoringModals` | `src/components/GraphAuthoring/GraphAuthoringModals.tsx` | Renders the active authoring modal based on `useGraphAuthoring` state. |
| `NodeDialog` | `src/components/NodeDialog/NodeDialog.tsx` | Owns the Create Node form fields and emits a validated node draft on submit. |

### 3.2 New Hook

| Hook | File | Responsibility |
|---|---|---|
| `useGraphContextMenu` | `src/components/GraphView/useGraphContextMenu.ts` | Owns context-menu state, open/close handlers, and dismissal behavior. |
| `useGraphAuthoring` | `src/components/GraphAuthoring/useGraphAuthoring.ts` | Owns graph authoring workflow state and exposes callbacks used by context menus and dialogs. |
| `useGraphCommandExecutor` | `src/graphActions/useGraphCommandExecutor.ts` | Owns the WebSocket command send boundary for graph actions. |

### 3.3 New Functions

| Function | Owner | Purpose |
|---|---|---|
| `openNodeMenu(event, nodeAlias)` | `useGraphContextMenu` | Opens the context menu for a specific graph node. |
| `openCanvasMenu(event)` | `useGraphContextMenu` | Opens the context menu for empty canvas space. |
| `closeContextMenu()` | `useGraphContextMenu` | Clears the active context menu. |
| `openCreateNode()` | `useGraphAuthoring` | Opens the Create Node dialog. This is the callback passed to `RightPanel` and `GraphView`. |
| `closeAuthoring()` | `useGraphAuthoring` | Closes the active authoring dialog. |
| `submitCreateNode(nodeDraft)` | `useGraphAuthoring` | Receives the validated node draft and delegates command execution to `useGraphCommandExecutor`. |
| `executeGraphCommand(action)` | `useGraphCommandExecutor` | Converts a typed graph action into a command string and sends it over WebSocket. |
| `buildGraphCommand(action)` | `graphCommand.ts` | Converts a typed graph action into backend command text. |
| `buildCreateNodeCommand(nodeDraft)` | `graphCommand.ts` | Builds the backend `create node ...` command for a node draft. |
| `createPropertyRow()` | `NodeDialog.tsx` | Creates an empty property row with a stable row id. |
| `rowsFromProperties(properties)` | `NodeDialog.tsx` | Converts node properties into editable rows. Mainly useful once Edit Node is added. |
| `propertiesFromRows(rows)` | `NodeDialog.tsx` | Converts form rows into a `Record<string, unknown>` for `MinigraphNode.properties`. |
| `validateNodeDraft(draft)` | `NodeDialog.tsx` | Performs form-level validation before calling `onSubmit`. |

### 3.4 New Props

| Prop | Owner | Type | Purpose |
|---|---|---|---|
| `onCreateNode` | `RightPanel` | `() => void` | Allows the graph area to request opening the Create Node dialog. |
| `onCreateNode` | `GraphView` | `() => void` | Forwarded to `GraphContextMenu` for the canvas Create action. |
| `onCreateNode` | `GraphContextMenu` | `() => void` | Called when the user selects Create Node from the canvas context menu. |
| `mode` | `NodeDialog` | `'create'` | Identifies dialog behavior. This first slice only supports create mode. |
| `nodeTypeOptions` | `NodeDialog` | `string[]` | Controls the available node type dropdown options. |
| `disabled` | `NodeDialog` | `boolean` | Prevents submit while a future command is pending. |
| `onSubmit` | `NodeDialog` | `(node: MinigraphNode) => void` | Emits the validated node draft. |
| `onClose` | `NodeDialog` | `() => void` | Requests closing the dialog without submitting. |

### 3.5 New State

| State | Owner | Shape | Purpose |
|---|---|---|---|
| `contextMenu` | `useGraphContextMenu` | `GraphContextMenuState \| null` | Tracks whether the graph context menu is open, where it should render, and what it targets. |
| `authoringState` | `useGraphAuthoring` | `GraphAuthoringState` | Tracks the active authoring workflow, starting with Create Node. |
| `alias` | `NodeDialog.tsx` | `string` | Local draft value for node alias. |
| `nodeType` | `NodeDialog.tsx` | `string` | Local draft value for node type. |
| `propertyRows` | `NodeDialog.tsx` | `PropertyRow[]` | Local draft values for node properties. |
| `formError` | `NodeDialog.tsx` | `string \| null` | Local validation error message. |

---

## 4. State Ownership

| Data or UI state | Owner | Rule |
|---|---|---|
| Canonical graph model | Backend session / graph storage | The frontend should not treat local graph data as canonical. |
| Fetched graph snapshot | Existing graph data hook / `Playground` | Used for rendering and lookup. Do not mutate this object directly from UI components. |
| ReactFlow nodes and edges | `GraphView` | Derived from graph data. They are render data, not source-of-truth data. |
| Context-menu target and position | `useGraphContextMenu` | Temporary UI state owned close to `GraphView`. |
| Graph authoring workflow | `useGraphAuthoring` | Tracks which authoring dialog is active and owns create/edit/delete workflow callbacks. |
| Create node form fields | `NodeDialog.tsx` | Local draft state. The form owns incomplete input until submit. |
| Backend graph command text | `graphCommand.ts` | Built from typed frontend graph actions. Components should not manually concatenate command strings. |
| Backend graph command send | `useGraphCommandExecutor` | Sends graph commands through the existing WebSocket command path. |
| Clip to Clipboard workflow | Existing clipboard flow / future clipboard action hook | Local frontend clipboard behavior. It is not a backend graph command and must not go through `graphCommand.ts`. |
| Modal layout and close affordance | `ModalShell` | Presentation only. No graph-specific behavior. |

Main rule:

`NodeDialog` creates a node draft. `useGraphAuthoring` owns the workflow decision. `useGraphCommandExecutor` sends the command. `graphCommand.ts` builds the command string. `GraphView`, `GraphContextMenu`, `NodeDialog`, and `Playground` must not manually build graph command strings or directly mutate `graphData`.

---

## 5. Right-Click Create Node Command Flow

Goal:

Right-click Create Node should use the same backend command system as the left console, but the command should be generated through the centralized graph command layer instead of being typed manually.

```text
User right-clicks blank ReactFlow canvas
-> GraphView.onPaneContextMenu(event)
-> useGraphContextMenu.openCanvasMenu(event)
-> contextMenu = { target: 'canvas', left, top }
-> GraphView renders GraphContextMenu
-> GraphContextMenu shows "Create Node"
-> User clicks "Create Node"
-> GraphContextMenu calls onCreateNode()
-> useGraphAuthoring.openCreateNode()
-> authoringState = { mode: 'create-node' }
-> GraphAuthoringModals renders NodeDialog mode="create"
-> User fills alias, type, and properties
-> User submits the form
-> NodeDialog validates local form state
-> NodeDialog calls onSubmit(nodeDraft)
-> useGraphAuthoring.submitCreateNode(nodeDraft)
-> useGraphCommandExecutor.executeGraphCommand({ type: 'create-node', node: nodeDraft })
-> graphCommand.buildGraphCommand(action)
-> graphCommand.buildCreateNodeCommand(nodeDraft)
-> existing buildNodeCommand('create', nodeDraft)
-> ws.sendRawText(command)
-> backend receives the same command text the console would have sent
-> existing protocol and graph refresh flow handles the backend response
```

Important boundary:

Right-click context-menu code does not send commands. Dialog code does not send commands. `Playground` does not own create/edit/delete submit handlers. The command send path is centralized in `useGraphCommandExecutor`, and the command string building is centralized in `graphCommand.ts`.

### 5.1 Central Graph Command Contract

File:

`src/graphActions/graphCommand.ts`

Purpose:

`graphCommand.ts` is the adapter between typed frontend graph actions and the backend Minigraph command grammar. It is reusable from right-click menus, dialogs, future toolbar buttons, keyboard shortcuts, or command palettes.

Types:

```ts
import type { MinigraphNode } from '../utils/graphTypes';

export type GraphCommandAction =
  | { type: 'create-node'; node: MinigraphNode }
  | { type: 'update-node'; node: MinigraphNode }
  | { type: 'delete-node'; alias: string }
  | {
      type: 'connect-nodes';
      source: string;
      target: string;
      relationType: string;
    };
```

Interface:

```ts
export function buildGraphCommand(action: GraphCommandAction): string;
export function buildCreateNodeCommand(node: MinigraphNode): string;
```

Implementation rule:

```ts
import { buildConnectCommand, buildNodeCommand } from '../clipboard/commandBuilder';

export function buildGraphCommand(action: GraphCommandAction): string {
  switch (action.type) {
    case 'create-node':
      return buildCreateNodeCommand(action.node);
    case 'update-node':
      return buildNodeCommand('update', action.node);
    case 'delete-node':
      return `delete node ${action.alias}`;
    case 'connect-nodes':
      return buildConnectCommand(action.source, action.target, action.relationType);
  }
}

export function buildCreateNodeCommand(node: MinigraphNode): string {
  return buildNodeCommand('create', node);
}
```

Rule:

No component should manually build strings like `create node ${alias}`. All graph command text must come from `graphCommand.ts`.

### 5.2 Graph Command Executor Contract

File:

`src/graphActions/useGraphCommandExecutor.ts`

Purpose:

`useGraphCommandExecutor` is the only frontend layer that sends UI-originated graph commands over the existing WebSocket command path.

Interface:

```ts
interface UseGraphCommandExecutorOptions {
  connected: boolean;
  sendRawText: (text: string) => void;
  addToast: (message: string, type?: ToastType) => void;
}

interface UseGraphCommandExecutorResult {
  executeGraphCommand: (action: GraphCommandAction) => boolean;
}
```

Behavior:

| Step | Rule |
|---|---|
| Validate connection | If disconnected, do not send. Show an error toast and return `false`. |
| Build command | Call `buildGraphCommand(action)`. |
| Send command | Call `sendRawText(command)`. |
| Report status | Show a lightweight info toast such as `Create node command sent for "foo"`. |
| Return result | Return `true` if the command was sent. |

### 5.3 Create Node Submission Contract

`useGraphAuthoring.submitCreateNode(nodeDraft)` owns the create workflow submit behavior:

```ts
const submitCreateNode = (nodeDraft: MinigraphNode) => {
  const sent = executeGraphCommand({
    type: 'create-node',
    node: nodeDraft,
  });

  if (sent) {
    closeAuthoring();
  }
};
```

This keeps `Playground` from growing one submit handler per graph action.

### 5.4 Clip To Clipboard Boundary

`Clip to Clipboard` is already exposed from the graph context menu, but it is not part of the graph command layer.

Reason:

`Clip to Clipboard` does not send Minigraph command text to the backend. It does not create, update, delete, or connect graph data. It copies selected graph data into the frontend clipboard workflow.

Expected flow after context-menu extraction:

```text
User right-clicks node
-> GraphView.onNodeContextMenu(event, node)
-> useGraphContextMenu.openNodeMenu(event, node.id)
-> GraphView renders GraphContextMenu
-> GraphContextMenu shows "Clip to Clipboard"
-> User clicks "Clip to Clipboard"
-> GraphContextMenu finds selected node and direct connections
-> GraphContextMenu calls onClipNode(node, connections)
-> existing clipboard workflow handles clip behavior
```

Rules:

| Rule | Detail |
|---|---|
| Do not route clip through `graphCommand.ts` | There is no backend command string to build. |
| Do not route clip through `useGraphCommandExecutor` | It does not use the WebSocket command path. |
| Keep clip as a callback on `GraphContextMenu` | The menu can render the action and adapt selected graph data to the existing callback. |
| Keep command actions separate from clipboard actions | Create/Edit/Delete/Connect are graph command actions. Clip is a clipboard action. |

### 6.3 Key Difference

| Concern | Old LeftPanel flow | New right-click flow |
|---|---|---|
| Who writes command text | User manually types it. | Frontend builds it from dialog data. |
| How command is sent | `useWebSocket.sendCommand`. | `useGraphCommandExecutor` calls `ws.sendRawText`. |
| Main architecture requirement | Keep console command behavior unchanged. | Centralize generated command creation and sending outside `Playground`. |
