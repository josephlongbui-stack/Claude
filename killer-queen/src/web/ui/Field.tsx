import type { ComponentChildren } from 'preact';

type Loose = Record<string, unknown> & { class?: string };
import './field.css';

export function Field({ label, htmlFor, help, error, children, class: cls }: { label: string; htmlFor: string; help?: string; error?: string | null; children: ComponentChildren; class?: string }) {
  return (
    <div class={`field ${error ? 'invalid' : ''} ${cls ?? ''}`}>
      <label class="label" for={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p class="help error" role="alert">
          {error}
        </p>
      ) : (
        help && <p class="help">{help}</p>
      )}
    </div>
  );
}

export function Input(props: Loose) {
  return <input {...(props as Record<string, unknown>)} class={`input ${props.class ?? ''}`} />;
}

export function Textarea(props: Loose) {
  return <textarea {...(props as Record<string, unknown>)} class={`input ${props.class ?? ''}`} />;
}

export function Select(props: Loose) {
  return (
    <span class="select">
      <select {...(props as Record<string, unknown>)} class={props.class ?? ''} />
    </span>
  );
}

export function Checkbox({ label, ...props }: Loose & { label: ComponentChildren }) {
  return (
    <label class="check">
      <input type="checkbox" {...(props as Record<string, unknown>)} />
      <span>{label}</span>
    </label>
  );
}
