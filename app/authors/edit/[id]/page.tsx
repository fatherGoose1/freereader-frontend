import PublishingStudio from "../../PublishingStudio";

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  return <PublishingStudio bookId={(await params).id} />;
}
