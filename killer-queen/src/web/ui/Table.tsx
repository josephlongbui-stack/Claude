import type { ComponentChildren } from 'preact';
import './table.css';

export interface Column {
  key: string;
  label: ComponentChildren;
  align?: 'left' | 'right';
  /** Hidden under 720 px. */
  hideSm?: boolean;
  /** Hidden under 360 px. */
  hideXs?: boolean;
  /** Screen-reader name for a column whose header is visually empty. */
  sr?: string;
  width?: 'task' | 'narrow';
}

/** A real table: header row, right-aligned numbers, optional caption for screen readers. */
export function Table({ columns, caption, children, class: cls, testId }: { columns: Column[]; caption: string; children: ComponentChildren; class?: string; testId?: string }) {
  return (
    <table class={`table ${cls ?? ''}`} data-testid={testId}>
      <caption class="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th scope="col" class={[c.align === 'right' ? 'r' : '', c.hideSm ? 'hide-sm' : '', c.hideXs ? 'hide-xs' : '', c.width ? `w-${c.width}` : ''].join(' ')}>
              {c.label === '' ? <span class="sr-only">{c.sr ?? 'Actions'}</span> : c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function Tr({ onClick, href, children, class: cls, testId }: { onClick?: () => void; href?: string; children: ComponentChildren; class?: string; testId?: string }) {
  const go = href ? () => (location.hash = href) : onClick;
  const props: Record<string, unknown> = go
    ? { onClick: go, tabIndex: 0, role: 'link', onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && go() }
    : {};
  return (
    <tr class={`${go ? 'link' : ''} ${cls ?? ''}`} data-testid={testId} {...props}>
      {children}
    </tr>
  );
}

export function Td({ children, align, hideSm, hideXs, class: cls, colSpan, rowSpan }: { children?: ComponentChildren; align?: 'right'; hideSm?: boolean; hideXs?: boolean; class?: string; colSpan?: number; rowSpan?: number }) {
  return (
    <td class={[align === 'right' ? 'r' : '', hideSm ? 'hide-sm' : '', hideXs ? 'hide-xs' : '', cls ?? ''].join(' ')} colSpan={colSpan} rowSpan={rowSpan}>
      {children}
    </td>
  );
}

/** Two-line cell: a title and a muted second line (agent, repo…). */
export function TitleCell({ title, sub, href }: { title: ComponentChildren; sub?: ComponentChildren; href?: string }) {
  return (
    <div class="title-cell">
      {href ? (
        <a class="title" href={href}>
          {title}
        </a>
      ) : (
        <span class="title">{title}</span>
      )}
      {sub && <div class="sub">{sub}</div>}
    </div>
  );
}
