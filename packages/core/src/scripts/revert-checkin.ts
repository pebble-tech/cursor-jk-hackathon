/** Undo one participant check-in (record + same-window codes; user → registered if no check-ins left). */

import { UsersTable } from '~/auth/schema';
import { CheckinRecordsTable, CodesTable } from '~/business.server/events/schemas/schema';
import {
  CodeStatusEnum,
  ParticipantStatusEnum,
  ParticipantTypeEnum,
} from '~/config/constant';
import { and, count, db, eq, gte, isNotNull, isNull, lte } from '~/drizzle.server';
import { logError, logInfo, logWarning } from '~/utils/logging';

const DEFAULT_CHECKIN_TYPE_ID = 'cmn9qffgm000004l7dsludhpw';
const CODE_ASSIGNED_BEFORE_MS = 5_000;
const CODE_ASSIGNED_AFTER_MS = 120_000;

function printLine(message: string, stream: NodeJS.WriteStream = process.stdout) {
  stream.write(`${message}\n`);
}

function parseArgs(): { participantId: string; checkinTypeId: string } {
  const argv = process.argv.slice(2);
  let participantId = process.env.REVERT_CHECKIN_PARTICIPANT_ID?.trim() ?? '';
  let checkinTypeId = process.env.REVERT_CHECKIN_TYPE_ID?.trim() ?? DEFAULT_CHECKIN_TYPE_ID;

  for (const a of argv) {
    if (a.startsWith('--participant-id=')) {
      participantId = a.slice('--participant-id='.length).trim();
    } else if (a.startsWith('--checkin-type-id=')) {
      const v = a.slice('--checkin-type-id='.length).trim();
      if (v.length > 0) {
        checkinTypeId = v;
      }
    }
  }

  if (!participantId) {
    throw new Error('Missing --participant-id=... (or REVERT_CHECKIN_PARTICIPANT_ID)');
  }

  return { participantId, checkinTypeId };
}

async function main() {
  const { participantId, checkinTypeId } = parseArgs();

  const record = await db.query.checkinRecords.findFirst({
    where: and(
      eq(CheckinRecordsTable.participantId, participantId),
      eq(CheckinRecordsTable.checkinTypeId, checkinTypeId)
    ),
  });

  if (!record) {
    printLine(
      `No check-in record for participant ${participantId} and type ${checkinTypeId}. Nothing to revert.`,
      process.stderr
    );
    process.exit(0);
  }

  const user = await db.query.users.findFirst({
    where: eq(UsersTable.id, participantId),
  });

  if (!user) {
    throw new Error(`User not found: ${participantId}`);
  }

  const checkinAt = record.checkedInAt;
  const windowStart = new Date(checkinAt.getTime() - CODE_ASSIGNED_BEFORE_MS);
  const windowEnd = new Date(checkinAt.getTime() + CODE_ASSIGNED_AFTER_MS);

  const codesToRevert = await db
    .select({ id: CodesTable.id })
    .from(CodesTable)
    .where(
      and(
        eq(CodesTable.assignedTo, participantId),
        eq(CodesTable.status, CodeStatusEnum.available),
        isNull(CodesTable.redeemedAt),
        isNotNull(CodesTable.assignedAt),
        gte(CodesTable.assignedAt, windowStart),
        lte(CodesTable.assignedAt, windowEnd)
      )
    );

  if (codesToRevert.length === 0 && user.participantType !== ParticipantTypeEnum.vip) {
    logWarning('Revert: no codes matched assignment window; row will still be removed — verify codes manually', {
      participantId,
      checkinTypeId,
    });
  }

  printLine(
    JSON.stringify(
      {
        action: 'revert-checkin',
        participantId,
        checkinTypeId,
        checkinRecordId: record.id,
        checkedInAt: checkinAt.toISOString(),
        codesMatchedForUnassign: codesToRevert.length,
        codeIds: codesToRevert.map((c) => c.id),
      },
      null,
      2
    ),
    process.stderr
  );

  await db.transaction(async (tx) => {
    await tx
      .delete(CheckinRecordsTable)
      .where(
        and(
          eq(CheckinRecordsTable.participantId, participantId),
          eq(CheckinRecordsTable.checkinTypeId, checkinTypeId)
        )
      );

    for (const code of codesToRevert) {
      await tx
        .update(CodesTable)
        .set({
          assignedTo: null,
          assignedAt: null,
          status: CodeStatusEnum.unassigned,
        })
        .where(eq(CodesTable.id, code.id));
    }

    const [remaining] = await tx
      .select({ c: count() })
      .from(CheckinRecordsTable)
      .where(eq(CheckinRecordsTable.participantId, participantId));

    const remainingCheckins = Number(remaining?.c ?? 0);

    if (remainingCheckins === 0) {
      await tx
        .update(UsersTable)
        .set({
          status: ParticipantStatusEnum.registered,
          checkedInAt: null,
          checkedInBy: null,
        })
        .where(eq(UsersTable.id, participantId));
    }
  });

  logInfo('Revert check-in completed', {
    participantId,
    checkinTypeId,
    unassignedCodes: codesToRevert.length,
  });

  printLine(
    JSON.stringify({
      success: true,
      participantId,
      checkinTypeId,
      unassignedCodeCount: codesToRevert.length,
    })
  );
}

main().catch((err: unknown) => {
  logError('revert-checkin failed', { error: err });
  printLine(String(err), process.stderr);
  process.exit(1);
});
