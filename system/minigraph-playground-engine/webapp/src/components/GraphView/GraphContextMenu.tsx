import { useEffect, useRef, useState } from 'react';
import type { MinigraphConnection, MinigraphGraphData, MinigraphNode } from '../../utils/graphTypes';
import { extractDirectConnections, findNodeByAlias } from '../../clipboard/helpers';
import type { GraphContextMenuState } from './useGraphContextMenu';
import styles from './GraphView.module.css';

interface GraphContextMenuProps {
  menu: GraphContextMenuState;
  graphData: MinigraphGraphData;
  onClose: () => void;
  onCreateNode?: () => void;
  onEditNode?: (node: MinigraphNode) => void;
  onDeleteNode?: (node: MinigraphNode) => void;
  onClipNode?: (node: MinigraphNode, connections: MinigraphConnection[]) => void;
}

export default function GraphContextMenu({
  menu,
  graphData,
  onClose,
  onCreateNode,
  onEditNode,
  onDeleteNode,
  onClipNode,
}: GraphContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

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

  useEffect(() => {
    setDeleteConfirming(false);
  }, [menu]);

  if (menu.target === 'canvas') {
    return (
      <div
        ref={menuRef}
        className={styles.contextMenu}
        style={{ position: 'fixed', top: menu.top, left: menu.left }}
        role="menu"
      >
        {onCreateNode && (
          <button
            role="menuitem"
            autoFocus
            className={styles.contextMenuItem}
            onClick={() => {
              onCreateNode();
              onClose();
            }}
          >
            Create Node
          </button>
        )}
      </div>
    );
  }

  const node = findNodeByAlias(graphData, menu.nodeAlias);
  if (!node) return null;

  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ position: 'fixed', top: menu.top, left: menu.left }}
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

      {onDeleteNode && (
        <button
          role="menuitem"
          autoFocus={!onEditNode && !onClipNode}
          className={`${styles.contextMenuItem} ${deleteConfirming ? styles.contextMenuDangerItem : ''}`}
          onClick={() => {
            if (!deleteConfirming) {
              setDeleteConfirming(true);
              return;
            }

            onDeleteNode(node);
            onClose();
          }}
        >
          {deleteConfirming ? 'Confirm Delete' : 'Delete Node'}
        </button>
      )}
    </div>
  );
}
