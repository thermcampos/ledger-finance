import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CategoriesApi } from '../api/ledger';

const colorPresets = ['#4FA98A', '#C9A227', '#C75450', '#6B8FC9', '#8B92A0'];

export default function Categories() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: CategoriesApi.list });
  const categories = categoriesQuery.data || [];

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [colorHex, setColorHex] = useState(colorPresets[0]);

  const createMutation = useMutation({
    mutationFn: CategoriesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowForm(false);
      setName('');
      setColorHex(colorPresets[0]);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({ name, colorHex });
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
        <button className="btn btn-jade btn-sm" onClick={() => setShowForm((s) => !s)}>
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
                <div className="d-flex gap-2">
                  {colorPresets.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setColorHex(c)}
                      aria-label={c}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: c,
                        border: colorHex === c ? '2px solid var(--text)' : '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
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
            className="d-flex align-items-center gap-3 px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
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
          </div>
        ))}
      </div>
    </div>
  );
}
