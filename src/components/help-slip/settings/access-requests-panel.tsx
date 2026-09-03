"use client";

import * as React from "react";
import { IconUserPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { HsModal, ModalCancel } from "@/components/help-slip/concern-parts";
import {
  CheckboxField,
  FieldGrid,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/help-slip/form-parts";
import {
  CountChip,
  ListState,
  Panel,
  PanelHead,
} from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import { Table, TBody, THead, Th, Td, Tr } from "@/components/ui/data-table";
import { HScroll } from "@/components/ui/hscroll";
import { Spinner } from "@/components/ui/spinner";
import { USER_ROLES, type UserRole } from "@/db/help-slip/schema";
import { helpSlipGet, helpSlipSend } from "@/lib/help-slip/api-client";
import { absoluteTime } from "@/lib/help-slip/format";
import { roleLabel } from "@/lib/help-slip/meta";
import type { AccessRequestRow } from "@/lib/help-slip/settings";
import { cn } from "@/lib/utils";

type Payload = {
  requests: AccessRequestRow[];
  departments: { id: string; name: string }[];
};

/**
 * Access requests — the ONLY way somebody joins Help Slip.
 *
 * That is a database constraint rather than a design preference:
 * `profiles.id` is a foreign key to `auth.users.id`, so a Help Slip profile
 * cannot exist until the person has signed in at least once. They sign in, a
 * request appears here, an admin decides.
 *
 * APPROVING NAMES THEIR ROLE AND DEPARTMENT IN THE SAME STEP, because a profile
 * with no role is not a row the database will accept — there is no "approve now,
 * configure later". The decision goes through `approve_access_request`, which
 * creates the profile, stamps the request reviewed and records who reviewed it
 * in one transaction; splitting that would leave a window where somebody is in
 * with no record of who let them in.
 *
 * A rejection REQUIRES a reason. Somebody who is refused needs to know whether
 * they used the wrong address or are simply not meant to have this.
 */
export function AccessRequestsPanel() {
  const queryClient = useQueryClient();
  const key = React.useMemo(
    () => ["help-slip", "settings", "access-requests"],
    [],
  );

  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      helpSlipGet<Payload>("/api/help-slip/settings/access-requests"),
  });

  const [deciding, setDeciding] = React.useState<{
    row: AccessRequestRow;
    mode: "approve" | "reject";
  } | null>(null);

  const requests = q.data?.requests ?? [];
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHead
          titleEn="Waiting for a decision"
          icon={<IconUserPlus stroke={1.6} />}
          aside={<CountChip>{pending.length}</CountChip>}
        />
        <ListState
          loading={q.isPending}
          error={q.isError ? (q.error as Error).message : null}
          onRetry={() => void q.refetch()}
          isEmpty={pending.length === 0}
          empty={{
            icon: IconUserPlus,
            titleEn: "Nobody is waiting.",
            bodyEn:
              "When somebody signs in for the first time, their request appears here.",
          }}
        >
          <HScroll>
            <Table>
              <THead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Signs in as</Th>
                  <Th>Asked</Th>
                  <Th> </Th>
                </Tr>
              </THead>
              <TBody>
                {pending.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-semibold text-text-1">
                      {r.googleName ?? "—"}
                    </Td>
                    <Td className="text-text-3">{r.googleEmail}</Td>
                    <Td className="num">{absoluteTime(r.requestedAt)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="h-11 md:h-8"
                          onClick={() =>
                            setDeciding({ row: r, mode: "approve" })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-11 md:h-8"
                          onClick={() =>
                            setDeciding({ row: r, mode: "reject" })
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </HScroll>
        </ListState>
      </Panel>

      {decided.length > 0 ? (
        <Panel>
          <PanelHead
            titleEn="Already decided"
            aside={<CountChip>{decided.length}</CountChip>}
          />
          <HScroll>
            <Table>
              <THead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Signs in as</Th>
                  <Th>Outcome</Th>
                  <Th>Reason</Th>
                  <Th>Decided</Th>
                </Tr>
              </THead>
              <TBody>
                {decided.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-semibold text-text-1">
                      {r.googleName ?? "—"}
                    </Td>
                    <Td className="text-text-3">{r.googleEmail}</Td>
                    <Td>
                      <span
                        className={cn(
                          "rounded-pill px-2 py-0.5 text-[11px] font-semibold uppercase",
                          r.status === "approved"
                            ? "bg-status-green-dim text-status-green"
                            : "bg-status-red-dim text-status-red",
                        )}
                      >
                        {r.status}
                      </span>
                    </Td>
                    <Td className="text-text-3">{r.rejectReason ?? "—"}</Td>
                    <Td className="num">
                      {r.reviewedAt ? absoluteTime(r.reviewedAt) : "—"}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </HScroll>
        </Panel>
      ) : null}

      <p className={cn("text-text-3", T.caption)}>
        This is the only way to add somebody. A Help Slip account is tied to a
        sign-in account, so a person must sign in once before they can be given
        one.
      </p>

      {deciding ? (
        <DecisionDialog
          row={deciding.row}
          mode={deciding.mode}
          departments={q.data?.departments ?? []}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            void queryClient.invalidateQueries({ queryKey: key });
            // A new profile changes the people list too.
            void queryClient.invalidateQueries({
              queryKey: ["help-slip", "settings", "users"],
            });
          }}
        />
      ) : null}
    </div>
  );
}

function DecisionDialog({
  row,
  mode,
  departments,
  onClose,
  onDone,
}: {
  row: AccessRequestRow;
  mode: "approve" | "reject";
  departments: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [fullName, setFullName] = React.useState(row.googleName ?? "");
  const [role, setRole] = React.useState<UserRole>("employee");
  const [departmentId, setDepartmentId] = React.useState("");
  const [hrAccess, setHrAccess] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const decide = useMutation({
    mutationFn: () =>
      helpSlipSend(
        `/api/help-slip/settings/access-requests/${row.id}`,
        "POST",
        mode === "approve"
          ? {
              decision: "approve",
              fullName,
              role,
              departmentId: departmentId || null,
              hrAccess,
            }
          : { decision: "reject", reason },
      ),
    onSuccess: onDone,
  });

  const blocked =
    mode === "approve" ? !fullName.trim() : reason.trim().length < 3;

  return (
    <HsModal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      titleEn={mode === "approve" ? "Let them in" : "Refuse access"}
      descriptionEn={row.googleEmail}
      error={decide.isError ? (decide.error as Error).message : undefined}
      footer={
        <>
          <ModalCancel disabled={decide.isPending} />
          <Button
            type="button"
            disabled={decide.isPending || blocked}
            className="h-11 md:h-9"
            onClick={() => decide.mutate()}
          >
            {decide.isPending ? <Spinner /> : null}
            {mode === "approve" ? "Approve" : "Reject"}
          </Button>
        </>
      }
    >
      {mode === "approve" ? (
        <div className="flex flex-col gap-3">
          <FieldGrid cols={2}>
            <TextField
              id="ar-name"
              labelEn="Full name"
              helperEn="How they appear on every concern."
              value={fullName}
              onChange={setFullName}
              required
              disabled={decide.isPending}
            />
            <SelectField
              id="ar-role"
              labelEn="Role"
              value={role}
              onChange={(v) => setRole(v as UserRole)}
              options={USER_ROLES.map((r) => ({
                value: r,
                label: roleLabel(r),
              }))}
              disabled={decide.isPending}
            />
            <SelectField
              id="ar-dept"
              labelEn="Department"
              helperEn="Where their concerns go by default."
              value={departmentId}
              onChange={setDepartmentId}
              placeholder="No department"
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              disabled={decide.isPending}
            />
          </FieldGrid>
          <div className="rounded-field border border-border bg-surface-2 px-3 py-2">
            <CheckboxField
              id="ar-hr"
              checked={hrAccess}
              onChange={setHrAccess}
              labelEn="Can open confidential complaints"
              descriptionEn="Leave this off unless they handle HR matters. It can be granted later."
              disabled={decide.isPending}
            />
          </div>
        </div>
      ) : (
        <TextAreaField
          id="ar-reason"
          labelEn="Why"
          helperEn="They see this, so say something useful."
          value={reason}
          onChange={setReason}
          rows={3}
          required
          disabled={decide.isPending}
        />
      )}
    </HsModal>
  );
}
