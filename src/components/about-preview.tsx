import Image from "next/image";
import Link from "next/link";

interface AboutPreviewProps {
  name: string;
  shortBio: string;
  photoUrl?: string;
}

export function AboutPreview({ name, shortBio, photoUrl }: AboutPreviewProps) {
  return (
    <section className="bg-driftwood py-16 px-6">
      <div className="max-w-2xl mx-auto text-center">
        <div className="relative w-20 h-20 rounded-full overflow-hidden mx-auto mb-4 bg-shallow-water">
          {photoUrl ? (
            <Image src={photoUrl} alt={name} fill className="object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-deep-ocean">
              Photo
            </div>
          )}
        </div>
        <h2 className="text-xl font-semibold text-deep-current mb-2">
          Hello, I&apos;m {name}
        </h2>
        <p className="text-deep-ocean leading-relaxed mb-4">{shortBio}</p>
        <Link
          href="/about"
          className="text-lunar-gold font-semibold hover:text-lunar-gold/80 transition-colors"
        >
          About me &rarr;
        </Link>
      </div>
    </section>
  );
}
