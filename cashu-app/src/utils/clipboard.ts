import { readText as tauriReadText, writeText as tauriWriteText } from '@tauri-apps/plugin-clipboard-manager';

/**
 * Reads plain text from clipboard using native Tauri plugin if available,
 * falling back to navigator.clipboard.readText() in standard browser environments.
 */
export async function readClipboardText(): Promise<string> {
  // 1. Try native Tauri clipboard plugin first (essential on Android / iOS / Desktop)
  try {
    const text = await tauriReadText();
    if (typeof text === 'string') {
      return text;
    }
  } catch (err) {

  }

  // 2. Fallback to Web standard navigator.clipboard
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
    try {
      const text = await navigator.clipboard.readText();
      return text || '';
    } catch (webErr) {
      console.warn('navigator.clipboard.readText failed:', webErr);
    }
  }

  return '';
}

/**
 * Writes plain text to clipboard using native Tauri plugin if available,
 * falling back to navigator.clipboard.writeText().
 */
export async function writeClipboardText(text: string, label?: string): Promise<boolean> {
  // 1. Try native Tauri clipboard plugin first
  try {
    await tauriWriteText(text, label ? { label } : undefined);
    return true;
  } catch (err) {

  }

  // 2. Fallback to Web standard navigator.clipboard
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (webErr) {
      console.warn('navigator.clipboard.writeText failed:', webErr);
    }
  }

  return false;
}
