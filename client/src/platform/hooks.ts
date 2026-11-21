import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { platform } from "./index";
import type { AppSettings, ServerInfo } from "./types";

export const serverInfoQueryKey = ["platform", "server-info"] as const;
export const settingsQueryKey = ["platform", "settings"] as const;

export function useServerInfo() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: serverInfoQueryKey, queryFn: platform.getServerInfo });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;
    void platform.onServerState((info) => queryClient.setQueryData(serverInfoQueryKey, info)).then((cleanup) => {
      if (active) unsubscribe = cleanup;
      else cleanup();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [queryClient]);

  return query;
}

export function useSettings() {
  return useQuery({ queryKey: settingsQueryKey, queryFn: platform.getSettings });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => platform.updateSettings(patch),
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsQueryKey, settings);
      void queryClient.invalidateQueries({ queryKey: serverInfoQueryKey });
    },
  });
}

export function useRestartServer() {
  const queryClient = useQueryClient();
  return useMutation<ServerInfo, Error, void>({
    mutationFn: platform.restartServer,
    onSuccess: (info) => queryClient.setQueryData(serverInfoQueryKey, info),
  });
}
