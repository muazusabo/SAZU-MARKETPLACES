'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

const FALLBACK_IMAGE = '/campus-scene.svg';

export function HeroImage({ src, objectPosition }: { src?: string; objectPosition: string }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const imageRef = useRef<HTMLImageElement>(null);
  const imageSrc = src && src !== failedUrl ? src : FALLBACK_IMAGE;
  const handleError = useCallback(() => {
    if (src) setFailedUrl(src);
  }, [src]);

  useEffect(() => {
    const image = imageRef.current;
    if (src && src !== failedUrl && image?.complete && image.naturalWidth === 0) handleError();
  }, [failedUrl, handleError, src]);

  return (
    <Image
      ref={imageRef}
      src={imageSrc}
      alt="Illustration of a student with books in front of a university campus"
      fill
      priority
      unoptimized
      sizes="(max-width: 1023px) 100vw, 55vw"
      onError={handleError}
      className="object-cover"
      style={{ objectPosition }}
    />
  );
}
