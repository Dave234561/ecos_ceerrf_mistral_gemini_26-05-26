import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { requestQueue } from "./requestQueue";
import { getCurrentUserToken } from "./firebase";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;

    // Try to parse error response for retry-after header
    let retryAfter: number | undefined;
    try {
      const errorData = JSON.parse(text);
      retryAfter = errorData.retryAfter;
    } catch {
      // Not JSON, ignore
    }

    const error: any = new Error(`${res.status}: ${text}`);
    error.status = res.status; // Add status code for easier checking
    error.retryAfter = retryAfter;
    throw error;
  }
}

/**
 * Get authentication headers for API requests
 * SECURITY: Automatically includes Firebase ID token for authenticated routes
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getCurrentUserToken();

  if (token) {
    return {
      'Authorization': `Bearer ${token}`
    };
  }

  return {};
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: RequestInit & { skipQueue?: boolean; maxRetries?: number }
): Promise<any> {
  const { skipQueue = false, maxRetries, ...fetchOptions } = options || {};

  // Function to execute the actual fetch
  const executeFetch = async () => {
    const defaultHeaders = data ? { "Content-Type": "application/json" } : {};

    // SECURITY: Automatically include Firebase auth token for authenticated routes
    const authHeaders = await getAuthHeaders();

    const res = await fetch(url, {
      method,
      headers: {
        ...defaultHeaders,
        ...authHeaders,  // Add Firebase token automatically
        ...(fetchOptions?.headers || {})  // Allow override if needed
      } as any,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      ...fetchOptions,
    });

    await throwIfResNotOk(res);
    return await res.json();
  };

  // Skip queue only if explicitly requested (removed automatic skip for GET)
  if (skipQueue) {
    return executeFetch();
  }

  // Use request queue with automatic retry for all requests
  // GET requests get fewer retries (3) vs mutations (5)
  const defaultMaxRetries = method === 'GET' ? 3 : 5;
  return requestQueue.enqueue(executeFetch, {
    maxRetries: maxRetries ?? defaultMaxRetries,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2
  });
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(queryKey[0] as string, {
      headers: {
        ...authHeaders,
      },
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
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
