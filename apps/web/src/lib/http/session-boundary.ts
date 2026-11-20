import { CanceledError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
declare module 'axios' { interface AxiosRequestConfig { axonSessionRevision?: number } }

/** Install before response/error handlers so an old 401 cannot log out the new identity. */
export function installSessionBoundary(client: AxiosInstance, currentIdentity: () => string, subscribe: (changed: () => void) => void, currentRevision?: () => number): void {
  let identity = currentIdentity();
  let generation = 0;
  subscribe(() => {
    const next = currentIdentity();
    if (next !== identity) { identity = next; generation += 1; }
  });
  const requests = new WeakMap<object, number>();
  client.interceptors.request.use((config) => {
    if (config.axonSessionRevision !== undefined && config.axonSessionRevision !== currentRevision?.()) throw new CanceledError('Oturum değişti; eski işlem gönderilmedi.');
    requests.set(config, generation); return config;
  });
  const assertCurrent = (config: InternalAxiosRequestConfig | undefined) => {
    if (config && requests.get(config) !== generation) throw new CanceledError('Oturum değişti; eski istek yanıtı yok sayıldı.');
  };
  client.interceptors.response.use((response) => { assertCurrent(response.config); return response; }, (error: unknown) => {
    if (typeof error === 'object' && error !== null && 'config' in error) {
      // Axios errors carry the original internal config; unknown errors have no request identity.
      const config = error.config;
      if (typeof config === 'object' && config !== null && requests.has(config)) {
        if (requests.get(config) !== generation) throw new CanceledError('Oturum değişti; eski istek hatası yok sayıldı.');
      }
    }
    return Promise.reject(error);
  });
}
