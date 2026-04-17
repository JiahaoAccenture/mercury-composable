import { describe, expect, it } from 'vitest';
import { buildGraphCommand } from '../buildGraphCommand';
import type { MinigraphGraphData, MinigraphNode } from '../../utils/graphTypes';

const graphData: MinigraphGraphData = {
  nodes: [
    { alias: 'root', types: ['Root'], properties: {} },
    { alias: 'person-name', types: ['Fetcher'], properties: { skill: 'demo.profile' } },
  ],
  connections: [
    {
      source: 'root',
      target: 'person-name',
      relations: [{ type: 'next', properties: {} }],
    },
  ],
};

function node(overrides: Partial<MinigraphNode> = {}): MinigraphNode {
  return {
    alias: 'person-name',
    types: ['Fetcher'],
    properties: { skill: 'demo.profile', description: 'Fetch profile' },
    ...overrides,
  };
}

describe('buildGraphCommand', () => {
  it('builds an update-node command from a node action', () => {
    const result = buildGraphCommand(
      { type: 'update-node', node: node() },
      { graphData },
    );

    expect(result).toEqual({
      ok: true,
      command: [
        'update node person-name',
        'with type Fetcher',
        'with properties',
        'skill[]=demo.profile',
        'description[]=Fetch profile',
      ].join('\n'),
    });
  });

  it('rejects update-node when the node is missing from the current graph', () => {
    const result = buildGraphCommand(
      { type: 'update-node', node: node({ alias: 'missing' }) },
      { graphData },
    );

    expect(result).toEqual({
      ok: false,
      code: 'node-not-found',
      message: 'Node "missing" was not found in the current graph.',
    });
  });

  it('rejects create-node when the alias already exists', () => {
    const result = buildGraphCommand(
      { type: 'create-node', node: node({ alias: 'root', types: ['Root'] }) },
      { graphData },
    );

    expect(result).toEqual({
      ok: false,
      code: 'node-alias-exists',
      message: 'Node "root" already exists.',
    });
  });

  it('builds a create-node command for a new node', () => {
    const result = buildGraphCommand(
      { type: 'create-node', node: node({ alias: 'formatter', types: ['mapper'] }) },
      { graphData },
    );

    expect(result).toEqual({
      ok: true,
      command: [
        'create node formatter',
        'with type mapper',
        'with properties',
        'skill[]=demo.profile',
        'description[]=Fetch profile',
      ].join('\n'),
    });
  });

  it('builds a delete-node command', () => {
    const result = buildGraphCommand(
      { type: 'delete-node', alias: 'person-name' },
      { graphData },
    );

    expect(result).toEqual({
      ok: true,
      command: 'delete node person-name',
    });
  });

  it('builds a connect-nodes command', () => {
    const result = buildGraphCommand(
      { type: 'connect-nodes', source: 'person-name', target: 'root', relationType: 'done' },
      { graphData },
    );

    expect(result).toEqual({
      ok: true,
      command: 'connect person-name to root with done',
    });
  });

  it('rejects a self-connection by default', () => {
    const result = buildGraphCommand(
      { type: 'connect-nodes', source: 'root', target: 'root', relationType: 'next' },
      { graphData },
    );

    expect(result).toEqual({
      ok: false,
      code: 'self-connection',
      message: 'Source and target node must be different.',
    });
  });

  it('rejects a duplicate source-target-relation connection by default', () => {
    const result = buildGraphCommand(
      { type: 'connect-nodes', source: 'root', target: 'person-name', relationType: 'next' },
      { graphData },
    );

    expect(result).toEqual({
      ok: false,
      code: 'duplicate-connection',
      message: 'Connection "root" -> "person-name" with relation "next" already exists.',
    });
  });

  it('allows duplicate connections when explicitly requested', () => {
    const result = buildGraphCommand(
      { type: 'connect-nodes', source: 'root', target: 'person-name', relationType: 'next' },
      { graphData, allowDuplicateConnection: true },
    );

    expect(result).toEqual({
      ok: true,
      command: 'connect root to person-name with next',
    });
  });
});
