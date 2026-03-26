import { useEffect, useState } from 'react';
import { Link, Outlet, createFileRoute, redirect, useLocation } from '@tanstack/react-router';
import { Activity, ClipboardList, Gift, LogOut, Menu, Users } from 'lucide-react';

import { UserRoleEnum } from '@base/core/config/constant';
import { SITE_SHORT_NAME } from '@base/core/config/event';
import { Button } from '@base/ui/components/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@base/ui/components/sheet';

import { getServerSession } from '~/apis/auth';
import { authClient } from '~/utils/auth-client';

export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [{ title: `Admin Portal - ${SITE_SHORT_NAME}` }],
  }),
  beforeLoad: async () => {
    const session = await getServerSession();

    if (!session) {
      throw redirect({
        to: '/login',
      });
    }

    if (session.user.role !== UserRoleEnum.admin) {
      throw redirect({
        to: '/',
      });
    }

    return {
      user: session.user,
    };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { user } = Route.useRouteContext();
  const location = useLocation();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = '/login';
        },
      },
    });
  };

  const handleNavClick = () => {
    setIsSheetOpen(false);
  };

  useEffect(() => {
    setIsSheetOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed hidden h-full w-64 border-r border-gray-200 bg-white md:block">
        <div className="flex h-16 items-center border-b border-gray-200 px-6">
          <span className="text-xl font-bold text-gray-900">Admin Portal</span>
        </div>

        <nav className="space-y-1 p-4">
          <Link
            to="/admin/participants"
            className="flex items-center rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 [&.active]:bg-gray-100 [&.active]:text-gray-900"
            activeProps={{ className: 'active' }}
          >
            <Users className="mr-3 h-5 w-5 text-gray-500" />
            Participants
          </Link>

          <Link
            to="/admin/checkins"
            className="flex items-center rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 [&.active]:bg-gray-100 [&.active]:text-gray-900"
            activeProps={{ className: 'active' }}
          >
            <ClipboardList className="mr-3 h-5 w-5 text-gray-500" />
            Check-in Types
          </Link>

          <Link
            to="/admin/credits"
            className="flex items-center rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 [&.active]:bg-gray-100 [&.active]:text-gray-900"
            activeProps={{ className: 'active' }}
          >
            <Gift className="mr-3 h-5 w-5 text-gray-500" />
            Credits
          </Link>
        </nav>

        <div className="absolute bottom-0 w-full border-t border-gray-200 p-4">
          <Link
            to="/ops"
            className="mb-4 flex w-full items-center justify-start rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Activity className="mr-2 h-4 w-4 text-gray-500" />
            Go to Ops
          </Link>
          <div className="mb-4 flex items-center px-2">
            <div className="flex-shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                <span className="text-sm font-medium text-gray-600">{user.name?.[0]?.toUpperCase()}</span>
              </div>
            </div>
            <div className="ml-3">
              <p className="max-w-[140px] truncate text-sm font-medium text-gray-700">{user.name}</p>
              <p className="max-w-[140px] truncate text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start text-gray-600" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64">
        <div className="sticky top-0 z-10 flex h-16 items-center border-b border-gray-200 bg-white px-4 md:hidden">
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="mr-2 h-10 w-10">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="border-b border-gray-200 px-6 py-4">
                <SheetTitle className="text-xl font-bold text-gray-900">Admin Portal</SheetTitle>
              </SheetHeader>
              <nav className="space-y-1 p-4">
                <Link
                  to="/admin/participants"
                  className="flex items-center rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 [&.active]:bg-gray-100 [&.active]:text-gray-900"
                  activeProps={{ className: 'active' }}
                  onClick={handleNavClick}
                >
                  <Users className="mr-3 h-5 w-5 text-gray-500" />
                  Participants
                </Link>

                <Link
                  to="/admin/checkins"
                  className="flex items-center rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 [&.active]:bg-gray-100 [&.active]:text-gray-900"
                  activeProps={{ className: 'active' }}
                  onClick={handleNavClick}
                >
                  <ClipboardList className="mr-3 h-5 w-5 text-gray-500" />
                  Check-in Types
                </Link>

                <Link
                  to="/admin/credits"
                  className="flex items-center rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 [&.active]:bg-gray-100 [&.active]:text-gray-900"
                  activeProps={{ className: 'active' }}
                  onClick={handleNavClick}
                >
                  <Gift className="mr-3 h-5 w-5 text-gray-500" />
                  Credits
                </Link>
              </nav>

              <div className="absolute bottom-0 w-full border-t border-gray-200 p-4">
                <Link
                  to="/ops"
                  className="mb-4 flex w-full items-center justify-start rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  onClick={handleNavClick}
                >
                  <Activity className="mr-2 h-4 w-4 text-gray-500" />
                  Go to Ops
                </Link>
                <div className="mb-4 flex items-center px-2">
                  <div className="flex-shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                      <span className="text-sm font-medium text-gray-600">{user.name?.[0]?.toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="ml-3">
                    <p className="max-w-[140px] truncate text-sm font-medium text-gray-700">{user.name}</p>
                    <p className="max-w-[140px] truncate text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full justify-start text-gray-600" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="text-lg font-bold">Admin Portal</span>
        </div>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
