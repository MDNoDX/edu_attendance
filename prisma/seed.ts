/**
 * Seed script — NadirEdu is single-tenant: this creates ONE demo teacher
 * account ("Toshpo'latov Mustafo") with a real-looking dataset matching the
 * teacher's actual groups:
 *  - 3 Groups: 10-guruh, 11-guruh, 12-guruh — each carrying its own name,
 *    subject, monthly price (560 000 so'm/oy) and lessons-per-month
 *    directly (no separate Course entity), with real weekly schedules
 *    and room names
 *  - 26 real students (names + phone numbers) distributed across the groups
 *  - LessonSessions for July 2026 up to today, with attendance marked
 *    (mostly present, a couple of realistic isolated absences)
 *  - Current month billing with a mix of paid/partial/unpaid Payment rows
 *
 * Run with: npm run db:seed
 */
import { PrismaClient, type Gender } from "@prisma/client";
import bcrypt from "bcryptjs";
import { computeEarningsForHistory, computeLessonValue, type AttendanceHistoryEntry } from "../src/lib/attendance-payment";
import { formatFullName } from "../src/lib/utils";

const prisma = new PrismaClient();

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

interface StudentSeed {
  lastName: string;
  firstName: string;
  gender: Gender;
  phone: string;
}

const GROUP10_STUDENTS: StudentSeed[] = [
  { lastName: "Abdulazizov", firstName: "Javohir", gender: "MALE", phone: "+998990778755" },
  { lastName: "Abdurashidov", firstName: "Abdug'ani", gender: "MALE", phone: "+998946383578" },
  { lastName: "Alisherov", firstName: "Sayidamirxon", gender: "MALE", phone: "+998998359560" },
  { lastName: "Arziyev", firstName: "Muhammadiyor", gender: "MALE", phone: "+998770600003" },
  { lastName: "Atajonov", firstName: "Ulug'bek", gender: "MALE", phone: "+998990959075" },
  { lastName: "Jo'rayeva", firstName: "Laziza", gender: "FEMALE", phone: "+998974541252" },
  { lastName: "Muhammadjonov", firstName: "Komilbek", gender: "MALE", phone: "+998977131495" },
  { lastName: "Qodirov", firstName: "Zakariyo", gender: "MALE", phone: "+998935098100" },
  { lastName: "Sultonova", firstName: "Ezoza", gender: "FEMALE", phone: "+998935330253" },
  { lastName: "Tojiboyeva", firstName: "Muslima", gender: "FEMALE", phone: "+998909250365" },
  { lastName: "Tojiboyeva", firstName: "Xadicha", gender: "FEMALE", phone: "+998909250366" },
  { lastName: "Xasanaliyev", firstName: "Munisa", gender: "FEMALE", phone: "+998907000001" },
  { lastName: "Xasanaliyev", firstName: "Mustafo", gender: "MALE", phone: "+998907000002" },
];

const GROUP11_STUDENTS: StudentSeed[] = [
  { lastName: "Baybayeva", firstName: "Nargiza", gender: "FEMALE", phone: "+998959709585" },
  { lastName: "Dalaboyeva", firstName: "Nasiba", gender: "FEMALE", phone: "+998974408332" },
  { lastName: "Djamolxojayeva", firstName: "Gulxumor", gender: "FEMALE", phone: "+998909207444" },
  { lastName: "DosMuhamedova", firstName: "Muqaddas", gender: "FEMALE", phone: "+998935171707" },
  { lastName: "Madaliyeva", firstName: "Iroda", gender: "FEMALE", phone: "+998974007532" },
  { lastName: "Xalilova", firstName: "Muslima", gender: "FEMALE", phone: "+998333339626" },
  { lastName: "Xomurodova", firstName: "Nishona", gender: "FEMALE", phone: "+998977091726" },
];

