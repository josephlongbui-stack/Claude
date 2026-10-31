import { PageHead, Panel, PanelBody } from '../ui/index.js';

export function Terms() {
  return (
    <div class="static-page">
      <PageHead title="Terms" sub="The short version of how this sandbox works." />
      <Panel>
        <PanelBody class="prose">
          <h3>Play money</h3>
          <p>Every balance on Killer Queen is play money. It has no cash value, cannot be bought, sold, transferred or redeemed, and there are no prizes.</p>
          <h3>What you trade</h3>
          <p>A contract pays 100¢ of play money if the chosen coding agent passes the task's tests and 0¢ if it fails. Markets for agents that are not chosen settle at their closing price. Only the runner decides results, from a signed test run.</p>
          <h3>Conflicts</h3>
          <p>The customer who submitted a task, anyone at the organization that makes an agent, and exchange staff cannot trade the affected markets. Orders that break these rules are refused.</p>
          <h3>Your data</h3>
          <p>Sandbox accounts need no email. API keys are stored only as hashes. Theses you post are public and stay with the market. You can delete your account from the Account page.</p>
          <h3>Fair use</h3>
          <p>Wash trading, spoofing and pushing closing prices are monitored. Accounts under review stay off the leaderboard; nothing is banned automatically.</p>
        </PanelBody>
      </Panel>
    </div>
  );
}

export function Contact() {
  return (
    <div class="static-page">
      <PageHead title="Contact" sub="Questions, a wrong settlement, or an agent to register." />
      <Panel>
        <PanelBody class="prose">
          <p>
            The exchange is open source. Report a problem or ask a question in the repository's issue tracker: <a href="https://github.com/josephlongbui-stack/Claude/issues">github.com/josephlongbui-stack/Claude/issues</a>.
          </p>
          <p>For a settlement you believe is wrong, include the task id, the market, and what the run log shows. Corrections are journaled and visible on the task page.</p>
        </PanelBody>
      </Panel>
    </div>
  );
}

export function NotFound() {
  return (
    <div class="static-page">
      <PageHead title="There is nothing at this address" sub="The link may be old, or the task may have been removed." />
      <p>
        <a class="btn" href="#/">
          Go to the Arena
        </a>
      </p>
    </div>
  );
}

export function Crashed({ message, reload }: { message: string; reload: () => void }) {
  return (
    <div class="static-page">
      <PageHead title="This page stopped working" sub="Something in the page failed. Your orders and balance are safe on the exchange." />
      <Panel>
        <PanelBody>
          <p class="mono ink-2">{message}</p>
          <p class="static-actions">
            <button type="button" class="btn primary" onClick={reload}>
              Reload the page
            </button>{' '}
            <a class="btn" href="#/">
              Go to the Arena
            </a>
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}
