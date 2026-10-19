"use client";

import ImagePicker from "@/components/admin/ImagePicker";
import { Field, inputClass } from "@/components/admin/ui";

/** A link pasted in, or a photo or video uploaded to the library, whichever the admin has. */
export function UrlField({
  label,
  hint,
  value,
  onChange,
  upload = true,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (url: string) => void;
  upload?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Field label={label} hint={hint}>
        <input
          className={inputClass}
          maxLength={1000}
          value={value}
          placeholder="https://"
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
      {upload && (
        <Field label="Or upload" hint="A video or picture from your device goes into the media library." as="group">
          <ImagePicker value={value ? [value] : []} onChange={(urls) => onChange(urls[0] ?? "")} max={1} coverLabel="File" />
        </Field>
      )}
    </div>
  );
}
