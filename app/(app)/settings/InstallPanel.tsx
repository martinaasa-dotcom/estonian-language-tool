"use client";

import { Check, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { isIosSafari, isStandalone, runInstall, useInstallEvent } from "@/components/installEvent";

/**
 * The install offer, where somebody can come and find it.
 *
 * The banner asks once in a device's life and then stays quiet forever, which
 * is the right trade for something nobody wants asked twice. The cost of that
 * is that the offer has to exist somewhere else, on the day they change their
 * mind, and that place is here: a button when the browser will give us one, the
 * Share menu when it is an iPhone, and a plain acknowledgement when the app is
 * already installed and there is nothing to do.
 */
export function InstallPanel() {
  const event = useInstallEvent();
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIosSafari());
  }, []);

  if (installed) {
    return (
      <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--mint-ink)" }}>
        <Check size={14} aria-hidden /> Installed on this device.
      </p>
    );
  }

  if (event) {
    return (
      <Button
        variant="primary"
        className="mt-3"
        onClick={() => {
          void runInstall(event).finally(() => setInstalled(isStandalone()));
        }}
      >
        <Download size={16} aria-hidden /> Install Kodukeel
      </Button>
    );
  }

  return (
    <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
      {ios
        ? "On this iPhone: the Share button, then Add to Home Screen."
        : "This browser has not offered an install button. Chrome and Edge put one in the address bar; Safari keeps it under Share."}
    </p>
  );
}
