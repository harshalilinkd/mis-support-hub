"use client";

import { useCallback, useEffect, useState } from "react";

import { loadRequestDetail } from "@/lib/actions/requests";
import type { RequestDetail as RequestDetailData } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { RequestDetail } from "./request-detail";

/** Centered modal that hydrates and renders <RequestDetail> for a request number. */
export function RequestSheet({
  number,
  currentUser,
  onOpenChange,
}: {
  number: string | null;
  currentUser: SessionUser;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<RequestDetailData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const reload = useCallback(async (n: string) => {
    const res = await loadRequestDetail(n);
    setDetail(res.ok ? res.data : null);
    setStatus(res.ok ? "ready" : "error");
  }, []);

  useEffect(() => {
    if (!number) return;
    let active = true;
    setDetail(null);
    setStatus("loading");
    void loadRequestDetail(number).then((res) => {
      if (!active) return;
      setDetail(res.ok ? res.data : null);
      setStatus(res.ok ? "ready" : "error");
    });
    return () => {
      active = false;
    };
  }, [number]);

  const showDetail = status === "ready" && detail && detail.number === number;

  return (
    <Dialog open={!!number} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-hidden rounded-[var(--radius-card)] border-border p-0 shadow-2xl sm:max-w-2xl">
        <DialogTitle className="sr-only">{number ?? "Request"}</DialogTitle>
        <div className="max-h-[88vh] overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
          {showDetail ? (
            <RequestDetail
              request={detail}
              currentUser={currentUser}
              onMutate={() => {
                if (number) void reload(number);
              }}
            />
          ) : status === "error" ? (
            <div className="grid place-items-center py-16 text-center text-sm text-text-muted">
              Couldn&apos;t load this request. It may have been removed or you may
              not have access.
            </div>
          ) : (
            <div className="space-y-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
