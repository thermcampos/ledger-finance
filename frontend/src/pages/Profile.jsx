import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UsersApi } from '../api/ledger';
import { useAuth } from '../context/useAuth';
import { THEMES, getStoredTheme, setTheme } from '../utils/theme';

const THEME_LABELS = { dark: 'Dark', light: 'Light' };

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

  const [theme, setThemeState] = useState(getStoredTheme);

  const handleThemeChange = (next) => {
    setThemeState(setTheme(next));
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

  const tokensQuery = useQuery({ queryKey: ['api-tokens'], queryFn: UsersApi.listTokens });
  const tokens = tokensQuery.data || [];

  const [tokenName, setTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  const createTokenMutation = useMutation({
    mutationFn: UsersApi.createToken,
    onSuccess: (response) => {
      setCreatedToken(response);
      setCopiedToken(false);
      setTokenName('');
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: UsersApi.removeToken,
    onSuccess: () => {
      setRevokingId(null);
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
  });

  const handleCreateToken = (e) => {
    e.preventDefault();
    createTokenMutation.mutate({ name: tokenName, scope: 'read' });
  };

  const copyCreatedToken = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken.token);
      setCopiedToken(true);
    } catch {
      setCopiedToken(false);
    }
  };

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
        <div className="eyebrow mb-3">API tokens</div>
        <div className="text-faint mb-3" style={{ fontSize: 12.5 }}>
          Tokens let an LLM you configure (e.g. a ChatGPT Custom GPT) read your finances through
          the /llm API. Read-only, one token per integration, revocable any time.
        </div>
        <form onSubmit={handleCreateToken} className="mb-3">
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="eyebrow d-block mb-2">Name</label>
              <input
                className="form-control form-control-sm"
                placeholder="e.g. ChatGPT"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                required
              />
            </div>
            <div className="col-md-3">
              <label className="eyebrow d-block mb-2">Scope</label>
              <select className="form-select form-select-sm" value="read" disabled>
                <option value="read">Read</option>
                <option value="read-write">Read + Write (coming soon)</option>
              </select>
            </div>
            <div className="col-md-3">
              <button type="submit" className="btn btn-jade btn-sm w-100" disabled={createTokenMutation.isPending}>
                {createTokenMutation.isPending ? 'Creating…' : 'Create token'}
              </button>
            </div>
          </div>
          {createTokenMutation.isError && (
            <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--red)' }}>
              {createTokenMutation.error?.response?.data?.message || 'Could not create token.'}
            </div>
          )}
        </form>

        {createdToken && (
          <div className="mb-3 p-3" style={{ border: '1px solid var(--border)' }}>
            <div className="eyebrow mb-2">Your new token — shown once, copy it now</div>
            <div className="d-flex gap-2 align-items-center">
              <code className="flex-grow-1" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {createdToken.token}
              </code>
              <button type="button" className="btn btn-ghost btn-sm" onClick={copyCreatedToken}>
                {copiedToken ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {tokensQuery.isLoading && (
          <div className="text-muted-c" style={{ fontSize: 13 }}>
            Loading…
          </div>
        )}
        {!tokensQuery.isLoading && tokens.length === 0 && (
          <div className="text-muted-c" style={{ fontSize: 13 }}>
            No tokens yet.
          </div>
        )}
        {tokens.map((t, i) => (
          <div
            key={t.id}
            className="py-2"
            style={{ borderTop: i > 0 || createdToken ? '1px solid var(--border)' : 'none' }}
          >
            {revokingId === t.id ? (
              <div>
                <div className="mb-2" style={{ fontSize: 13 }}>
                  Revoke &ldquo;{t.name}&rdquo;? Any integration using it stops working immediately.
                </div>
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-red btn-sm"
                    disabled={revokeTokenMutation.isPending}
                    onClick={() => revokeTokenMutation.mutate(t.id)}
                  >
                    {revokeTokenMutation.isPending ? 'Revoking…' : 'Revoke'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevokingId(null)}>
                    Cancel
                  </button>
                </div>
                {revokeTokenMutation.isError && (
                  <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                    Could not revoke this token.
                  </div>
                )}
              </div>
            ) : (
              <div className="d-flex align-items-center justify-content-between">
                <span style={{ fontSize: 13 }}>{t.name}</span>
                <span className="d-flex align-items-center gap-3">
                  <span className="text-faint" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                    {t.lastUsedAt
                      ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                      : 'Never used'}
                    {' · '}expires {new Date(t.expiresAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setRevokingId(t.id)}
                  >
                    Revoke
                  </button>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="panel p-4 mt-4">
        <div className="eyebrow mb-3">Appearance</div>
        <label className="eyebrow d-block mb-2">Theme</label>
        <div className="d-flex gap-2" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              className={`btn btn-sm ${theme === t ? 'btn-jade' : 'btn-ghost'}`}
              aria-pressed={theme === t}
              onClick={() => handleThemeChange(t)}
            >
              {THEME_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="text-faint mt-2" style={{ fontSize: 11.5 }}>
          Saved on this device. Dark is the default.
        </div>
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
