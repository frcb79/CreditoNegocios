import { QueryClient, QueryFunction } from "@tanstack/react-query";

class ApiError extends Error {
  status: number;
  isNetworkError: boolean;
  
  constructor(message: string, status: number, isNetworkError = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    
    // Try to parse JSON response and extract message
    try {
      const json = JSON.parse(text);
      if (json.message) {
        throw new ApiError(json.message, res.status);
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // If not valid JSON or no message field, use original text
    }
    
    throw new ApiError(text || `Error ${res.status}`, res.status);
  }
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  
  // Only retry network errors and 5xx server errors
  if (error instanceof ApiError) {
    return error.isNetworkError || error.status >= 500;
  }
  
  // Retry on network failures (fetch throws TypeError for network errors)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  
  return false;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    const res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    // Handle network errors (no internet, server unreachable)
    if (error instanceof TypeError) {
      throw new ApiError(
        "Error de conexión. Por favor verifica tu conexión a internet e intenta de nuevo.",
        0,
        true
      );
    }
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Build URL from query key
    let url = '';
    const baseUrl = queryKey[0] as string;
    
    if (queryKey.length > 1 && typeof queryKey[1] === 'object' && queryKey[1] !== null) {
      // Handle structured query keys with params
      const params = new URLSearchParams();
      Object.entries(queryKey[1]).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
    } else {
      // Handle simple query keys
      url = queryKey.join("/") as string;
    }
    
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: shouldRetry,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
    mutations: {
      retry: shouldRetry,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
  },
});

export { ApiError };
