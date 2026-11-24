import { useEffect, useState, type ComponentProps, type ComponentType } from 'react';
import type { Scanner as QrScanner } from '@yudiel/react-qr-scanner';

export type LazyQrScannerProps = ComponentProps<typeof QrScanner>;

let cachedScanner: ComponentType<LazyQrScannerProps> | null = null;
let loadPromise: Promise<ComponentType<LazyQrScannerProps>> | null = null;

function loadScanner(): Promise<ComponentType<LazyQrScannerProps>> {
  if (!loadPromise) {
    loadPromise = import('@yudiel/react-qr-scanner').then((mod) => {
      cachedScanner = mod.Scanner;
      return mod.Scanner;
    });
  }
  return loadPromise;
}

export function LazyQrScanner(props: LazyQrScannerProps) {
  const [ScannerComponent, setScannerComponent] =
    useState<ComponentType<LazyQrScannerProps> | null>(() => cachedScanner);

  useEffect(() => {
    if (ScannerComponent) return;
    let active = true;
    loadScanner().then((loaded) => {
      if (active) setScannerComponent(() => loaded);
    });
    return () => {
      active = false;
    };
  }, [ScannerComponent]);

  if (!ScannerComponent) return null;
  return <ScannerComponent {...props} />;
}
