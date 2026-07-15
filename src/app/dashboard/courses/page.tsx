import { PageHeader } from "@/components/shared/page-header";
import { CoursesManager } from "@/components/features/courses-manager";
import { listCourses } from "@/app/actions/courses";

export default async function CoursesPage() {
  const courses = await listCourses();

  return (
    <div className="space-y-6">
      <PageHeader title="Kurslarim" description="Narx va davomiylik shabloni sifatidagi kurslaringiz" />
      <CoursesManager initialCourses={courses as never} />
    </div>
  );
}
