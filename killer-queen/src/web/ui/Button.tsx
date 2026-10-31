import type { ComponentChildren } from 'preact';

type Loose = Record<string, unknown>;
import './button.css';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'quiet' | 'yes' | 'no';
  /** Filled outcome colour (trade buttons). */
  solid?: boolean;
  size?: 32 | 40;
  block?: boolean;
  href?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: (e: Event) => void;
  children: ComponentChildren;
  class?: string;
  'aria-pressed'?: boolean;
  'aria-label'?: string;
  'data-testid'?: string;
  title?: string;
}

export function Button({ variant = 'secondary', solid, size = 32, block, href, children, class: cls, type = 'button', ...rest }: ButtonProps) {
  const className = ['btn', variant, solid ? 'solid' : '', size === 40 ? 'lg' : '', block ? 'block' : '', cls ?? ''].join(' ');
  if (href) {
    return (
      <a class={className} href={href} {...(rest as Loose)}>
        {children}
      </a>
    );
  }
  return (
    <button class={className} type={type} {...(rest as Loose)}>
      {children}
    </button>
  );
}

export function IconButton({ children, class: cls, ...rest }: Omit<ButtonProps, 'variant' | 'children'> & { children: ComponentChildren; 'aria-label': string }) {
  return (
    <Button variant="quiet" class={`icon-btn ${cls ?? ''}`} {...rest}>
      {children}
    </Button>
  );
}
