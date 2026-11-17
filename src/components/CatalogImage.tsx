"use client";

import Image from "next/image";
import { useState } from "react";

type CatalogImageProps = {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  loading?: "eager" | "lazy";
  preload?: boolean;
};

export function CatalogImage({
  src,
  alt,
  sizes,
  className = "object-cover",
  loading = "lazy",
  preload = false,
}: CatalogImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={`${alt}，图片暂时无法加载`}
        className="absolute inset-0 flex items-center justify-center bg-[#e8e0d6] text-earth"
      >
        <span className="font-serif text-3xl tracking-[-0.08em]">MM</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      loading={preload ? undefined : loading}
      preload={preload}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
