import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <div className="mx-auto w-full max-w-5xl px-6 py-7"><PageHeader title={title} description={description} /><EmptyState title={`${title} is coming soon`} description="This page is being prepared. Your local server and connections remain available." /></div>;
}
