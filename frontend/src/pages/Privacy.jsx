import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

export default function Privacy() {
  return (
    <div className="landing">
      <PublicNav />

      <div className="legal-content">
        <div className="eyebrow mb-2">Legal</div>
        <div className="page-title mb-2" style={{ fontSize: 30 }}>
          Privacy Policy
        </div>
        <div className="text-faint mb-4" style={{ fontSize: 12.5 }}>
          Draft — not yet reviewed by a lawyer
        </div>

        <div className="panel p-4 mb-4" style={{ borderColor: 'var(--gold)' }}>
          <div style={{ fontSize: 13, color: 'var(--gold)' }}>
            <i className="bi bi-exclamation-triangle me-2" />
            This page is a draft written for a personal project. It has not been reviewed by a
            lawyer and should not be relied on as a binding privacy policy until it has been.
          </div>
        </div>

        <h2>What we collect</h2>
        <p>
          When you create an account, we collect your email address, display name, and a
          password (stored only as a salted hash — we never see or store it in plain text).
        </p>
        <p>
          Everything else in Ledger is data you choose to enter yourself: account names and
          balances, transactions, budgets, and categories. Ledger does not connect to your bank
          or any financial institution — there are no bank credentials to hand over, because we
          never ask for them.
        </p>

        <h2>How we use it</h2>
        <p>
          Your information is used solely to provide the service: showing your accounts,
          transactions, budgets, and related figures back to you. We do not use your data for
          advertising, and we do not sell or rent it to third parties.
        </p>

        <h2>Cookies &amp; local storage</h2>
        <p>
          Ledger doesn&rsquo;t use tracking cookies or third-party analytics. Your session token
          and a few display preferences (like your last-viewed account) are kept in your
          browser&rsquo;s local storage so you stay signed in and the app remembers small
          conveniences — this data never leaves your device except to authenticate requests to
          our servers.
        </p>

        <h2>Storage &amp; security</h2>
        <p>
          Your data is stored in a database we operate. Passwords are hashed with BCrypt.
          Sign-in sessions use a signed token that expires after 7 days, after which you&rsquo;ll
          need to sign in again.
        </p>

        <h2>Data retention &amp; deletion</h2>
        <p>
          We retain your data for as long as your account is active. If you&rsquo;d like your
          account and data deleted, contact us using the details below.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          If this policy changes in a material way, we&rsquo;ll update this page and adjust the
          date at the top.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy, or requests to delete your data, can be sent to{' '}
          <span className="mono">[support email goes here]</span>.
        </p>
      </div>

      <PublicFooter />
    </div>
  );
}
