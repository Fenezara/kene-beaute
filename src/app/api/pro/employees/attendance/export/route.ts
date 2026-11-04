// GET /api/pro/employees/attendance/export?tenantId=&from=&to=&format=xlsx|csv
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { buildAttendanceExcel, type AttendanceExportRow } from "@/lib/accounting/excel";
import { toCsv, type CsvCell } from "@/lib/accounting/csv";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:employees:attendance:export");
    if (guard) return guard;

    const sp = req.nextUrl.searchParams;
    const tenant = await resolveTenant(req, sp.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const fromStr = sp.get("from");
    const toStr = sp.get("to");
    const format = (sp.get("format") ?? "xlsx").toLowerCase();

    let from: Date | undefined;
    let to: Date | undefined;

    if (fromStr) {
      const d = new Date(fromStr);
      if (!Number.isNaN(d.getTime())) from = d;
    }
    if (toStr) {
      const d = new Date(toStr);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        to = d;
      }
    }

    // Si aucune période spécifiée, par défaut le mois en cours
    if (!from && !to) {
      const now = new Date();
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const dateFilter = from || to ? { gte: from, lte: to } : undefined;

    const attendances = await db.attendance.findMany({
      where: {
        employee: { tenantId: tenant.id },
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      include: {
        employee: { select: { name: true, role: true } },
      },
      orderBy: [{ date: "desc" }, { checkIn: "asc" }],
    });

    const rows: AttendanceExportRow[] = attendances.map((a) => ({
      date: a.date,
      employeeName: a.employee.name,
      role: a.employee.role,
      checkIn: a.checkIn,
      checkOut: a.checkOut,
      hoursWorked: a.hours,
      status: (a.status as "present" | "late" | "absent" | "leave") || "present",
    }));

    const countLabel = `${attendances.length} pointages enregistrés`;
    const meta = {
      tenantName: tenant.name,
      tenantCity: tenant.city,
      type: "journal" as const,
      from,
      to,
      countLabel,
    };

    const periodStr = `${from ? from.toISOString().slice(0, 10) : "debut"}_au_${to ? to.toISOString().slice(0, 10) : "fin"}`;

    if (format === "csv") {
      const csvRows: CsvCell[][] = [
        ["Kènè Pro — Feuille d'émargement & Suivi des présences"],
        [tenant.name],
        [`Période : ${periodStr} · ${countLabel}`],
        [],
        ["Date", "Collaboratrice", "Rôle", "Heure Arrivée", "Heure Départ", "Heures", "Statut"],
      ];
      for (const r of rows) {
        csvRows.push([
          new Date(r.date).toLocaleDateString("fr-FR"),
          r.employeeName,
          r.role,
          r.checkIn ?? "--:--",
          r.checkOut ?? "--:--",
          r.hoursWorked,
          r.status,
        ]);
      }
      return new NextResponse(toCsv(csvRows), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="emargement-${tenant.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${periodStr}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const excelBuffer = await buildAttendanceExcel(meta, rows);
    const filename = `emargement-${tenant.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${periodStr}.xlsx`;

    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Rows-Count": String(rows.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return serverError("pro/employees/attendance/export:get", err);
  }
}
