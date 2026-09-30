"use client";

import { useEffect, useState } from "react";
import { authorClient } from "./client";
import { assetUrl } from "./model";

export default function AuthorImage({ blob, path, alt }: { blob?: Blob; path?: string | null; alt: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    setSrc("");
    const load = async () => {
      let image = blob;
      if (!image && path) {
        const { data } = await authorClient().auth.getSession();
        const response = await fetch(assetUrl(path), {
          headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}, cache: "no-store",
        });
        if (response.ok) image = await response.blob();
      }
      if (!image || cancelled) return;
      url = URL.createObjectURL(image);
      setSrc(url);
    };
    void load().catch(() => undefined);
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [blob, path]);
  return src ? <img src={src} alt={alt} /> : null;
}
