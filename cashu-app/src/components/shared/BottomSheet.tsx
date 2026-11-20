import { useLayoutEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { BottomSheetParent, useBottomSheetDialog } from './useBottomSheetDialog';

export interface BottomSheetControls {
  close: () => void;
  closeButtonProps: { type: 'button'; onClick: () => void; disabled: boolean; 'aria-label': string };
  dragHandleProps: ReturnType<typeof useBottomSheet>['dragHandleProps'];
  isClosing: boolean;
}

type DialogName =
  | { 'aria-label': string; 'aria-labelledby'?: never }
  | { 'aria-labelledby': string; 'aria-label'?: never };

export type BottomSheetProps = DialogName & {
  onClose: () => void;
  children: (controls: BottomSheetControls) => ReactNode;
  dismissible?: boolean;
  suspended?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  id?: string;
  'aria-describedby'?: string;
  className?: string;
  backdropClassName?: string;
};

export function BottomSheet({
  onClose, children, dismissible = true, suspended = false, initialFocusRef, returnFocusRef,
  id, 'aria-label': label, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy,
  className = '', backdropClassName = 'bg-background/80 backdrop-blur-sm',
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<(() => void) | null>(null);
  const dialog = useBottomSheetDialog({ panelRef, initialFocusRef, returnFocusRef, suspended, onEscape: () => closeRef.current?.() });
  const blocked = !dismissible || suspended || !dialog.active;
  const { dragHandleProps, sheetStyle, backdropStyle, isClosing, closeWithAnimation } = useBottomSheet({ onClose, disabled: blocked });
  const close = () => { if (!blocked && !isClosing) closeWithAnimation(); };
  closeRef.current = close;
  useLayoutEffect(() => { if (isClosing) dialog.release(); }, [isClosing, dialog.release]);

  if (typeof document === 'undefined') return null;
  return (
    <BottomSheetParent.Provider value={dialog.id}>
      {createPortal(
        <div
          className={`bottom-sheet-backdrop ${backdropClassName}`}
          style={{ ...backdropStyle, zIndex: dialog.zIndex }}
          onClick={event => { if (event.target === event.currentTarget) close(); }}
        >
          <div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-modal={dialog.active && !isClosing || undefined}
            aria-label={label}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-hidden={!dialog.active || isClosing || undefined}
            inert={!dialog.active || isClosing}
            tabIndex={-1}
            className={`bottom-sheet-panel ${className}`}
            style={sheetStyle}
            onClick={event => event.stopPropagation()}
          >
            {children({ close, closeButtonProps: { type: 'button', onClick: close, disabled: blocked || isClosing, 'aria-label': 'Close' }, dragHandleProps, isClosing })}
          </div>
        </div>, document.body,
      )}
    </BottomSheetParent.Provider>
  );
}
