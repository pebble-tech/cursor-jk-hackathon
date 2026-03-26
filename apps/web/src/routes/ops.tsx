import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';

import { UserRoleEnum } from '@base/core/config/constant';
import { SITE_SHORT_NAME } from '@base/core/config/event';
import { Button } from '@base/ui/components/button';

import { getServerSession } from '~/apis/auth';
import { authClient } from '~/utils/auth-client';

export const Route = createFileRoute('/ops')({
  head: () => ({
    meta: [{ title: `Ops Dashboard - ${SITE_SHORT_NAME}` }],
  }),
  beforeLoad: async () => {
    const session = await getServerSession();

    if (!session) {
      throw redirect({
        to: '/login',
      });
    }

    const role = session.user.role;
    if (role !== UserRoleEnum.ops && role !== UserRoleEnum.admin) {
      throw redirect({
        to: '/',
      });
    }

    return {
      user: session.user,
    };
  },
  component: OpsLayout,
});

function OpsLayout() {
  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = '/login';
        },
      },
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">Ops Dashboard</h1>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
