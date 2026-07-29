import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProtocolBus } from '../../protocol/bus';
import type { NodeActionTextResultEvent } from '../../protocol/events';
import type { MinigraphGraphData, MinigraphNode } from '../../utils/graphTypes';
import type { NodeActionTextResult } from '../../utils/messageParser';
import type { GraphAuthoringExecutor } from '../../graphActions/graphAuthoringExecutor';
import {
  buildCreateConnectionCommand,
  buildCreateNodeCommand,
  buildDeleteNodeCommand,
  buildUpdateNodeCommand,
} from '../../graphActions/minigraphCommandBuilder';
import type { ConnectionFormState } from '../../graphActions/connectionAuthoringTypes';
import { CONNECTION_RELATION_OPTIONS } from '../../graphActions/connectionRelations';
import type {
  NodeAction,
  NodeFormState,
  NodeFormSource,
  NodeFormValidationErrors,
} from '../../graphActions/nodeAuthoringTypes';
import { createDefaultNodeFormState, createEditNodeFormState } from '../../graphActions/propertyRows';
import { validateConnectionFormState, validateDeleteNodeAlias, validateNodeFormState } from '../../graphActions/validation';

export const DEFAULT_AUTHORING_TIMEOUT_MS = 10_000;

type EditableNodeAction = Extract<NodeAction, 'create-node' | 'edit-node'>;
type EditableAuthoringAction = Extract<NodeAction, 'create-node' | 'edit-node' | 'create-connection'>;
type CreateNodeFormSource = Exclude<NodeFormSource, 'edit-node'>;
type UserMessageType = 'info' | 'success' | 'error';

export type AuthoringState =
  | {
      status: 'closed';
      pendingSubmit: PendingAuthoringSubmit | null;
      serverMessage: string | null;
    }
  | {
      status: 'open';
      action: EditableNodeAction;
      phase: 'editing' | 'sending';
      formState: NodeFormState;
      originalAlias: string | null;
      pendingSubmit: PendingAuthoringSubmit | null;
      serverMessage: string | null;
      connectionLost: boolean;
    }
  | {
      status: 'open';
      action: 'create-connection';
      phase: 'editing' | 'sending';
      formState: ConnectionFormState;
      pendingSubmit: PendingAuthoringSubmit | null;
      serverMessage: string | null;
      connectionLost: boolean;
    };

export interface PendingAuthoringSubmit {
  action: NodeAction;
  alias: string | null;
  targetAlias?: string | null;
  command: string;
  sentAt: string;
}

export interface UseGraphAuthoringOptions {
  bus: ProtocolBus;
  connected: boolean;
  graphData: MinigraphGraphData | null;
  executor: GraphAuthoringExecutor;
  timeoutMs?: number;
  onAccepted?: (result: NodeActionTextResult) => void;
  onUserMessage?: (message: string, type?: UserMessageType) => void;
}

export interface UseGraphAuthoringReturn {
  state: AuthoringState;
  validationErrors: NodeFormValidationErrors;
  openCreateNode: (source: CreateNodeFormSource) => void;
  openCreateConnection: (sourceAlias: string, targetAlias: string) => void;
  openEditNode: (node: MinigraphNode) => void;
  deleteNode: (node: MinigraphNode) => void;
  updateFormState: (formState: NodeFormState | ConnectionFormState) => void;
  submit: () => void;
  close: () => void;
}

const PENDING_ACTION_MESSAGE = 'A graph authoring action is already pending. Wait for it to finish before starting another.';
const CREATE_SEND_FAILURE_MESSAGE = 'Could not send the create-node command because the WebSocket is not open. The form values remain in this dialog.';
const EDIT_SEND_FAILURE_MESSAGE = 'Could not send the edit-node command because the WebSocket is not open. Your changes remain in this dialog.';
const DELETE_SEND_FAILURE_MESSAGE = 'Could not send the delete-node command because the WebSocket is not open.';
const CONNECTION_SEND_FAILURE_MESSAGE = 'Could not send the create-connection command because the WebSocket is not open. The form values remain in this dialog.';
const NODE_UNAVAILABLE_MESSAGE = 'This node is no longer available in the current graph.';
const CREATE_DISCONNECTED_EDITING_MESSAGE = 'Connection disconnected. Refresh the page and create the node again after the app reconnects.';
const EDIT_DISCONNECTED_EDITING_MESSAGE = 'Connection disconnected. Refresh the page and edit the node again after the app reconnects.';
const CONNECTION_DISCONNECTED_EDITING_MESSAGE = 'Connection disconnected. Refresh the page and create the connection again after the app reconnects.';
const PENDING_DISCONNECTED_MESSAGE = 'Connection disconnected while the graph authoring action was pending. The outcome is unknown. Refresh the page and check the graph before trying again.';

