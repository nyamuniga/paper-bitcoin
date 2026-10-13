/**
 * Setup global handlers to suppress web-like behaviors (zoom shortcuts,
 * wheel zoom, gesture zoom) ensuring a native desktop/mobile app feel.
 */

if (typeof window !== 'undefined') {
  // Prevent browser zoom via keyboard (Ctrl/Cmd + '+', '-', '0', '=', '_')
  window.addEventListener('keydown', (e) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0' || e.key === '_')
    ) {
      e.preventDefault();
    }
  });

  // Prevent zoom via trackpad / mousewheel with Ctrl/Cmd
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // Prevent Safari / WebKit gesture zooming (multi-touch pinch)
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('gestureend', (e) => e.preventDefault());
}
