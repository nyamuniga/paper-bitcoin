import type { ComponentPropsWithRef, ReactElement } from 'react';

type NativeButtonProps = ComponentPropsWithRef<'button'>;

export type IconButtonProps = Omit<NativeButtonProps, 'type' | 'aria-label' | 'children'> & {
  type: NonNullable<NativeButtonProps['type']>;
  'aria-label': string;
  children: ReactElement;
};

/** Callers own the icon, tooltip, feedback and action; the label names the button. */
export function IconButton({
  type, 'aria-label': label, className, children, ...nativeProps
}: IconButtonProps) {
  return (
    <button
      {...nativeProps}
      type={type}
      aria-label={label}
      className={['icon-button', className].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}
