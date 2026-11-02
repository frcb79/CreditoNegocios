import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    // Roles can change when the operator switches accounts in another tab.
    // Do not keep stale Master UI after the server session has changed.
    refetchOnWindowFocus: true,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
