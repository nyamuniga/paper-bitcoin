import { useState, useRef, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';

interface UseBottomSheetOptions {
  modal?: boolean;
  onClose: () => void;
  dismissThreshold?: number;
  disabled?: boolean;
}

let openBottomSheetCount = 0;

export function registerBottomSheetOpen() {
  openBottomSheetCount++;
  if (openBottomSheetCount === 1) {
    document.documentElement.classList.add('has-bottom-sheet-open');
    document.body.classList.add('has-bottom-sheet-open');
  }
}

export function registerBottomSheetClose() {
  openBottomSheetCount = Math.max(0, openBottomSheetCount - 1);
  if (openBottomSheetCount === 0) {
    document.documentElement.classList.remove('has-bottom-sheet-open');
    document.body.classList.remove('has-bottom-sheet-open');
  }
}

export function useBottomSheet({ onClose, dismissThreshold = 60, disabled = false, modal = true }: UseBottomSheetOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const startYRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const closeCleanupRef = useRef<(() => void) | null>(null);
  const mouseCleanupRef = useRef<(() => void) | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const currentYRef = useRef(0);
  const startTimeRef = useRef(0);

  // Lock background scroll and register active sheet
  useEffect(() => {
    if (!modal || isClosing) return;
    registerBottomSheetOpen();
    return () => {
      registerBottomSheetClose();
    };
  }, [modal, isClosing]);

  // Trigger smooth entrance on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => {
    closeCleanupRef.current?.();
    mouseCleanupRef.current?.();
  }, []);

  const closeWithAnimation = useCallback(() => {
    if (disabled || closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    setIsDragging(false);
    startYRef.current = null;
    mouseCleanupRef.current?.();

    let finished = false;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', finishBeforeInteraction, true);
      document.removeEventListener('keydown', finishBeforeInteraction, true);
      closeCleanupRef.current = null;
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      onCloseRef.current();
    };
    // Release the owner's "open" state before the next button processes a press.
    // Otherwise reopening this same sheet during its exit is a no-op.
    const finishBeforeInteraction = () => flushSync(finish);
    document.addEventListener('pointerdown', finishBeforeInteraction, true);
    document.addEventListener('keydown', finishBeforeInteraction, true);
    timer = setTimeout(finish, 280);
    closeCleanupRef.current = cleanup;
  }, [disabled]);

  const handleStart = useCallback((clientY: number) => {
    if (disabled || closingRef.current) return;
    startYRef.current = clientY;
    currentYRef.current = clientY;
    startTimeRef.current = Date.now();
    setIsDragging(true);
  }, [disabled]);

  const handleMove = useCallback((clientY: number) => {
    if (disabled || startYRef.current === null || closingRef.current) return;
    const deltaY = clientY - startYRef.current;
    currentYRef.current = clientY;
    setDragY(Math.max(0, deltaY));
  }, [disabled]);

  const handleEnd = useCallback(() => {
    if (disabled || startYRef.current === null || closingRef.current) return;
    const deltaY = currentYRef.current - startYRef.current;
    const timeDelta = Date.now() - startTimeRef.current;
    const velocity = timeDelta > 0 ? deltaY / timeDelta : 0;

    setIsDragging(false);
    startYRef.current = null;

    // Dismiss if pulled past threshold or swiped down quickly (> 0.35 px/ms)
    if (deltaY > dismissThreshold || (deltaY > 20 && velocity > 0.35)) {
      closeWithAnimation();
    } else {
      setDragY(0);
    }
  }, [disabled, dismissThreshold, closeWithAnimation]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      handleStart(e.touches[0].clientY);
    },
    [handleStart]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      handleMove(e.touches[0].clientY);
    },
    [handleMove]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      handleEnd();
    },
    [handleEnd]
  );

  const onTouchCancel = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    startYRef.current = null;
    setIsDragging(false);
    setDragY(0);
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled || closingRef.current) return;
      mouseCleanupRef.current?.();
      handleStart(e.clientY);

      const onMouseMove = (moveEvent: MouseEvent) => {
        handleMove(moveEvent.clientY);
      };

      const onMouseUp = () => {
        handleEnd();
        cleanup();
      };
      const cleanup = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        mouseCleanupRef.current = null;
      };
      mouseCleanupRef.current = cleanup;

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [disabled, handleStart, handleMove, handleEnd]
  );

  // Compute transform:
  // Closed / Closing: 100% off-screen bottom
  // Dragging: follows finger in pixels
  // Open: resting at 0
  const currentTransform = !isOpen || isClosing
    ? 'translate3d(0, 100%, 0)'
    : dragY > 0
    ? `translate3d(0, ${dragY}px, 0)`
    : 'translate3d(0, 0, 0)';

  // Compute transition curve:
  // Dragging: none (instant response)
  // Closing: smooth natural gravity exit (cubic-bezier(0.32, 0.72, 0, 1))
  // Opening / Snapping back: spring easing (cubic-bezier(0.16, 1, 0.3, 1))
  const currentTransition = isDragging
    ? 'none'
    : isClosing
    ? 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)'
    : 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)';

  const sheetStyle: React.CSSProperties = {
    transform: currentTransform,
    transition: currentTransition,
    willChange: 'transform',
    pointerEvents: isClosing ? 'none' : undefined,
  };

  const backdropOpacity = !isOpen || isClosing
    ? 0
    : dragY > 0
    ? Math.max(0.05, 1 - dragY / 320)
    : 1;

  const backdropStyle: React.CSSProperties = {
    opacity: backdropOpacity,
    transition: isDragging ? 'none' : 'opacity 260ms ease',
    willChange: 'opacity',
    pointerEvents: isClosing ? 'none' : undefined,
  };

  const dragHandleProps = disabled
    ? {
        style: { touchAction: 'auto' as const, userSelect: 'auto' as const },
      }
    : {
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        onTouchCancel,
        onMouseDown,
        style: { touchAction: 'none' as const, userSelect: 'none' as const },
      };

  return {
    dragHandleProps,
    sheetStyle,
    backdropStyle,
    isClosing,
    closeWithAnimation,
  };
}
