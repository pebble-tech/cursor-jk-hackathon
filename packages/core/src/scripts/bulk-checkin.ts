/** Dry-run or bulk-execute check-ins via processCheckinForParticipant. Run: pnpm --filter @base/core bulk-checkin [-- --execute] */

import { UsersTable } from '~/auth/schema';
import { processCheckinForParticipant } from '~/business.server/events/checkin-process';
import {
  CheckinRecordsTable,
  CheckinTypesTable,
  CodesTable,
  CreditTypesTable,
} from '~/business.server/events/schemas/schema';
import {
  CheckinTypeCategoryEnum,
  CodeStatusEnum,
  ParticipantStatusEnum,
  ParticipantTypeEnum,
  UserRoleEnum,
} from '~/config/constant';
import { and, asc, count, db, eq, inArray, isNull, or } from '~/drizzle.server';
import { logError, logInfo } from '~/utils/logging';

const DEFAULT_CHECKIN_TYPE_ID = 'cmn9qffgm000004l7dsludhpw';

function printLine(message: string, stream: NodeJS.WriteStream = process.stdout) {
  stream.write(`${message}\n`);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const execute = argv.includes('--execute');
  let checkinTypeId = process.env.BULK_CHECKIN_TYPE_ID ?? DEFAULT_CHECKIN_TYPE_ID;
  for (const a of argv) {
    if (a.startsWith('--checkin-type=')) {
      const v = a.slice('--checkin-type='.length).trim();
      if (v.length > 0) {
        checkinTypeId = v;
      }
    }
  }
  return { execute, checkinTypeId };
}

async function resolveActorUserId(): Promise<string | null> {
  const fromEnv = process.env.BULK_CHECKIN_ACTOR_USER_ID?.trim();
  if (fromEnv) {
    const [row] = await db
      .select({ id: UsersTable.id })
      .from(UsersTable)
      .where(eq(UsersTable.id, fromEnv))
      .limit(1);
    if (!row) {
      throw new Error(`Invalid BULK_CHECKIN_ACTOR_USER_ID: no user with id ${fromEnv}`);
    }
    return row.id;
  }
  const [actor] = await db
    .select({ id: UsersTable.id })
    .from(UsersTable)
    .where(or(eq(UsersTable.role, UserRoleEnum.admin), eq(UsersTable.role, UserRoleEnum.ops)))
    .orderBy(asc(UsersTable.createdAt))
    .limit(1);
  return actor?.id ?? null;
}

type ParticipantReportRow = {
  id: string;
  name: string;
  email: string;
  participantType: string;
  status: string;
  hasQr: boolean;
  checkedInAtForThisType: string | null;
  assignedCreditsByDisplayName: Record<string, number>;
  wouldRunFirstAttendanceCredits: boolean;
};

