import { useEffect, useRef, useState } from 'react';

export default function Dropdown({ icon, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const current = options.find((o) => o.value === value);

  return (
    <div className="dropdown-custom" ref={ref}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
        {icon && <i className={`bi ${icon} me-1`} />}
        {current?.label}
      </button>
      {open && (
        <div className="dropdown-menu-custom">
          {options.map((o) => (
            <button
              type="button"
              key={o.value}
              className={`dropdown-item-custom${o.value === value ? ' active' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
