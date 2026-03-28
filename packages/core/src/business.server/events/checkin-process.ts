import { UsersTable } from '~/auth/schema';
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
} from '~/config/constant';
import { and, asc, db, eq, isNull } from '~/drizzle.server';
import { sendCheckinConfirmationEmail } from '~/email/templates/checkin-confirmation';
import { logError, logInfo, logWarning } from '~/utils/logging';

export type ProcessCheckinResult =
  | {
      success: true;
      participant: {
        id: string;
        name: string;
        email: string;
        participantType: string;
        qrCodeValue: string | null;
      };
      codesAssigned: number;
      assignedCodes: Array<{
        creditType: {
          id: string;
          name: string;
          displayName: string;
          emailInstructions: string | null;
        };
        code: {
          id: string;
          codeValue: string;
          redeemUrl: string | null;
        };
      }>;
      isVip: boolean;
      isFirstAttendance: boolean;
    }
  | {
      success: false;
      error: string;
      participant?: {
        id: string;
        name: string;
        email: string;
        participantType: string;
      };
      existingCheckinTime?: Date;
    };

/** Shared check-in pipeline for ops QR scans and bulk tooling. */
export async function processCheckinForParticipant(input: {
  participantId: string;
  checkinTypeId: string;
  checkedInByUserId: string;
}): Promise<ProcessCheckinResult> {
  const { participantId, checkinTypeId, checkedInByUserId } = input;

  const participant = await db.query.users.findFirst({
    where: eq(UsersTable.id, participantId),
  });

  if (!participant) {
    return { success: false, error: 'Participant not found' };
  }

  const checkinType = await db.query.checkinTypes.findFirst({
    where: eq(CheckinTypesTable.id, checkinTypeId),
  });

  if (!checkinType || !checkinType.isActive) {
    return { success: false, error: 'Check-in type not found or inactive' };
  }

  const existingCheckin = await db.query.checkinRecords.findFirst({
    where: and(
      eq(CheckinRecordsTable.checkinTypeId, checkinTypeId),
      eq(CheckinRecordsTable.participantId, participantId)
    ),
  });

  if (existingCheckin) {
    return {
      success: false,
      error: 'Already checked in',
      participant: {
        id: participant.id,
        name: participant.name,
        email: participant.email,
        participantType: participant.participantType,
      },
      existingCheckinTime: existingCheckin.checkedInAt,
    };
  }

  const isFirstAttendance =
    checkinType.type === CheckinTypeCategoryEnum.attendance &&
    participant.status === ParticipantStatusEnum.registered;

  const isVip = participant.participantType === ParticipantTypeEnum.vip;

  let codesAssigned = 0;
  const assignedCodes: Array<{
    creditType: typeof CreditTypesTable.$inferSelect;
    code: typeof CodesTable.$inferSelect;
  }> = [];

  if (isFirstAttendance && !isVip) {
    await db.transaction(async (tx) => {
      const activeCreditTypes = await tx
        .select()
        .from(CreditTypesTable)
        .where(eq(CreditTypesTable.isActive, true))
        .orderBy(asc(CreditTypesTable.displayOrder));

      for (const creditType of activeCreditTypes) {
        const [code] = await tx
          .select()
          .from(CodesTable)
          .where(
            and(
              eq(CodesTable.creditTypeId, creditType.id),
              eq(CodesTable.status, CodeStatusEnum.unassigned),
              isNull(CodesTable.assignedTo)
            )
          )
          .limit(1)
          .for('update', { skipLocked: true });

        if (code) {
          await tx
            .update(CodesTable)
            .set({
              assignedTo: participantId,
              assignedAt: new Date(),
              status: CodeStatusEnum.available,
            })
            .where(eq(CodesTable.id, code.id));

          assignedCodes.push({ creditType, code });
          codesAssigned++;
        } else {
          logWarning('Code pool exhausted', {
            creditTypeId: creditType.id,
            creditTypeName: creditType.name,
            participantId,
          });
        }
      }

      if (isFirstAttendance) {
        await tx
          .update(UsersTable)
          .set({
            status: ParticipantStatusEnum.checked_in,
            checkedInAt: new Date(),
            checkedInBy: checkedInByUserId,
          })
          .where(eq(UsersTable.id, participantId));
      }
    });
  } else if (isFirstAttendance && isVip) {
    await db.transaction(async (tx) => {
      await tx
        .update(UsersTable)
        .set({
          status: ParticipantStatusEnum.checked_in,
          checkedInAt: new Date(),
          checkedInBy: checkedInByUserId,
        })
        .where(eq(UsersTable.id, participantId));
    });
  }

  await db.insert(CheckinRecordsTable).values({
    checkinTypeId,
    participantId,
    checkedInBy: checkedInByUserId,
  });

  logInfo('Check-in processed', {
    participantId,
    checkinTypeId,
    checkinTypeName: checkinType.name,
    codesAssigned,
    isVip,
    isFirstAttendance,
    checkedInBy: checkedInByUserId,
  });

  const assignedCodesData = assignedCodes.map(({ creditType, code }) => ({
    creditType: {
      id: creditType.id,
      name: creditType.name,
      displayName: creditType.displayName,
      emailInstructions: creditType.emailInstructions,
    },
    code: {
      id: code.id,
      codeValue: code.codeValue,
      redeemUrl: code.redeemUrl,
    },
  }));

  if (isFirstAttendance && !isVip && participant.qrCodeValue && assignedCodes.length > 0) {
    const emailResult = await sendCheckinConfirmationEmail({
      to: participant.email,
      name: participant.name,
      qrCodeValue: participant.qrCodeValue,
      assignedCodes: assignedCodesData,
    });

    if (!emailResult.success) {
      logError('Failed to send check-in confirmation email', {
        participantId,
        email: participant.email,
        error: emailResult.error,
      });
    } else {
      logInfo('Check-in confirmation email sent', {
        participantId,
        email: participant.email,
        messageId: emailResult.messageId,
      });
    }
  }

  return {
    success: true,
    participant: {
      id: participant.id,
      name: participant.name,
      email: participant.email,
      participantType: participant.participantType,
      qrCodeValue: participant.qrCodeValue,
    },
    codesAssigned,
    assignedCodes: assignedCodesData,
    isVip,
    isFirstAttendance,
  };
}
