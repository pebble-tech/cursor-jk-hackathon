import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type ColumnDef } from '@tanstack/react-table';
import { AlertCircle, Edit2, Loader2, Plus, Power, Trash2 } from 'lucide-react';

import { CheckinTypeCategoryCodes } from '@base/core/config/constant';
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
import { Input } from '@base/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@base/ui/components/select';
import { Textarea } from '@base/ui/components/textarea';

import {
  createCheckinType,
  deleteCheckinType,
  listCheckinTypes,
  toggleCheckinTypeActive,
  updateCheckinType,
  type CreateCheckinTypeInput,
  type UpdateCheckinTypeInput,
} from '~/apis/admin/checkins';

export const Route = createFileRoute('/admin/checkins')({
  head: () => ({
    meta: [{ title: `Check-in Types - Admin Portal - ${SITE_SHORT_NAME}` }],
  }),
  component: CheckinTypesPage,
});

type CheckinType = {
  id: string;
  name: string;
  type: 'attendance' | 'meal';
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
};

function CheckinTypesPage() {
  const queryClient = useQueryClient();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCheckinType, setSelectedCheckinType] = useState<CheckinType | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    type: 'attendance' as 'attendance' | 'meal',
    description: '',
    displayOrder: 0,
    isActive: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['checkin-types'],
    queryFn: () => listCheckinTypes(),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateCheckinTypeInput) => createCheckinType({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkin-types'] });
      setCreateDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateCheckinTypeInput) => updateCheckinType({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkin-types'] });
      setEditDialogOpen(false);
      setSelectedCheckinType(null);
      resetForm();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => toggleCheckinTypeActive({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkin-types'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCheckinType({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkin-types'] });
      setDeleteDialogOpen(false);
      setSelectedCheckinType(null);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'attendance',
      description: '',
      displayOrder: 0,
      isActive: true,
    });
  };

  const handleCreate = () => {
    createMutation.mutate({
      name: formData.name,
      type: formData.type,
      description: formData.description || undefined,
      displayOrder: formData.displayOrder,
      isActive: formData.isActive,
    });
  };

  const handleEdit = () => {
    if (!selectedCheckinType) return;
    updateMutation.mutate({
      id: selectedCheckinType.id,
      name: formData.name,
      type: formData.type,
      description: formData.description || undefined,
      displayOrder: formData.displayOrder,
      isActive: formData.isActive,
    });
  };

  const openEditDialog = (checkinType: CheckinType) => {
    setSelectedCheckinType(checkinType);
    setFormData({
      name: checkinType.name,
      type: checkinType.type,
      description: checkinType.description || '',
      displayOrder: checkinType.displayOrder,
      isActive: checkinType.isActive,
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (checkinType: CheckinType) => {
    setSelectedCheckinType(checkinType);
    setDeleteDialogOpen(true);
  };

  const columns: ColumnDef<CheckinType>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const isActive = row.original.isActive;
        return <span className={isActive ? '' : 'text-gray-400'}>{row.getValue('name')}</span>;
      },
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.getValue('type') as string;
        const styles: Record<string, string> = {
          attendance: 'bg-blue-100 text-blue-800',
          meal: 'bg-orange-100 text-orange-800',
        };
        const labels: Record<string, string> = {
          attendance: 'Attendance',
          meal: 'Meal',
        };
        return (
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${styles[type] || ''}`}>
            {labels[type] || type}
          </span>
        );
      },
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const description = row.getValue('description') as string | null;
        return <span className="text-gray-500">{description || '-'}</span>;
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
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const checkinType = row.original;
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => openEditDialog(checkinType)} title="Edit">
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleMutation.mutate(checkinType.id)}
              disabled={toggleMutation.isPending}
              title={checkinType.isActive ? 'Deactivate' : 'Activate'}
            >
              <Power className={`h-4 w-4 ${checkinType.isActive ? 'text-green-600' : 'text-gray-400'}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openDeleteDialog(checkinType)}
              title="Delete"
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
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
          <h1 className="text-2xl font-bold text-gray-900">Check-in Types</h1>
          <p className="mt-1 text-sm text-gray-500">Manage attendance and meal check-in categories</p>
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
              Add Check-in Type
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Check-in Type</DialogTitle>
              <DialogDescription>Add a new attendance or meal check-in category.</DialogDescription>
            </DialogHeader>

            <CheckinTypeForm
              formData={formData}
              setFormData={setFormData}
              error={createMutation.error as Error | null}
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleCreate} disabled={!formData.name || createMutation.isPending}>
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
          data={data?.checkinTypes ?? []}
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
            setSelectedCheckinType(null);
            resetForm();
            updateMutation.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Check-in Type</DialogTitle>
            <DialogDescription>Update the check-in type details.</DialogDescription>
          </DialogHeader>

          <CheckinTypeForm formData={formData} setFormData={setFormData} error={updateMutation.error as Error | null} />

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleEdit} disabled={!formData.name || updateMutation.isPending}>
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
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setSelectedCheckinType(null);
            deleteMutation.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Check-in Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedCheckinType?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteMutation.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {(deleteMutation.error as Error).message}
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => selectedCheckinType && deleteMutation.mutate(selectedCheckinType.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type CheckinTypeFormProps = {
  formData: {
    name: string;
    type: 'attendance' | 'meal';
    description: string;
    displayOrder: number;
    isActive: boolean;
  };
  setFormData: React.Dispatch<
    React.SetStateAction<{
      name: string;
      type: 'attendance' | 'meal';
      description: string;
      displayOrder: number;
      isActive: boolean;
    }>
  >;
  error: Error | null;
};

function CheckinTypeForm({ formData, setFormData, error }: CheckinTypeFormProps) {
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Name *</label>
        <Input
          placeholder="Day 1 Attendance"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Type *</label>
        <Select
          value={formData.type}
          onValueChange={(v) => setFormData((prev) => ({ ...prev, type: v as 'attendance' | 'meal' }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CheckinTypeCategoryCodes.map((code) => (
              <SelectItem key={code} value={code}>
                {code === 'attendance' ? 'Attendance' : 'Meal'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <Textarea
          placeholder="Optional description..."
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          rows={2}
        />
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

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error.message}
        </div>
      )}
    </div>
  );
}
