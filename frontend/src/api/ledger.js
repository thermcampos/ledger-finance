import client from './client';

export const AuthApi = {
  signup: (payload) => client.post('/auth/signup', payload).then((r) => r.data),
  login: (payload) => client.post('/auth/login', payload).then((r) => r.data),
};

export const UsersApi = {
  updateProfile: (payload) => client.put('/users/me', payload).then((r) => r.data),
  changePassword: (payload) => client.put('/users/me/password', payload).then((r) => r.data),
  history: () => client.get('/users/me/history').then((r) => r.data),
};

export const AccountsApi = {
  list: () => client.get('/accounts').then((r) => r.data),
  create: (payload) => client.post('/accounts', payload).then((r) => r.data),
  update: (id, payload) => client.put(`/accounts/${id}`, payload).then((r) => r.data),
  remove: (id) => client.delete(`/accounts/${id}`),
};

export const CategoriesApi = {
  list: () => client.get('/categories').then((r) => r.data),
  create: (payload) => client.post('/categories', payload).then((r) => r.data),
  update: (id, payload) => client.put(`/categories/${id}`, payload).then((r) => r.data),
  usage: (id) => client.get(`/categories/${id}/usage`).then((r) => r.data),
  remove: (id) => client.delete(`/categories/${id}`),
};

export const TransactionsApi = {
  listByAccount: (accountId) =>
    client.get(`/transactions/account/${accountId}`).then((r) => r.data),
  create: (payload) => client.post('/transactions', payload).then((r) => r.data),
  update: (id, payload) => client.put(`/transactions/${id}`, payload).then((r) => r.data),
  remove: (id) => client.delete(`/transactions/${id}`),
};

export const BudgetsApi = {
  listForMonth: (yearMonth) =>
    client.get(`/budgets/month/${yearMonth}`).then((r) => r.data),
  spendForMonth: (yearMonth) =>
    client.get(`/budgets/month/${yearMonth}/spend`).then((r) => r.data),
  upsert: (payload) => client.post('/budgets', payload).then((r) => r.data),
  remove: (id) => client.delete(`/budgets/${id}`),
};
