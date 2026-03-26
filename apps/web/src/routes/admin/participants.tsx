import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type ColumnDef } from '@tanstack/react-table';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Edit,
  Gift,
  History,
  Loader2,
  Mail,
  MailPlus,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';

import {
  ParticipantType,
  ParticipantTypeEnum,
  UserRole,
  UserRoleEnum,
  UserType,
  UserTypeEnum,
} from '@base/core/config/constant';
import { SITE_SHORT_NAME } from '@base/core/config/event';
import { Button } from '@base/ui/components/button';
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

import {
  assignCodeToUser,
  getUserCodes,
  listCreditTypes,
  unassignCodeFromUser,
  type AssignCodeToUserInput,
  type UnassignCodeFromUserInput,
} from '~/apis/admin/credits';
import { getWelcomeEmailStats, sendWelcomeEmailToUser, sendWelcomeEmails } from '~/apis/admin/emails';
import {
  createUser,
  deleteUser,
  getOpsActivityLogs,
  getParticipantCheckinLogs,
  importParticipants,
  listParticipants,
  updateUser,
  type CreateUserInput,
  type DeleteUserInput,
  type GetOpsActivityLogsInput,
  type GetParticipantCheckinLogsInput,
  type ListParticipantsInput,
  type UpdateUserInput,
} from '~/apis/admin/participants';
import { generateSkippedRowsCSV, parseParticipantsCSV, type ParsedRow } from '~/utils/csv-parser';

export const Route = createFileRoute('/admin/participants')({
  head: () => ({
    meta: [{ title: `Participants - Admin Portal - ${SITE_SHORT_NAME}` }],
  }),
  component: ParticipantsPage,
});

type Participant = {
  id: string;
  name: string;
  email: string;
  role: string;
  participantType: string;
  status: string;
  createdAt: Date;
  checkedInAt: Date | null;
};