const GROUP12_STUDENTS: StudentSeed[] = [
  { lastName: "Abdullayev", firstName: "Otabek", gender: "MALE", phone: "+998974002405" },
  { lastName: "Aliyev", firstName: "Baxtiyor", gender: "MALE", phone: "+998974037077" },
  { lastName: "Boltayev", firstName: "Muzaffar", gender: "MALE", phone: "+998999431660" },
  { lastName: "Elmirzayev", firstName: "Bahodir", gender: "MALE", phone: "+998909163357" },
  { lastName: "Komilov", firstName: "Doston", gender: "MALE", phone: "+998909848147" },
  { lastName: "Saidov", firstName: "Mirtolib", gender: "MALE", phone: "+998998818926" },
];

/** All lesson dates in July 2026 matching a given weekday set, from the 1st through `throughDay`. */
function julyDates(daysOfWeek: number[], throughDay: number): Date[] {
  const dates: Date[] = [];
  for (let day = 1; day <= throughDay; day++) {
    const d = new Date(2026, 6, day); // July = month index 6
    if (daysOfWeek.includes(d.getDay())) dates.push(d);
  }
  return dates;
}

async function main() {
  console.log("Seeding started...");

  const teacherUsername = process.env.SEED_TEACHER_USERNAME ?? "teacher1";
  const teacherPassword = process.env.SEED_TEACHER_PASSWORD ?? "Teacher123!";

  const teacherFirstName = "Mustafo";
  const teacherLastName = "Toshpo'latov";

  const teacher = await prisma.user.upsert({
    where: { username: teacherUsername },
    update: {},
    create: {
      username: teacherUsername,
      passwordHash: await hash(teacherPassword),
      firstName: teacherFirstName,
      lastName: teacherLastName,
      fullName: formatFullName(teacherFirstName, teacherLastName),
      phone: "+998901234567",
      defaultLessonRate: 25000,
      specialization: "Fonetika",
    },
  });

  const coursePrice = 560000;
  const lessonsPerMonth = 8; // haftasiga 2 marta x taxminan 4 hafta

  // Course used to be a separate template entity; a group now carries its
  // own name/subject/monthlyPrice/lessonsPerMonth directly (see
  // prisma/schema.prisma), so each group definition below just states its
  // own values instead of pointing at a shared Course row.
  const groupDefs = [
    {
      name: "10-guruh",
      subject: "Fonetika",
      monthlyPrice: coursePrice,
      lessonsPerMonth,
      roomName: "9-xona",
      startTime: "16:00",
      endTime: "18:00",
      daysOfWeek: [2, 4], // Seshanba, Payshanba
      students: GROUP10_STUDENTS,
    },
    {
      name: "11-guruh",
      subject: "Fonetika",
      monthlyPrice: coursePrice,
      lessonsPerMonth,
      roomName: "10-xona",
      startTime: "18:00",
      endTime: "20:00",
      daysOfWeek: [1, 4], // Dushanba, Payshanba
      students: GROUP11_STUDENTS,
    },
    {
      name: "12-guruh",
      subject: "Fonetika",
      monthlyPrice: coursePrice,
      lessonsPerMonth,
      roomName: "10-xona",
      startTime: "20:00",
      endTime: "22:00",
      daysOfWeek: [1, 4], // Dushanba, Payshanba
      students: GROUP12_STUDENTS,
    },
  ];

  // "Today" for this seed run is fixed to July 13, 2026 (the day this dataset
  // was prepared) so lesson history stays reproducible regardless of when
  // `npm run db:seed` is actually executed.
  const today = new Date(2026, 6, 13);

  for (const def of groupDefs) {
    const group = await prisma.group.create({
      data: {
        userId: teacher.id,
        name: def.name,
        subject: def.subject,
        monthlyPrice: def.monthlyPrice,
        lessonsPerMonth: def.lessonsPerMonth,
        roomName: def.roomName,
        capacity: 15,
        startDate: new Date(2026, 6, 1),
        scheduleSlots: {
          create: def.daysOfWeek.map((dayOfWeek) => ({ dayOfWeek, startTime: def.startTime, endTime: def.endTime })),
        },
      },
      include: { scheduleSlots: true },
    });

    const students = [];
    for (const s of def.students) {
      const student = await prisma.student.create({
        data: {
          userId: teacher.id,
          firstName: s.firstName,
          lastName: s.lastName,
          gender: s.gender,
          birthDate: new Date(2011, (s.firstName.length + s.lastName.length) % 12, 10),
          phone: s.phone,
          parentPhone: s.phone,
          address: "Toshkent shahri, Yunusobod tumani",
          startDate: new Date(2026, 6, 1),
          status: "ACTIVE",
          groupId: group.id,
        },
      });
      students.push(student);
    }

    // Past lesson dates for this group, from July 1 through today.
    const pastDates = julyDates(def.daysOfWeek, today.getDate());
    // Future sessions too, so the schedule/journal shows the whole month
    // (these stay unmarked and locked until their date arrives).
    const futureDates = julyDates(def.daysOfWeek, 31).filter((d) => d > today);

    const sessions = [];
    for (const date of [...pastDates, ...futureDates]) {
      const session = await prisma.lessonSession.create({
        data: {
          userId: teacher.id,
          groupId: group.id,
          date,
          startTime: def.startTime,
          endTime: def.endTime,
          status: date <= today ? "COMPLETED" : "SCHEDULED",
        },
      });
      sessions.push({ session, isPast: date <= today });
    }

    const lessonValue = computeLessonValue(Number(group.monthlyPrice), group.lessonsPerMonth);
    const lessonRate = Number(teacher.defaultLessonRate);
    const pastSessions = sessions.filter((s) => s.isPast).map((s) => s.session);

    for (let si = 0; si < students.length; si++) {
      const student = students[si];
      if (pastSessions.length === 0) continue;

      const history: AttendanceHistoryEntry[] = pastSessions.map((session, idx) => {
        // A couple of realistic isolated misses, matching the pattern seen
        // in the real journal (never 3-in-a-row, so nobody hits the cutoff
        // in this small real dataset).
        let status: AttendanceHistoryEntry["status"] = "PRESENT";
        if (def.name === "11-guruh" && si === 2 && idx === 1) status = "UNEXCUSED_ABSENT"; // Djamolxojayeva Gulxumor, 06.07
        if (def.name === "11-guruh" && si === 6 && idx === 1) status = "UNEXCUSED_ABSENT"; // Xomurodova Nishona, 06.07
        if (def.name === "11-guruh" && si === 0 && idx === 0) status = "EXCUSED_ABSENT"; // Baybayeva Nargiza, 02.07
        if (def.name === "10-guruh" && si === 4 && idx === 1) status = "UNEXCUSED_ABSENT"; // Atajonov Ulug'bek, 07.07
        return { lessonSessionId: session.id, date: session.date, status };
      });

      const computed = computeEarningsForHistory(history, lessonRate);

      for (const entry of computed) {
        await prisma.attendance.create({
          data: {
            studentId: student.id,
            lessonSessionId: entry.lessonSessionId,
            status: entry.status,
            teacherEarningAmount: entry.teacherEarning,
            lessonValueSnapshot: lessonValue,
          },
        });
      }
    }

    // Current month billing for every student in this group, a realistic mix of statuses.
    const monthStart = new Date(2026, 6, 1);
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const amountDue = coursePrice;
      const amountPaid = i % 3 === 0 ? amountDue : i % 3 === 1 ? Math.round(amountDue / 2) : 0;
      const payment = await prisma.payment.create({
        data: {
          userId: teacher.id,
          studentId: student.id,
          billingMonth: monthStart,
          amountDue,
          amountPaid,
          status: i % 3 === 0 ? "PAID" : i % 3 === 1 ? "PARTIAL" : "UNPAID",
        },
      });
      if (amountPaid > 0) {
        await prisma.paymentTransaction.create({
          data: {
            paymentId: payment.id,
            amount: amountPaid,
            method: "CASH",
            paidAt: new Date(2026, 6, 5),
          },
        });
      }
    }
  }

  console.log("Seeding finished.");
  console.log("---------------------------------------------");
  console.log("Demo teacher login:", teacherUsername, "/ password:", teacherPassword);
  console.log("Guruhlar: 10-guruh, 11-guruh, 12-guruh (jami 26 ta student)");
  console.log("---------------------------------------------");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
