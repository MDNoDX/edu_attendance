import { redirect } from "next/navigation";

// To'lovlar bo'limi Hisobot bo'limi bilan birlashtirildi — endi bitta joyda
// umumiy summa, guruh/student bo'yicha ulush va excel/pdf eksport mavjud.
export default function PaymentsPage() {
  redirect("/dashboard/reports");
}