const CLOSED_STATE: AuthoringState = { status: 'closed', pendingSubmit: null, serverMessage: null };

function getPendingSubmit(state: AuthoringState): PendingAuthoringSubmit | null {
  return state.pendingSubmit;
}

function getSendFailureMessage(action: NodeAction): string {
  if (action === 'create-connection') return CONNECTION_SEND_FAILURE_MESSAGE;
  if (action === 'edit-node') return EDIT_SEND_FAILURE_MESSAGE;
  if (action === 'delete-node') return DELETE_SEND_FAILURE_MESSAGE;
  return CREATE_SEND_FAILURE_MESSAGE;
}

function getTimeoutMessage(action: NodeAction): string {
  return `The ${action} command was sent, but no backend result was observed yet. The outcome is unknown.`;
}

function getDisconnectedEditingMessage(action: EditableAuthoringAction): string {
  if (action === 'create-connection') return CONNECTION_DISCONNECTED_EDITING_MESSAGE;
  return action === 'edit-node' ? EDIT_DISCONNECTED_EDITING_MESSAGE : CREATE_DISCONNECTED_EDITING_MESSAGE;
}

function aliasesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function findCurrentNodeByAlias(
  graphData: MinigraphGraphData | null,
  alias: string,
): MinigraphNode | null {
  return graphData?.nodes.find((node) => node.alias.toLowerCase() === alias.toLowerCase()) ?? null;
}

function eventMatchesPendingAction(
  event: NodeActionTextResultEvent,
  pending: PendingAuthoringSubmit,
): boolean {
  if (event.status === 'error') return true;

  if (pending.action === 'create-connection') {
    if (event.action === 'create-connection') {
      if (event.alias === null) return true;
      if (!aliasesMatch(event.alias, pending.alias)) return false;
      return event.status === 'accepted'
        ? aliasesMatch(event.targetAlias, pending.targetAlias)
        : event.targetAlias === null || aliasesMatch(event.targetAlias, pending.targetAlias);
    }
    if (event.action === null) {
      return aliasesMatch(event.alias, pending.alias) || aliasesMatch(event.alias, pending.targetAlias);
    }
    return false;
  }

  if (!aliasesMatch(event.alias, pending.alias)) return false;
  return event.action === null || event.action === pending.action;
}

export interface AuthoringTransition {
  state: AuthoringState;
  acceptedResult?: NodeActionTextResult;
  notification?: {
    message: string;
    type: UserMessageType;
  };
}

export function resolvePendingAuthoringEvent(
  current: AuthoringState,
  event: NodeActionTextResultEvent,
): AuthoringTransition | null {
  const pending = getPendingSubmit(current);
  if (!pending || !eventMatchesPendingAction(event, pending)) return null;

  if (event.status === 'accepted') {
    return {
      state: CLOSED_STATE,
      acceptedResult: {
        status: event.status,
        action: event.action,
        alias: event.alias,
        targetAlias: event.targetAlias,
        message: event.message,
      },
    };
  }

  if (current.status === 'open') {
    return {
      state: {
        ...current,
        phase: 'editing',
        pendingSubmit: null,
        serverMessage: event.status === 'error'
          ? `Backend returned an error while this submit was pending: ${event.message}`
          : event.message,
      },
    };
  }

  return {
    state: CLOSED_STATE,
    notification: { message: event.message, type: 'error' },
  };
}

