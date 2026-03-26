import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type ColumnDef } from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, Download, Edit2, Gift, Loader2, Plus, Power, Trash2, Upload } from 'lucide-react';

import {
  CodeDistributionTypeEnum,
  CreditCategories,
  UserRoles,
  type CodeDistributionType,
  type CreditCategory,
  type UserRole,
} from '@base/core/config/constant';
import { SITE_SHORT_NAME } from '@base/core/config/event';
import { Button } from '@base/ui/components/button';
import { Checkbox } from '@base/ui/components/checkbox';
import { DataTable } from '@base/ui/components/data-table';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@base/ui/components/dialog';
import { FileUpload } from '@base/ui/components/file-upload';
import { Input } from '@base/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@base/ui/components/select';
import { Textarea } from '@base/ui/components/textarea';

import { listCheckinTypes } from '~/apis/admin/checkins';
import {
  createCreditType,
  deleteCreditType,
  executeGiveaway,
  getGiveawayPreview,
  importCodes,
  listCreditTypes,
  toggleCreditTypeActive,
  updateCreditType,
  type CreateCreditTypeInput,
  type ExecuteGiveawayInput,
  type GiveawayPreviewInput,
  type ImportCodesInput,
  type UpdateCreditTypeInput,
} from '~/apis/admin/credits';
import { categoryIcons } from '~/utils/credit-category-icons';
import { generateSkippedCodesCSV, parseCodesCSV, type ParsedCodeRow } from '~/utils/csv-parser';

export const Route = createFileRoute('/admin/credits')({
  head: () => ({
    meta: [{ title: `Credits - Admin Portal - ${SITE_SHORT_NAME}` }],
  }),
  component: CreditsPage,
});

type PoolStats = {
  total: number;
  assigned: number;
  remaining: number;
};

type CreditType = {
  id: string;
  name: string;
  displayName: string;
  emailInstructions: string | null;
  webInstructions: string | null;
  displayOrder: number;
  iconUrl: string | null;
  isActive: boolean;
  category: CreditCategory;
  distributionType: CodeDistributionType;
  universalCode: string | null;
  universalRedeemUrl: string | null;
  createdAt: Date;
  poolStats: PoolStats;
};

