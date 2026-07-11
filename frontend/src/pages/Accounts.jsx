import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountsApi, TransactionsApi } from '../api/ledger';
import { startOfDay } from '../utils/date';
import { balanceAsOf, sortChronologically } from '../utils/balance';
import { nextBillFor } from '../utils/creditCard';

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
  const accounts = useMemo(() => accountsQuery.data || [], [accountsQuery.data]);

  const txnQueries = useQueries({
    queries: accounts.map((a) => ({
      queryKey: ['transactions', a.id],
      queryFn: () => TransactionsApi.listByAccount(a.id),
      enabled: !!a.id,
    })),
  });
  const today = startOfDay(new Date());
  const txnsByAccountId = useMemo(() => {
    const map = new Map();
    accounts.forEach((a, i) => map.set(a.id, txnQueries[i]?.data || []));
    return map;
  }, [accounts, txnQueries]);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [kind, setKind] = useState('CHECKING');
  const [balance, setBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [dueDayOfMonth, setDueDayOfMonth] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');

  // Deep link from Credit Cards / Card Bills' "Add a credit card" CTAs
  // (?add=credit-card) — open the form with Kind pre-selected instead of
  // landing on the page and making the user pick it again.
  const [searchParams] = useSearchParams();
  const appliedAddParam = useRef(false);
  useEffect(() => {
    if (searchParams.get('add') === 'credit-card' && !appliedAddParam.current) {
      appliedAddParam.current = true;
      setKind('CREDIT_CARD');
      setShowForm(true);
    }
  }, [searchParams]);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editInstitution, setEditInstitution] = useState('');
  const [editKind, setEditKind] = useState('CHECKING');
  const [editCreditLimit, setEditCreditLimit] = useState('');
  const [editDueDayOfMonth, setEditDueDayOfMonth] = useState('');
  const [editPaymentAccountId, setEditPaymentAccountId] = useState('');

  const createMutation = useMutation({
    mutationFn: AccountsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setShowForm(false);
      setName('');
      setInstitution('');
      setBalance('');
      setCreditLimit('');
      setDueDayOfMonth('');
      setPaymentAccountId('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => AccountsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: AccountsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setConfirmingId(null);
    },
  });

  const [confirmingId, setConfirmingId] = useState(null);
  const [blockedId, setBlockedId] = useState(null);

  const checkDeleteMutation = useMutation({
    mutationFn: async (a) => {
      const txns = await TransactionsApi.listByAccount(a.id);
      return { account: a, hasTransactions: txns.length > 0 };
    },
    onSuccess: ({ account, hasTransactions }) => {
      if (hasTransactions) {
        setBlockedId(account.id);
        setConfirmingId(null);
      } else {
        setConfirmingId(account.id);
        setBlockedId(null);
      }
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({
      name,
      institution,
      kind,
      balance: kind === 'CREDIT_CARD' ? 0 : Number(balance) || 0,
      creditLimit: kind === 'CREDIT_CARD' && creditLimit !== '' ? Number(creditLimit) : null,
      dueDayOfMonth: kind === 'CREDIT_CARD' && dueDayOfMonth !== '' ? Number(dueDayOfMonth) : null,
      paymentAccountId: kind === 'CREDIT_CARD' && paymentAccountId ? Number(paymentAccountId) : null,
    });
  };

  const startEdit = (a) => {
    setConfirmingId(null);
    setBlockedId(null);
    setEditingId(a.id);
    setEditName(a.name || '');
    setEditInstitution(a.institution || '');
    setEditKind(a.kind || 'CHECKING');
    setEditCreditLimit(a.creditLimit != null ? String(a.creditLimit) : '');
    setEditDueDayOfMonth(a.dueDayOfMonth != null ? String(a.dueDayOfMonth) : '');
    setEditPaymentAccountId(a.paymentAccount?.id != null ? String(a.paymentAccount.id) : '');
  };

  const handleEditSubmit = (e, id) => {
    e.preventDefault();
    updateMutation.mutate({
      id,
      payload: {
        name: editName,
        institution: editInstitution,
        kind: editKind,
        creditLimit: editKind === 'CREDIT_CARD' && editCreditLimit !== '' ? Number(editCreditLimit) : null,
        dueDayOfMonth: editKind === 'CREDIT_CARD' && editDueDayOfMonth !== '' ? Number(editDueDayOfMonth) : null,
        paymentAccountId: editKind === 'CREDIT_CARD' && editPaymentAccountId ? Number(editPaymentAccountId) : null,
      },
    });
  };

  const handleDeleteClick = (a) => {
    setBlockedId(null);
    checkDeleteMutation.mutate(a);
  };

  const cancelDelete = () => {
    setConfirmingId(null);
    setBlockedId(null);
    deleteMutation.reset();
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
              <div className={kind === 'CREDIT_CARD' ? 'col-md-4' : 'col-md-3'}>
                <label className="eyebrow d-block mb-2">Name</label>
                <input
                  className="form-control form-control-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className={kind === 'CREDIT_CARD' ? 'col-md-4' : 'col-md-3'}>
                <label className="eyebrow d-block mb-2">Institution</label>
                <input
                  className="form-control form-control-sm"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                />
              </div>
              <div className={kind === 'CREDIT_CARD' ? 'col-md-4' : 'col-md-3'}>
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
              {kind !== 'CREDIT_CARD' && (
                <div className="col-md-3">
                  <label className="eyebrow d-block mb-2">Starting balance</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control form-control-sm"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                  />
                </div>
              )}
            </div>
            {kind === 'CREDIT_CARD' && (
              <div className="row g-3 align-items-end mt-1">
                <div className="col-md-4">
                  <label className="eyebrow d-block mb-2">Credit limit</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control form-control-sm"
                    placeholder="Optional"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                  />
                </div>
                <div className="col-md-4">
                  <label className="eyebrow d-block mb-2">Due day of month</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    className="form-control form-control-sm"
                    placeholder="Optional, e.g. 15"
                    value={dueDayOfMonth}
                    onChange={(e) => setDueDayOfMonth(e.target.value)}
                  />
                </div>
                <div className="col-md-4">
                  <label className="eyebrow d-block mb-2">Payment account</label>
                  <select
                    className="form-select form-select-sm"
                    value={paymentAccountId}
                    onChange={(e) => setPaymentAccountId(e.target.value)}
                  >
                    <option value="">None</option>
                    {accounts
                      .filter((a) => a.kind === 'CHECKING' || a.kind === 'SAVINGS')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}
            <div className="row mt-3">
              <div className="col-12 d-flex justify-content-end">
                <button type="submit" className="btn btn-jade btn-sm" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {!accountsQuery.isLoading && accounts.length === 0 && (
        <div className="panel p-4 text-center text-muted-c" style={{ padding: 40, fontSize: 13 }}>
          No accounts yet.
        </div>
      )}

      <div className="row g-3">
        {accounts.map((a) => {
          const txns = txnsByAccountId.get(a.id) || [];
          const bill = a.kind === 'CREDIT_CARD' ? nextBillFor(a, txns, today) : null;
          const bal = a.kind === 'CREDIT_CARD' ? bill?.amountOwed : balanceAsOf(a, sortChronologically(txns), today);
          return (
          <div className="col-md-6 col-lg-3" key={a.id}>
            <div className="account-card-lg">
              {editingId === a.id ? (
                <form onSubmit={(e) => handleEditSubmit(e, a.id)}>
                  <label className="eyebrow d-block mb-2">Name</label>
                  <input
                    className="form-control form-control-sm mb-2"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                  <label className="eyebrow d-block mb-2">Institution</label>
                  <input
                    className="form-control form-control-sm mb-2"
                    value={editInstitution}
                    onChange={(e) => setEditInstitution(e.target.value)}
                  />
                  <label className="eyebrow d-block mb-2">Kind</label>
                  <select
                    className="form-select form-select-sm mb-3"
                    value={editKind}
                    onChange={(e) => setEditKind(e.target.value)}
                  >
                    <option value="CHECKING">Checking</option>
                    <option value="SAVINGS">Savings</option>
                    <option value="CREDIT_CARD">Credit card</option>
                    <option value="INVESTMENT">Investment</option>
                  </select>
                  {editKind === 'CREDIT_CARD' && (
                    <>
                      <label className="eyebrow d-block mb-2">Credit limit</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control form-control-sm mb-2"
                        placeholder="Optional"
                        value={editCreditLimit}
                        onChange={(e) => setEditCreditLimit(e.target.value)}
                      />
                      <label className="eyebrow d-block mb-2">Due day of month</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        className="form-control form-control-sm mb-3"
                        placeholder="Optional, e.g. 15"
                        value={editDueDayOfMonth}
                        onChange={(e) => setEditDueDayOfMonth(e.target.value)}
                      />
                      <label className="eyebrow d-block mb-2">Payment account</label>
                      <select
                        className="form-select form-select-sm mb-3"
                        value={editPaymentAccountId}
                        onChange={(e) => setEditPaymentAccountId(e.target.value)}
                      >
                        <option value="">None</option>
                        {accounts
                          .filter((acct) => (acct.kind === 'CHECKING' || acct.kind === 'SAVINGS') && acct.id !== a.id)
                          .map((acct) => (
                            <option key={acct.id} value={acct.id}>
                              {acct.name}
                            </option>
                          ))}
                      </select>
                    </>
                  )}
                  <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-jade btn-sm flex-grow-1" disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                  {updateMutation.isError && (
                    <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                      Could not save changes.
                    </div>
                  )}
                </form>
              ) : confirmingId === a.id ? (
                <div>
                  <div className="acct-name mb-2">Delete &ldquo;{a.name}&rdquo;?</div>
                  <div className="text-faint mb-3" style={{ fontSize: 12.5 }}>
                    This cannot be undone.
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-red btn-sm flex-grow-1"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(a.id)}
                    >
                      {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={cancelDelete}>
                      Cancel
                    </button>
                  </div>
                  {deleteMutation.isError && (
                    <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                      Could not delete this account.
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="d-flex justify-content-between align-items-start">
                    <div className="account-icon">
                      <i className={`bi ${kindIcons[a.kind] || 'bi-wallet2'} text-muted-c`} />
                    </div>
                    <div className="d-flex gap-1">
                      <button className="icon-btn" title="Edit account" onClick={() => startEdit(a)}>
                        <i className="bi bi-pencil" />
                      </button>
                      <button
                        className="icon-btn"
                        title="Delete account"
                        onClick={() => handleDeleteClick(a)}
                        disabled={checkDeleteMutation.isPending && checkDeleteMutation.variables?.id === a.id}
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  </div>
                  <div className="acct-kind">{a.kind?.replace('_', ' ')}</div>
                  <div className="acct-balance" style={{ color: bal < 0 ? 'var(--red)' : undefined }}>
                    {bal != null ? money(bal) : '—'}
                  </div>
                  <div className="acct-name mb-3">{a.name}</div>
                  {a.institution && <div className="text-faint mb-2" style={{ fontSize: 11.5 }}>{a.institution}</div>}
                  <div className="text-faint" style={{ fontSize: 11.5 }}>
                    {a.lastSyncedAt ? `Synced ${new Date(a.lastSyncedAt).toLocaleString()}` : 'Not yet synced'}
                  </div>
                  {blockedId === a.id && (
                    <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                      Cannot delete — this account still has transactions.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
