import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  const globalWindow = window as Window & {
    global?: Window;
    Buffer?: typeof Buffer;
    process?: { env: Record<string, string> };
  };
  globalWindow.global = window;
  globalWindow.Buffer = Buffer;
  globalWindow.process = { env: {} };
}
