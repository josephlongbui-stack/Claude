import type { ComponentChildren } from 'preact';
import './panel.css';

/** A bordered surface; the only container. */
export function Panel({ children, class: cls, testId }: { children: ComponentChildren; class?: string; testId?: string }) {
  return (
    <div class={`panel ${cls ?? ''}`} data-testid={testId}>
      {children}
    </div>
  );
}

export function PanelHead({ title, aside, children }: { title?: ComponentChildren; aside?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class="panel-head">
      {title && <h2 class="panel-title">{title}</h2>}
      {children}
      {aside && <span class="panel-aside">{aside}</span>}
    </div>
  );
}

export function PanelBody({ children, class: cls }: { children: ComponentChildren; class?: string }) {
  return <div class={`panel-body ${cls ?? ''}`}>{children}</div>;
}

/** Section title with a right-hand note ("2 open"). */
export function SectionHead({ title, aside, level = 2 }: { title: ComponentChildren; aside?: ComponentChildren; level?: 2 | 3 }) {
  return (
    <div class="section-head">
      {level === 2 ? <h2>{title}</h2> : <h3>{title}</h3>}
      {aside && <span class="section-aside">{aside}</span>}
    </div>
  );
}

/** Page header: title, optional sub line, optional right-hand control. */
export function PageHead({ title, sub, aside, children }: { title: ComponentChildren; sub?: ComponentChildren; aside?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class="page-head">
      <div class="page-head-main">
        <h1 class="page-title">{title}</h1>
        {sub && <p class="page-sub">{sub}</p>}
        {children}
      </div>
      {aside && <div class="page-head-aside">{aside}</div>}
    </div>
  );
}
