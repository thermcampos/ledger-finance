import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CategoriesApi } from '../api/ledger';

const CATEGORY_PALETTE = [
  '#4FA98A', '#6B8FC9', '#9B7FD4', '#C9A227', '#C75450',
  '#D48A5F', '#5FB3B3', '#B85C8A', '#7FA65C', '#8B92A0',
];

function pickNextColor(usedColors) {
  const available = CATEGORY_PALETTE.filter((c) => !usedColors.includes(c));
  const pool = available.length > 0 ? available : CATEGORY_PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function Categories() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: CategoriesApi.list });
  const categories = categoriesQuery.data || [];

  const [showForm, setShowForm] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [name, setName] = useState('');
  const [colorHex, setColorHex] = useState(CATEGORY_PALETTE[0]);

  const createMutation = useMutation({
    mutationFn: CategoriesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowForm(false);
      setName('');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({ name, colorHex });
  };

  const handleAddClick = () => {
    if (!showForm) {
      const usedColors = categories.map((c) => c.colorHex).filter(Boolean);
      setColorHex(pickNextColor(usedColors));
      setShowPalette(false);
    }
    setShowForm((s) => !s);
  };

  const [editingId, setEditingId] = useState(null);
  const [showEditPalette, setShowEditPalette] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColorHex, setEditColorHex] = useState(CATEGORY_PALETTE[0]);

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => CategoriesApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setEditingId(null);
    },
  });

  const startEdit = (c) => {
    setConfirmingId(null);
    setBlockedId(null);
    setShowEditPalette(false);
    setEditingId(c.id);
    setEditName(c.name || '');
    setEditColorHex(c.colorHex || CATEGORY_PALETTE[0]);
  };

  const handleEditSubmit = (e, id) => {
    e.preventDefault();
    updateMutation.mutate({ id, payload: { name: editName, colorHex: editColorHex } });
  };

  const [confirmingId, setConfirmingId] = useState(null);
  const [blockedId, setBlockedId] = useState(null);
  const [blockedUsage, setBlockedUsage] = useState(null);

  const checkDeleteMutation = useMutation({
    mutationFn: async (c) => {
      const usage = await CategoriesApi.usage(c.id);
      return { category: c, usage };
    },
    onSuccess: ({ category, usage }) => {
      if (usage.transactionCount > 0 || usage.budgetCount > 0) {
        setBlockedId(category.id);
        setBlockedUsage(usage);
        setConfirmingId(null);
      } else {
        setConfirmingId(category.id);
        setBlockedId(null);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: CategoriesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setConfirmingId(null);
    },
  });

  const handleDeleteClick = (c) => {
    setBlockedId(null);
    checkDeleteMutation.mutate(c);
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
            {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
          </div>
          <div className="page-title">Categories</div>
        </div>
        <button className="btn btn-jade btn-sm" onClick={handleAddClick}>
          <i className="bi bi-plus-lg me-1" />
          Add category
        </button>
      </div>

      {showForm && (
        <div className="panel p-4 mb-4">
          <form onSubmit={handleSubmit}>
            <div className="row g-3 align-items-end">
              <div className="col-md-4">
                <label className="eyebrow d-block mb-2">Name</label>
                <input
                  className="form-control form-control-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-5">
                <label className="eyebrow d-block mb-2">Color</label>
                <div className="d-flex align-items-center gap-3">
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: colorHex,
                      border: '1px solid var(--border)',
                      flexShrink: 0,
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowPalette((s) => !s)}
                  >
                    {showPalette ? 'Hide palette' : 'Choose color'}
                  </button>
                </div>
                {showPalette && (
                  <div className="d-flex gap-2 flex-wrap mt-2">
                    {CATEGORY_PALETTE.map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setColorHex(c)}
                        aria-label={c}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: c,
                          border: colorHex === c ? '2px solid var(--text)' : '1px solid var(--border)',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="col-md-3">
                <button type="submit" className="btn btn-jade btn-sm w-100" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="panel">
        {categories.length === 0 && (
          <div className="p-4 text-muted-c">No categories yet — add one to start tagging transactions.</div>
        )}
        {categories.map((c) => (
          <div
            key={c.id}
            className="d-flex align-items-center gap-3 px-4 py-3 flex-wrap"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            {editingId === c.id ? (
              <form
                onSubmit={(e) => handleEditSubmit(e, c.id)}
                className="d-flex align-items-center gap-3 flex-wrap w-100"
              >
                <div className="d-flex align-items-center gap-2">
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: editColorHex,
                      border: '1px solid var(--border)',
                      flexShrink: 0,
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowEditPalette((s) => !s)}
                  >
                    {showEditPalette ? 'Hide palette' : 'Choose color'}
                  </button>
                </div>
                {showEditPalette && (
                  <div className="d-flex gap-2 flex-wrap">
                    {CATEGORY_PALETTE.map((preset) => (
                      <button
                        type="button"
                        key={preset}
                        onClick={() => setEditColorHex(preset)}
                        aria-label={preset}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: preset,
                          border: editColorHex === preset ? '2px solid var(--text)' : '1px solid var(--border)',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                )}
                <input
                  className="form-control form-control-sm"
                  style={{ maxWidth: 200 }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
                <div className="d-flex gap-2 ms-auto">
                  <button type="submit" className="btn btn-jade btn-sm" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
                {updateMutation.isError && (
                  <div className="w-100" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                    Could not save changes.
                  </div>
                )}
              </form>
            ) : confirmingId === c.id ? (
              <>
                <span style={{ fontWeight: 500 }}>Delete "{c.name}"?</span>
                <span className="text-faint" style={{ fontSize: 12.5 }}>
                  This cannot be undone.
                </span>
                <div className="d-flex gap-2 ms-auto">
                  <button
                    className="btn btn-red btn-sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(c.id)}
                  >
                    {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={cancelDelete}>
                    Cancel
                  </button>
                </div>
                {deleteMutation.isError && (
                  <div className="w-100" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                    Could not delete this category.
                  </div>
                )}
              </>
            ) : (
              <>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: c.colorHex || 'var(--text-faint)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontWeight: 500 }}>{c.name}</span>
                {blockedId === c.id && (
                  <span style={{ fontSize: 11.5, color: 'var(--red)' }}>
                    Cannot delete — used by {blockedUsage?.transactionCount || 0} transaction(s),{' '}
                    {blockedUsage?.budgetCount || 0} budget(s).
                  </span>
                )}
                <div className="d-flex gap-1 ms-auto">
                  <button className="icon-btn" title="Edit category" onClick={() => startEdit(c)}>
                    <i className="bi bi-pencil" />
                  </button>
                  <button
                    className="icon-btn"
                    title="Delete category"
                    onClick={() => handleDeleteClick(c)}
                    disabled={checkDeleteMutation.isPending && checkDeleteMutation.variables?.id === c.id}
                  >
                    <i className="bi bi-trash" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
