import { createServerFn } from '@tanstack/react-start';

import { UsersTable } from '@base/core/auth/schema';
import {
  processCheckinForParticipant,
  type ProcessCheckinResult,
} from '@base/core/business.server/events/checkin-process';
import { verifyQRCodeValue } from '@base/core/business.server/events/events';
import { CheckinRecordsTable, CheckinTypesTable } from '@base/core/business.server/events/schemas/schema';
import { asc, count, db, eq, sql } from '@base/core/drizzle.server';

import { requireOpsOrAdmin } from '~/apis/auth';

export type { ProcessCheckinResult } from '@base/core/business.server/events/checkin-process';

export const processCheckin = createServerFn({ method: 'POST' })
  .validator((data: { qrValue: string; checkinTypeId: string }) => {
    if (!data.qrValue || typeof data.qrValue !== 'string') {
      throw new Error('QR value is required');
    }
    if (!data.checkinTypeId || typeof data.checkinTypeId !== 'string') {
      throw new Error('Check-in type ID is required');
    }
    return data;
  })
  .handler(async ({ data }): Promise<ProcessCheckinResult> => {
    const session = await requireOpsOrAdmin();
    const { qrValue, checkinTypeId } = data;

    const qrVerification = verifyQRCodeValue(qrValue);
    if (!qrVerification.valid) {
      return { success: false, error: 'Invalid QR code' };
    }

    const participantId = qrVerification.participantId;

    return processCheckinForParticipant({
      participantId,
      checkinTypeId,
      checkedInByUserId: session.user.id,
    });
  });

export type GuestStatusResult =
  | {
      success: true;
      participant: {
        id: string;
        name: string;
        email: string;
        participantType: string;
      };
      checkinStatuses: Array<{
        checkinTypeId: string;
        checkinTypeName: string;
        checkedInAt: Date | null;
      }>;
    }
  | {
      success: false;
      error: string;
    };

export const getGuestStatus = createServerFn({ method: 'POST' })
  .validator((data: { qrValue: string }) => {
    if (!data.qrValue || typeof data.qrValue !== 'string') {
      throw new Error('QR value is required');
    }
    return data;
  })
  .handler(async ({ data }): Promise<GuestStatusResult> => {
    await requireOpsOrAdmin();
    const { qrValue } = data;

    const qrVerification = verifyQRCodeValue(qrValue);
    if (!qrVerification.valid) {
      return { success: false, error: 'Invalid QR code' };
    }

    const participantId = qrVerification.participantId;

    const participant = await db.query.users.findFirst({
      where: eq(UsersTable.id, participantId),
    });

    if (!participant) {
      return { success: false, error: 'Participant not found' };
    }

    const checkinTypes = await db
      .select()
      .from(CheckinTypesTable)
      .where(eq(CheckinTypesTable.isActive, true))
      .orderBy(asc(CheckinTypesTable.displayOrder));

    const checkinRecords = await db.query.checkinRecords.findMany({
      where: eq(CheckinRecordsTable.participantId, participantId),
    });

    const recordsMap = new Map(checkinRecords.map((record) => [record.checkinTypeId, record.checkedInAt]));

    const checkinStatuses = checkinTypes.map((type) => ({
      checkinTypeId: type.id,
      checkinTypeName: type.name,
      checkedInAt: recordsMap.get(type.id) || null,
    }));

    return {
      success: true,
      participant: {
        id: participant.id,
        name: participant.name,
        email: participant.email,
        participantType: participant.participantType,
      },
      checkinStatuses,
    };
  });

export const getCheckinCount = createServerFn({ method: 'POST' })
  .validator((data: { checkinTypeId: string }) => {
    if (!data.checkinTypeId || typeof data.checkinTypeId !== 'string') {
      throw new Error('Check-in type ID is required');
    }
    return data;
  })
  .handler(async ({ data }) => {
    await requireOpsOrAdmin();
    const { checkinTypeId } = data;

    const [result] = await db
      .select({ count: count() })
      .from(CheckinRecordsTable)
      .where(eq(CheckinRecordsTable.checkinTypeId, checkinTypeId));

    return { count: result?.count ?? 0 };
  });

type RecentScan = {
  participantId: string;
  participantName: string;
  participantType: string;
  checkinTypeId: string;
  checkinTypeName: string;
  checkedInAt: Date;
  isDuplicate: boolean;
};

export const getRecentScans = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{
    scans: RecentScan[];
  }> => {
    const session = await requireOpsOrAdmin();

    const records = await db
      .select({
        participantId: CheckinRecordsTable.participantId,
        participantName: UsersTable.name,
        participantType: UsersTable.participantType,
        checkinTypeId: CheckinRecordsTable.checkinTypeId,
        checkinTypeName: CheckinTypesTable.name,
        checkedInAt: CheckinRecordsTable.checkedInAt,
      })
      .from(CheckinRecordsTable)
      .innerJoin(UsersTable, eq(CheckinRecordsTable.participantId, UsersTable.id))
      .innerJoin(CheckinTypesTable, eq(CheckinRecordsTable.checkinTypeId, CheckinTypesTable.id))
      .where(eq(CheckinRecordsTable.checkedInBy, session.user.id))
      .orderBy(sql`${CheckinRecordsTable.checkedInAt} DESC`)
      .limit(10);

    const scans: RecentScan[] = records.map((record) => ({
      participantId: record.participantId,
      participantName: record.participantName,
      participantType: record.participantType,
      checkinTypeId: record.checkinTypeId,
      checkinTypeName: record.checkinTypeName,
      checkedInAt: record.checkedInAt,
      isDuplicate: false,
    }));

    return { scans };
  }
);
