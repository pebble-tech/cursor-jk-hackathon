import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Award, Check, Copy, ExternalLink, Eye, Info, LogOut, QrCode, Ticket } from 'lucide-react';
import { toast } from 'sonner';

import { ParticipantStatusEnum, UserRoleEnum } from '@base/core/config/constant';
import { SHOW_CERTIFICATE_TAB, SITE_SHORT_NAME } from '@base/core/config/event';
import { Badge } from '@base/ui/components/badge';
import { Button } from '@base/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@base/ui/components/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@base/ui/components/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@base/ui/components/tabs';

import { CertificateNameEditor } from '~/components/certificate-name-editor';
import { QRCodeDisplay } from '~/components/qr-code-display';
import { getServerSession } from '~/apis/auth';
import { getParticipantDashboard, markCreditRedeemed, updateProfileName } from '~/apis/participant/dashboard';
import { authClient } from '~/utils/auth-client';
import { getDashboardUrlForUser } from '~/utils/auth-redirect';
import { categoryIcons } from '~/utils/credit-category-icons';

export const Route = createFileRoute('/dashboard')({
  head: () => ({
    meta: [{ title: `Dashboard - ${SITE_SHORT_NAME}` }],
  }),
  beforeLoad: async () => {
    const session = await getServerSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }

    const role = session.user.role;
    if (role !== UserRoleEnum.participant) {
      const dashboardUrl = getDashboardUrlForUser(session.user);
      throw redirect({ to: dashboardUrl });
    }

    return { session };
  },
  component: DashboardPage,
});

type ParticipantCertificateUser = {
  name: string;
  isNameUpdated?: boolean | null;
};

function DashboardCertificateTabTrigger({ isCheckedIn }: { isCheckedIn: boolean }) {
  return (
    <TabsTrigger value="certificate" className="gap-2" disabled={!isCheckedIn}>
      <Award className="h-4 w-4" />
      Certificate
    </TabsTrigger>
  );
}

function DashboardCertificateTabContent({ user, isCheckedIn }: { user: ParticipantCertificateUser; isCheckedIn: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const nameUpdateMutation = useMutation({
    mutationFn: (name: string) => updateProfileName({ data: { name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-dashboard'] });
      toast.success('Name updated');
    },
    onError: () => {
      toast.error('Failed to update name');
    },
  });

  return (
    <TabsContent value="certificate">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-base font-medium text-gray-500">Your Certificate</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          {isCheckedIn ? (
            <>
              <CertificateNameEditor
                currentName={user.name}
                onSave={async (newName) => {
                  await nameUpdateMutation.mutateAsync(newName);
                }}
                isSaving={nameUpdateMutation.isPending}
                isLocked={user.isNameUpdated ?? false}
              />
              {user.isNameUpdated ? (
                <Button onClick={() => navigate({ to: '/certificate' })}>
                  <Eye className="mr-2 h-4 w-4" />
                  View & Download Certificate
                </Button>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
                  <p className="text-sm text-amber-800">
                    Please save your certificate name above before viewing and downloading your certificate.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg bg-gray-50 p-8 text-center">
              <p className="text-gray-600">Check in at the event to unlock your certificate</p>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function DashboardPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['participant-dashboard'],
    queryFn: () => getParticipantDashboard(),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  const redeemMutation = useMutation({
    mutationFn: markCreditRedeemed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-dashboard'] });
      toast.success('Marked as redeemed');
    },
    onError: () => {
      toast.error('Failed to update');
    },
  });

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = '/';
        },
      },
    });
  };

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
        <p className="text-red-600">Failed to load dashboard</p>
      </div>
    );
  }

  const { user, credits } = data;
  const isCheckedIn = user.status === ParticipantStatusEnum.checked_in;
  const pendingCreditsCount = credits.filter((c) => c.redeemedAt === null).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{user.name}</h1>
            <StatusBadge status={user.status} checkedInAt={user.checkedInAt} />
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <Tabs defaultValue="qr" className="w-full">
          <TabsList
            className={`mb-6 grid w-full ${SHOW_CERTIFICATE_TAB ? 'grid-cols-3' : 'grid-cols-2'}`}
          >
            <TabsTrigger value="qr" className="gap-2">
              <QrCode className="h-4 w-4" />
              My QR Code
            </TabsTrigger>
            <TabsTrigger value="credits" className="gap-2">
              <Ticket className="h-4 w-4" />
              My Credits
              {isCheckedIn && pendingCreditsCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5">
                  {pendingCreditsCount}
                </Badge>
              )}
            </TabsTrigger>
            {SHOW_CERTIFICATE_TAB && <DashboardCertificateTabTrigger isCheckedIn={isCheckedIn} />}
          </TabsList>

          <TabsContent value="qr">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-base font-medium text-gray-500">Your QR Code</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                {user.qrCodeValue ? (
                  <>
                    <QRCodeDisplay value={user.qrCodeValue} size={280} />
                    <div className="mt-6 space-y-1 text-center text-sm text-gray-600">
                      <p>Show this at registration desk</p>
                      <p>Show at food stations</p>
                    </div>
                    <p className="mt-4 text-xs text-gray-400">This QR never expires</p>
                  </>
                ) : (
                  <p className="py-8 text-center text-gray-500">QR code not available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="credits">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Your Credits {isCheckedIn && credits.length > 0 && `(${credits.length})`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!isCheckedIn ? (
                  <div className="rounded-lg bg-gray-50 p-8 text-center">
                    <p className="text-gray-600">Your credits will appear after check-in</p>
                  </div>
                ) : credits.length === 0 ? (
                  <div className="rounded-lg bg-gray-50 p-8 text-center">
                    <p className="text-gray-600">No credits available</p>
                  </div>
                ) : (
                  <CreditsSection
                    credits={credits}
                    onMarkRedeemed={(codeId, redeemed) => redeemMutation.mutate({ data: { codeId, redeemed } })}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {SHOW_CERTIFICATE_TAB && (
            <DashboardCertificateTabContent user={user} isCheckedIn={isCheckedIn} />
          )}
        </Tabs>
      </main>
    </div>
  );
}

function StatusBadge({ status, checkedInAt }: { status: string; checkedInAt?: Date | null }) {
  const isCheckedIn = status === ParticipantStatusEnum.checked_in;

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Badge variant={isCheckedIn ? 'default' : 'secondary'} className={isCheckedIn ? 'bg-green-600' : ''}>
      {isCheckedIn ? `Checked in${checkedInAt ? ` at ${formatTime(checkedInAt)}` : ''}` : 'Registered'}
    </Badge>
  );
}

