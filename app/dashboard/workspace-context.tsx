"use client";

import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";

interface WorkspaceInfo {
  id: string;
  public_id: string;
  name: string;
  max_pages: number;
  is_publisher: boolean;
}

interface WorkspaceContextValue extends WorkspaceInfo {
  workspaces: WorkspaceInfo[];
  switchWorkspace: (id: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  workspace,
  workspaces,
  children,
}: {
  workspace: WorkspaceInfo;
  workspaces: WorkspaceInfo[];
  children: React.ReactNode;
}) {
  const router = useRouter();

  const switchWorkspace = async (id: string) => {
    await fetch("/api/internal/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: id }),
    });
    router.refresh();
  };

  const value: WorkspaceContextValue = {
    ...workspace,
    workspaces,
    switchWorkspace,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
