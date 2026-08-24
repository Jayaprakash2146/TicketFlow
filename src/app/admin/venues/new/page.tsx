"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { VenueBuilder } from "@/components/venue-builder";

export default function NewVenuePage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/admin" className="muted inline-flex items-center gap-1.5 text-sm hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Admin
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white">Create a venue</h1>
      <p className="muted mt-1">
        Define the seat grid and paint categories onto it. Organisers will price each category when they create events here.
      </p>
      <div className="mt-6">
        <VenueBuilder mode="create" onSaved={(id) => router.push(`/admin/venues/${id}`)} />
      </div>
    </div>
  );
}
