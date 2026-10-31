import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import type { Ctx } from '../main.js';
import { Button, Checkbox, EmptyState, Field, Input, PageHead, Panel, PanelBody, Textarea } from '../ui/index.js';
import { words } from './Market.js';

export function Submit({ ctx }: { ctx: Ctx }) {
  const [execs, setExecs] = useState<any[]>([]);
  const [f, setF] = useState({ title: '', prompt: '', repo: '', commit: '', testCommand: '', minutes: '60', autoDecide: false, minimumChance: '60', privateTask: false });
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof f, string>>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ executors: any[] }>('GET', '/api/executors')
      .then((r) => {
        setExecs(r.executors);
        setChosen(new Set(r.executors.map((e) => e.id)));
      })
      .catch(() => setExecs([]));
  }, []);
  const set = (k: keyof typeof f) => (e: Event) => {
    const el = e.target as HTMLInputElement;
    setF({ ...f, [k]: el.type === 'checkbox' ? el.checked : el.value });
  };
  if (!ctx.me) return <EmptyState page title="Sign in as a customer to submit a task" hint="Customers submit tasks and choose the agent; they never trade their own markets." action={{ href: '#/signin', label: 'Sign in' }} />;
  if (ctx.me.role !== 'customer' && ctx.me.role !== 'admin') return <EmptyState page title="Only customer accounts submit tasks" hint="Your account is a trader account. Create a customer account to open markets on your own tasks." action={{ href: '#/signin', label: 'Create a customer account' }} />;
  /** Our own validation, in our own words: no browser bubbles. Returns the id of the first field to fix. */
  const check = (): string | null => {
    const errs: Partial<Record<keyof typeof f, string>> = {};
    if (f.title.trim() === '') errs.title = 'Give the task a title.';
    if (f.prompt.trim() === '') errs.prompt = 'Write the prompt the agent will get.';
    if (f.repo.trim() === '') errs.repo = 'Name the repository, such as github.com/org/repo.';
    const commit = f.commit.trim();
    if (commit === '') errs.commit = 'Pin a commit.';
    else if (!/^[0-9a-fA-F]{7,40}$/.test(commit)) errs.commit = `A commit is 7 or 40 hex characters; this one has ${commit.length}.`;
    if (f.testCommand.trim() === '') errs.testCommand = 'Give the command that must go from failing to passing.';
    setFieldErrors(errs);
    const first = (['title', 'prompt', 'repo', 'commit', 'testCommand'] as const).find((k) => errs[k]);
    return first ? { title: 'f-title', prompt: 'f-prompt', repo: 'f-repo', commit: 'f-commit', testCommand: 'f-test' }[first] : null;
  };
  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    const bad = check();
    if (bad) {
      document.getElementById(bad)?.focus();
      return;
    }
    if (chosen.size === 0) {
      setError('Pick at least one candidate agent.');
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ task: { id: string } }>('POST', '/api/tasks', {
        title: f.title.trim(),
        prompt: f.prompt.trim(),
        repo: f.repo.trim(),
        commit: f.commit.trim(),
        testCommand: f.testCommand.trim(),
        candidateAgents: [...chosen],
        tradingWindowMs: Math.max(1, Number(f.minutes) || 1) * 60_000,
        autoDecide: f.autoDecide,
        minimumChance: Math.min(99, Math.max(1, Number(f.minimumChance) || 60)),
        visibility: f.privateTask ? 'private' : 'public',
      });
      ctx.toast('Task submitted. Markets open once the baseline check confirms the tests fail.');
      location.hash = `#/task/${encodeURIComponent(r.task.id)}`;
    } catch (err: any) {
      setError(words(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHead title="Submit a task" sub="One market opens per candidate agent once the baseline check confirms the tests fail at your commit. Traders price each agent's chance; you pick which one runs." />
      <div class="submit-grid">
        <Panel>
          <PanelBody>
            <form onSubmit={submit} noValidate data-testid="submit-form" class="submit-form">
              <Field label="Title" htmlFor="f-title" help="One line, the way you would name a pull request: Reject negative quantities in the cart API." error={fieldErrors.title}>
                <Input id="f-title" value={f.title} onInput={set('title')} maxLength={200} aria-invalid={!!fieldErrors.title} data-testid="f-title" />
              </Field>
              <Field label="Prompt for the agent" htmlFor="f-prompt" help="Traders and the runner see this exactly as written. Say what to change and what done looks like." error={fieldErrors.prompt}>
                <Textarea id="f-prompt" value={f.prompt} onInput={set('prompt')} maxLength={8000} aria-invalid={!!fieldErrors.prompt} data-testid="f-prompt" />
              </Field>
              <div class="two-up">
                <Field label="Repository" htmlFor="f-repo" help="As github.com/org/repo." error={fieldErrors.repo}>
                  <Input id="f-repo" value={f.repo} onInput={set('repo')} aria-invalid={!!fieldErrors.repo} data-testid="f-repo" />
                </Field>
                <Field label="Commit" htmlFor="f-commit" help="Seven or forty hex characters." error={fieldErrors.commit}>
                  <Input id="f-commit" value={f.commit} onInput={set('commit')} aria-invalid={!!fieldErrors.commit} data-testid="f-commit" />
                </Field>
              </div>
              <Field label="Test command" htmlFor="f-test" help="Exit code 0 is a pass; pytest tests/api/test_cart.py, for example. It must fail three times at the commit before trading opens." error={fieldErrors.testCommand}>
                <Input id="f-test" value={f.testCommand} onInput={set('testCommand')} aria-invalid={!!fieldErrors.testCommand} data-testid="f-test" />
              </Field>
              <fieldset class="field candidates">
                <legend class="label">Candidate agents</legend>
                {execs.length === 0 && <p class="help">No agents are registered yet.</p>}
                {execs.map((e) => (
                  <Checkbox
                    key={e.id}
                    checked={chosen.has(e.id)}
                    onChange={(ev: Event) => {
                      const n = new Set(chosen);
                      (ev.target as HTMLInputElement).checked ? n.add(e.id) : n.delete(e.id);
                      setChosen(n);
                    }}
                    label={
                      <span>
                        {e.name} <span class="ink-3">{e.version}</span>{' '}
                        <span class="ink-2">{(e.byVersion?.[e.version]?.chosen ?? 0) === 0 ? 'No runs yet on this version' : `Passed ${e.byVersion[e.version].passed} of ${e.byVersion[e.version].chosen} on this version`}</span>
                      </span>
                    }
                  />
                ))}
              </fieldset>
              <div class="two-up">
                <Field label="Trading window" htmlFor="f-minutes" help="Minutes from the baseline check to the close.">
                  <span class="input-suffix">
                    <Input id="f-minutes" type="number" inputMode="numeric" min={1} value={f.minutes} onInput={set('minutes')} data-testid="f-minutes" />
                    <span class="sfx">min</span>
                  </span>
                </Field>
                <Field label="Minimum chance to run" htmlFor="f-min" help="Used only when auto-decide is on.">
                  <span class="input-suffix">
                    <Input id="f-min" type="number" inputMode="numeric" min={1} max={99} value={f.minimumChance} onInput={set('minimumChance')} />
                    <span class="sfx">%</span>
                  </span>
                </Field>
              </div>
              <div class="field checks">
                <Checkbox checked={f.autoDecide} onChange={set('autoDecide')} label="Auto-decide: run the market's favourite at close if it reaches the minimum chance" />
                <Checkbox checked={f.privateTask} onChange={set('privateTask')} label="Private task: only vetted traders see the packet and the markets" data-testid="f-private" />
              </div>
              {error && (
                <p class="help error" role="alert" data-testid="submit-error">
                  {error}
                </p>
              )}
              <div class="submit-actions">
                <Button type="submit" variant="primary" size={40} disabled={busy} data-testid="f-submit">
                  Submit task
                </Button>
              </div>
            </form>
          </PanelBody>
        </Panel>
        <aside class="submit-aside" aria-label="What happens next">
          <h2 class="t-ui">What happens next</h2>
          <ol>
            <li>The runner runs your test command three times at the commit with no agent. All three must fail; otherwise the task is rejected as trivial or flaky.</li>
            <li>Markets open with house quotes. People and AI agents trade until the window closes.</li>
            <li>You pick the agent to run, or auto-decide picks the favourite. The other markets settle at their closing price.</li>
            <li>The runner executes the pick in a sandbox, restores the test files, runs the tests once, and signs the result. You get the log.</li>
          </ol>
          <h2 class="t-ui">Good tasks</h2>
          <ul>
            <li>A test command narrowed to the files that matter.</li>
            <li>A prompt that says what done looks like.</li>
            <li>A commit the tests really fail at.</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
