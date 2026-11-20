import { useId } from 'react';
import type { ReactElement } from 'react';

export interface FormFieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface FormFieldProps {
  id?: string;
  label: string;
  hint?: string | null;
  error?: string | null;
  describedBy?: string;
  className?: string;
  labelClassName?: string;
  hintClassName?: string;
  errorClassName?: string;
  children: (control: FormFieldControlProps) => ReactElement;
}

/** Spread the supplied attributes onto the caller-owned input or textarea. */
export function FormField({
  id, label, hint, error, describedBy, className, labelClassName,
  hintClassName, errorClassName, children,
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? `field-${generatedId}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const descriptionIds = [describedBy, hint ? hintId : undefined, error ? errorId : undefined]
    .filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
  const control: FormFieldControlProps = {
    id: controlId,
    'aria-describedby': [...new Set(descriptionIds)].join(' ') || undefined,
    'aria-invalid': error ? true : undefined,
  };

  return (
    <div className={['form-field', className].filter(Boolean).join(' ')}>
      <label htmlFor={controlId} className={['form-field-label', labelClassName].filter(Boolean).join(' ')}>
        {label}
      </label>
      {children(control)}
      {hint && <p id={hintId} className={['form-field-hint', hintClassName].filter(Boolean).join(' ')}>{hint}</p>}
      {error && <p id={errorId} role="alert" className={['form-field-error', errorClassName].filter(Boolean).join(' ')}>{error}</p>}
    </div>
  );
}