export function resolveAuthoringSendFailure(
  current: Extract<AuthoringState, { status: 'open' }>,
): Extract<AuthoringState, { status: 'open' }> {
  return {
    ...current,
    phase: 'editing',
    pendingSubmit: null,
    serverMessage: getSendFailureMessage(current.action),
  };
}

export function resolveAuthoringTimeout(
  current: AuthoringState,
): AuthoringTransition | null {
  const pending = getPendingSubmit(current);
  if (!pending) return null;

  const message = getTimeoutMessage(pending.action);
  if (current.status === 'open') {
    return {
      state: {
        ...current,
        phase: 'editing',
        pendingSubmit: null,
        serverMessage: message,
      },
    };
  }

  return {
    state: CLOSED_STATE,
    notification: { message, type: 'error' },
  };
}

export function resolveAuthoringDisconnect(
  current: AuthoringState,
): AuthoringTransition | null {
  const pending = getPendingSubmit(current);

  if (current.status === 'open') {
    const message = pending
      ? PENDING_DISCONNECTED_MESSAGE
      : getDisconnectedEditingMessage(current.action);
    return {
      state: {
        ...current,
        phase: 'editing',
        pendingSubmit: null,
        serverMessage: message,
        connectionLost: true,
      },
    };
  }

  if (!pending) return null;
  return {
    state: CLOSED_STATE,
    notification: { message: PENDING_DISCONNECTED_MESSAGE, type: 'error' },
  };
}

function isConnectionFormState(
  formState: NodeFormState | ConnectionFormState,
): formState is ConnectionFormState {
  return 'sourceAlias' in formState;
}

