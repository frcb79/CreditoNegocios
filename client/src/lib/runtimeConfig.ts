function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

export function getApiBaseUrl() {
  const value = import.meta.env.VITE_API_BASE_URL?.trim();
  return value ? stripTrailingSlash(value) : "";
}

export function getAppBaseUrl() {
  const value = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  return value ? stripTrailingSlash(value) : window.location.origin;
}

export function buildApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (!path.startsWith("/api")) {
    return path;
  }

  return `${getApiBaseUrl()}${path}`;
}

export function buildWebSocketUrl(path: string) {
  const override = import.meta.env.VITE_WS_BASE_URL?.trim();
  if (override) {
    return `${stripTrailingSlash(override)}${path}`;
  }

  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl) {
    const apiUrl = new URL(apiBaseUrl);
    const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${apiUrl.host}${path}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

function resolveFetchUrl(input: string | URL) {
  const candidate = typeof input === "string" ? input : input.toString();

  if (candidate.startsWith("/api")) {
    return buildApiUrl(candidate);
  }

  if (/^https?:\/\//i.test(candidate)) {
    const url = new URL(candidate);
    if (url.origin === window.location.origin && url.pathname.startsWith("/api")) {
      return buildApiUrl(`${url.pathname}${url.search}`);
    }
  }

  return candidate;
}

export function installApiFetchInterceptor() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" || input instanceof URL) {
      return originalFetch(resolveFetchUrl(input), init);
    }

    const nextUrl = resolveFetchUrl(input.url);
    if (nextUrl === input.url) {
      return originalFetch(input, init);
    }

    return originalFetch(new Request(nextUrl, input), init);
  };
}