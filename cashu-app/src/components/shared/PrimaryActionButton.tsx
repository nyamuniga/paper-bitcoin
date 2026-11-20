import type { ComponentPropsWithRef, ReactNode } from 'react';

type NativeButtonProps = ComponentPropsWithRef<'button'>;
type ActionContent =
  | { children: string; 'aria-label'?: string }
  | { children: ReactNode; 'aria-label': string };

export type PrimaryActionButtonProps = Omit<NativeButtonProps, 'type' | 'children' | 'aria-label' | 'aria-busy'> & ActionContent & {
  type: NonNullable<NativeButtonProps['type']>;
  loading?: boolean;
};

/** Callers own labels, icons and workflow; loading only marks and disables the action. */
export function PrimaryActionButton({
  type, loading = false, disabled = false, className, children, ...nativeProps
}: PrimaryActionButtonProps) {
  return (
    <button
      {...nativeProps}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={['primary-action-button', className].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}
