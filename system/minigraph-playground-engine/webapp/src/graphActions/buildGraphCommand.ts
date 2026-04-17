import { buildConnectCommand, buildNodeCommand } from '../clipboard/commandBuilder';
import type { MinigraphGraphData, MinigraphNode } from '../utils/graphTypes';

export type GraphCommandAction =
  | { type: 'create-node'; node: MinigraphNode }
  | { type: 'update-node'; node: MinigraphNode }
  | { type: 'delete-node'; alias: string }
  | { type: 'connect-nodes'; source: string; target: string; relationType: string };

export type GraphCommandErrorCode =
  | 'node-alias-required'
  | 'node-alias-invalid'
  | 'node-alias-exists'
  | 'node-not-found'
  | 'node-type-required'
  | 'source-required'
  | 'target-required'
  | 'relation-type-required'
  | 'self-connection'
  | 'duplicate-connection';

export type GraphCommandResult =
  | { ok: true; command: string }
  | { ok: false; code: GraphCommandErrorCode; message: string };

export interface BuildGraphCommandOptions {
  graphData?: MinigraphGraphData | null;
  allowSelfConnection?: boolean;
  allowDuplicateConnection?: boolean;
}

function fail(code: GraphCommandErrorCode, message: string): GraphCommandResult {
  return { ok: false, code, message };
}

function trimAlias(alias: string): string {
  return alias.trim();
}

function validateAlias(alias: string): GraphCommandResult | null {
  if (!alias) {
    return fail('node-alias-required', 'Node alias is required.');
  }

  if (/\s/.test(alias)) {
    return fail('node-alias-invalid', 'Node alias cannot contain whitespace.');
  }

  return null;
}

function nodeExists(graphData: MinigraphGraphData | null | undefined, alias: string): boolean {
  return graphData?.nodes.some((node) => node.alias === alias) ?? false;
}

function normalizeNode(node: MinigraphNode): MinigraphNode {
  return {
    ...node,
    alias: trimAlias(node.alias),
    types: node.types.map((type) => type.trim()).filter(Boolean),
  };
}

function firstNodeType(node: MinigraphNode): string {
  return node.types[0]?.trim() ?? '';
}

function validateNodeForCreate(
  node: MinigraphNode,
  graphData: MinigraphGraphData | null | undefined,
): GraphCommandResult | null {
  const aliasError = validateAlias(node.alias);
  if (aliasError) return aliasError;

  if (!firstNodeType(node)) {
    return fail('node-type-required', 'Node type is required.');
  }

  if (nodeExists(graphData, node.alias)) {
    return fail('node-alias-exists', `Node "${node.alias}" already exists.`);
  }

  return null;
}

function validateNodeForUpdate(
  node: MinigraphNode,
  graphData: MinigraphGraphData | null | undefined,
): GraphCommandResult | null {
  const aliasError = validateAlias(node.alias);
  if (aliasError) return aliasError;

  if (!firstNodeType(node)) {
    return fail('node-type-required', 'Node type is required.');
  }

  if (graphData && !nodeExists(graphData, node.alias)) {
    return fail('node-not-found', `Node "${node.alias}" was not found in the current graph.`);
  }

  return null;
}

function validateDeleteNode(
  alias: string,
  graphData: MinigraphGraphData | null | undefined,
): GraphCommandResult | null {
  const aliasError = validateAlias(alias);
  if (aliasError) return aliasError;

  if (graphData && !nodeExists(graphData, alias)) {
    return fail('node-not-found', `Node "${alias}" was not found in the current graph.`);
  }

  return null;
}

function hasDuplicateConnection(
  graphData: MinigraphGraphData | null | undefined,
  source: string,
  target: string,
  relationType: string,
): boolean {
  return graphData?.connections.some((connection) => (
    connection.source === source &&
    connection.target === target &&
    connection.relations.some((relation) => relation.type === relationType)
  )) ?? false;
}

function validateConnectNodes(
  source: string,
  target: string,
  relationType: string,
  options: BuildGraphCommandOptions,
): GraphCommandResult | null {
  if (!source) {
    return fail('source-required', 'Source node is required.');
  }

  if (!target) {
    return fail('target-required', 'Target node is required.');
  }

  if (!relationType) {
    return fail('relation-type-required', 'Relation type is required.');
  }

  const sourceError = validateAlias(source);
  if (sourceError) return sourceError;

  const targetError = validateAlias(target);
  if (targetError) return targetError;

  const graphData = options.graphData;
  if (graphData && !nodeExists(graphData, source)) {
    return fail('node-not-found', `Source node "${source}" was not found in the current graph.`);
  }

  if (graphData && !nodeExists(graphData, target)) {
    return fail('node-not-found', `Target node "${target}" was not found in the current graph.`);
  }

  if (!options.allowSelfConnection && source === target) {
    return fail('self-connection', 'Source and target node must be different.');
  }

  if (
    !options.allowDuplicateConnection &&
    hasDuplicateConnection(graphData, source, target, relationType)
  ) {
    return fail(
      'duplicate-connection',
      `Connection "${source}" -> "${target}" with relation "${relationType}" already exists.`,
    );
  }

  return null;
}

export function buildGraphCommand(
  action: GraphCommandAction,
  options: BuildGraphCommandOptions = {},
): GraphCommandResult {
  switch (action.type) {
    case 'create-node': {
      const node = normalizeNode(action.node);
      const validation = validateNodeForCreate(node, options.graphData);
      if (validation) return validation;
      return { ok: true, command: buildNodeCommand('create', node) };
    }

    case 'update-node': {
      const node = normalizeNode(action.node);
      const validation = validateNodeForUpdate(node, options.graphData);
      if (validation) return validation;
      return { ok: true, command: buildNodeCommand('update', node) };
    }

    case 'delete-node': {
      const alias = trimAlias(action.alias);
      const validation = validateDeleteNode(alias, options.graphData);
      if (validation) return validation;
      return { ok: true, command: `delete node ${alias}` };
    }

    case 'connect-nodes': {
      const source = trimAlias(action.source);
      const target = trimAlias(action.target);
      const relationType = action.relationType.trim();
      const validation = validateConnectNodes(source, target, relationType, options);
      if (validation) return validation;
      return { ok: true, command: buildConnectCommand(source, target, relationType) };
    }
  }
}
