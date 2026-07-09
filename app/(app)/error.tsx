"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center text-center">
      <div>
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-accent-soft text-primary">
          <AlertTriangle className="size-5" />
        </div>
        <h2 className="font-display text-lg font-semibold">
          Something went wrong
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
          An unexpected error occurred while loading this page. You can try again.
        </p>
        <Button className="mt-4" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
