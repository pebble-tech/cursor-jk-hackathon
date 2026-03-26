import { startTransition, useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Award, CheckCircle2, Clock, Eye, QrCode, User, X } from 'lucide-react';
import { toast } from 'sonner';

import { CheckinTypeCategoryEnum, ParticipantTypeEnum } from '@base/core/config/constant';
import { SITE_SHORT_NAME } from '@base/core/config/event';
import { Button } from '@base/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@base/ui/components/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@base/ui/components/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@base/ui/components/tabs';

import { CertificateNameEditor } from '~/components/certificate-name-editor';
import { QRScanner } from '~/components/qr-scanner';
import {
  getCheckinCount,
  getGuestStatus,
  getRecentScans,
  processCheckin,
  type GuestStatusResult,
  type ProcessCheckinResult,
} from '~/apis/ops/checkin';
import { listCheckinTypes } from '~/apis/ops/checkin-types';
import { getOpsProfile, updateOpsProfileName } from '~/apis/ops/profile';

export const Route = createFileRoute('/ops/')({
  head: () => ({
    meta: [{ title: `Check-in - Ops Dashboard - ${SITE_SHORT_NAME}` }],
  }),
  component: OpsDashboardPage,
});

type Mode = 'checkin' | 'status' | 'certificate';

type ScanResultPopupProps = {
  type: 'success' | 'error' | 'duplicate';
  participantName: string;
  checkinTypeName: string;
  codesAssigned?: number;
  isVip?: boolean;
  existingCheckinTime?: Date;
  onClose: () => void;
};

type GuestStatusPopupProps = {
  result: GuestStatusResult;
  onClose: () => void;
  onScanAnother: () => void;
};