type Credit = {
  id: string;
  codeValue: string;
  redeemUrl: string | null;
  redeemedAt: Date | null;
  creditType: {
    displayName: string;
    webInstructions: string | null;
    iconUrl: string | null;
    category: string | null;
  } | null;
};

type CreditsSectionProps = {
  credits: Credit[];
  onMarkRedeemed: (codeId: string, redeemed: boolean) => void;
};

type FilterType = 'all' | 'redeemed' | 'pending';

function CreditsSection({ credits, onMarkRedeemed }: CreditsSectionProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredCredits = credits.filter((credit) => {
    if (filter === 'all') return true;
    if (filter === 'redeemed') return credit.redeemedAt !== null;
    return credit.redeemedAt === null;
  });

  const filterOptions: { value: FilterType; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: credits.length },
    { value: 'pending', label: 'Pending', count: credits.filter((c) => c.redeemedAt === null).length },
    { value: 'redeemed', label: 'Redeemed', count: credits.filter((c) => c.redeemedAt !== null).length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
              filter === option.value
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {option.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs ${
                filter === option.value ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {option.count}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredCredits.map((credit) => (
          <CreditCard key={credit.id} credit={credit} onMarkRedeemed={onMarkRedeemed} />
        ))}
        {filteredCredits.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">No credits in this category</p>
        )}
      </div>
    </div>
  );
}

type CreditCardProps = {
  credit: Credit;
  onMarkRedeemed: (codeId: string, redeemed: boolean) => void;
};

