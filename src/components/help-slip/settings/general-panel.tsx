"use client";

import * as React from "react";
import { IconBell, IconClock, IconSettings } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  CheckboxField,
  FieldGrid,
  FormAlert,
  SelectField,
  TextField,
} from "@/components/help-slip/form-parts";
import { SectionCard } from "@/components/help-slip/page-parts";
import { T } from "@/components/help-slip/type-scale";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { helpSlipGet, helpSlipSend } from "@/lib/help-slip/api-client";
import {
  DEFAULT_SETTINGS,
  type GeneralSettings,
} from "@/lib/help-slip/settings";
import { cn } from "@/lib/utils";

const PRIORITY_ORDER = [
  { key: "urgent", label: "Urgent", note: "Work has stopped." },
  { key: "high", label: "High", note: "" },
  { key: "normal", label: "Normal", note: "" },
  { key: "low", label: "Low", note: "" },
] as const;

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00`,
}));

/**
 * General — the one settings row, edited whole.
 *
 * The SLA days are the reason this is a jsonb blob rather than columns: they
 * had to become editable without a migration, and `v_concerns` reads them on
 * every query. So changing a number here moves the due date of every open
 * concern the moment it saves, which is why the form says so out loud rather
 * than presenting four anonymous number boxes.
 */
export function GeneralPanel() {
  const q = useQuery({
    queryKey: ["help-slip", "settings", "general"],
    queryFn: () =>
      helpSlipGet<{ settings: GeneralSettings }>(
        "/api/help-slip/settings/general",
      ),
  });

  const [form, setForm] = React.useState<GeneralSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (loaded || !q.data) return;
    setForm(q.data.settings);
    setLoaded(true);
  }, [q.data, loaded]);

  const save = useMutation({
    mutationFn: (next: GeneralSettings) =>
      helpSlipSend<{ settings: GeneralSettings }>(
        "/api/help-slip/settings/general",
        "PUT",
        next,
      ),
    onSuccess: (res) => {
      setForm(res.settings);
      setSaved(true);
    },
  });

  const busy = save.isPending || q.isPending;
  const set = (patch: Partial<GeneralSettings>) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...patch }));
  };

  return (
    <form
      className="mx-auto flex w-full max-w-[1000px] flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(form);
      }}
    >
      <SectionCard title="Organisation" icon={<IconSettings stroke={1.6} />}>
        <FieldGrid cols={2}>
          <TextField
            id="gen-org"
            labelEn="Organisation name"
            helperEn="Shown in the app and in WhatsApp messages."
            value={form.org_name}
            onChange={(v) => set({ org_name: v })}
            required
            disabled={busy}
          />
          <SelectField
            id="gen-theme"
            labelEn="Default theme"
            helperEn="For a device that has not chosen one."
            value={form.default_theme}
            onChange={(v) =>
              set({ default_theme: v as GeneralSettings["default_theme"] })
            }
            options={[
              { value: "system", label: "Follow the device" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            disabled={busy}
          />
        </FieldGrid>
      </SectionCard>

      <SectionCard
        title="How long a concern may take"
        icon={<IconClock stroke={1.6} />}
      >
        <p className={cn("text-text-3", T.bodySm)}>
          In days, from when a concern is filed. Changing a number here moves
          the due date of every open concern at that priority, immediately.
        </p>
        <FieldGrid>
          {PRIORITY_ORDER.map((p) => (
            <TextField
              key={p.key}
              id={`gen-sla-${p.key}`}
              labelEn={p.label}
              helperEn={p.note || undefined}
              value={String(form.sla_days[p.key])}
              onChange={(v) =>
                set({
                  sla_days: { ...form.sla_days, [p.key]: Number(v) || 0 },
                })
              }
              disabled={busy}
            />
          ))}
        </FieldGrid>
      </SectionCard>

      <SectionCard title="WhatsApp updates" icon={<IconBell stroke={1.6} />}>
        <CheckboxField
          id="gen-whatsapp"
          checked={form.whatsapp_enabled}
          onChange={(v) => set({ whatsapp_enabled: v })}
          labelEn="Send WhatsApp updates"
          descriptionEn="Off means messages are still recorded but never sent."
          disabled={busy}
        />
        <FieldGrid cols={2}>
          <SelectField
            id="gen-quiet-from"
            labelEn="Quiet hours start"
            helperEn="Nothing is sent after this."
            value={String(form.quiet_hours.from)}
            onChange={(v) =>
              set({ quiet_hours: { ...form.quiet_hours, from: Number(v) } })
            }
            options={HOURS}
            disabled={busy || !form.whatsapp_enabled}
          />
          <SelectField
            id="gen-quiet-to"
            labelEn="Quiet hours end"
            helperEn="Anything held overnight goes out then."
            value={String(form.quiet_hours.to)}
            onChange={(v) =>
              set({ quiet_hours: { ...form.quiet_hours, to: Number(v) } })
            }
            options={HOURS}
            disabled={busy || !form.whatsapp_enabled}
          />
        </FieldGrid>
      </SectionCard>

      {save.isError ? (
        <FormAlert>{(save.error as Error).message}</FormAlert>
      ) : saved ? (
        <FormAlert tone="neutral" role="status">
          Saved.
        </FormAlert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy} className="h-11 md:h-9">
          {save.isPending ? <Spinner /> : null}
          Save settings
        </Button>
      </div>
    </form>
  );
}
