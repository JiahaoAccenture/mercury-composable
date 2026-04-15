import { useEffect, useRef } from 'react';
import type { MinigraphConnection, MinigraphGraphData, MinigraphNode } from '../../utils/graphTypes';
import { extractDirectConnections, findNodeByAlias } from '../../clipboard/helpers';
import styles from './GraphView.module.css';

export interface NodeContextMenuState {
  x: number;
  y: number;
  nodeAlias: string;
}

interface GraphContextMenuProps {
  menu: NodeContextMenuState;
  graphData: MinigraphGraphData;
  onClose: () => void;
  onEditNode?: (node: MinigraphNode) => void;
  onClipNode?: (node: MinigraphNode, connections: MinigraphConnection[]) => void;
}

export default function GraphContextMenu({
  menu,
  graphData,
  onClose,
  onEditNode,
  onClipNode,
}: GraphContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDismiss = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as globalThis.Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleDismiss);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDismiss);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const node = findNodeByAlias(graphData, menu.nodeAlias);
  if (!node) return null;

  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ position: 'fixed', top: menu.y, left: menu.x }}
      role="menu"
    >
      {onEditNode && (
        <button
          role="menuitem"
          autoFocus
          className={styles.contextMenuItem}
          onClick={() => {
            onEditNode(node);
            onClose();
          }}
        >
          Edit Node
        </button>
      )}

      {onClipNode && (
        <button
          role="menuitem"
          autoFocus={!onEditNode}
          className={styles.contextMenuItem}
          onClick={() => {
            const connections = extractDirectConnections(graphData, menu.nodeAlias);
            onClipNode(node, connections);
            onClose();
          }}
        >
          Clip to Clipboard
        </button>
      )}
    </div>
  );
}
