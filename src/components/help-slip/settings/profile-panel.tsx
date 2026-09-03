"use client";

import * as React from "react";
import { IconUser } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { FormAlert, TextField } from "@/components/help-slip/form-parts";
import {
  MetaItem,
  MetaStrip,
  SectionCard,
} from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { helpSlipGet, helpSlipSend } from "@/lib/help-slip/api-client";
import { useHelpSlipSession } from "@/lib/help-slip/context";
import { roleLabel } from "@/lib/help-slip/meta";
import type { SettingsUserRow } from "@/lib/help-slip/settings";
import { cn } from "@/lib/utils";

type Payload = {
  profile: {
    fullName: string;
    email: string;
    role: string;
    departmentId: string | null;
    hrAccess: boolean;
    avatarUrl: string | null;
  };
  departments: { id: string; name: string }[];
};

/**
 * Your own profile — the one settings screen everybody gets.
 *
 * WHAT IS EDITABLE HERE IS EXACTLY WHAT THE DATABASE LETS YOU EDIT ABOUT
 * YOURSELF: name, phone, avatar. Role, department, confidential access and
 * account status are shown as FACTS, not fields, because
 * `guard_profile_columns`'s final branch rewrites all four back to their old
 * values on a self-edit. Rendering them as disabled inputs would suggest they
 * are one permission away from being editable; they are not, for you, ever.
 */
export function ProfilePanel() {
  const session = useHelpSlipSession();
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ["help-slip", "settings", "profile"],
    queryFn: () => helpSlipGet<Payload>("/api/help-slip/settings/profile"),
  });

  const [fullName, setFullName] = React.useState(session.fullName);
  const [phone, setPhone] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  // Hydrate once from the server, then leave the fields alone — a refetch on
  // window focus must not overwrite what somebody is halfway through typing.
  React.useEffect(() => {
    if (loaded || !q.data) return;
    setFullName(q.data.profile.fullName);
    setLoaded(true);
  }, [q.data, loaded]);

  const save = useMutation({
    mutationFn: (body: { fullName: string; phone: string | null }) =>
      helpSlipSend<{ user: SettingsUserRow }>(
        "/api/help-slip/settings/profile",
        "PATCH",
        body,
      ),
    onSuccess: (res) => {
      setSaved(true);
      setFullName(res.user.fullName);
      setPhone(res.user.phone ?? "");
      void queryClient.invalidateQueries({
        queryKey: ["help-slip", "settings"],
      });
    },
  });

  const dept =
    q.data?.departments.find((d) => d.id === q.data?.profile.departmentId)
      ?.name ?? "—";

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
      <SectionCard title="Your details" icon={<IconUser stroke={1.6} />}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            save.mutate({ fullName, phone: phone.trim() || null });
          }}
        >
          <TextField
            id="profile-name"
            labelEn="Full name"
            helperEn="How you appear on every concern you raise."
            value={fullName}
            onChange={setFullName}
            required
            disabled={save.isPending || q.isPending}
          />
          <TextField
            id="profile-phone"
            labelEn="Phone"
            helperEn="Optional. Used for WhatsApp updates."
            value={phone}
            onChange={setPhone}
            disabled={save.isPending || q.isPending}
          />

          {save.isError ? (
            <FormAlert>{(save.error as Error).message}</FormAlert>
          ) : saved ? (
            <FormAlert tone="neutral" role="status">
              Saved.
            </FormAlert>
          ) : null}

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={save.isPending}
              className="h-11 md:h-9"
            >
              {save.isPending ? <Spinner /> : null}
              Save changes
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Your access">
        {/* Facts, not fields. See the header: the database rewrites every one of
            these back on a self-edit, so an input would be a lie. */}
        <MetaStrip cols={3}>
          <MetaItem label="Signed in as">{session.email}</MetaItem>
          <MetaItem label="Role">{roleLabel(session.role)}</MetaItem>
          <MetaItem label="Department">{dept}</MetaItem>
          <MetaItem label="Confidential complaints">
            {session.hrAccess ? "Can open" : "Cannot open"}
          </MetaItem>
        </MetaStrip>
        <p className={cn("text-text-3", T.caption)}>
          Only an admin can change these. Ask one if something here is wrong.
        </p>
      </SectionCard>
    </div>
  );
}