function ScanResultPopup({
  type,
  participantName,
  checkinTypeName,
  codesAssigned,
  isVip,
  existingCheckinTime,
  onClose,
}: ScanResultPopupProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const getStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          icon: 'text-green-600',
          title: 'text-green-800',
          text: 'text-green-700',
        };
      case 'duplicate':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          icon: 'text-yellow-600',
          title: 'text-yellow-800',
          text: 'text-yellow-700',
        };
      case 'error':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: 'text-red-600',
          title: 'text-red-800',
          text: 'text-red-700',
        };
    }
  };

  const styles = getStyles();

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className={`${styles.bg} ${styles.border} border-2`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${styles.title}`}>
            {type === 'success' && <CheckCircle2 className={`h-6 w-6 ${styles.icon}`} />}
            {type === 'duplicate' && <Clock className={`h-6 w-6 ${styles.icon}`} />}
            {type === 'error' && <X className={`h-6 w-6 ${styles.icon}`} />}
            {type === 'success' && 'SUCCESS'}
            {type === 'duplicate' && 'ALREADY CHECKED IN'}
            {type === 'error' && 'ERROR'}
          </DialogTitle>
        </DialogHeader>
        <div className={`space-y-3 ${styles.text}`}>
          <div className="text-center">
            <p className="text-lg font-semibold">{participantName}</p>
            {isVip && (
              <p className="mt-1 text-sm font-medium">
                <span className="rounded-full bg-yellow-100 px-2 py-1">⭐ VIP ⭐</span>
              </p>
            )}
            <p className="mt-2 text-sm">{checkinTypeName}</p>
          </div>
          {type === 'success' && codesAssigned !== undefined && codesAssigned > 0 && (
            <p className="text-center text-sm font-medium">{codesAssigned} codes assigned</p>
          )}
          {type === 'duplicate' && existingCheckinTime && (
            <p className="text-center text-sm">Checked in at {existingCheckinTime.toLocaleTimeString()}</p>
          )}
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs opacity-70">Auto-dismiss in 5s</p>
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GuestStatusPopup({ result, onClose, onScanAnother }: GuestStatusPopupProps) {
  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Guest Status</DialogTitle>
        </DialogHeader>
        {result.success ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{result.participant.name}</h3>
              {result.participant.participantType === ParticipantTypeEnum.vip && (
                <span className="mt-1 inline-block rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium">
                  ⭐ VIP ⭐
                </span>
              )}
            </div>
            <div className="space-y-2">
              {result.checkinStatuses.map((status) => (
                <div
                  key={status.checkinTypeId}
                  className="flex items-center justify-between border-b border-gray-100 py-2"
                >
                  <span className="text-sm">{status.checkinTypeName}</span>
                  {status.checkedInAt ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-gray-600">{new Date(status.checkedInAt).toLocaleTimeString()}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">☐</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={onScanAnother} className="flex-1">
                Scan Another
              </Button>
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center text-red-600">
              <p className="font-medium">{result.error}</p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={onScanAnother} className="flex-1">
                Try Again
              </Button>
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OpsDashboardPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('checkin');
  const [selectedCheckinTypeId, setSelectedCheckinTypeId] = useState<string | null>(null);
  const [scannerPaused, setScannerPaused] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResultPopupProps | null>(null);
  const [statusResult, setStatusResult] = useState<GuestStatusResult | null>(null);
  const queryClient = useQueryClient();

  const {
    data: opsProfile,
    isLoading: isOpsProfileLoading,
    error: opsProfileError,
  } = useQuery({
    queryKey: ['ops-profile'],
    queryFn: () => getOpsProfile(),
    enabled: mode === 'certificate',
  });

  const nameUpdateMutation = useMutation({
    mutationFn: (name: string) => updateOpsProfileName({ data: { name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-profile'] });
      toast.success('Name updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update name');
    },
  });

  const { data: checkinTypesData } = useQuery({
    queryKey: ['ops', 'checkinTypes'],
    queryFn: listCheckinTypes,
  });

  useEffect(() => {
    if (checkinTypesData?.checkinTypes && checkinTypesData.checkinTypes.length > 0 && !selectedCheckinTypeId) {
      setSelectedCheckinTypeId(checkinTypesData.checkinTypes[0].id);
    }
  }, [checkinTypesData, selectedCheckinTypeId]);

  const { data: checkinCount } = useQuery({
    queryKey: ['ops', 'checkinCount', selectedCheckinTypeId],
    queryFn: () => getCheckinCount({ data: { checkinTypeId: selectedCheckinTypeId! } }),
    enabled: !!selectedCheckinTypeId && mode === 'checkin',
    refetchInterval: 30000,
  });

  const { data: recentScansData } = useQuery({
    queryKey: ['ops', 'recentScans'],
    queryFn: getRecentScans,
    enabled: mode === 'checkin',
    refetchInterval: 10000,
  });

  const handleCloseSuccess = useCallback(() => {
    setScanResult(null);
    setScannerPaused(false);
    queryClient.invalidateQueries({ queryKey: ['ops', 'checkinCount'] });
    queryClient.invalidateQueries({ queryKey: ['ops', 'recentScans'] });
  }, [queryClient]);

  const handleCloseError = useCallback(() => {
    setScanResult(null);
    setScannerPaused(false);
  }, []);

  const processCheckinMutation = useMutation({
    mutationFn: async (data: { qrValue: string; checkinTypeId: string }) => {
      return await processCheckin({ data });
    },
    onSuccess: (result: ProcessCheckinResult) => {
      startTransition(() => {
        if (result.success) {
          setScanResult({
            type: 'success',
            participantName: result.participant.name,
            checkinTypeName: checkinTypesData?.checkinTypes.find((t) => t.id === selectedCheckinTypeId)?.name || '',
            codesAssigned: result.codesAssigned,
            isVip: result.isVip,
            onClose: handleCloseSuccess,
          });
        } else {
          setScanResult({
            type: result.error === 'Already checked in' ? 'duplicate' : 'error',
            participantName: result.participant?.name || 'Unknown',
            checkinTypeName: checkinTypesData?.checkinTypes.find((t) => t.id === selectedCheckinTypeId)?.name || '',
            existingCheckinTime: result.existingCheckinTime,
            onClose: handleCloseError,
          });
        }
      });
    },
    onError: (_error: Error) => {
      startTransition(() => {
        setScanResult({
          type: 'error',
          participantName: 'Unknown',
          checkinTypeName: checkinTypesData?.checkinTypes.find((t) => t.id === selectedCheckinTypeId)?.name || '',
          onClose: handleCloseError,
        });
      });
    },
  });

  const getGuestStatusMutation = useMutation({
    mutationFn: async (data: { qrValue: string }) => {
      return await getGuestStatus({ data });
    },
    onSuccess: (result: GuestStatusResult) => {
      startTransition(() => {
        setStatusResult(result);
        setScannerPaused(true);
      });
    },
    onError: () => {
      startTransition(() => {
        setStatusResult({
          success: false,
          error: 'Failed to fetch guest status',
        });
        setScannerPaused(true);
      });
    },
  });

  const handleScan = useCallback(
    (decodedText: string) => {
      startTransition(() => {
        setScannerPaused(true);
      });

      if (mode === 'checkin') {
        if (!selectedCheckinTypeId) return;
        processCheckinMutation.mutate({
          qrValue: decodedText,
          checkinTypeId: selectedCheckinTypeId,
        });
      } else {
        getGuestStatusMutation.mutate({ qrValue: decodedText });
      }
    },
    [mode, selectedCheckinTypeId, processCheckinMutation, getGuestStatusMutation]
  );

  const handleScanAnother = () => {
    setStatusResult(null);
    setScannerPaused(false);
  };

  const selectedCheckinType = checkinTypesData?.checkinTypes.find((t) => t.id === selectedCheckinTypeId);

  return (
    <div className="mx-auto max-w-4xl">
      <Tabs
        defaultValue="checkin"
        value={mode}
        onValueChange={(value) => {
          setMode(value as Mode);
          setStatusResult(null);
          setScannerPaused(false);
        }}
        className="w-full"
      >
        <TabsList className="mb-6 grid w-full grid-cols-3">
          <TabsTrigger value="checkin" className="gap-2">
            <QrCode className="h-4 w-4" />
            Check-in
          </TabsTrigger>
          <TabsTrigger value="status" className="gap-2">
            <User className="h-4 w-4" />
            Guest Status
          </TabsTrigger>
          <TabsTrigger value="certificate" className="gap-2">
            <Award className="h-4 w-4" />
            Certificate
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checkin" className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Select Check-in Type</h2>
            <div className="space-y-2">
              {checkinTypesData?.checkinTypes.map((type) => (
                <label
                  key={type.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selectedCheckinTypeId === type.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="checkinType"
                    value={type.id}
                    checked={selectedCheckinTypeId === type.id}
                    onChange={() => setSelectedCheckinTypeId(type.id)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{type.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          type.type === CheckinTypeCategoryEnum.attendance
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {type.type === CheckinTypeCategoryEnum.attendance ? 'Attendance' : 'Meal'}
                      </span>
                    </div>
                    {type.description && <p className="mt-1 text-sm text-gray-600">{type.description}</p>}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Scan QR Code</h2>
            <QRScanner onScan={handleScan} paused={scannerPaused || processCheckinMutation.isPending} />
          </div>

          {selectedCheckinType && checkinCount !== undefined && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-700">
                ✓ {checkinCount.count} checked in for {selectedCheckinType.name}
              </p>
            </div>
          )}

          {recentScansData && recentScansData.scans.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Recent Scans</h2>
              <div className="space-y-2">
                {recentScansData.scans.map((scan) => (
                  <div
                    key={`${scan.participantId}-${scan.checkinTypeId}-${scan.checkedInAt.getTime()}`}
                    className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">{scan.participantName}</span>
                      {scan.participantType === ParticipantTypeEnum.vip && (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs">VIP</span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-600">{scan.checkinTypeName}</p>
                      <p className="text-xs text-gray-500">{new Date(scan.checkedInAt).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="status" className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Scan participant QR to view all statuses</h2>
            <QRScanner onScan={handleScan} paused={scannerPaused || getGuestStatusMutation.isPending} />
          </div>
        </TabsContent>

        <TabsContent value="certificate">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-base font-medium text-gray-500">Your Certificate</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6">
              {isOpsProfileLoading ? (
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
              ) : opsProfileError ? (
                <p className="text-red-600">Failed to load profile</p>
              ) : opsProfile ? (
                <>
                  <CertificateNameEditor
                    currentName={opsProfile.name}
                    onSave={async (newName) => {
                      await nameUpdateMutation.mutateAsync(newName);
                    }}
                    isSaving={nameUpdateMutation.isPending}
                    isLocked={opsProfile.isNameUpdated ?? false}
                  />
                  {opsProfile.isNameUpdated ? (
                    <Button onClick={() => navigate({ to: '/ops/certificate' })}>
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
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {scanResult && <ScanResultPopup {...scanResult} />}
      {statusResult && (
        <GuestStatusPopup
          result={statusResult}
          onClose={() => {
            setStatusResult(null);
            setScannerPaused(false);
          }}
          onScanAnother={handleScanAnother}
        />
      )}
    </div>
  );
}
