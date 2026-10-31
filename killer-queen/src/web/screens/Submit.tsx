import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { Card, EmptyState } from '../components/index.js';
import type { Ctx } from '../main.js';

export function Submit({ ctx }: { ctx: Ctx }) {
  const [execs, setExecs] = useState<any[]>([]);
  const [f, setF] = useState({ title: '', prompt: '', repo: '', commit: '', testCommand: '', minutes: 10, autoDecide: false, minimumChance: 60, privateTask: false });
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ executors: any[] }>('GET', '/api/executors').then((r) => {
      setExecs(r.executors);
      setChosen(new Set(r.executors.map((e) => e.id)));
    });
  }, []);
  const set = (k: keyof typeof f) => (e: Event) => {
    const el = e.target as HTMLInputElement;
    setF({ ...f, [k]: el.type === 'checkbox' ? el.checked : el.value });
  };
  const submit = async (e: Event) => {
    e.preventDefault();
    setErrors(null);
    setBusy(true);
    try {
      const r = await api<{ task: { id: string } }>('POST', '/api/tasks', {
        title: f.title,
        prompt: f.prompt,
        repo: f.repo,
        commit: f.commit,
        testCommand: f.testCommand,
        candidateAgents: [...chosen],
        tradingWindowMs: Math.max(1, Number(f.minutes)) * 60_000,
        autoDecide: f.autoDecide,
        minimumChance: Number(f.minimumChance),
        visibility: f.privateTask ? 'private' : 'public',
      });
      ctx.toast('Task submitted. Markets open after the baseline check.');
      location.hash = `#/task/${encodeURIComponent(r.task.id)}`;
    } catch (err: any) {
      setErrors(`${err.error} (${err.code})`);
    } finally {
      setBusy(false);
    }
  };
  if (!ctx.me) return <EmptyState title="Sign in as a customer to submit a task" hint="Customers submit tasks and pick the agent; they never trade their own markets." action={{ href: '#/account', label: 'Sign in or create an account' }} />;
  if (ctx.me.role !== 'customer' && ctx.me.role !== 'admin') return <EmptyState title="Only customer accounts submit tasks" hint="Create a customer account on the Account page to open markets." action={{ href: '#/account', label: 'Go to Account' }} />;
  return (
    <div class="stack" style="gap:20px">
      <div class="page-head">
        <div>
          <h1>Submit a task</h1>
          <p class="sub">One market per candidate agent opens once the baseline check passes. You pay for the signal; traders compete to supply it.</p>
        </div>
      </div>
      <div class="split">
        <Card>
          <form onSubmit={submit} data-testid="submit-form" class="stack" style="gap:16px">
            <div class="field" style="margin:0">
              <label for="f-title">Title</label>
              <input id="f-title" value={f.title} onInput={set('title')} required placeholder="Reject negative quantities in the cart API" data-testid="f-title" />
            </div>
            <div class="field" style="margin:0">
              <label for="f-prompt">Prompt for the coding agent</label>
              <textarea id="f-prompt" value={f.prompt} onInput={set('prompt')} required placeholder="What the agent should change, and what done looks like." data-testid="f-prompt" />
              <p class="help">Traders and the runner see this exactly as written.</p>
            </div>
            <div class="fields">
              <div>
                <label for="f-repo">Repository</label>
                <input id="f-repo" value={f.repo} onInput={set('repo')} placeholder="github.com/org/repo" required data-testid="f-repo" />
              </div>
              <div>
                <label for="f-commit">Commit</label>
                <input id="f-commit" value={f.commit} onInput={set('commit')} placeholder="58b0ce4" required data-testid="f-commit" />
              </div>
            </div>
            <div class="field" style="margin:0">
              <label for="f-test">Test command</label>
              <input id="f-test" value={f.testCommand} onInput={set('testCommand')} placeholder="pytest tests/api/test_cart.py" required data-testid="f-test" />
              <p class="help">Exit code 0 means pass. It must fail three times at the pinned commit before trading opens.</p>
            </div>
            <div>
              <label>Candidate agents</label>
              {execs.length === 0 && <p class="muted">No agents registered yet.</p>}
              <div class="stack" style="gap:8px">
                {execs.map((e) => (
                  <label class="check" style="margin:0;font-weight:400">
                    <input
                      type="checkbox"
                      checked={chosen.has(e.id)}
                      onChange={(ev) => {
                        const n = new Set(chosen);
                        (ev.target as HTMLInputElement).checked ? n.add(e.id) : n.delete(e.id);
                        setChosen(n);
                      }}
                    />
                    <span>
                      <b>{e.name}</b> <span class="muted">· {e.org} · v{e.version} · {e.passed}/{e.chosen} passed</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div class="fields">
              <div>
                <label for="f-minutes">Trading window (minutes)</label>
                <input id="f-minutes" type="number" min={1} value={f.minutes} onInput={set('minutes')} data-testid="f-minutes" />
              </div>
              <div>
                <label for="f-min">Minimum chance to auto-run (¢)</label>
                <input id="f-min" type="number" min={1} max={99} value={f.minimumChance} onInput={set('minimumChance')} />
              </div>
            </div>
            <div class="stack" style="gap:8px">
              <label class="check" style="margin:0;font-weight:400">
                <input type="checkbox" checked={f.autoDecide} onChange={set('autoDecide')} />
                <span>Auto-decide: run the market's favourite at close if it reaches the minimum chance</span>
              </label>
              <label class="check" style="margin:0;font-weight:400">
                <input type="checkbox" checked={f.privateTask} onChange={set('privateTask')} data-testid="f-private" />
                <span>Private task: only vetted traders see the packet and markets</span>
              </label>
            </div>
            {errors && (
              <div class="callout no" data-testid="submit-error">
                {errors}
              </div>
            )}
            <div class="row">
              <button class="primary lg" disabled={busy || chosen.size === 0} data-testid="f-submit">
                Open markets
              </button>
              <span class="muted" style="font-size:12.5px">
                {chosen.size} market{chosen.size === 1 ? '' : 's'} will open
              </span>
            </div>
          </form>
        </Card>
        <div class="side stack" style="gap:16px">
          <Card title="What happens next">
            <ol class="stack muted" style="margin:0;padding-left:18px;gap:6px;font-size:13.5px">
              <li>The runner runs your test command three times at the pinned commit. All three must fail, or the task is rejected as trivial or flaky.</li>
              <li>Markets open with house quotes; humans and agents trade for the window you set.</li>
              <li>At close you pick the agent to run, or let auto-decide pick the favourite.</li>
              <li>The runner executes it in a sandbox and signs the result; you get the log.</li>
            </ol>
          </Card>
          <Card title="Good tasks">
            <ul class="stack muted" style="margin:0;padding-left:18px;gap:6px;font-size:13.5px">
              <li>A test command narrowed to the files that matter.</li>
              <li>A prompt that says what done looks like.</li>
              <li>Public repos first; private tasks reach vetted traders only.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
