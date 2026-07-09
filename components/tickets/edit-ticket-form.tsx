"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";

import { updateTicket } from "@/lib/actions/tickets";
import type { Department } from "@/lib/db/schema";
import {
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  editTicketSchema,
  type EditTicketInput,
} from "@/lib/validators/ticket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FormValues = z.input<typeof editTicketSchema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

export function EditTicketForm({
  ticketId,
  defaults,
  onSaved,
}: {
  ticketId: string;
  defaults: {
    title: string;
    description: string;
    department: Department;
    sheetLink: string;
  };
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues, unknown, EditTicketInput>({
    resolver: zodResolver(editTicketSchema),
    defaultValues: {
      title: defaults.title,
      description: defaults.description,
      department: defaults.department,
      sheetLink: defaults.sheetLink,
    },
  });

  const onSubmit = (values: EditTicketInput) => {
    startTransition(async () => {
      const res = await updateTicket({ ticketId, ...values });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Ticket updated");
      router.refresh();
      onSaved();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="edit-title" className="mb-1.5 block text-sm font-medium">
          Summary
        </label>
        <Input id="edit-title" disabled={pending} {...register("title")} />
        <FieldError message={errors.title?.message} />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">Department</label>
        <Controller
          control={control}
          name="department"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={pending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DEPARTMENT_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError message={errors.department?.message} />
      </div>

      <div>
        <label htmlFor="edit-sheet" className="mb-1.5 block text-sm font-medium">
          Sheet link (optional)
        </label>
        <Input
          id="edit-sheet"
          type="url"
          placeholder="https://docs.google.com/spreadsheets/…"
          disabled={pending}
          {...register("sheetLink")}
        />
        <FieldError message={errors.sheetLink?.message} />
      </div>

      <div>
        <label htmlFor="edit-desc" className="mb-1.5 block text-sm font-medium">
          Description
        </label>
        <Textarea
          id="edit-desc"
          rows={5}
          disabled={pending}
          {...register("description")}
        />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
