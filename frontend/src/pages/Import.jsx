import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountsApi, CategoriesApi, ImportApi, TransactionsApi } from '../api/ledger';
import { isoDate } from '../utils/date';
import { billOptionsFor } from '../utils/creditCard';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function money(amount) {
  const value = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? '-' : '+';
  return `${sign}$${value}`;
}

export default function Import() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('upload'); // upload | review | done
  const [accountId, setAccountId] = useState('');
  const [targetBillDueDate, setTargetBillDueDate] = useState('');
  const [rows, setRows] = useState([]); // { tempId, description, occurredOn, amount, categoryId, selected }
  const [flipSigns, setFlipSigns] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const fileInputRef = useRef(null);

  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: AccountsApi.list });
  const accounts = useMemo(
    () => [...(accountsQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [accountsQuery.data]
  );
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: CategoriesApi.list });
  const categories = useMemo(
    () => [...(categoriesQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [categoriesQuery.data]
  );

  const selectedAccount = accounts.find((a) => String(a.id) === accountId);
  const isCreditCard = selectedAccount?.kind === 'CREDIT_CARD';

  const billOptions = useMemo(
    () => (isCreditCard ? billOptionsFor(selectedAccount, todayIso()) : []),
    [isCreditCard, selectedAccount]
  );

  const existingTxnsQuery = useQuery({
    queryKey: ['transactions', accountId],
    queryFn: () => TransactionsApi.listByAccount(Number(accountId)),
    enabled: !!accountId,
  });

  const parseMutation = useMutation({
    mutationFn: (file) => ImportApi.parse(Number(accountId), file),
    onSuccess: (parsed) => {
      const existing = existingTxnsQuery.data || [];
      const initialRows = parsed.map((r) => {
        const isDuplicate = existing.some(
          (t) => t.occurredOn === r.occurredOn && Math.abs(Number(t.amount) - Number(r.amount)) < 0.005
        );
        return {
          tempId: r.tempId,
          description: r.description,
          occurredOn: r.occurredOn,
          amount: r.amount,
          categoryId: '',
          selected: !isDuplicate,
          isDuplicate,
        };
      });
      setRows(initialRows);
      setPhase('review');
    },
  });

  const handleFile = (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.pdf')) return;
    parseMutation.mutate(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const effectiveAmount = (row) => (flipSigns ? -Number(row.amount) : Number(row.amount));

  const selectedRows = rows.filter((r) => r.selected);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  function toggleAll() {
    setRows((prev) => prev.map((r) => ({ ...r, selected: !allSelected })));
  }

  function updateRow(tempId, patch) {
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)));
  }

  const batchMutation = useMutation({
    mutationFn: ImportApi.batch,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
      setCreatedCount(created.length);
      setPhase('done');
    },
  });

  function handleConfirm() {
    batchMutation.mutate({
      accountId: Number(accountId),
      billDueDate: isCreditCard ? targetBillDueDate : null,
      rows: selectedRows.map((r) => ({
        description: r.description,
        occurredOn: r.occurredOn,
        amount: effectiveAmount(r),
        categoryId: r.categoryId ? Number(r.categoryId) : null,
      })),
    });
  }

  function startOver() {
    setPhase('upload');
    setRows([]);
    setFlipSigns(false);
    setCreatedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">Transactions</div>
          <div className="page-title">Import</div>
        </div>
        <Link to="/transactions" className="btn btn-ghost btn-sm">
          <i className="bi bi-x-lg me-1" />
          Cancel
        </Link>
      </div>

      {phase === 'upload' && (
        <div className="panel p-4">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="eyebrow d-block mb-2">Account</label>
              <select
                className="form-select form-select-sm"
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setTargetBillDueDate('');
                }}
              >
                <option value="" disabled>
                  Select…
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.kind === 'CREDIT_CARD' ? ' (credit card)' : ''}
                  </option>
                ))}
              </select>
            </div>
            {isCreditCard && (
              <div className="col-md-6">
                <label className="eyebrow d-block mb-2">Target bill</label>
                <select
                  className="form-select form-select-sm"
                  value={targetBillDueDate}
                  onChange={(e) => setTargetBillDueDate(e.target.value)}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {billOptions.map((d) => (
                    <option key={isoDate(d)} value={isoDate(d)}>
                      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} bill
                    </option>
                  ))}
                </select>
                <div className="text-faint mt-1" style={{ fontSize: 11.5 }}>
                  Every imported transaction is assigned to this one bill.
                </div>
              </div>
            )}
          </div>

          <div
            className="mt-4"
            style={{
              border: `1px dashed ${dragOver ? 'var(--jade)' : 'var(--border)'}`,
              borderRadius: 8,
              padding: '48px 20px',
              textAlign: 'center',
              opacity: accountId && (!isCreditCard || targetBillDueDate) ? 1 : 0.5,
              pointerEvents: accountId && (!isCreditCard || targetBillDueDate) ? 'auto' : 'none',
              transition: 'border-color 0.12s ease',
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <i className="bi bi-cloud-upload" style={{ fontSize: 28, color: 'var(--text-faint)' }} />
            <div className="mt-2" style={{ fontSize: 13.5 }}>
              Drag a .csv or .pdf statement here, or{' '}
              <button
                type="button"
                className="btn btn-jade btn-sm d-inline-block"
                style={{ marginLeft: 4 }}
                onClick={() => fileInputRef.current?.click()}
                disabled={parseMutation.isPending}
              >
                browse
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {parseMutation.isPending && (
              <div className="text-faint mt-3" style={{ fontSize: 12.5 }}>
                Reading file…
              </div>
            )}
            {parseMutation.isError && (
              <div className="mt-3" style={{ fontSize: 12.5, color: 'var(--red)' }}>
                {parseMutation.error?.response?.data?.message ||
                  parseMutation.error?.response?.data ||
                  "Couldn't read that file."}
              </div>
            )}
          </div>
        </div>
      )}

      {phase === 'review' && (
        <>
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center gap-2">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              <span className="text-faint" style={{ fontSize: 12.5 }}>
                {selectedRows.length} of {rows.length} selected
              </span>
            </div>
            <button
              type="button"
              className={`btn btn-sm ${flipSigns ? 'btn-jade' : 'btn-ghost'}`}
              onClick={() => setFlipSigns((f) => !f)}
            >
              <i className="bi bi-arrow-left-right me-1" />
              Flip all signs
            </button>
          </div>

          {rows.map((r) => (
            <div className="txn-row" key={r.tempId}>
              <input
                type="checkbox"
                checked={r.selected}
                onChange={(e) => updateRow(r.tempId, { selected: e.target.checked })}
              />
              <input
                type="date"
                className="form-control form-control-sm"
                style={{ maxWidth: 150 }}
                value={r.occurredOn}
                onChange={(e) => updateRow(r.tempId, { occurredOn: e.target.value })}
              />
              <div className="txn-main">
                <input
                  className="form-control form-control-sm"
                  value={r.description}
                  onChange={(e) => updateRow(r.tempId, { description: e.target.value })}
                />
                {r.isDuplicate && (
                  <div className="mt-1" style={{ fontSize: 11, color: 'var(--gold)' }}>
                    <i className="bi bi-exclamation-triangle me-1" />
                    Possible duplicate — already on this account
                  </div>
                )}
              </div>
              <select
                className="form-select form-select-sm"
                style={{ maxWidth: 160 }}
                value={r.categoryId}
                onChange={(e) => updateRow(r.tempId, { categoryId: e.target.value })}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className={`cell-amount ${effectiveAmount(r) < 0 ? 'neg' : 'pos'}`} style={{ minWidth: 100 }}>
                {money(effectiveAmount(r))}
              </div>
            </div>
          ))}

          {batchMutation.isError && (
            <div className="panel p-3 mb-3" style={{ fontSize: 12.5, color: 'var(--red)' }}>
              {batchMutation.error?.response?.data?.message ||
                batchMutation.error?.response?.data ||
                "Couldn't import these transactions."}
            </div>
          )}

          <div className="d-flex justify-content-end gap-2 mt-3">
            <button type="button" className="btn btn-ghost btn-sm" onClick={startOver}>
              Start over
            </button>
            <button
              type="button"
              className="btn btn-jade btn-sm"
              disabled={selectedRows.length === 0 || batchMutation.isPending}
              onClick={handleConfirm}
            >
              {batchMutation.isPending
                ? 'Importing…'
                : `Import ${selectedRows.length} transaction${selectedRows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}

      {phase === 'done' && (
        <div className="panel p-4 text-center" style={{ padding: 48 }}>
          <i className="bi bi-check-circle" style={{ fontSize: 32, color: 'var(--jade)' }} />
          <div className="mt-3" style={{ fontSize: 15 }}>
            Imported {createdCount} transaction{createdCount === 1 ? '' : 's'}.
          </div>
          <div className="mt-4 d-flex justify-content-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={startOver}>
              Import another file
            </button>
            {isCreditCard ? (
              <button
                type="button"
                className="btn btn-jade btn-sm"
                onClick={() => navigate(`/card-bills?account=${accountId}&bill=${targetBillDueDate}`)}
              >
                View bill
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-jade btn-sm"
                onClick={() => navigate(`/transactions?account=${accountId}`)}
              >
                View transactions
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
