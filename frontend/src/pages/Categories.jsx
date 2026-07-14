import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CategoriesApi } from '../api/ledger';
import { DEFAULT_ICON, ICON_OPTIONS, iconClassName } from '../constants/categoryIcons';
import { useStickyHeader } from '../hooks/useStickyHeader';

const CATEGORY_PALETTE = [
  '#4FA98A', '#6B8FC9', '#9B7FD4', '#C9A227', '#C75450',
  '#D48A5F', '#5FB3B3', '#B85C8A', '#7FA65C', '#8B92A0',
];

function pickNextColor(usedColors) {
  const available = CATEGORY_PALETTE.filter((c) => !usedColors.includes(c));
  const pool = available.length > 0 ? available : CATEGORY_PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Starter set offered from "Add pre-set" — reuses the same curated icon
// list as the picker, so every preset category already has a sensible icon.
const PRESET_CATEGORIES = ICON_OPTIONS.map((opt) => ({ name: opt.label, icon: opt.value }));

export default function Categories() {
  const queryClient = useQueryClient();
  const { sentinelRef, isStuck } = useStickyHeader();
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: CategoriesApi.list });
  const categories = [...(categoriesQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name));

  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setShowAddMenu(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const existingNames = new Set(categories.map((c) => c.name.trim().toLowerCase()));
  const missingPresets = PRESET_CATEGORIES.filter((p) => !existingNames.has(p.name.toLowerCase()));

  const addPresetsMutation = useMutation({
    mutationFn: () => {
      const usedColors = categories.map((c) => c.colorHex).filter(Boolean);
      const payloads = missingPresets.map((preset) => {
        const color = pickNextColor(usedColors);
        usedColors.push(color);
        return { name: preset.name, colorHex: color, icon: preset.icon };
      });
      return Promise.all(payloads.map((payload) => CategoriesApi.create(payload)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowAddMenu(false);
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [name, setName] = useState('');
  const [colorHex, setColorHex] = useState(CATEGORY_PALETTE[0]);
  const [icon, setIcon] = useState(DEFAULT_ICON);

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
    createMutation.mutate({ name, colorHex, icon });
  };

  const handleAddClick = () => {
    if (!showForm) {
      const usedColors = categories.map((c) => c.colorHex).filter(Boolean);
      setColorHex(pickNextColor(usedColors));
      setIcon(DEFAULT_ICON);
      setShowPalette(false);
      setShowIconPicker(false);
    }
    setShowForm((s) => !s);
  };

  const [editingId, setEditingId] = useState(null);
  const [showEditPalette, setShowEditPalette] = useState(false);
  const [showEditIconPicker, setShowEditIconPicker] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColorHex, setEditColorHex] = useState(CATEGORY_PALETTE[0]);
  const [editIcon, setEditIcon] = useState(DEFAULT_ICON);

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
    setShowEditIconPicker(false);
    setEditingId(c.id);
    setEditName(c.name || '');
    setEditColorHex(c.colorHex || CATEGORY_PALETTE[0]);
    setEditIcon(c.icon || DEFAULT_ICON);
  };

  const handleEditSubmit = (e, id) => {
    e.preventDefault();
    updateMutation.mutate({ id, payload: { name: editName, colorHex: editColorHex, icon: editIcon } });
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
      <div ref={sentinelRef} />
      <div className={`sticky-page-header${isStuck ? ' is-stuck' : ''}`}>
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">
            {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
          </div>
          <div className="page-title">Categories</div>
        </div>
        <div className="dropdown-custom d-flex align-items-center" ref={addMenuRef}>
          <button className="btn btn-jade btn-sm" onClick={handleAddClick}>
            <i className="bi bi-plus-lg me-1" />
            Add category
          </button>
          <button
            type="button"
            className="btn btn-jade btn-sm px-2 ms-1"
            title="More ways to add"
            onClick={() => setShowAddMenu((s) => !s)}
          >
            <i className="bi bi-chevron-down" />
          </button>
          {showAddMenu && (
            <div className="dropdown-menu-custom">
              <button
                type="button"
                className="dropdown-item-custom"
                disabled={missingPresets.length === 0 || addPresetsMutation.isPending}
                style={missingPresets.length === 0 ? { opacity: 0.5, cursor: 'default' } : undefined}
                onClick={() => addPresetsMutation.mutate()}
              >
                <i className="bi bi-magic me-2" />
                {addPresetsMutation.isPending
                  ? 'Adding…'
                  : missingPresets.length === 0
                    ? 'Starter categories already added'
                    : 'Add starter categories'}
              </button>
            </div>
          )}
        </div>
      </div>
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
                  autoFocus
                />
              </div>
              <div className="col-md-4">
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
              <div className="col-md-4">
                <label className="eyebrow d-block mb-2">Icon</label>
                <div className="d-flex align-items-center gap-3">
                  <span
                    className="txn-icon"
                    style={{ color: colorHex }}
                  >
                    <i className={iconClassName(icon)} />
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowIconPicker((s) => !s)}
                  >
                    {showIconPicker ? 'Hide icons' : 'Choose icon'}
                  </button>
                </div>
              </div>
            </div>
            {showIconPicker && (
              <div className="row g-3 mt-1">
                <div className="col-12 d-flex gap-2 flex-wrap">
                  {ICON_OPTIONS.map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      title={opt.label}
                      onClick={() => setIcon(opt.value)}
                      className="icon-btn icon-btn-lg"
                      style={{
                        border: icon === opt.value ? '2px solid var(--text)' : '1px solid var(--border)',
                      }}
                    >
                      <i className={iconClassName(opt.value)} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="row g-3 mt-1">
              <div className="col-12 d-flex justify-content-end">
                <button type="submit" className="btn btn-jade btn-sm" disabled={createMutation.isPending}>
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
                <div className="d-flex align-items-center gap-2">
                  <span className="txn-icon" style={{ color: editColorHex, width: 30, height: 30 }}>
                    <i className={iconClassName(editIcon)} />
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowEditIconPicker((s) => !s)}
                  >
                    {showEditIconPicker ? 'Hide icons' : 'Choose icon'}
                  </button>
                </div>
                {showEditIconPicker && (
                  <div className="d-flex gap-2 flex-wrap w-100">
                    {ICON_OPTIONS.map((opt) => (
                      <button
                        type="button"
                        key={opt.value}
                        title={opt.label}
                        onClick={() => setEditIcon(opt.value)}
                        className="icon-btn icon-btn-lg"
                        style={{
                          border: editIcon === opt.value ? '2px solid var(--text)' : '1px solid var(--border)',
                        }}
                      >
                        <i className={iconClassName(opt.value)} />
                      </button>
                    ))}
                  </div>
                )}
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
                <span style={{ fontWeight: 500 }}>Delete &ldquo;{c.name}&rdquo;?</span>
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
                  className="txn-icon"
                  style={{ color: c.colorHex || 'var(--text-faint)', width: 30, height: 30 }}
                >
                  <i className={iconClassName(c.icon)} />
                </span>
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
