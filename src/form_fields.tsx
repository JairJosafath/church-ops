/** Labelled form controls, each tied to its hint and its error for screen readers. */
import { useId, type ReactElement, type ReactNode } from 'react';

import type { ActionMessage } from './use_action';

interface FieldText {
  readonly label: string;
  readonly hint?: string;
  /** What to fix, shown under the field; undefined when it is fine. */
  readonly error?: string | undefined;
}

function describedBy(id: string, { hint, error }: FieldText): string | undefined {
  const ids = [hint === undefined ? '' : `${id}-hint`, error === undefined ? '' : `${id}-error`];
  const joined = ids.filter((part) => part !== '').join(' ');
  return joined === '' ? undefined : joined;
}

function FieldNotes({ id, hint, error }: FieldText & { readonly id: string }): ReactElement {
  return (
    <>
      {hint === undefined ? null : (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      )}
      {error === undefined ? null : (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </>
  );
}

interface TextFieldProps extends FieldText {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: 'text' | 'email' | 'date' | 'datetime-local';
  readonly required?: boolean;
  readonly multiline?: boolean;
  readonly inputMode?: 'text' | 'numeric' | 'decimal';
  readonly autoComplete?: string;
}

export function TextField(props: TextFieldProps): ReactElement {
  const id = useId();
  const common = {
    id,
    value: props.value,
    required: props.required ?? false,
    'aria-invalid': props.error !== undefined,
    'aria-describedby': describedBy(id, props),
  };
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      {props.multiline === true ? (
        <textarea
          {...common}
          rows={4}
          onChange={(event) => {
            props.onChange(event.target.value);
          }}
        />
      ) : (
        <input
          {...common}
          type={props.type ?? 'text'}
          inputMode={props.inputMode ?? 'text'}
          autoComplete={props.autoComplete ?? 'off'}
          onChange={(event) => {
            props.onChange(event.target.value);
          }}
        />
      )}
      <FieldNotes id={id} {...props} />
    </div>
  );
}

interface SelectFieldProps extends FieldText {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly children: ReactNode;
  readonly required?: boolean;
}

export function SelectField(props: SelectFieldProps): ReactElement {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <select
        id={id}
        value={props.value}
        required={props.required ?? false}
        aria-invalid={props.error !== undefined}
        aria-describedby={describedBy(id, props)}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      >
        {props.children}
      </select>
      <FieldNotes id={id} {...props} />
    </div>
  );
}

interface CheckboxFieldProps {
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

export function CheckboxField(props: CheckboxFieldProps): ReactElement {
  const id = useId();
  return (
    <div className="field checkbox">
      <input
        id={id}
        type="checkbox"
        checked={props.checked}
        aria-describedby={props.hint === undefined ? undefined : `${id}-hint`}
        onChange={(event) => {
          props.onChange(event.target.checked);
        }}
      />
      <label htmlFor={id}>{props.label}</label>
      <FieldNotes id={id} {...props} />
    </div>
  );
}

interface NoticeProps {
  /** What happened; null shows nothing, while the live region stays in place. */
  readonly message: string | null;
  readonly tone?: 'info' | 'error';
}

/** A status message, read out by screen readers when it changes. */
export function Notice({ message, tone = 'info' }: NoticeProps): ReactElement {
  return (
    <div className="notice-region" aria-live="polite">
      {message === null ? null : <p className={`notice ${tone}`}>{message}</p>}
    </div>
  );
}

/** What the last action did, or why it failed, in a live region. */
export function ActionNotice({
  message,
}: {
  readonly message: ActionMessage | null;
}): ReactElement {
  return <Notice message={message?.text ?? null} tone={message?.tone ?? 'info'} />;
}
