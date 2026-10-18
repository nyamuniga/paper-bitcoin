import { useState, useRef, useCallback, useEffect } from 'react';

interface UseBottomSheetOptions {
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

export function useBottomSheet({ onClose, dismissThreshold = 60, disabled = false }: UseBottomSheetOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const startTimeRef = useRef(0);

  // Lock background scroll and register active sheet
  useEffect(() => {
    registerBottomSheetOpen();
    return () => {
      registerBottomSheetClose();
    };
  }, []);

  // Trigger smooth entrance on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const closeWithAnimation = useCallback(() => {
    if (disabled || isClosing) return;
    setIsClosing(true);
    // Wait for the slide down transition to complete before unmounting
    setTimeout(() => {
      onClose();
    }, 280);
  }, [disabled, isClosing, onClose]);

  const handleStart = useCallback((clientY: number) => {
    if (disabled || isClosing) return;
    startYRef.current = clientY;
    currentYRef.current = clientY;
    startTimeRef.current = Date.now();
    setIsDragging(true);
  }, [disabled, isClosing]);

  const handleMove = useCallback((clientY: number) => {
    if (disabled || !startYRef.current || isClosing) return;
    const deltaY = clientY - startYRef.current;
    if (deltaY > 0) {
      currentYRef.current = clientY;
      setDragY(deltaY);
    }
  }, [disabled, isClosing]);

  const handleEnd = useCallback(() => {
    if (disabled || !startYRef.current || isClosing) return;
    const deltaY = currentYRef.current - startYRef.current;
    const timeDelta = Date.now() - startTimeRef.current;
    const velocity = timeDelta > 0 ? deltaY / timeDelta : 0;

    setIsDragging(false);
    startYRef.current = 0;

    // Dismiss if pulled past threshold or swiped down quickly (> 0.35 px/ms)
    if (deltaY > dismissThreshold || (deltaY > 20 && velocity > 0.35)) {
      closeWithAnimation();
    } else {
      setDragY(0);
    }
  }, [disabled, dismissThreshold, closeWithAnimation, isClosing]);

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

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleStart(e.clientY);

      const onMouseMove = (moveEvent: MouseEvent) => {
        handleMove(moveEvent.clientY);
      };

      const onMouseUp = () => {
        handleEnd();
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [handleStart, handleMove, handleEnd]
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
  };

  const dragHandleProps = disabled
    ? {
        style: { touchAction: 'auto' as const, userSelect: 'auto' as const },
      }
    : {
        onTouchStart,
        onTouchMove,
        onTouchEnd,
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
