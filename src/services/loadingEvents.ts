export const API_LOADING_EVENT = 'oriafuture:api-loading';

export function notifyApiLoading(delta: 1 | -1): void {
  window.dispatchEvent(new CustomEvent(API_LOADING_EVENT, { detail: { delta } }));
}