// Owns the complete graph-authoring lifecycle: form state, validation,
// raw-command send, text-result matching, timeout handling, and disconnect
// handling. UI components call this hook instead of sending commands or
// interpreting backend text themselves.
export function useGraphAuthoring({
  bus,
  connected,
  graphData,
  executor,
  timeoutMs = DEFAULT_AUTHORING_TIMEOUT_MS,
  onAccepted,
  onUserMessage,
}: UseGraphAuthoringOptions): UseGraphAuthoringReturn {
  const [state, setState] = useState<AuthoringState>(CLOSED_STATE);
  const [validationErrors, setValidationErrors] = useState<NodeFormValidationErrors>({});

  const stateRef = useRef(state);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasConnectedRef = useRef(connected);
  const graphDataRef = useRef(graphData);
  const onAcceptedRef = useRef(onAccepted);
  const onUserMessageRef = useRef(onUserMessage);

  // ProtocolBus and timers can fire after render, so callbacks read refs for
  // the latest state/context without re-subscribing on every form keystroke.
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { graphDataRef.current = graphData; }, [graphData]);
  useEffect(() => { onAcceptedRef.current = onAccepted; }, [onAccepted]);
  useEffect(() => { onUserMessageRef.current = onUserMessage; }, [onUserMessage]);

  const notifyUser = useCallback((message: string, type: UserMessageType = 'error') => {
    onUserMessageRef.current?.(message, type);
  }, []);

  const setAuthoringState = useCallback((next: AuthoringState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearPendingTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startSubmitTimer = useCallback(() => {
    clearPendingTimer();
    timeoutRef.current = setTimeout(() => {
      const transition = resolveAuthoringTimeout(stateRef.current);
      if (!transition) return;
      setAuthoringState(transition.state);
      if (transition.notification) {
        notifyUser(transition.notification.message, transition.notification.type);
      }
      timeoutRef.current = null;
    }, timeoutMs);
  }, [clearPendingTimer, notifyUser, setAuthoringState, timeoutMs]);

  const openCreateNode = useCallback((source: CreateNodeFormSource) => {
    if (!connected) return;
    if (getPendingSubmit(stateRef.current)) {
      notifyUser(PENDING_ACTION_MESSAGE, 'error');
      return;
    }

    const formState = createDefaultNodeFormState(source);
    setValidationErrors({});
    setAuthoringState({
      status: 'open',
      action: 'create-node',
      phase: 'editing',
      formState,
      originalAlias: null,
      pendingSubmit: null,
      serverMessage: null,
      connectionLost: false,
    });
  }, [connected, notifyUser, setAuthoringState]);

  const openCreateConnection = useCallback((sourceAlias: string, targetAlias: string) => {
    if (!connected) return;
    if (getPendingSubmit(stateRef.current)) {
      notifyUser(PENDING_ACTION_MESSAGE, 'error');
      return;
    }

    const formState: ConnectionFormState = {
      sourceAlias,
      targetAlias,
      relation: CONNECTION_RELATION_OPTIONS[0],
    };
    const validation = validateConnectionFormState(formState, {
      graphData: graphDataRef.current,
      connected,
    });
    if (!validation.valid) return;

    setValidationErrors({});
    setAuthoringState({
      status: 'open',
      action: 'create-connection',
      phase: 'editing',
      formState,
      pendingSubmit: null,
      serverMessage: null,
      connectionLost: false,
    });
  }, [connected, notifyUser, setAuthoringState]);

  const openEditNode = useCallback((node: MinigraphNode) => {
    if (!connected) {
      notifyUser(EDIT_DISCONNECTED_EDITING_MESSAGE, 'error');
      return;
    }
    if (getPendingSubmit(stateRef.current)) {
      notifyUser(PENDING_ACTION_MESSAGE, 'error');
      return;
    }

    const currentNode = findCurrentNodeByAlias(graphDataRef.current, node.alias);
    if (!currentNode) {
      notifyUser(NODE_UNAVAILABLE_MESSAGE, 'error');
      return;
    }

    const conversion = createEditNodeFormState(currentNode);
    if (!conversion.valid || !conversion.formState) {
      notifyUser(conversion.message ?? 'This node cannot be edited in the UI.', 'error');
      return;
    }

    setValidationErrors({});
    setAuthoringState({
      status: 'open',
      action: 'edit-node',
      phase: 'editing',
      formState: conversion.formState,
      originalAlias: currentNode.alias,
      pendingSubmit: null,
      serverMessage: null,
      connectionLost: false,
    });
  }, [connected, notifyUser, setAuthoringState]);

  const deleteNode = useCallback((node: MinigraphNode) => {
    if (!connected) {
      notifyUser(DELETE_SEND_FAILURE_MESSAGE, 'error');
      return;
    }
    if (getPendingSubmit(stateRef.current)) {
      notifyUser(PENDING_ACTION_MESSAGE, 'error');
      return;
    }

    const validation = validateDeleteNodeAlias(node.alias, { graphData: graphDataRef.current });
    if (!validation.valid) {
      notifyUser(Object.values(validation.errors)[0] ?? 'Invalid node alias.', 'error');
      return;
    }

    let command: string;
    try {
      command = buildDeleteNodeCommand(node.alias, { graphData: graphDataRef.current });
    } catch (err) {
      notifyUser(err instanceof Error ? err.message : String(err), 'error');
      return;
    }

    const sent = executor.execute(command);
    if (!sent) {
      notifyUser(DELETE_SEND_FAILURE_MESSAGE, 'error');
      return;
    }

    const pending: PendingAuthoringSubmit = {
      action: 'delete-node',
      alias: node.alias.trim(),
      command,
      sentAt: new Date().toISOString(),
    };
    setValidationErrors({});
    setAuthoringState({ status: 'closed', pendingSubmit: pending, serverMessage: null });
    startSubmitTimer();
  }, [connected, executor, notifyUser, setAuthoringState, startSubmitTimer]);

  const updateFormState = useCallback((formState: NodeFormState | ConnectionFormState) => {
    const current = stateRef.current;
    if (current.status !== 'open') return;
    if (current.phase === 'sending' || current.connectionLost) return;

    setValidationErrors({});

    if (current.action === 'create-connection') {
      if (!isConnectionFormState(formState)) return;
      setAuthoringState({
        ...current,
        formState,
        pendingSubmit: null,
        serverMessage: null,
        connectionLost: false,
      });
      return;
    }

    if (isConnectionFormState(formState)) return;
    setAuthoringState({
      ...current,
      formState,
      pendingSubmit: null,
      serverMessage: null,
      connectionLost: false,
    });
  }, [setAuthoringState]);

  const submit = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== 'open') return;
    if (current.phase === 'sending') return;
    if (current.connectionLost) return;

    const action = current.action;
    if (!connected) {
      setAuthoringState({
        ...current,
        serverMessage: getSendFailureMessage(action),
      });
      return;
    }

    const validation = current.action === 'create-connection'
      ? validateConnectionFormState(current.formState, {
        graphData: graphDataRef.current,
        connected,
      })
      : validateNodeFormState(
        current.formState,
        current.action === 'edit-node'
          ? { mode: 'edit', originalAlias: current.originalAlias }
          : { graphData: graphDataRef.current },
      );
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    let command: string;
    let pendingAlias: string | null;
    let pendingTargetAlias: string | null = null;
    try {
      if (current.action === 'edit-node') {
        pendingAlias = current.originalAlias?.trim() ?? '';
        command = buildUpdateNodeCommand(current.formState, pendingAlias);
      } else if (current.action === 'create-node') {
        pendingAlias = current.formState.alias.trim();
        command = buildCreateNodeCommand(current.formState);
      } else if (isConnectionFormState(current.formState)) {
        pendingAlias = current.formState.sourceAlias.trim();
        pendingTargetAlias = current.formState.targetAlias.trim();
        command = buildCreateConnectionCommand(current.formState);
      } else {
        setValidationErrors({ command: 'Invalid connection form state.' });
        return;
      }
    } catch (err) {
      setValidationErrors({ command: err instanceof Error ? err.message : String(err) });
      return;
    }

    const sent = executor.execute(command);
    if (!sent) {
      setAuthoringState(resolveAuthoringSendFailure(current));
      return;
    }

    const pending: PendingAuthoringSubmit = {
      action,
      alias: pendingAlias,
      targetAlias: pendingTargetAlias,
      command,
      sentAt: new Date().toISOString(),
    };
    setValidationErrors({});
    setAuthoringState({
      ...current,
      phase: 'sending',
      pendingSubmit: pending,
      serverMessage: null,
      connectionLost: false,
    });
    startSubmitTimer();
  }, [connected, executor, setAuthoringState, startSubmitTimer]);

  const close = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== 'open') return;
    if (current.phase === 'sending') return;
    clearPendingTimer();
    setValidationErrors({});
    setAuthoringState(CLOSED_STATE);
  }, [clearPendingTimer, setAuthoringState]);

  useEffect(() => {
    return bus.on('minigraph.nodeAction.textResult', (event: NodeActionTextResultEvent) => {
      const transition = resolvePendingAuthoringEvent(stateRef.current, event);
      if (!transition) return;

      clearPendingTimer();
      if (transition.acceptedResult) setValidationErrors({});
      setAuthoringState(transition.state);
      if (transition.acceptedResult) {
        onAcceptedRef.current?.(transition.acceptedResult);
      }
      if (transition.notification) {
        notifyUser(transition.notification.message, transition.notification.type);
      }
    });
  }, [bus, clearPendingTimer, notifyUser, setAuthoringState]);

  // A disconnect changes the backend WebSocket session. Open modal values are
  // intentionally memory-only; if the connection is lost, fields are locked and
  // the user must refresh before trying the action again.
  useEffect(() => {
    if (wasConnectedRef.current && !connected) {
      const transition = resolveAuthoringDisconnect(stateRef.current);
      if (transition) {
        clearPendingTimer();
        setAuthoringState(transition.state);
        if (transition.notification) {
          notifyUser(transition.notification.message, transition.notification.type);
        }
      }
    }
    wasConnectedRef.current = connected;
  }, [clearPendingTimer, connected, notifyUser, setAuthoringState]);

  useEffect(() => {
    return () => {
      clearPendingTimer();
    };
  }, [clearPendingTimer]);

  return {
    state,
    validationErrors,
    openCreateNode,
    openCreateConnection,
    openEditNode,
    deleteNode,
    updateFormState,
    submit,
    close,
  };
}
