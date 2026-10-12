import SharedAssignment from "../../../../SharedAssignment";
export default async function SharedReader({ params }: { params: Promise<{ token: string; versionId: string }> }) {
  const { token, versionId } = await params;
  return <SharedAssignment token={token} versionId={versionId} />;
}
