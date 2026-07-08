import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_SERVER || '/api',
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('ledger_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    // /auth/* requests return 401 for bad credentials, not an expired
    // session — those should surface to the caller, not force a reload.
    const isAuthRequest = error.config?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem('ledger_token');
      localStorage.removeItem('ledger_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
