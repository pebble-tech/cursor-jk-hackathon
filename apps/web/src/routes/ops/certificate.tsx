import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { UserRoleEnum } from '@base/core/config/constant';
import { SITE_SHORT_NAME } from '@base/core/config/event';
import { Button } from '@base/ui/components/button';

import { CertificateDisplay } from '~/components/certificate-display';
import { getServerSession } from '~/apis/auth';
import { getOpsProfile } from '~/apis/ops/profile';

export const Route = createFileRoute('/ops/certificate')({
  head: () => ({
    meta: [{ title: `Certificate - Ops Dashboard - ${SITE_SHORT_NAME}` }],
  }),
  beforeLoad: async () => {
    const session = await getServerSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }

    const role = session.user.role;
    if (role !== UserRoleEnum.ops && role !== UserRoleEnum.admin) {
      throw redirect({ to: '/' });
    }

    const profile = await getOpsProfile();
    if (!profile.isNameUpdated) {
      throw redirect({ to: '/ops' });
    }

    return { session };
  },
  component: OpsCertificatePage,
});

function OpsCertificatePage() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['ops-profile'],
    queryFn: () => getOpsProfile(),
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

  if (!data.isNameUpdated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <Button variant="outline" onClick={() => navigate({ to: '/ops' })} className="mb-6">
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
        <Button variant="outline" onClick={() => navigate({ to: '/ops' })} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex flex-col items-center">
          <CertificateDisplay participantName={data.name} templateType="ops" />
        </div>
      </div>
    </div>
  );
}
