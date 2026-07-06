import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountsApi } from '../api/ledger';

const kindIcons = {
  CHECKING: 'bi-wallet2',
  SAVINGS: 'bi-piggy-bank',
  CREDIT_CARD: 'bi-credit-card',
  INVESTMENT: 'bi-graph-up-arrow',
};

function money(amount) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function Accounts() {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: AccountsApi.list });
  const accounts = accountsQuery.data || [];

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [kind, setKind] = useState('CHECKING');
  const [balance, setBalance] = useState('');

  const createMutation = useMutation({
    mutationFn: AccountsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setShowForm(false);
      setName('');
      setInstitution('');
      setBalance('');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({ name, institution, kind, balance: Number(balance) || 0 });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">
            {accounts.length} linked account{accounts.length === 1 ? '' : 's'}
          </div>
          <div className="page-title">Accounts</div>
        </div>
        <button className="btn btn-jade btn-sm" onClick={() => setShowForm((s) => !s)}>
          <i className="bi bi-plus-lg me-1" />
          Add account
        </button>
      </div>

      {showForm && (
        <div className="panel p-4 mb-4">
          <form onSubmit={handleSubmit}>
            <div className="row g-3 align-items-end">
              <div className="col-md-3">
                <label className="eyebrow d-block mb-2">Name</label>
                <input
                  className="form-control form-control-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-3">
                <label className="eyebrow d-block mb-2">Institution</label>
                <input
                  className="form-control form-control-sm"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                />
              </div>
              <div className="col-md-2">
                <label className="eyebrow d-block mb-2">Kind</label>
                <select
                  className="form-select form-select-sm"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="CHECKING">Checking</option>
                  <option value="SAVINGS">Savings</option>
                  <option value="CREDIT_CARD">Credit card</option>
                  <option value="INVESTMENT">Investment</option>
                </select>
              </div>
              <div className="col-md-2">
                <label className="eyebrow d-block mb-2">Starting balance</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </div>
              <div className="col-md-2">
                <button type="submit" className="btn btn-jade btn-sm w-100" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="row g-3">
        {accounts.map((a) => (
          <div className="col-md-6 col-lg-3" key={a.id}>
            <div className="account-card-lg">
              <div className="account-icon">
                <i className={`bi ${kindIcons[a.kind] || 'bi-wallet2'} text-muted-c`} />
              </div>
              <div className="acct-kind">{a.kind?.replace('_', ' ')}</div>
              <div className="acct-balance" style={{ color: a.balance < 0 ? 'var(--red)' : undefined }}>
                {money(Number(a.balance))}
              </div>
              <div className="acct-name mb-3">{a.name}</div>
              {a.institution && <div className="text-faint mb-2" style={{ fontSize: 11.5 }}>{a.institution}</div>}
              <div className="text-faint" style={{ fontSize: 11.5 }}>
                {a.lastSyncedAt ? `Synced ${new Date(a.lastSyncedAt).toLocaleString()}` : 'Not yet synced'}
              </div>
            </div>
          </div>
        ))}
        <div className="col-md-6 col-lg-3">
          <div className="add-account-card" onClick={() => setShowForm(true)}>
            <i className="bi bi-plus-lg mb-2" style={{ fontSize: 18 }} />
            <div style={{ fontSize: 13, fontWeight: 500 }}>Add account</div>
          </div>
        </div>
      </div>
    </div>
  );
}
