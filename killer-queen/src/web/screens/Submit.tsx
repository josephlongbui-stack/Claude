import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
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
  const set = (k: keyof typeof f) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).type === 'checkbox' ? (e.target as HTMLInputElement).checked : (e.target as HTMLInputElement).value });
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
      ctx.toast('Task submitted; markets are open.');
      location.hash = `#/task/${encodeURIComponent(r.task.id)}`;
    } catch (err: any) {
      setErrors(`${err.error} (${err.code})`);
    } finally {
      setBusy(false);
    }
  };
  if (!ctx.me)
    return (
      <div class="empty">
        <a href="#/account">Sign in</a> as a customer to submit a task.
      </div>
    );
  if (ctx.me.role !== 'customer' && ctx.me.role !== 'admin') return <div class="empty">Only customer accounts submit tasks. Create one on the Account page.</div>;
  return (
    <div class="panel" style="max-width:760px">
      <h1>Submit a task</h1>
      <p class="muted">You pay for the signal; traders compete to supply it. You cannot trade on your own task.</p>
      <form onSubmit={submit} data-testid="submit-form">
        <label>Title</label>
        <input value={f.title} onInput={set('title')} required data-testid="f-title" />
        <label>Prompt for the coding agent</label>
        <textarea value={f.prompt} onInput={set('prompt')} required data-testid="f-prompt" />
        <div class="row">
          <div>
            <label>Repo</label>
            <input value={f.repo} onInput={set('repo')} placeholder="github.com/org/repo" required data-testid="f-repo" />
          </div>
          <div>
            <label>Commit</label>
            <input value={f.commit} onInput={set('commit')} placeholder="58b0ce4" required data-testid="f-commit" />
          </div>
        </div>
        <label>Test command (exit 0 = pass)</label>
        <input value={f.testCommand} onInput={set('testCommand')} placeholder="pytest tests/api/test_cart.py" required data-testid="f-test" />
        <label>Candidate agents</label>
        {execs.length === 0 && <p class="muted">No executors registered; run npm run seed.</p>}
        {execs.map((e) => (
          <div>
            <input
              type="checkbox"
              id={`c-${e.id}`}
              style="width:auto"
              checked={chosen.has(e.id)}
              onChange={(ev) => {
                const n = new Set(chosen);
                (ev.target as HTMLInputElement).checked ? n.add(e.id) : n.delete(e.id);
                setChosen(n);
              }}
            />{' '}
            <label for={`c-${e.id}`} style="display:inline; text-transform:none">
              <span class="mono">{e.id}</span> · {e.org} · v{e.version} · {e.passed}/{e.chosen} passed
            </label>
          </div>
        ))}
        <div class="row">
          <div>
            <label>Trading window (minutes)</label>
            <input type="number" min={1} value={f.minutes} onInput={set('minutes')} data-testid="f-minutes" />
          </div>
          <div>
            <label>Auto-decide</label>
            <div>
              <input type="checkbox" style="width:auto" checked={f.autoDecide} onChange={set('autoDecide')} /> pick the highest-priced agent at close
            </div>
          </div>
          <div>
            <label>Private task</label>
            <div>
              <input type="checkbox" style="width:auto" checked={f.privateTask} onChange={set('privateTask')} data-testid="f-private" /> only vetted traders see the packet
            </div>
          </div>
          <div>
            <label>Minimum chance to run (¢)</label>
            <input type="number" min={1} max={99} value={f.minimumChance} onInput={set('minimumChance')} />
          </div>
        </div>
        {errors && <p class="no-c" data-testid="submit-error">{errors}</p>}
        <p>
          <button class="primary" disabled={busy || chosen.size === 0} data-testid="f-submit">
            Open markets
          </button>
        </p>
      </form>
    </div>
  );
}
