"use client";

import QRCode from "react-qr-code";

export function QrPanel({
  url,
  code,
  size = 200,
}: {
  url: string;
  code: string;
  size?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-5 shadow-xl">
      <QRCode value={url} size={size} fgColor="#101f3a" bgColor="#ffffff" />
      <div className="text-center leading-snug">
        <div className="text-sm font-semibold uppercase tracking-wide text-steel-600">
          Scan to play
        </div>
        <div className="mt-0.5 text-2xl font-extrabold tracking-[0.18em] text-navy-900">
          {code}
        </div>
        <div className="mt-0.5 max-w-[220px] break-all text-[11px] text-steel-600">
          {url.replace(/^https?:\/\//, "")}
        </div>
      </div>
    </div>
  );
}
