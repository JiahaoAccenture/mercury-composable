import { useState } from 'react';

interface ContextMenuPointerEvent {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
}

interface BaseGraphContextMenuState {
  left: number;
  top: number;
}

export type GraphContextMenuState =
  | (BaseGraphContextMenuState & { target: 'node'; nodeAlias: string })
  | (BaseGraphContextMenuState & { target: 'canvas' });

export function useGraphContextMenu() {
  const [contextMenu, setContextMenu] = useState<GraphContextMenuState | null>(null);

  const openNodeMenu = (event: ContextMenuPointerEvent, nodeAlias: string) => {
    event.preventDefault();
    setContextMenu({
      target: 'node',
      left: event.clientX,
      top: event.clientY,
      nodeAlias,
    });
  };

  const openCanvasMenu = (event: ContextMenuPointerEvent) => {
    event.preventDefault();
    setContextMenu({
      target: 'canvas',
      left: event.clientX,
      top: event.clientY,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  return {
    contextMenu,
    openNodeMenu,
    openCanvasMenu,
    closeContextMenu,
  };
}
