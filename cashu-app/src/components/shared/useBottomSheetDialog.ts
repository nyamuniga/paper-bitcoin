import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

interface Layer {
  id: symbol;
  parent: symbol | null;
  panel: HTMLElement;
  suspended: boolean;
  update: (active: boolean, zIndex: number) => void;
  focus: () => void;
}

export const BottomSheetParent = createContext<symbol | null>(null);
const layers: Layer[] = [];
const topLayer = () => layers[layers.length - 1];
const activeLayer = () => {
  const top = topLayer();
  return top?.suspended ? undefined : top;
};
function updateLayers() {
  layers.forEach((layer, index) => layer.update(layer === activeLayer(), 100 + index));
}

function available(element: HTMLElement | null | undefined): element is HTMLElement {
  if (!element?.isConnected || element.matches(':disabled') || element.closest('[inert],[hidden],[aria-hidden="true"]')) return false;
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && style.visibility !== 'collapse' && element.getClientRects().length > 0;
}

function tabbable(panel: HTMLElement) {
  const elements = [...panel.querySelectorAll<HTMLElement>(
    'a[href],area[href],button,input,select,textarea,iframe,[tabindex],[contenteditable]:not([contenteditable="false"])',
  )].filter(element => element.tabIndex >= 0 && available(element));
  return elements.filter(element => {
    if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || !element.name) return true;
    const group = elements.filter((candidate): candidate is HTMLInputElement => (
      candidate instanceof HTMLInputElement && candidate.type === 'radio'
      && candidate.name === element.name && candidate.form === element.form
    ));
    return element === (group.find(radio => radio.checked) ?? group[0]);
  }).sort((first, second) => (first.tabIndex || Infinity) - (second.tabIndex || Infinity));
}

interface Options {
  panelRef: RefObject<HTMLDivElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  suspended: boolean;
  onEscape: () => void;
}

/** Interaction ownership for this shell's portals; foreign overlays explicitly suspend it. */
export function useBottomSheetDialog(options: Options) {
  const parent = useContext(BottomSheetParent);
  const id = useRef(Symbol('bottom-sheet')).current;
  const current = useRef(options);
  current.current = options;
  const opener = useRef(typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const layerRef = useRef<Layer | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState({ active: false, zIndex: 100 });

  useLayoutEffect(() => {
    const panel = current.current.panelRef.current;
    if (!panel) return;
    const focus = () => {
      const target = [lastFocus.current, current.current.initialFocusRef?.current, ...tabbable(panel)]
        .find(element => available(element) && panel.contains(element));
      (target ?? panel).focus({ preventScroll: true });
      if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    };
    const layer: Layer = {
      id, parent, panel, suspended: current.current.suspended, focus,
      update: (active, zIndex) => {
        setState(previous => previous.active === active && previous.zIndex === zIndex ? previous : { active, zIndex });
        if (active) queueMicrotask(() => {
          if (activeLayer() === layer && !panel.contains(document.activeElement)) focus();
        });
      },
    };
    layerRef.current = layer;
    // Child layout effects can register before their parent on an initial nested mount.
    const child = layers.findIndex(candidate => candidate.parent === id);
    layers.splice(child < 0 ? layers.length : child, 0, layer);
    updateLayers();

    const keyboard = (event: KeyboardEvent) => {
      if (activeLayer() !== layer) return;
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        if (!event.defaultPrevented) {
          event.preventDefault();
          current.current.onEscape();
        }
      } else if (event.key === 'Tab' && !event.defaultPrevented) {
        const controls = tabbable(panel);
        const position = controls.indexOf(document.activeElement as HTMLElement);
        if (!controls.length || position < 0 || (event.shiftKey ? position === 0 : position === controls.length - 1)) {
          event.preventDefault();
          (event.shiftKey ? controls[controls.length - 1] ?? panel : controls[0] ?? panel).focus();
        }
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (activeLayer() !== layer) return;
      if (event.target instanceof HTMLElement && panel.contains(event.target)) lastFocus.current = event.target;
      else focus();
    };
    document.addEventListener('keydown', keyboard);
    document.addEventListener('focusin', containFocus);

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const wasTop = topLayer() === layer;
      layers.splice(layers.indexOf(layer), 1);
      layerRef.current = null;
      document.removeEventListener('keydown', keyboard);
      document.removeEventListener('focusin', containFocus);
      updateLayers();
      if (wasTop) queueMicrotask(() => {
        const active = activeLayer();
        const target = [current.current.returnFocusRef?.current, opener.current].find(available);
        if (active) {
          if (target && active.panel.contains(target)) target.focus({ preventScroll: true });
          else if (!active.panel.contains(document.activeElement)) active.focus();
        } else if (!topLayer()) {
          const focused = document.activeElement;
          if (focused instanceof HTMLElement && focused !== document.body && !panel.contains(focused)) return;
          if (target) target.focus({ preventScroll: true });
          else {
            const previous = document.body.getAttribute('tabindex');
            document.body.tabIndex = -1;
            document.body.focus({ preventScroll: true });
            if (previous === null) document.body.removeAttribute('tabindex');
            else document.body.setAttribute('tabindex', previous);
          }
        }
      });
    };
    releaseRef.current = release;
    return release;
  }, [id, parent]);

  useLayoutEffect(() => {
    if (layerRef.current) {
      layerRef.current.suspended = options.suspended;
      updateLayers();
    }
  }, [options.suspended]);

  const release = useCallback(() => releaseRef.current?.(), []);
  return { ...state, id, release };
}
