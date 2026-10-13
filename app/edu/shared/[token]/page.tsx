import SharedAssignment from "../../SharedAssignment";
export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedAssignment token={token} />;
}