const columns: ColumnDef<Participant>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => {
      const role = row.getValue('role') as string;
      const styles: Record<string, string> = {
        admin: 'bg-purple-100 text-purple-800',
        ops: 'bg-blue-100 text-blue-800',
        participant: 'bg-gray-100 text-gray-800',
      };
      return (
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${styles[role] || styles.participant}`}>
          {role}
        </span>
      );
    },
  },
  {
    accessorKey: 'participantType',
    header: 'Type',
    cell: ({ row }) => {
      const type = row.getValue('participantType') as string;
      const styles: Record<string, string> = {
        vip: 'bg-yellow-100 text-yellow-800',
        regular: 'bg-gray-100 text-gray-800',
      };
      return (
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${styles[type] || styles.regular}`}>{type}</span>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      const styles: Record<string, string> = {
        checked_in: 'bg-green-100 text-green-800',
        registered: 'bg-gray-100 text-gray-800',
      };
      const labels: Record<string, string> = {
        checked_in: 'Checked In',
        registered: 'Registered',
      };
      return (
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${styles[status] || styles.registered}`}>
          {labels[status] || status}
        </span>
      );
    },
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row, table }) => {
      const participant = row.original;
      const meta = table.options.meta as {
        onEdit?: (participant: Participant) => void;
        onDelete?: (participant: Participant) => void;
        onViewLog?: (participant: Participant) => void;
        onSendEmail?: (participant: Participant) => void;
        onManageCodes?: (participant: Participant) => void;
        sendingEmailUserId?: string | null;
      };
      return (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => meta.onViewLog?.(participant)}
            className="h-8 w-8 p-0"
            title="View Log"
          >
            <History className="h-4 w-4" />
          </Button>
          {participant.role === 'participant' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => meta.onSendEmail?.(participant)}
                className="h-8 w-8 p-0"
                title="Send/Retry Email"
                disabled={meta.sendingEmailUserId === participant.id}
              >
                {meta.sendingEmailUserId === participant.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MailPlus className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => meta.onManageCodes?.(participant)}
                className="h-8 w-8 p-0"
                title="Manage Codes"
              >
                <Gift className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => meta.onEdit?.(participant)} className="h-8 w-8 p-0">
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => meta.onDelete?.(participant)}
            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      );
    },
  },
];

function ParticipantsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [sendEmailDialogOpen, setSendEmailDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [manageCodesDialogOpen, setManageCodesDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Participant | null>(null);
  const [deletingUser, setDeletingUser] = useState<Participant | null>(null);
  const [viewingLogUser, setViewingLogUser] = useState<Participant | null>(null);
  const [sendingEmailUser, setSendingEmailUser] = useState<Participant | null>(null);
  const [managingCodesUser, setManagingCodesUser] = useState<Participant | null>(null);
  const [sendingEmailUserId, setSendingEmailUserId] = useState<string | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserType, setNewUserType] = useState<UserType>(UserTypeEnum.vip);
  const [originalRole, setOriginalRole] = useState<string | null>(null);
  const [originalParticipantType, setOriginalParticipantType] = useState<string | null>(null);

  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: Array<{ row: number; email: string; reason: string }>;
  } | null>(null);

  const listParams: ListParticipantsInput = {
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
    search: search || undefined,
    status: statusFilter !== 'all' ? (statusFilter as 'registered' | 'checked_in') : undefined,
    participantType: typeFilter !== 'all' ? (typeFilter as ParticipantType) : undefined,
    role: roleFilter !== 'all' ? (roleFilter as UserRole) : undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  };

  const { data, isLoading } = useQuery({
    queryKey: ['participants', listParams],
    queryFn: () => listParticipants({ data: listParams }),
  });

  const { data: emailStats, refetch: refetchEmailStats } = useQuery({
    queryKey: ['welcome-email-stats'],
    queryFn: () => getWelcomeEmailStats(),
    enabled: emailDialogOpen,
  });

  const [emailResult, setEmailResult] = useState<{
    sentCount: number;
    failedCount: number;
    failures: Array<{ email: string; error: string }>;
  } | null>(null);

  const sendEmailsMutation = useMutation({
    mutationFn: () => sendWelcomeEmails(),
    onSuccess: (result) => {
      setEmailResult(result);
      queryClient.invalidateQueries({ queryKey: ['welcome-email-stats'] });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: (input: CreateUserInput) => createUser({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      setAddUserDialogOpen(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserType(UserTypeEnum.vip);
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: (input: UpdateUserInput) => updateUser({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      setEditUserDialogOpen(false);
      setEditingUser(null);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (input: DeleteUserInput) => deleteUser({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      setDeleteUserDialogOpen(false);
      setDeletingUser(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: (participants: Array<{ name: string; email: string; lumaId?: string; userType: UserType }>) =>
      importParticipants({ data: { participants } }),
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
  });

  const sendEmailToUserMutation = useMutation({
    mutationFn: (userId: string) => sendWelcomeEmailToUser({ data: { userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['welcome-email-stats'] });
      setSendingEmailUserId(null);
      setSendEmailDialogOpen(false);
      setSendingEmailUser(null);
    },
  });

  const handleFileSelect = async (file: File) => {
    setCsvFile(file);
    setParseError(null);
    setParsedRows([]);
    setImportResult(null);

    const content = await file.text();
    const result = parseParticipantsCSV(content);

    if (!result.success) {
      setParseError(result.error || 'Failed to parse CSV');
      return;
    }

    setParsedRows(result.rows);
  };

  const handleImport = () => {
    const validParticipants = parsedRows.filter((r) => r.valid).map((r) => r.data);

    if (validParticipants.length === 0) {
      setParseError('No valid rows to import');
      return;
    }

    importMutation.mutate(validParticipants);
  };

  const handleDownloadSkipped = () => {
    if (!importResult?.skipped.length) return;

    const csv = generateSkippedRowsCSV(importResult.skipped);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skipped-rows.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddUser = () => {
    if (!newUserName || !newUserEmail) return;
    createUserMutation.mutate({
      name: newUserName,
      email: newUserEmail,
      userType: newUserType,
    });
  };

  const resetImportDialog = () => {
    setCsvFile(null);
    setParsedRows([]);
    setParseError(null);
    setImportResult(null);
  };

  const handleEdit = (participant: Participant) => {
    setEditingUser(participant);
    setNewUserName(participant.name);
    setNewUserEmail(participant.email);
    let userType: UserType = UserTypeEnum.vip;
    if (participant.role === UserRoleEnum.admin) {
      userType = UserTypeEnum.admin;
    } else if (participant.role === UserRoleEnum.ops) {
      userType = UserTypeEnum.ops;
    } else if (
      participant.role === UserRoleEnum.participant &&
      participant.participantType === ParticipantTypeEnum.regular
    ) {
      userType = UserTypeEnum.regular;
    } else if (participant.participantType === ParticipantTypeEnum.vip) {
      userType = UserTypeEnum.vip;
    }
    setNewUserType(userType);
    setOriginalRole(participant.role);
    setOriginalParticipantType(participant.participantType);
    setEditUserDialogOpen(true);
  };

  const handleDelete = (participant: Participant) => {
    setDeletingUser(participant);
    setDeleteUserDialogOpen(true);
  };

  const handleViewLog = (participant: Participant) => {
    setViewingLogUser(participant);
    setLogDialogOpen(true);
  };

  const handleSendEmail = (participant: Participant) => {
    setSendingEmailUser(participant);
    setSendEmailDialogOpen(true);
  };

  const handleManageCodes = (participant: Participant) => {
    setManagingCodesUser(participant);
    setManageCodesDialogOpen(true);
  };

  const handleConfirmSendEmail = () => {
    setSendingEmailUserId(sendingEmailUser!.id);
    sendEmailToUserMutation.mutate(sendingEmailUser!.id);
  };

  const handleUpdateUser = () => {
    if (!editingUser || !newUserName || !newUserEmail || !originalRole || !originalParticipantType) return;

    const updateData: UpdateUserInput = {
      id: editingUser.id,
      name: newUserName,
      email: newUserEmail,
    };

    let newRole: UserRole = UserRoleEnum.participant;
    let newParticipantType: ParticipantType = ParticipantTypeEnum.regular;

    if (newUserType === UserTypeEnum.admin) {
      newRole = UserRoleEnum.admin;
      newParticipantType = ParticipantTypeEnum.regular;
    } else if (newUserType === UserTypeEnum.ops) {
      newRole = UserRoleEnum.ops;
      newParticipantType = ParticipantTypeEnum.regular;
    } else if (newUserType === UserTypeEnum.regular) {
      newRole = UserRoleEnum.participant;
      newParticipantType = ParticipantTypeEnum.regular;
    } else {
      newRole = UserRoleEnum.participant;
      newParticipantType = ParticipantTypeEnum.vip;
    }

    if (newRole !== originalRole) {
      updateData.role = newRole;
    }
    if (newParticipantType !== originalParticipantType) {
      updateData.participantType = newParticipantType;
    }

    updateUserMutation.mutate(updateData);
  };

  const handleConfirmDelete = () => {
    if (!deletingUser) return;
    deleteUserMutation.mutate({ id: deletingUser.id });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Participants</h1>
          <p className="mt-1 text-sm text-gray-500">Manage registrations, imports, and participant details</p>
        </div>

        <div className="flex items-center gap-2">
          <Dialog
            open={emailDialogOpen}
            onOpenChange={(open) => {
              setEmailDialogOpen(open);
              if (!open) {
                setEmailResult(null);
              } else {
                refetchEmailStats();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Mail className="h-4 w-4" />
                Send Welcome Emails
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send Welcome Emails</DialogTitle>
                <DialogDescription>
                  Send welcome emails to participants who haven't received one yet. Emails are sent in batches of 100
                  with rate limiting.
                </DialogDescription>
              </DialogHeader>

              {emailResult ? (
                <div className="space-y-4 py-4">
                  <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800">Successfully sent {emailResult.sentCount} emails</p>
                      {emailResult.failedCount > 0 && (
                        <p className="text-sm text-red-700">{emailResult.failedCount} failed</p>
                      )}
                    </div>
                  </div>

                  {emailResult.failures.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border p-3">
                      <p className="mb-2 text-sm font-medium text-gray-700">Failed emails:</p>
                      {emailResult.failures.map((f, i) => (
                        <p key={i} className="text-xs text-red-600">
                          {f.email}: {f.error}
                        </p>
                      ))}
                    </div>
                  )}

                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Close</Button>
                    </DialogClose>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Emails to send:</span>
                      <span className="font-semibold">{emailStats?.pendingCount ?? '-'}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-gray-600">Already sent:</span>
                      <span className="text-gray-500">{emailStats?.sentCount ?? '-'}</span>
                    </div>
                    {emailStats && emailStats.pendingCount > 0 && (
                      <div className="mt-3 rounded-md bg-blue-50 p-2 text-xs text-blue-700">
                        Will send up to 100 emails per batch. Click again to send the next batch if more remain.
                      </div>
                    )}
                  </div>

                  {emailStats?.pendingCount === 0 && (
                    <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                      <CheckCircle2 className="h-4 w-4" />
                      All participants have already received welcome emails.
                    </div>
                  )}

                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button
                      onClick={() => sendEmailsMutation.mutate()}
                      disabled={sendEmailsMutation.isPending || emailStats?.pendingCount === 0}
                    >
                      {sendEmailsMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        `Send ${Math.min(emailStats?.pendingCount ?? 0, 100)} Emails`
                      )}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog
            open={importDialogOpen}
            onOpenChange={(open) => {
              setImportDialogOpen(open);
              if (!open) resetImportDialog();
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Upload className="h-4 w-4" />
                Import CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import Participants</DialogTitle>
                <DialogDescription>
                  Upload a CSV file with columns: name, email, user_type (optional: regular/vip/ops/admin, defaults to
                  regular), luma_id (optional)
                </DialogDescription>
              </DialogHeader>

              {importResult ? (
                <div className="space-y-4 py-4">
                  <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800">
                        Successfully imported {importResult.imported} participants
                      </p>
                      {importResult.skipped.length > 0 && (
                        <p className="text-sm text-green-700">{importResult.skipped.length} rows skipped</p>
                      )}
                    </div>
                  </div>

                  {importResult.skipped.length > 0 && (
                    <Button variant="outline" onClick={handleDownloadSkipped} className="gap-2">
                      <Download className="h-4 w-4" />
                      Download Skipped Rows
                    </Button>
                  )}
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
                    error={parseError}
                    loading={importMutation.isPending}
                  />

                  {parsedRows.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">
                          {parsedRows.filter((r) => r.valid).length} valid rows,{' '}
                          {parsedRows.filter((r) => !r.valid).length} invalid
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
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Name</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Email</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">User Type</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedRows.slice(0, 5).map((row) => (
                              <tr key={row.row} className="border-t">
                                <td className="px-3 py-2 text-gray-500">{row.row}</td>
                                <td className="px-3 py-2">{row.data.name}</td>
                                <td className="px-3 py-2">{row.data.email}</td>
                                <td className="px-3 py-2">
                                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                                    {row.data.userType}
                                  </span>
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
                        `Import ${parsedRows.filter((r) => r.valid).length} Participants`
                      )}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add User</DialogTitle>
                <DialogDescription>Manually create a new VIP, ops, or admin account.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input placeholder="John Doe" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    placeholder="john@example.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">User Type</label>
                  <Select value={newUserType} onValueChange={(v) => setNewUserType(v as UserType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular Participant</SelectItem>
                      <SelectItem value="vip">VIP (Cannot login, QR only)</SelectItem>
                      <SelectItem value="ops">Ops (Magic link login)</SelectItem>
                      <SelectItem value="admin">Admin (Google OAuth login)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {createUserMutation.isError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    {(createUserMutation.error as Error).message}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  onClick={handleAddUser}
                  disabled={!newUserName || !newUserEmail || createUserMutation.isPending}
                >
                  {createUserMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create User'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-72">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <Input
            placeholder="Search by name or email..."
            className="pl-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
          />
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="registered">Registered</SelectItem>
              <SelectItem value="checked_in">Checked In</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="regular">Regular</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={roleFilter}
            onValueChange={(v) => {
              setRoleFilter(v);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="participant">Participant</SelectItem>
              <SelectItem value="ops">Ops</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <DataTable
          columns={columns}
          data={data?.users ?? []}
          pageCount={data?.pagination.totalPages ?? 0}
          pagination={pagination}
          onPaginationChange={setPagination}
          isLoading={isLoading}
          meta={{
            onEdit: handleEdit,
            onDelete: handleDelete,
            onViewLog: handleViewLog,
            onSendEmail: handleSendEmail,
            onManageCodes: handleManageCodes,
            sendingEmailUserId,
          }}
        />
      </div>

      {/* Edit User Dialog */}
      <Dialog
        open={editUserDialogOpen}
        onOpenChange={(open) => {
          setEditUserDialogOpen(open);
          if (!open) {
            setEditingUser(null);
            setNewUserName('');
            setNewUserEmail('');
            setNewUserType(UserTypeEnum.vip);
            setOriginalRole(null);
            setOriginalParticipantType(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input placeholder="John Doe" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                placeholder="john@example.com"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">User Type</label>
              <Select value={newUserType} onValueChange={(v) => setNewUserType(v as UserType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular Participant</SelectItem>
                  <SelectItem value="vip">VIP (Cannot login, QR only)</SelectItem>
                  <SelectItem value="ops">Ops (Magic link login)</SelectItem>
                  <SelectItem value="admin">Admin (Google OAuth login)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {updateUserMutation.isError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {(updateUserMutation.error as Error).message}
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleUpdateUser} disabled={!newUserName || !newUserEmail || updateUserMutation.isPending}>
              {updateUserMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update User'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteUserDialogOpen} onOpenChange={setDeleteUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deletingUser?.name} ({deletingUser?.email})? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>

          {deleteUserMutation.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {(deleteUserMutation.error as Error).message}
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteUserMutation.isPending}>
              {deleteUserMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete User'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog
        open={sendEmailDialogOpen}
        onOpenChange={(open) => {
          setSendEmailDialogOpen(open);
          if (!open) {
            setSendingEmailUser(null);
            setSendingEmailUserId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Welcome Email</DialogTitle>
            <DialogDescription>
              Send welcome email to {sendingEmailUser?.name} ({sendingEmailUser?.email})?
            </DialogDescription>
          </DialogHeader>

          {sendEmailToUserMutation.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {(sendEmailToUserMutation.error as Error).message}
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleConfirmSendEmail} disabled={sendEmailToUserMutation.isPending}>
              {sendEmailToUserMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Email'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check-in Log Dialog */}
      <Dialog
        open={logDialogOpen}
        onOpenChange={(open) => {
          setLogDialogOpen(open);
          if (!open) {
            setViewingLogUser(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          {viewingLogUser && (
            <CheckinLogModal userId={viewingLogUser.id} userName={viewingLogUser.name} userRole={viewingLogUser.role} />
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Codes Dialog */}
      <Dialog
        open={manageCodesDialogOpen}
        onOpenChange={(open) => {
          setManageCodesDialogOpen(open);
          if (!open) {
            setManagingCodesUser(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          {managingCodesUser && (
            <ManageCodesModal
              userId={managingCodesUser.id}
              userName={managingCodesUser.name}
              userEmail={managingCodesUser.email}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckinLogModal({ userId, userName, userRole }: { userId: string; userName: string; userRole: string }) {
  const isOpsOrAdmin = userRole === UserRoleEnum.ops || userRole === UserRoleEnum.admin;

  if (isOpsOrAdmin) {
    return <OpsActivityLogView userId={userId} userName={userName} userRole={userRole} />;
  }

  return <ParticipantCheckinHistoryView userId={userId} userName={userName} />;
}

function ParticipantCheckinHistoryView({ userId, userName }: { userId: string; userName: string }) {
  const queryParams: GetParticipantCheckinLogsInput = { participantId: userId };

  const { data, isLoading } = useQuery({
    queryKey: ['participant-checkin-logs', userId],
    queryFn: () => getParticipantCheckinLogs({ data: queryParams }),
  });

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Check-in History: {userName}</DialogTitle>
        <DialogDescription>Records of when this participant was checked in.</DialogDescription>
      </DialogHeader>

      <div className="py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : !data?.records.length ? (
          <div className="py-8 text-center text-gray-500">No check-in records found</div>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Check-in Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Checked In By</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((record, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-4 py-3">{record.checkinTypeName}</td>
                    <td className="px-4 py-3">{record.checkedInByName}</td>
                    <td className="px-4 py-3 text-gray-500">{formatTime(record.checkedInAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function OpsActivityLogView({ userId, userName, userRole }: { userId: string; userName: string; userRole: string }) {
  const queryParams: GetOpsActivityLogsInput = { opsUserId: userId };

  const { data, isLoading } = useQuery({
    queryKey: ['ops-activity-logs', userId],
    queryFn: () => getOpsActivityLogs({ data: queryParams }),
  });

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const roleLabel = userRole === UserRoleEnum.admin ? 'Admin' : 'Ops';

  return (
    <>
      <DialogHeader>
        <DialogTitle>Check-in Activity: {userName}</DialogTitle>
        <DialogDescription>Participants checked in by this {roleLabel.toLowerCase()} user.</DialogDescription>
      </DialogHeader>

      <div className="py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : !data?.records.length ? (
          <div className="py-8 text-center text-gray-500">No check-in activity found</div>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Participant</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Check-in Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((record, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-4 py-3">
                      <div>{record.participantName}</div>
                      <div className="text-xs text-gray-400">{record.participantEmail}</div>
                    </td>
                    <td className="px-4 py-3">{record.checkinTypeName}</td>
                    <td className="px-4 py-3 text-gray-500">{formatTime(record.checkedInAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function ManageCodesModal({ userId, userName, userEmail }: { userId: string; userName: string; userEmail: string }) {
  const queryClient = useQueryClient();
  const [assignCreditTypeId, setAssignCreditTypeId] = useState<string>('');
  const [sendEmail, setSendEmail] = useState(false);

  const { data: userCodesData, isLoading: isLoadingCodes } = useQuery({
    queryKey: ['user-codes', userId],
    queryFn: () => getUserCodes({ data: { userId } }),
  });

  const { data: creditTypesData } = useQuery({
    queryKey: ['credit-types-list'],
    queryFn: () => listCreditTypes(),
  });

  const assignCodeMutation = useMutation({
    mutationFn: (input: AssignCodeToUserInput) => assignCodeToUser({ data: input }),
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['user-codes', userId] });
        queryClient.invalidateQueries({ queryKey: ['credit-types-list'] });
        setAssignCreditTypeId('');
        setSendEmail(false);
      }
    },
  });

  const unassignCodeMutation = useMutation({
    mutationFn: (input: UnassignCodeFromUserInput) => unassignCodeFromUser({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-codes', userId] });
      queryClient.invalidateQueries({ queryKey: ['credit-types-list'] });
    },
  });

  const handleAssignCode = () => {
    if (!assignCreditTypeId) return;
    assignCodeMutation.mutate({
      userId,
      creditTypeId: assignCreditTypeId,
      sendEmail,
    });
  };

  const handleUnassignCode = (codeId: string) => {
    if (confirm('Are you sure you want to unassign this code? It will be returned to the available pool.')) {
      unassignCodeMutation.mutate({ codeId });
    }
  };

  const formatTime = (date: Date | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const availableCreditTypes = creditTypesData?.creditTypes.filter((ct) => ct.isActive) || [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>Manage Codes: {userName}</DialogTitle>
        <DialogDescription>
          Assign or unassign codes for {userName} ({userEmail})
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-4">
        {/* Assign New Code Section */}
        <div className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Assign New Code</h3>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Credit Type</label>
              <Select value={assignCreditTypeId} onValueChange={setAssignCreditTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select credit type" />
                </SelectTrigger>
                <SelectContent>
                  {availableCreditTypes.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-gray-500">No active credit types available</div>
                  ) : (
                    availableCreditTypes.map((ct) => (
                      <SelectItem key={ct.id} value={ct.id}>
                        {ct.displayName} ({ct.poolStats.remaining} available)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAssignCode}
              disabled={!assignCreditTypeId || assignCodeMutation.isPending || availableCreditTypes.length === 0}
            >
              {assignCodeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign Code'
              )}
            </Button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              id="send-email"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <label htmlFor="send-email" className="text-sm text-gray-600">
              Send email notification to user
            </label>
          </div>

          {assignCodeMutation.isError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {(assignCodeMutation.error as Error).message}
            </div>
          )}

          {assignCodeMutation.isSuccess && !assignCodeMutation.data.success && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {assignCodeMutation.data.message}
            </div>
          )}

          {assignCodeMutation.isSuccess && assignCodeMutation.data.success && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              {assignCodeMutation.data.message}
            </div>
          )}
        </div>

        {/* Assigned Codes List */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Assigned Codes</h3>
          {isLoadingCodes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : !userCodesData?.codes.length ? (
            <div className="rounded-lg border p-8 text-center text-gray-500">No codes assigned yet</div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Credit Type</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Code</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Assigned At</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {userCodesData.codes.map((code) => (
                    <tr key={code.id} className="border-t">
                      <td className="px-4 py-3">{code.creditType.displayName}</td>
                      <td className="px-4 py-3 font-mono text-xs">{code.codeValue}</td>
                      <td className="px-4 py-3">
                        {code.status === 'redeemed' ? (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                            Redeemed
                          </span>
                        ) : (
                          <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                            Available
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatTime(code.assignedAt)}</td>
                      <td className="px-4 py-3">
                        {code.status !== 'redeemed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnassignCode(code.id)}
                            className="h-8 text-xs text-red-600 hover:text-red-700"
                            disabled={unassignCodeMutation.isPending}
                          >
                            {unassignCodeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Unassign'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {unassignCodeMutation.isError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {(unassignCodeMutation.error as Error).message}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
