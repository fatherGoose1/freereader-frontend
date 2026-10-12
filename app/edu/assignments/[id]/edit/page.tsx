import AssignmentEditor from "../../../AssignmentEditor";
export default async function EditAssignment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssignmentEditor assignmentId={id} />;
}