function PoolStatus({ stats }: { stats: PoolStats }) {
  if (stats.total === 0) {
    return <span className="text-sm text-gray-500">No codes</span>;
  }

  const percentage = (stats.remaining / stats.total) * 100;
  let colorClass = 'bg-green-500';
  if (percentage < 10) {
    colorClass = 'bg-red-500';
  } else if (percentage < 50) {
    colorClass = 'bg-yellow-500';
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full ${colorClass}`} style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-xs whitespace-nowrap text-gray-600">
        {stats.remaining} / {stats.total}
      </span>
    </div>
  );
}

function CreditsPage() {
  const queryClient = useQueryClient();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCreditType, setSelectedCreditType] = useState<CreditType | null>(null);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedCreditTypeForImport, setSelectedCreditTypeForImport] = useState<CreditType | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedCodeRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: Array<{ codeValue: string; reason: string }>;
  } | null>(null);

  const [giveawayDialogOpen, setGiveawayDialogOpen] = useState(false);
  const [selectedCreditTypeForGiveaway, setSelectedCreditTypeForGiveaway] = useState<CreditType | null>(null);
  const [giveawayRoles, setGiveawayRoles] = useState<UserRole[]>([]);
  const [giveawayCheckinTypeId, setGiveawayCheckinTypeId] = useState<string>('all');
  const [giveawayResult, setGiveawayResult] = useState<{ codesAssigned: number } | null>(null);

  const [formData, setFormData] = useState<CreditTypeFormData>({
    name: '',
    displayName: '',
    emailInstructions: '',
    webInstructions: '',
    displayOrder: 0,
    iconUrl: '',
    isActive: true,
    category: 'software_credit',
    distributionType: 'unique',
    universalCode: '',
    universalRedeemUrl: '',
    universalQuantity: 100,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['credit-types'],
    queryFn: () => listCreditTypes(),
  });

  const { data: checkinTypesData } = useQuery({
    queryKey: ['checkin-types'],
    queryFn: () => listCheckinTypes(),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateCreditTypeInput) => createCreditType({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-types'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateCreditTypeInput) => updateCreditType({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-types'] });
      setEditDialogOpen(false);
      setSelectedCreditType(null);
      resetForm();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => toggleCreditTypeActive({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-types'] });
    },
  });

  const importMutation = useMutation({
    mutationFn: (input: ImportCodesInput) => importCodes({ data: input }),
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['credit-types'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCreditType({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-types'] });
    },
  });

  const giveawayPreviewMutation = useMutation({
    mutationFn: (input: GiveawayPreviewInput) => getGiveawayPreview({ data: input }),
  });

  const giveawayExecuteMutation = useMutation({
    mutationFn: (input: ExecuteGiveawayInput) => executeGiveaway({ data: input }),
    onSuccess: (result) => {
      setGiveawayResult({ codesAssigned: result.codesAssigned });
      queryClient.invalidateQueries({ queryKey: ['credit-types'] });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      displayName: '',
      emailInstructions: '',
      webInstructions: '',
      displayOrder: 0,
      iconUrl: '',
      isActive: true,
      category: 'software_credit',
      distributionType: 'unique',
      universalCode: '',
      universalRedeemUrl: '',
      universalQuantity: 100,
    });
  };

  const handleCreate = () => {
    createMutation.mutate({
      name: formData.name,
      displayName: formData.displayName,
      emailInstructions: formData.emailInstructions,
      webInstructions: formData.webInstructions,
      displayOrder: formData.displayOrder,
      iconUrl: formData.iconUrl || undefined,
      isActive: formData.isActive,
      category: formData.category,
      distributionType: formData.distributionType,
      universalCode: formData.distributionType === 'universal' ? formData.universalCode : undefined,
      universalRedeemUrl:
        formData.distributionType === 'universal' ? formData.universalRedeemUrl || undefined : undefined,
      universalQuantity: formData.distributionType === 'universal' ? formData.universalQuantity : undefined,
    });
  };

  const handleEdit = () => {
    if (!selectedCreditType) return;
    updateMutation.mutate({
      id: selectedCreditType.id,
      displayName: formData.displayName,
      emailInstructions: formData.emailInstructions,
      webInstructions: formData.webInstructions,
      displayOrder: formData.displayOrder,
      iconUrl: formData.iconUrl || undefined,
      isActive: formData.isActive,
      category: formData.category,
    });
  };

  const openEditDialog = (creditType: CreditType) => {
    setSelectedCreditType(creditType);
    setFormData({
      name: creditType.name,
      displayName: creditType.displayName,
      emailInstructions: creditType.emailInstructions || '',
      webInstructions: creditType.webInstructions || '',
      displayOrder: creditType.displayOrder,
      iconUrl: creditType.iconUrl || '',
      isActive: creditType.isActive,
      category: creditType.category,
      distributionType: creditType.distributionType,
      universalCode: creditType.universalCode || '',
      universalRedeemUrl: creditType.universalRedeemUrl || '',
      universalQuantity: 100,
    });
    setEditDialogOpen(true);
  };

  const openImportDialog = (creditType: CreditType) => {
    setSelectedCreditTypeForImport(creditType);
    setImportDialogOpen(true);
  };

  const resetImportDialog = () => {
    setCsvFile(null);
    setParsedRows([]);
    setParseError(null);
    setImportResult(null);
    importMutation.reset();
  };

  const handleFileSelect = async (file: File) => {
    setCsvFile(file);
    setParseError(null);
    setParsedRows([]);
    setImportResult(null);

    const content = await file.text();
    const result = parseCodesCSV(content);

    if (!result.success) {
      setParseError(result.error || 'Failed to parse CSV');
      return;
    }

    setParsedRows(result.rows);
  };

  const handleImport = () => {
    if (!selectedCreditTypeForImport) return;

    const validCodes = parsedRows.filter((r) => r.valid).map((r) => r.data);

    if (validCodes.length === 0) {
      setParseError('No valid rows to import');
      return;
    }

    importMutation.mutate({
      creditTypeId: selectedCreditTypeForImport.id,
      codes: validCodes,
    });
  };

  const handleDownloadSkipped = () => {
    if (!importResult?.skipped.length) return;

    const csv = generateSkippedCodesCSV(importResult.skipped);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skipped-codes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const openGiveawayDialog = (creditType: CreditType) => {
    setSelectedCreditTypeForGiveaway(creditType);
    setGiveawayDialogOpen(true);
  };

  const resetGiveawayDialog = () => {
    setGiveawayRoles([]);
    setGiveawayCheckinTypeId('all');
    setGiveawayResult(null);
    giveawayPreviewMutation.reset();
    giveawayExecuteMutation.reset();
  };

  const handleGiveawayPreview = () => {
    if (!selectedCreditTypeForGiveaway || giveawayRoles.length === 0) return;

    giveawayPreviewMutation.mutate({
      creditTypeId: selectedCreditTypeForGiveaway.id,
      roles: giveawayRoles,
      checkinTypeId: giveawayCheckinTypeId === 'all' ? undefined : giveawayCheckinTypeId,
    });
  };

  const handleGiveawayExecute = () => {
    if (!selectedCreditTypeForGiveaway || giveawayRoles.length === 0) return;

    giveawayExecuteMutation.mutate({
      creditTypeId: selectedCreditTypeForGiveaway.id,
      roles: giveawayRoles,
      checkinTypeId: giveawayCheckinTypeId === 'all' ? undefined : giveawayCheckinTypeId,
    });
  };

  const toggleGiveawayRole = (role: UserRole) => {
    setGiveawayRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
    giveawayPreviewMutation.reset();
  };

  const columns: ColumnDef<CreditType>[] = [
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ row }) => {
        const category = row.getValue('category') as CreditCategory;
        const CategoryIcon = category in categoryIcons ? categoryIcons[category] : null;
        const categoryMap: Record<CreditCategory, string> = {
          food_voucher: CreditCategories.FOOD_VOUCHER.label,
          software_credit: CreditCategories.SOFTWARE_CREDIT.label,
          swag: CreditCategories.SWAG.label,
        };
        const categoryLabel = categoryMap[category] || category;
        return (
          <div className="flex items-center gap-2">
            {CategoryIcon && <CategoryIcon className="h-4 w-4 text-gray-600" />}
            <span className="text-sm text-gray-600">{categoryLabel}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'displayName',
      header: 'Display Name',
      cell: ({ row }) => {
        const isActive = row.original.isActive;
        return <span className={isActive ? '' : 'text-gray-400'}>{row.getValue('displayName')}</span>;
      },
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const isActive = row.original.isActive;
        return (
          <span className={`font-mono text-sm text-gray-500 ${isActive ? '' : 'text-gray-400'}`}>
            {row.getValue('name')}
          </span>
        );
      },
    },
    {
      accessorKey: 'displayOrder',
      header: 'Order',
      cell: ({ row }) => <span className="text-gray-600">{row.getValue('displayOrder')}</span>,
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => {
        const isActive = row.getValue('isActive') as boolean;
        return (
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
          >
            {isActive ? 'Active' : 'Inactive'}
          </span>
        );
      },
    },
    {
      accessorKey: 'poolStats',
      header: 'Pool Status',
      cell: ({ row }) => {
        const stats = row.getValue('poolStats') as PoolStats;
        return <PoolStatus stats={stats} />;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const creditType = row.original;
        const isUniversal = creditType.distributionType === CodeDistributionTypeEnum.universal;
        return (
          <div className="flex items-center gap-1">
            {!isUniversal && (
              <Button variant="ghost" size="sm" onClick={() => openImportDialog(creditType)} title="Import Codes">
                <Upload className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openGiveawayDialog(creditType)}
              disabled={!creditType.isActive || creditType.poolStats.remaining === 0}
              title="Giveaway Codes"
            >
              <Gift
                className={`h-4 w-4 ${creditType.isActive && creditType.poolStats.remaining > 0 ? 'text-purple-600' : 'text-gray-400'}`}
              />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => openEditDialog(creditType)} title="Edit">
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleMutation.mutate(creditType.id)}
              disabled={toggleMutation.isPending}
              title={creditType.isActive ? 'Deactivate' : 'Activate'}
            >
              <Power className={`h-4 w-4 ${creditType.isActive ? 'text-green-600' : 'text-gray-400'}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (creditType.poolStats.assigned > 0) {
                  alert('Cannot delete credit type with assigned codes');
                  return;
                }
                if (confirm(`Delete "${creditType.displayName}"? This will also delete all unassigned codes.`)) {
                  deleteMutation.mutate(creditType.id);
                }
              }}
              disabled={deleteMutation.isPending}
              title="Delete"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credits</h1>
          <p className="mt-1 text-sm text-gray-500">Manage sponsor credit types and code pools</p>
        </div>

        <Dialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) {
              resetForm();
              createMutation.reset();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Credit Type
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Credit Type</DialogTitle>
              <DialogDescription>Add a new sponsor credit type with redemption instructions.</DialogDescription>
            </DialogHeader>

            <CreditTypeForm
              formData={formData}
              setFormData={setFormData}
              error={createMutation.error as Error | null}
              isEdit={false}
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                onClick={handleCreate}
                disabled={
                  !formData.name ||
                  !formData.displayName ||
                  !formData.emailInstructions ||
                  !formData.webInstructions ||
                  (formData.distributionType === 'universal' &&
                    (!formData.universalCode || !formData.universalQuantity)) ||
                  createMutation.isPending
                }
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <DataTable
          columns={columns}
          data={data?.creditTypes ?? []}
          pageCount={1}
          pagination={{ pageIndex: 0, pageSize: 100 }}
          onPaginationChange={() => {}}
          isLoading={isLoading}
        />
      </div>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setSelectedCreditType(null);
            resetForm();
            updateMutation.reset();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Credit Type</DialogTitle>
            <DialogDescription>Update the credit type details.</DialogDescription>
          </DialogHeader>

          <CreditTypeForm
            formData={formData}
            setFormData={setFormData}
            error={updateMutation.error as Error | null}
            isEdit={true}
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleEdit}
              disabled={
                !formData.displayName ||
                !formData.emailInstructions ||
                !formData.webInstructions ||
                updateMutation.isPending
              }
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          setImportDialogOpen(open);
          if (!open) {
            setSelectedCreditTypeForImport(null);
            resetImportDialog();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Codes - {selectedCreditTypeForImport?.displayName}</DialogTitle>
            <DialogDescription>Upload a CSV file with columns: code, redeem_url (optional)</DialogDescription>
          </DialogHeader>

          {importResult ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">Successfully imported {importResult.imported} codes</p>
                  {importResult.skipped.length > 0 && (
                    <p className="text-sm text-green-700">{importResult.skipped.length} codes skipped</p>
                  )}
                </div>
              </div>

              {importResult.skipped.length > 0 && (
                <Button variant="outline" onClick={handleDownloadSkipped} className="gap-2">
                  <Download className="h-4 w-4" />
                  Download Skipped Codes
                </Button>
              )}

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Close</Button>
                </DialogClose>
              </DialogFooter>
            </div>
          ) : (
            <>
              <FileUpload
                onFileSelect={handleFileSelect}
                value={csvFile}
                onClear={() => {
                  setCsvFile(null);
                  setParsedRows([]);
                  setParseError(null);
                }}
                error={parseError || (importMutation.error as Error | null)?.message}
                loading={importMutation.isPending}
              />

              {parsedRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      {parsedRows.filter((r) => r.valid).length} valid rows, {parsedRows.filter((r) => !r.valid).length}{' '}
                      invalid
                    </span>
                    <span className="text-gray-500">
                      Showing first {Math.min(5, parsedRows.length)} of {parsedRows.length}
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Row</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Code</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Redeem URL</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.slice(0, 5).map((row) => (
                          <tr key={row.row} className="border-t">
                            <td className="px-3 py-2 text-gray-500">{row.row}</td>
                            <td className="px-3 py-2 font-mono text-xs">{row.data.codeValue}</td>
                            <td className="max-w-[150px] truncate px-3 py-2 text-xs text-gray-500">
                              {row.data.redeemUrl || '-'}
                            </td>
                            <td className="px-3 py-2">
                              {row.valid ? (
                                <span className="text-green-600">Valid</span>
                              ) : (
                                <span className="text-red-600">{row.error}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleImport}
                  disabled={parsedRows.filter((r) => r.valid).length === 0 || importMutation.isPending}
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${parsedRows.filter((r) => r.valid).length} Codes`
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={giveawayDialogOpen}
        onOpenChange={(open) => {
          setGiveawayDialogOpen(open);
          if (!open) {
            setSelectedCreditTypeForGiveaway(null);
            resetGiveawayDialog();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Giveaway Codes - {selectedCreditTypeForGiveaway?.displayName}</DialogTitle>
            <DialogDescription>Distribute codes to users based on role and check-in filters</DialogDescription>
          </DialogHeader>

          {giveawayResult ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">
                    Successfully distributed {giveawayResult.codesAssigned} code
                    {giveawayResult.codesAssigned !== 1 ? 's' : ''}
                  </p>
                  <p className="text-sm text-green-700">Email notifications are being sent to recipients</p>
                </div>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Close</Button>
                </DialogClose>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-3">
                  <label className="text-sm font-medium">Select Roles *</label>
                  <div className="flex flex-col gap-2">
                    {Object.values(UserRoles).map((role) => (
                      <label key={role.code} className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={giveawayRoles.includes(role.code)}
                          onCheckedChange={() => toggleGiveawayRole(role.code)}
                        />
                        <span className="text-sm">{role.label}</span>
                        {role.code === 'participant' && (
                          <span className="text-xs text-gray-500">(Regular only, excludes VIP)</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Filter by Check-in (Optional)</label>
                  <Select
                    value={giveawayCheckinTypeId}
                    onValueChange={(value) => {
                      setGiveawayCheckinTypeId(value);
                      giveawayPreviewMutation.reset();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All users" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All users</SelectItem>
                      {checkinTypesData?.checkinTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">Only distribute to users who checked in for this event</p>
                </div>

                <Button
                  variant="outline"
                  onClick={handleGiveawayPreview}
                  disabled={giveawayRoles.length === 0 || giveawayPreviewMutation.isPending}
                  className="w-full"
                >
                  {giveawayPreviewMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Calculating...
                    </>
                  ) : (
                    'Preview Distribution'
                  )}
                </Button>

                {giveawayPreviewMutation.data && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Matching Users:</span>
                      <span className="font-medium">{giveawayPreviewMutation.data.matchingUsers}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Available Codes:</span>
                      <span className="font-medium">{giveawayPreviewMutation.data.availableCodes}</span>
                    </div>

                    {giveawayPreviewMutation.data.matchingUsers === 0 && (
                      <div className="flex items-center gap-2 rounded bg-yellow-50 p-2 text-sm text-yellow-800">
                        <AlertCircle className="h-4 w-4" />
                        No users match the selected criteria
                      </div>
                    )}

                    {giveawayPreviewMutation.data.availableCodes < giveawayPreviewMutation.data.matchingUsers && (
                      <div className="flex items-center gap-2 rounded bg-red-50 p-2 text-sm text-red-800">
                        <AlertCircle className="h-4 w-4" />
                        Not enough codes! Need {giveawayPreviewMutation.data.matchingUsers}, only{' '}
                        {giveawayPreviewMutation.data.availableCodes} available
                      </div>
                    )}

                    {!giveawayPreviewMutation.data.creditType.isActive && (
                      <div className="flex items-center gap-2 rounded bg-red-50 p-2 text-sm text-red-800">
                        <AlertCircle className="h-4 w-4" />
                        Credit type is inactive
                      </div>
                    )}
                  </div>
                )}

                {giveawayPreviewMutation.error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {(giveawayPreviewMutation.error as Error).message}
                  </div>
                )}

                {giveawayExecuteMutation.error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {(giveawayExecuteMutation.error as Error).message}
                  </div>
                )}
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleGiveawayExecute}
                  disabled={!giveawayPreviewMutation.data?.canProceed || giveawayExecuteMutation.isPending}
                >
                  {giveawayExecuteMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Distributing...
                    </>
                  ) : (
                    `Distribute ${giveawayPreviewMutation.data?.matchingUsers ?? 0} Codes`
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type CreditTypeFormData = {
  name: string;
  displayName: string;
  emailInstructions: string;
  webInstructions: string;
  displayOrder: number;
  iconUrl: string;
  isActive: boolean;
  category: CreditCategory;
  distributionType: CodeDistributionType;
  universalCode: string;
  universalRedeemUrl: string;
  universalQuantity: number;
};

type CreditTypeFormProps = {
  formData: CreditTypeFormData;
  setFormData: React.Dispatch<React.SetStateAction<CreditTypeFormData>>;
  error: Error | null;
  isEdit: boolean;
};

function CreditTypeForm({ formData, setFormData, error, isEdit }: CreditTypeFormProps) {
  const isUniversal = formData.distributionType === 'universal';

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Name (Internal Key) *</label>
        <Input
          placeholder="cursor"
          value={formData.name}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, name: e.target.value.toLowerCase().replace(/\s+/g, '_') }))
          }
          disabled={isEdit}
          className="font-mono"
        />
        {!isEdit && (
          <p className="text-xs text-gray-500">
            Lowercase letters, numbers, and underscores only. Cannot be changed after creation.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Display Name *</label>
        <Input
          placeholder="Cursor Pro Credits (50 credits)"
          value={formData.displayName}
          onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Category *</label>
        <Select
          value={formData.category}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value as CreditCategory }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="food_voucher">{CreditCategories.FOOD_VOUCHER.label}</SelectItem>
            <SelectItem value="software_credit">{CreditCategories.SOFTWARE_CREDIT.label}</SelectItem>
            <SelectItem value="swag">{CreditCategories.SWAG.label}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">Category for grouping and icon display</p>
      </div>

      {!isEdit && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Distribution Type *</label>
          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="distributionType"
                value="unique"
                checked={formData.distributionType === 'unique'}
                onChange={() => setFormData((prev) => ({ ...prev, distributionType: 'unique' }))}
                className="h-4 w-4"
              />
              <span className="text-sm">Unique codes (CSV import)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="distributionType"
                value="universal"
                checked={formData.distributionType === 'universal'}
                onChange={() => setFormData((prev) => ({ ...prev, distributionType: 'universal' }))}
                className="h-4 w-4"
              />
              <span className="text-sm">Universal code (same for all)</span>
            </label>
          </div>
          <p className="text-xs text-gray-500">
            {isUniversal
              ? 'All participants will receive the same code'
              : 'Each participant will receive a unique code from CSV import'}
          </p>
        </div>
      )}

      {!isEdit && isUniversal && (
        <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-800">Universal Code Settings</p>

          <div className="space-y-2">
            <label className="text-sm font-medium">Code *</label>
            <Input
              placeholder="CURSOR50"
              value={formData.universalCode}
              onChange={(e) => setFormData((prev) => ({ ...prev, universalCode: e.target.value.toUpperCase() }))}
              className="font-mono uppercase"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Redeem URL</label>
            <Input
              placeholder="https://cursor.com/redeem"
              type="url"
              value={formData.universalRedeemUrl}
              onChange={(e) => setFormData((prev) => ({ ...prev, universalRedeemUrl: e.target.value }))}
            />
            <p className="text-xs text-gray-500">Optional URL for redemption</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Quantity *</label>
            <Input
              type="number"
              min={1}
              max={10000}
              value={formData.universalQuantity}
              onChange={(e) => setFormData((prev) => ({ ...prev, universalQuantity: parseInt(e.target.value) || 1 }))}
            />
            <p className="text-xs text-gray-500">Number of participants that can receive this code</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Email Instructions *</label>
        <Textarea
          placeholder="Brief instructions for email notifications..."
          value={formData.emailInstructions}
          onChange={(e) => setFormData((prev) => ({ ...prev, emailInstructions: e.target.value }))}
          rows={3}
        />
        <p className="text-xs text-gray-500">Brief text shown in email notifications</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Web Instructions *</label>
        <Textarea
          placeholder="Instructions for dashboard display..."
          value={formData.webInstructions}
          onChange={(e) => setFormData((prev) => ({ ...prev, webInstructions: e.target.value }))}
          rows={3}
        />
        <p className="text-xs text-gray-500">Plain text shown on participant dashboard</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Display Order *</label>
          <Input
            type="number"
            min={0}
            value={formData.displayOrder}
            onChange={(e) => setFormData((prev) => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
          />
        </div>

        <div className="flex items-center space-x-2 pt-6">
          <input
            type="checkbox"
            id="isActive"
            checked={formData.isActive}
            onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="isActive" className="text-sm font-medium">
            Active
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Icon URL</label>
        <Input
          placeholder="https://example.com/icon.png"
          type="url"
          value={formData.iconUrl}
          onChange={(e) => setFormData((prev) => ({ ...prev, iconUrl: e.target.value }))}
        />
        <p className="text-xs text-gray-500">Optional icon URL for display</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error.message}
        </div>
      )}
    </div>
  );
}
