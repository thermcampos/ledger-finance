import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UsersApi } from '../api/ledger';
import { useAuth } from '../context/useAuth';

function describeHistoryEntry(entry) {
  switch (entry.field) {
    case 'DISPLAY_NAME':
      return `Changed display name from "${entry.oldValue}" to "${entry.newValue}"`;
    case 'EMAIL':
      return `Changed email from "${entry.oldValue}" to "${entry.newValue}"`;
    case 'PASSWORD':
      return 'Changed password';
    default:
      return 'Account updated';
  }
}

export default function Profile() {
  const { user, applySession } = useAuth();
  const queryClient = useQueryClient();

  const meQuery = useQuery({ queryKey: ['me'], queryFn: UsersApi.me });
  const historyQuery = useQuery({ queryKey: ['account-history'], queryFn: UsersApi.history });
  const history = historyQuery.data || [];

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');

  const profileMutation = useMutation({
    mutationFn: UsersApi.updateProfile,
    onSuccess: (response) => {
      applySession(response);
      queryClient.invalidateQueries({ queryKey: ['account-history'] });
    },
  });

  const handleProfileSubmit = (e) => {
    e.preventDefault();
    profileMutation.mutate({ displayName, email });
  };

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  const passwordMutation = useMutation({
    mutationFn: UsersApi.changePassword,
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      queryClient.invalidateQueries({ queryKey: ['account-history'] });
    },
  });

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMismatch(true);
      return;
    }
    setPasswordMismatch(false);
    passwordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">Account settings</div>
          <div className="page-title">Profile</div>
        </div>
      </div>

      <div className="panel p-4 mb-4">
        <div className="eyebrow mb-3">Profile</div>
        <form onSubmit={handleProfileSubmit}>
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="eyebrow d-block mb-2">Display name</label>
              <input
                className="form-control form-control-sm"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
            <div className="col-md-4">
              <label className="eyebrow d-block mb-2">Email</label>
              <input
                type="email"
                className="form-control form-control-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="col-md-3">
              <button type="submit" className="btn btn-jade btn-sm w-100" disabled={profileMutation.isPending}>
                {profileMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {profileMutation.isError && (
            <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--red)' }}>
              {profileMutation.error?.response?.data?.message || 'Could not save changes.'}
            </div>
          )}
          {profileMutation.isSuccess && (
            <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--jade)' }}>
              Profile updated.
            </div>
          )}
        </form>
      </div>

      <div className="panel p-4">
        <div className="eyebrow mb-3">Change password</div>
        <form onSubmit={handlePasswordSubmit}>
          <div className="row g-3 align-items-end">
            <div className="col-md-3">
              <label className="eyebrow d-block mb-2">Current password</label>
              <input
                type="password"
                className="form-control form-control-sm"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="col-md-3">
              <label className="eyebrow d-block mb-2">New password</label>
              <input
                type="password"
                className="form-control form-control-sm"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="col-md-3">
              <label className="eyebrow d-block mb-2">Confirm new password</label>
              <input
                type="password"
                className="form-control form-control-sm"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="col-md-3">
              <button type="submit" className="btn btn-jade btn-sm w-100" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {passwordMismatch && (
            <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--red)' }}>
              New password and confirmation don&rsquo;t match.
            </div>
          )}
          {passwordMutation.isError && (
            <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--red)' }}>
              {passwordMutation.error?.response?.data?.message || 'Could not change password.'}
            </div>
          )}
          {passwordMutation.isSuccess && (
            <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--jade)' }}>
              Password changed.
            </div>
          )}
        </form>
      </div>

      <div className="panel p-4 mt-4">
        <div className="eyebrow mb-3">Account history</div>
        {historyQuery.isLoading && (
          <div className="text-muted-c" style={{ fontSize: 13 }}>
            Loading…
          </div>
        )}
        {!historyQuery.isLoading && history.length === 0 && (
          <div className="text-muted-c" style={{ fontSize: 13 }}>
            No changes yet.
          </div>
        )}
        {history.map((h, i) => (
          <div
            key={h.id}
            className="d-flex align-items-center justify-content-between py-2"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
          >
            <span style={{ fontSize: 13 }}>{describeHistoryEntry(h)}</span>
            <span className="text-faint" style={{ fontSize: 11.5, whiteSpace: 'nowrap', marginLeft: 12 }}>
              {new Date(h.changedAt).toLocaleString()}
            </span>
          </div>
        ))}
        {meQuery.data?.createdAt && (
          <div className="text-faint mt-3" style={{ fontSize: 11.5 }}>
            Member since{' '}
            {new Date(meQuery.data.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
        )}
      </div>
    </div>
  );
}
