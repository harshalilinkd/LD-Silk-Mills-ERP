"use client";

import * as React from "react";
import { IconBuildingFactory2, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  FieldGrid,
  FormAlert,
  TextField,
} from "@/components/help-slip/form-parts";
import {
  CountChip,
  ListState,
  Panel,
  PanelHead,
  SectionCard,
} from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { HScroll } from "@/components/ui/hscroll";
import { Spinner } from "@/components/ui/spinner";
import { helpSlipGet, helpSlipSend } from "@/lib/help-slip/api-client";
import type { AdminDepartmentRow } from "@/lib/help-slip/settings";
import { cn } from "@/lib/utils";

type Payload = { departments: AdminDepartmentRow[] };

/**
 * Departments.
 *
 * THERE IS NO DELETE, and that is a data-integrity decision rather than a
 * missing feature. Every concern carries a `department_id`; deleting a
 * department would orphan every concern ever filed against it, including closed
 * ones somebody may need to look up years later. Retiring one instead removes
 * it from the raise form's dropdown — which returns active rows only — while
 * every historical concern keeps its department name. The concern count beside
 * each row is there so nobody retires one without seeing what is behind it.
 */
export function DepartmentsPanel() {
  const queryClient = useQueryClient();
  const key = ["help-slip", "settings", "departments"];

  const q = useQuery({
    queryKey: key,
    queryFn: () => helpSlipGet<Payload>("/api/help-slip/settings/departments"),
  });

  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");

  const create = useMutation({
    mutationFn: (body: { code: string; name: string }) =>
      helpSlipSend("/api/help-slip/settings/departments", "POST", body),
    onSuccess: () => {
      setCode("");
      setName("");
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const patch = useMutation({
    mutationFn: (v: { id: string; name?: string; status?: string }) =>
      helpSlipSend<Payload>(
        `/api/help-slip/settings/departments/${v.id}`,
        "PATCH",
        v.status ? { status: v.status } : { name: v.name },
      ),
    onSuccess: (res) => queryClient.setQueryData(key, res),
  });

  const rows = q.data?.departments ?? [];

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Add a department" icon={<IconPlus stroke={1.6} />}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ code, name });
          }}
        >
          <FieldGrid cols={2}>
            <TextField
              id="dept-name"
              labelEn="Name"
              helperEn="What people see in the dropdown."
              value={name}
              onChange={setName}
              required
              disabled={create.isPending}
            />
            <TextField
              id="dept-code"
              labelEn="Code"
              helperEn="A short handle. Cannot be changed later."
              value={code}
              onChange={setCode}
              required
              disabled={create.isPending}
            />
          </FieldGrid>
          {create.isError ? (
            <FormAlert>{(create.error as Error).message}</FormAlert>
          ) : null}
          <div>
            <Button
              type="submit"
              disabled={create.isPending || !name.trim() || !code.trim()}
              className="h-11 md:h-9"
            >
              {create.isPending ? <Spinner /> : null}
              Add department
            </Button>
          </div>
        </form>
      </SectionCard>

      <Panel>
        <PanelHead
          titleEn="Departments"
          icon={<IconBuildingFactory2 stroke={1.6} />}
          aside={<CountChip>{rows.length}</CountChip>}
        />
        <ListState
          loading={q.isPending}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => void q.refetch()}
          isEmpty={rows.length === 0}
          empty={{
            icon: IconBuildingFactory2,
            titleEn: "No departments yet.",
            bodyEn: "Add one above so people can file concerns against it.",
          }}
        >
          <HScroll>
            <Table>
              <THead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Code</Th>
                  <Th>Concerns</Th>
                  <Th>Status</Th>
                  <Th> </Th>
                </Tr>
              </THead>
              <TBody>
                {rows.map((d) => (
                  <Tr key={d.id}>
                    <Td className="font-semibold text-text-1">{d.name}</Td>
                    <Td className="num text-text-3">{d.code}</Td>
                    <Td className="num">{d.concernCount}</Td>
                    <Td>
                      <span
                        className={cn(
                          "rounded-pill px-2 py-0.5 text-[11px] font-semibold uppercase",
                          d.status === "active"
                            ? "bg-status-green-dim text-status-green"
                            : "bg-chip text-text-3",
                        )}
                      >
                        {d.status === "active" ? "Active" : "Retired"}
                      </span>
                    </Td>
                    <Td>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={patch.isPending}
                        className="h-11 md:h-8"
                        onClick={() =>
                          patch.mutate({
                            id: d.id,
                            status:
                              d.status === "active" ? "inactive" : "active",
                          })
                        }
                      >
                        {d.status === "active" ? "Retire" : "Restore"}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </HScroll>
        </ListState>
      </Panel>

      {patch.isError ? (
        <FormAlert>{(patch.error as Error).message}</FormAlert>
      ) : null}

      <p className={cn("text-text-3", T.caption)}>
        Departments are never deleted — every concern ever filed points at one.
        Retiring a department hides it from the &ldquo;Raise a concern&rdquo;
        form while its history keeps its name.
      </p>
    </div>
  );
}