async function buildReport(checkinTypeId: string): Promise<{
  checkinType: { id: string; name: string; type: string; isActive: boolean };
  participants: ParticipantReportRow[];
  unassignedPoolByCreditType: Array<{ creditTypeId: string; displayName: string; unassignedCount: number }>;
  summary: {
    totalParticipants: number;
    alreadyCheckedInForType: number;
    pendingCheckInForType: number;
    wouldTriggerFirstAttendanceCredits: number;
  };
}> {
  const checkinType = await db.query.checkinTypes.findFirst({
    where: eq(CheckinTypesTable.id, checkinTypeId),
  });

  if (!checkinType) {
    throw new Error(`Check-in type not found: ${checkinTypeId}`);
  }

  const participants = await db.query.users.findMany({
    where: eq(UsersTable.role, UserRoleEnum.participant),
    orderBy: [asc(UsersTable.email)],
  });

  const participantIds = participants.map((p) => p.id);
  if (participantIds.length === 0) {
    return {
      checkinType: {
        id: checkinType.id,
        name: checkinType.name,
        type: checkinType.type,
        isActive: checkinType.isActive,
      },
      participants: [],
      unassignedPoolByCreditType: [],
      summary: {
        totalParticipants: 0,
        alreadyCheckedInForType: 0,
        pendingCheckInForType: 0,
        wouldTriggerFirstAttendanceCredits: 0,
      },
    };
  }

  const existingForType = await db
    .select({
      participantId: CheckinRecordsTable.participantId,
      checkedInAt: CheckinRecordsTable.checkedInAt,
    })
    .from(CheckinRecordsTable)
    .where(
      and(
        eq(CheckinRecordsTable.checkinTypeId, checkinTypeId),
        inArray(CheckinRecordsTable.participantId, participantIds)
      )
    );

  const checkinByParticipant = new Map(
    existingForType.map((r) => [r.participantId, r.checkedInAt] as const)
  );

  const codeAssignments = await db
    .select({
      assignedTo: CodesTable.assignedTo,
      displayName: CreditTypesTable.displayName,
    })
    .from(CodesTable)
    .innerJoin(CreditTypesTable, eq(CodesTable.creditTypeId, CreditTypesTable.id))
    .where(inArray(CodesTable.assignedTo, participantIds));

  const creditsByUser = new Map<string, Record<string, number>>();
  for (const row of codeAssignments) {
    if (!row.assignedTo) {
      continue;
    }
    const cur = creditsByUser.get(row.assignedTo) ?? {};
    const name = row.displayName;
    cur[name] = (cur[name] ?? 0) + 1;
    creditsByUser.set(row.assignedTo, cur);
  }

  const activeCreditTypes = await db
    .select({ id: CreditTypesTable.id, displayName: CreditTypesTable.displayName })
    .from(CreditTypesTable)
    .where(eq(CreditTypesTable.isActive, true))
    .orderBy(asc(CreditTypesTable.displayOrder));

  const unassignedPoolByCreditType: Array<{
    creditTypeId: string;
    displayName: string;
    unassignedCount: number;
  }> = [];

  for (const ct of activeCreditTypes) {
    const [row] = await db
      .select({ c: count() })
      .from(CodesTable)
      .where(
        and(
          eq(CodesTable.creditTypeId, ct.id),
          eq(CodesTable.status, CodeStatusEnum.unassigned),
          isNull(CodesTable.assignedTo)
        )
      );
    unassignedPoolByCreditType.push({
      creditTypeId: ct.id,
      displayName: ct.displayName,
      unassignedCount: Number(row?.c ?? 0),
    });
  }

  let alreadyCheckedInForType = 0;

  const rows: ParticipantReportRow[] = participants.map((p) => {
    const checkedAt = checkinByParticipant.get(p.id);
    if (checkedAt) {
      alreadyCheckedInForType++;
    }
    const hasCheckinForType = checkedAt !== undefined;
    const wouldRunFirst =
      checkinType.type === CheckinTypeCategoryEnum.attendance &&
      p.status === ParticipantStatusEnum.registered &&
      !hasCheckinForType;

    return {
      id: p.id,
      name: p.name,
      email: p.email,
      participantType: p.participantType,
      status: p.status,
      hasQr: Boolean(p.qrCodeValue),
      checkedInAtForThisType: checkedAt ? checkedAt.toISOString() : null,
      assignedCreditsByDisplayName: creditsByUser.get(p.id) ?? {},
      wouldRunFirstAttendanceCredits: wouldRunFirst && p.participantType !== ParticipantTypeEnum.vip,
    };
  });

  return {
    checkinType: {
      id: checkinType.id,
      name: checkinType.name,
      type: checkinType.type,
      isActive: checkinType.isActive,
    },
    participants: rows,
    unassignedPoolByCreditType,
    summary: {
      totalParticipants: participants.length,
      alreadyCheckedInForType,
      pendingCheckInForType: participants.length - alreadyCheckedInForType,
      wouldTriggerFirstAttendanceCredits: rows.filter((r) => r.wouldRunFirstAttendanceCredits).length,
    },
  };
}

async function main() {
  const { execute, checkinTypeId } = parseArgs();

  printLine(`[bulk-checkin] building report checkinTypeId=${checkinTypeId} execute=${execute}`, process.stderr);

  const report = await buildReport(checkinTypeId);

  printLine('\n=== Pre-validated bulk check-in report ===\n');
  printLine(JSON.stringify(report, null, 2));

  if (!report.checkinType.isActive) {
    printLine('\nCheck-in type is not active; processCheckinForParticipant will reject check-ins.', process.stderr);
    process.exit(1);
  }

  if (!execute) {
    printLine(
      '\nDry run only. Re-run with --execute to perform check-ins (uses BULK_CHECKIN_ACTOR_USER_ID or oldest admin/ops user).\n',
      process.stderr
    );
    process.exit(0);
  }

  const actorId = await resolveActorUserId();
  if (!actorId) {
    logError('No actor user: set BULK_CHECKIN_ACTOR_USER_ID or create an admin/ops user');
    process.exit(1);
  }

  logInfo('Bulk check-in execute started', { actorId, checkinTypeId });

  const pending = report.participants.filter((p) => !p.checkedInAtForThisType);
  let ok = 0;
  let failed = 0;

  for (const p of pending) {
    const result = await processCheckinForParticipant({
      participantId: p.id,
      checkinTypeId,
      checkedInByUserId: actorId,
    });
    if (result.success) {
      ok++;
      logInfo('Checked in', {
        email: p.email,
        codesAssigned: result.codesAssigned,
        isFirstAttendance: result.isFirstAttendance,
      });
    } else {
      failed++;
      logError('Check-in failed', { email: p.email, error: result.error });
    }
  }

  printLine('\n=== Execute summary ===\n');
  printLine(JSON.stringify({ actorId, checkinTypeId, attempted: pending.length, succeeded: ok, failed }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  logError('bulk-checkin script failed', { error: err });
  printLine(String(err), process.stderr);
  process.exit(1);
});
