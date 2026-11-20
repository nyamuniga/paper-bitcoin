import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export interface PaymentPageLayoutProps extends ComponentPropsWithoutRef<'main'> {
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  bodyLabel: string;
  bodyClassName?: string;
}

export function PaymentPageLayout({
  header,
  children,
  footer,
  bodyLabel,
  bodyClassName = '',
  className = '',
  ...props
}: PaymentPageLayoutProps) {
  return (
    <main {...props} className={`payment-page-layout ${className}`}>
      <div className="payment-page-layout__header">{header}</div>
      <div
        className={`payment-page-layout__body ${bodyClassName}`}
        role="region"
        aria-label={bodyLabel}
        tabIndex={0}
      >
        {children}
      </div>
      {footer != null && footer !== false && (
        <div className="payment-page-layout__footer">{footer}</div>
      )}
    </main>
  );
}