function CreditCard({ credit, onMarkRedeemed }: CreditCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(credit.codeValue);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const isRedeemed = credit.redeemedAt !== null;

  const CategoryIcon =
    credit.creditType?.category && credit.creditType.category in categoryIcons
      ? categoryIcons[credit.creditType.category as keyof typeof categoryIcons]
      : null;

  const IconComponent = credit.creditType?.iconUrl ? null : CategoryIcon || Ticket;

  const categoryColors: Record<string, { bg: string; icon: string; bgMuted: string; iconMuted: string }> = {
    food_voucher: {
      bg: 'bg-orange-100',
      icon: 'text-orange-600',
      bgMuted: 'bg-orange-50',
      iconMuted: 'text-orange-300',
    },
    software_credit: {
      bg: 'bg-violet-100',
      icon: 'text-violet-600',
      bgMuted: 'bg-violet-50',
      iconMuted: 'text-violet-300',
    },
    swag: { bg: 'bg-pink-100', icon: 'text-pink-600', bgMuted: 'bg-pink-50', iconMuted: 'text-pink-300' },
  };

  const colors = credit.creditType?.category
    ? categoryColors[credit.creditType.category] || {
        bg: 'bg-gray-100',
        icon: 'text-gray-600',
        bgMuted: 'bg-gray-50',
        iconMuted: 'text-gray-300',
      }
    : { bg: 'bg-gray-100', icon: 'text-gray-600', bgMuted: 'bg-gray-50', iconMuted: 'text-gray-300' };

  return (
    <div
      className={`rounded-xl border-2 bg-white p-4 transition-all ${
        isRedeemed ? 'border-gray-100 bg-gray-50/50' : 'border-gray-200 shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-md ${isRedeemed ? colors.bgMuted : colors.bg}`}
          >
            {credit.creditType?.iconUrl ? (
              <img
                src={credit.creditType.iconUrl}
                alt=""
                className={`h-4 w-4 object-contain ${isRedeemed ? 'opacity-40' : ''}`}
              />
            ) : IconComponent ? (
              <IconComponent className={`h-4 w-4 ${isRedeemed ? colors.iconMuted : colors.icon}`} />
            ) : null}
          </div>
          <h3 className={`font-medium ${isRedeemed ? 'text-gray-500' : 'text-gray-900'}`}>
            {credit.creditType?.displayName}
          </h3>
        </div>
        <Badge
          variant={isRedeemed ? 'secondary' : 'outline'}
          className={isRedeemed ? 'bg-green-100 text-green-700' : ''}
        >
          {isRedeemed ? 'Redeemed' : 'Pending'}
        </Badge>
      </div>

      <div className="mt-4">
        <div
          className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
            isRedeemed ? 'border-gray-200 bg-gray-100' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <code className={`font-mono text-sm font-medium ${isRedeemed ? 'text-gray-500' : 'text-gray-800'}`}>
            {credit.codeValue}
          </code>
          <button
            onClick={handleCopy}
            className={`rounded-md p-1.5 transition-colors ${
              isRedeemed ? 'text-gray-400 hover:bg-gray-200' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
            }`}
            title="Copy code"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {credit.redeemUrl && (
            <a
              href={credit.redeemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Redeem here
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {credit.creditType?.webInstructions && (
            <Dialog>
              <DialogTrigger asChild>
                <button className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700">
                  <Info className="h-3.5 w-3.5" />
                  Instructions
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2.5">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${colors.bg}`}>
                      {credit.creditType?.iconUrl ? (
                        <img src={credit.creditType.iconUrl} alt="" className="h-4 w-4 object-contain" />
                      ) : IconComponent ? (
                        <IconComponent className={`h-4 w-4 ${colors.icon}`} />
                      ) : null}
                    </div>
                    {credit.creditType?.displayName}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                  <div className="rounded-lg bg-amber-50 p-4">
                    <p className="mb-2 text-sm font-semibold text-amber-800">How to Redeem</p>
                    <p className="text-sm leading-relaxed whitespace-pre-line text-amber-900">
                      {credit.creditType.webInstructions}
                    </p>
                  </div>

                  <div className="space-y-3 border-t border-gray-100 pt-4">
                    <div>
                      <p className="mb-2 text-xs font-medium text-gray-500">Your Code</p>
                      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <code className="font-mono text-sm font-semibold text-gray-900">{credit.codeValue}</code>
                        <button
                          onClick={handleCopy}
                          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
                          title="Copy code"
                        >
                          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {credit.redeemUrl && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-gray-500">Redemption Link</p>
                        <a
                          href={credit.redeemUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100"
                        >
                          Open redemption page
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={isRedeemed}
            onChange={(e) => onMarkRedeemed(credit.id, e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
          />
          <span className="text-sm text-gray-600">Mark done</span>
        </label>
      </div>

      {isRedeemed && credit.redeemedAt && (
        <p className="mt-3 text-xs text-gray-400">Redeemed on {new Date(credit.redeemedAt).toLocaleDateString()}</p>
      )}
    </div>
  );
}
