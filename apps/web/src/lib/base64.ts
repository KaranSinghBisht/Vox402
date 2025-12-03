export function b64encodeUtf8(s: string) {
  return btoa(unescape(encodeURIComponent(s)));
}
export function b64decodeUtf8(b64: string) {
  return decodeURIComponent(escape(atob(b64)));
}
