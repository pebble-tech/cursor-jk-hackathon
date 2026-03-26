import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { ParticipantStatusEnum } from '@base/core/config/constant';
import { SITE_SHORT_NAME } from '@base/core/config/event';
import { Button } from '@base/ui/components/button';

import { CertificateDisplay } from '~/components/certificate-display';
import { getServerSession } from '~/apis/auth';
import { getParticipantDashboard } from '~/apis/participant/dashboard';

export const Route = createFileRoute('/certificate')({
  head: () => ({
    meta: [{ title: `Certificate - ${SITE_SHORT_NAME}` }],
  }),
  beforeLoad: async () => {
    const session = await getServerSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }

    const isCheckedIn = session.user.status === ParticipantStatusEnum.checked_in;
    if (!isCheckedIn) {
      throw redirect({ to: '/dashboard' });
    }

    const dashboard = await getParticipantDashboard();
    if (!dashboard.user.isNameUpdated) {
      throw redirect({ to: '/dashboard' });
    }

    return { session };
  },
  component: CertificatePage,
});

function CertificatePage() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['participant-dashboard'],
    queryFn: () => getParticipantDashboard(),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-red-600">Failed to load certificate</p>
      </div>
    );
  }

  const { user } = data;
  const isCheckedIn = user.status === ParticipantStatusEnum.checked_in;

  if (!isCheckedIn) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <Button variant="outline" onClick={() => navigate({ to: '/dashboard' })} className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-600">Check in at the event to unlock your certificate</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user.isNameUpdated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <Button variant="outline" onClick={() => navigate({ to: '/dashboard' })} className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
            <p className="text-amber-800">
              Please save your certificate name in the Certificate tab before viewing and downloading your certificate.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <Button variant="outline" onClick={() => navigate({ to: '/dashboard' })} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex flex-col items-center">
          <CertificateDisplay participantName={user.name} templateType="participant" />
        </div>
      </div>
    </div>
  );
}
