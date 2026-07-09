import { Link } from 'react-router-dom';
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

export default function Terms() {
  return (
    <div className="landing">
      <PublicNav />

      <div className="legal-content">
        <div className="eyebrow mb-2">Legal</div>
        <div className="page-title mb-2" style={{ fontSize: 30 }}>
          Terms of Service
        </div>
        <div className="text-faint mb-4" style={{ fontSize: 12.5 }}>
          Draft — not yet reviewed by a lawyer
        </div>

        <div className="panel p-4 mb-4" style={{ borderColor: 'var(--gold)' }}>
          <div style={{ fontSize: 13, color: 'var(--gold)' }}>
            <i className="bi bi-exclamation-triangle me-2" />
            This page is a draft written for a personal project. It has not been reviewed by a
            lawyer and should not be relied on as a binding legal agreement until it has been.
          </div>
        </div>

        <h2>1. Acceptance of terms</h2>
        <p>
          By creating an account or using Ledger, you agree to these terms. If you don&rsquo;t
          agree, please don&rsquo;t use the service.
        </p>

        <h2>2. What Ledger is</h2>
        <p>
          Ledger is a personal tool for manually tracking accounts, transactions, credit card
          bills, and budgets. It does not connect to any bank or financial institution, and it
          does not move money, initiate payments, or manage your funds in any way.
        </p>
        <p>
          Ledger is provided for informational and organizational purposes only. It is not
          financial, investment, tax, or legal advice, and shouldn&rsquo;t be treated as a
          substitute for professional advice.
        </p>

        <h2>3. Your account</h2>
        <p>
          You&rsquo;re responsible for the accuracy of the information you enter, for keeping
          your password secure, and for anything that happens under your account. Let us know if
          you believe your account has been accessed without your permission.
        </p>

        <h2>4. Acceptable use</h2>
        <p>
          Use Ledger only for its intended purpose. Don&rsquo;t attempt to disrupt the service,
          access another user&rsquo;s data, or use it for anything unlawful.
        </p>

        <h2>5. Your data</h2>
        <p>
          The financial information you enter is yours. See our{' '}
          <Link to="/privacy" style={{ color: 'var(--jade)' }}>
            Privacy Policy
          </Link>{' '}
          for how it&rsquo;s stored and used.
        </p>

        <h2>6. No warranty</h2>
        <p>
          Ledger is provided &ldquo;as is,&rdquo; without warranties of any kind. We don&rsquo;t
          guarantee the service will be uninterrupted, error-free, or that any figure it displays
          is accurate — always double-check anything financially important.
        </p>

        <h2>7. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, Ledger and its operator aren&rsquo;t liable for
          any indirect, incidental, or consequential damages arising from your use of the
          service, including decisions made based on data it displays.
        </p>

        <h2>8. Termination</h2>
        <p>
          You may stop using Ledger and request account deletion at any time. We may suspend or
          terminate accounts that violate these terms.
        </p>

        <h2>9. Changes to these terms</h2>
        <p>
          If these terms change in a material way, we&rsquo;ll update this page and adjust the
          date at the top.
        </p>

        <h2>10. Governing law</h2>
        <p>
          <span className="mono">[governing law / jurisdiction placeholder]</span>
        </p>

        <h2>11. Contact</h2>
        <p>
          Questions about these terms can be sent to{' '}
          <span className="mono">[support email goes here]</span>.
        </p>
      </div>

      <PublicFooter />
    </div>
  );
}
