'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { masterDataAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { showToast } from '@/lib/toast';
import { useDashboardHeader, useModulePermission } from '@/components/layout/DashboardShell';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';

const NAME_COLUMN_ALIASES: Record<string, string[]> = {
  schools: ['school name', 'school', 'name', 'schoolname', 'school_name'],
  colleges: ['college name', 'college', 'name', 'collegename', 'college_name'],
};

function parseNamesFromSheet(
  type: 'schools' | 'colleges',
  rawRows: unknown[][]
): string[] {
  if (!rawRows?.length) return [];
  const aliases = NAME_COLUMN_ALIASES[type].map((a) => a.toLowerCase());
  const firstRow = rawRows[0] as unknown[];
  let colIndex = 0;
  if (firstRow && Array.isArray(firstRow)) {
    const headerStr = String(firstRow[0] ?? '').trim().toLowerCase();
    if (aliases.some((a) => headerStr === a || headerStr.includes(a))) {
      colIndex = 0;
    } else {
      const found = firstRow.findIndex((cell) => {
        const s = String(cell ?? '').trim().toLowerCase();
        return aliases.some((a) => s === a || s.includes(a));
      });
      if (found >= 0) colIndex = found;
    }
  }
  const names: string[] = [];
  const firstCellStr = firstRow && Array.isArray(firstRow) ? String(firstRow[colIndex] ?? '').trim().toLowerCase() : '';
  const firstRowIsHeader = firstCellStr && aliases.some((a) => firstCellStr === a || firstCellStr.includes(a));
  const startRow = firstRowIsHeader ? 1 : 0;
  for (let i = startRow; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[] | undefined;
    if (!row || !Array.isArray(row)) continue;
    const val = row[colIndex];
    const s = typeof val === 'string' ? val.trim() : String(val ?? '').trim();
    if (s) names.push(s);
  }
  return [...new Set(names)];
}

async function parseNamesFromFile(
  file: File,
  type: 'schools' | 'colleges'
): Promise<string[]> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const sheet = wb.Sheets[firstSheet];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  return parseNamesFromSheet(type, rawRows);
}

type TabId = 'states' | 'districts' | 'mandals' | 'schools' | 'colleges';

type StateRow = { id: string; name: string; isActive: boolean; displayOrder: number };
type DistrictRow = { id: string; stateId: string; name: string; isActive: boolean; displayOrder: number };
type MandalRow = { id: string; districtId: string; name: string; isActive: boolean; displayOrder: number };
type SchoolRow = { id: string; name: string; isActive: boolean };
type CollegeRow = { id: string; name: string; isActive: boolean };

function extractData<T>(res: any): T[] {
  const d = res?.data;
  if (Array.isArray(d)) return d as T[];
  if (d?.data && Array.isArray(d.data)) return d.data as T[];
  return [];
}

export default function MasterDataPage() {
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const router = useRouter();
  const { hasAccess: canAccess } = useModulePermission('masterData');
  const currentUser = auth.getUser();
  const canDelete = currentUser?.roleName === 'Super Admin';

  const [activeTab, setActiveTab] = useState<TabId>('states');
  const [showInactive, setShowInactive] = useState(false);

  const [stateName, setStateName] = useState('');
  const [districtStateId, setDistrictStateId] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [mandalDistrictId, setMandalDistrictId] = useState('');
  const [mandalName, setMandalName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [collegeName, setCollegeName] = useState('');

  const [bulkType, setBulkType] = useState<'schools' | 'colleges' | null>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkNames, setBulkNames] = useState<string[]>([]);
  const [bulkParseError, setBulkParseError] = useState<string | null>(null);
  const [bulkParsing, setBulkParsing] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const [editingStateId, setEditingStateId] = useState<string | null>(null);
  const [editingStateName, setEditingStateName] = useState('');
  const [editingDistrictId, setEditingDistrictId] = useState<string | null>(null);
  const [editingDistrictName, setEditingDistrictName] = useState('');
  const [editingDistrictStateId, setEditingDistrictStateId] = useState('');
  const [editingMandalId, setEditingMandalId] = useState<string | null>(null);
  const [editingMandalName, setEditingMandalName] = useState('');
  const [editingMandalDistrictId, setEditingMandalDistrictId] = useState('');
  const [editingSchoolId, setEditingSchoolId] = useState<string | null>(null);
  const [editingSchoolName, setEditingSchoolName] = useState('');
  const [editingCollegeId, setEditingCollegeId] = useState<string | null>(null);
  const [editingCollegeName, setEditingCollegeName] = useState('');

  const { data: statesRes } = useQuery({
    queryKey: ['master-data', 'states', showInactive],
    queryFn: () => masterDataAPI.listStates({ showInactive }),
  });
  const { data: districtsRes } = useQuery({
    queryKey: ['master-data', 'districts', districtStateId, showInactive],
    queryFn: () =>
      masterDataAPI.listDistricts({
        stateId: districtStateId || undefined,
        showInactive,
      }),
  });
  const { data: mandalsRes } = useQuery({
    queryKey: ['master-data', 'mandals', mandalDistrictId, showInactive],
    queryFn: () =>
      masterDataAPI.listMandals({
        districtId: mandalDistrictId || undefined,
        showInactive,
      }),
  });
  const { data: schoolsRes } = useQuery({
    queryKey: ['master-data', 'schools', showInactive],
    queryFn: () => masterDataAPI.listSchools({ showInactive }),
  });
  const { data: collegesRes } = useQuery({
    queryKey: ['master-data', 'colleges', showInactive],
    queryFn: () => masterDataAPI.listColleges({ showInactive }),
  });

  const states = useMemo(() => extractData<StateRow>(statesRes), [statesRes]);
  const districts = useMemo(() => extractData<DistrictRow>(districtsRes), [districtsRes]);
  const mandals = useMemo(() => extractData<MandalRow>(mandalsRes), [mandalsRes]);
  const schools = useMemo(() => extractData<SchoolRow>(schoolsRes), [schoolsRes]);
  const colleges = useMemo(() => extractData<CollegeRow>(collegesRes), [collegesRes]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['master-data'] });
  };

  const createStateMu = useMutation({
    mutationFn: (data: { name: string }) => masterDataAPI.createState(data),
    onSuccess: () => {
      showToast.success('State added');
      setStateName('');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to add state'),
  });
  const createDistrictMu = useMutation({
    mutationFn: (data: { stateId: string; name: string }) =>
      masterDataAPI.createDistrict(data),
    onSuccess: () => {
      showToast.success('District added');
      setDistrictName('');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to add district'),
  });
  const createMandalMu = useMutation({
    mutationFn: (data: { districtId: string; name: string }) =>
      masterDataAPI.createMandal(data),
    onSuccess: () => {
      showToast.success('Mandal added');
      setMandalName('');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to add mandal'),
  });
  const createSchoolMu = useMutation({
    mutationFn: (data: { name: string }) => masterDataAPI.createSchool(data),
    onSuccess: () => {
      showToast.success('School added');
      setSchoolName('');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to add school'),
  });
  const createCollegeMu = useMutation({
    mutationFn: (data: { name: string }) => masterDataAPI.createCollege(data),
    onSuccess: () => {
      showToast.success('College added');
      setCollegeName('');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to add college'),
  });

  const deleteStateMu = useMutation({
    mutationFn: (id: string) => masterDataAPI.deleteState(id),
    onSuccess: () => {
      showToast.success('State deleted');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to delete state'),
  });
  const deleteDistrictMu = useMutation({
    mutationFn: (id: string) => masterDataAPI.deleteDistrict(id),
    onSuccess: () => {
      showToast.success('District deleted');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to delete district'),
  });
  const deleteMandalMu = useMutation({
    mutationFn: (id: string) => masterDataAPI.deleteMandal(id),
    onSuccess: () => {
      showToast.success('Mandal deleted');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to delete mandal'),
  });

  const updateStateMu = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      masterDataAPI.updateState(id, { name: name.trim() }),
    onSuccess: () => {
      showToast.success('State updated');
      setEditingStateId(null);
      setEditingStateName('');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to update state'),
  });
  const updateDistrictMu = useMutation({
    mutationFn: ({ id, name, stateId }: { id: string; name: string; stateId: string }) =>
      masterDataAPI.updateDistrict(id, { name: name.trim(), stateId }),
    onSuccess: () => {
      showToast.success('District updated');
      setEditingDistrictId(null);
      setEditingDistrictName('');
      setEditingDistrictStateId('');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to update district'),
  });
  const updateMandalMu = useMutation({
    mutationFn: ({ id, name, districtId }: { id: string; name: string; districtId: string }) =>
      masterDataAPI.updateMandal(id, { name: name.trim(), districtId }),
    onSuccess: () => {
      showToast.success('Mandal updated');
      setEditingMandalId(null);
      setEditingMandalName('');
      setEditingMandalDistrictId('');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to update mandal'),
  });
  const updateSchoolMu = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      masterDataAPI.updateSchool(id, { name: name.trim() }),
    onSuccess: () => {
      showToast.success('School updated');
      setEditingSchoolId(null);
      setEditingSchoolName('');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to update school'),
  });
  const updateCollegeMu = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      masterDataAPI.updateCollege(id, { name: name.trim() }),
    onSuccess: () => {
      showToast.success('College updated');
      setEditingCollegeId(null);
      setEditingCollegeName('');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to update college'),
  });

  const deleteSchoolMu = useMutation({
    mutationFn: (id: string) => masterDataAPI.deleteSchool(id),
    onSuccess: () => {
      showToast.success('School deleted');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to delete school'),
  });
  const deleteCollegeMu = useMutation({
    mutationFn: (id: string) => masterDataAPI.deleteCollege(id),
    onSuccess: () => {
      showToast.success('College deleted');
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Failed to delete college'),
  });

  const bulkCreateSchoolsMu = useMutation({
    mutationFn: (names: string[]) => masterDataAPI.bulkCreateSchools(names),
    onSuccess: (res: any) => {
      const d = res?.data ?? res;
      const created = d?.created ?? 0;
      const skipped = d?.skipped ?? 0;
      showToast.success(`Schools: ${created} added${skipped ? `, ${skipped} skipped (already exist)` : ''}`);
      setBulkType(null);
      setBulkFile(null);
      setBulkNames([]);
      setBulkParseError(null);
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Bulk upload failed'),
  });

  const bulkCreateCollegesMu = useMutation({
    mutationFn: (names: string[]) => masterDataAPI.bulkCreateColleges(names),
    onSuccess: (res: any) => {
      const d = res?.data ?? res;
      const created = d?.created ?? 0;
      const skipped = d?.skipped ?? 0;
      showToast.success(`Colleges: ${created} added${skipped ? `, ${skipped} skipped (already exist)` : ''}`);
      setBulkType(null);
      setBulkFile(null);
      setBulkNames([]);
      setBulkParseError(null);
      invalidateAll();
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message || 'Bulk upload failed'),
  });

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bulkType) return;
    setBulkParseError(null);
    setBulkNames([]);
    setBulkFile(file);
    setBulkParsing(true);
    try {
      const names = await parseNamesFromFile(file, bulkType);
      setBulkNames(names);
      if (names.length === 0) setBulkParseError('No names found. Use a column named "name", "school name", or "college name", or put names in the first column.');
    } catch (err) {
      setBulkParseError(err instanceof Error ? err.message : 'Failed to parse file');
      setBulkNames([]);
    } finally {
      setBulkParsing(false);
      e.target.value = '';
    }
  };

  const closeBulkModal = () => {
    setBulkType(null);
    setBulkFile(null);
    setBulkNames([]);
    setBulkParseError(null);
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
  };

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          States, Districts &amp; Mandals
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Manage states, districts, mandals, school names, and college names. Hierarchy: State → District → Mandal.
        </p>
      </div>
    ),
    []
  );

  useEffect(() => {
    setHeaderContent(headerContent);
    return () => clearHeaderContent();
  }, [headerContent, setHeaderContent, clearHeaderContent]);

  useEffect(() => {
    if (!canAccess) router.replace('/superadmin/dashboard');
  }, [canAccess, router]);

  useEffect(() => {
    setEditingStateId(null);
    setEditingStateName('');
    setEditingDistrictId(null);
    setEditingDistrictName('');
    setEditingDistrictStateId('');
    setEditingMandalId(null);
    setEditingMandalName('');
    setEditingMandalDistrictId('');
    setEditingSchoolId(null);
    setEditingSchoolName('');
    setEditingCollegeId(null);
    setEditingCollegeName('');
  }, [activeTab]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'states', label: 'States' },
    { id: 'districts', label: 'Districts' },
    { id: 'mandals', label: 'Mandals' },
    { id: 'schools', label: 'Schools' },
    { id: 'colleges', label: 'Colleges' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === id
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
        <label className="ml-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-slate-300"
          />
          Show inactive
        </label>
      </div>

      {activeTab === 'states' && (
        <Card title="States" description="Add or remove states.">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <Input
              label="State name"
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              placeholder="e.g. Andhra Pradesh"
              className="max-w-xs"
            />
            <Button
              onClick={() => {
                if (!stateName.trim()) return;
                createStateMu.mutate({ name: stateName.trim() });
              }}
              disabled={createStateMu.isPending || !stateName.trim()}
            >
              Add State
            </Button>
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {states.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                {editingStateId === s.id ? (
                  <>
                    <input
                      type="text"
                      value={editingStateName}
                      onChange={(e) => setEditingStateName(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      placeholder="State name"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!editingStateName.trim()) return;
                        updateStateMu.mutate({ id: s.id, name: editingStateName.trim() });
                      }}
                      disabled={updateStateMu.isPending || !editingStateName.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingStateId(null);
                        setEditingStateName('');
                      }}
                      disabled={updateStateMu.isPending}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className={s.isActive ? '' : 'text-slate-400 line-through'}>
                      {s.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingStateId(s.id);
                          setEditingStateName(s.name);
                        }}
                      >
                        Edit
                      </Button>
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Delete state "${s.name}"? This will delete all its districts and mandals.`))
                              deleteStateMu.mutate(s.id);
                          }}
                          disabled={deleteStateMu.isPending}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {activeTab === 'districts' && (
        <Card title="Districts" description="Add districts under a state.">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="min-w-[200px]">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                State
              </label>
              <select
                value={districtStateId}
                onChange={(e) => setDistrictStateId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Select state</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="District name"
              value={districtName}
              onChange={(e) => setDistrictName(e.target.value)}
              placeholder="e.g. Konaseema"
              className="max-w-xs"
            />
            <Button
              onClick={() => {
                if (!districtStateId || !districtName.trim()) return;
                createDistrictMu.mutate({
                  stateId: districtStateId,
                  name: districtName.trim(),
                });
              }}
              disabled={
                createDistrictMu.isPending ||
                !districtStateId ||
                !districtName.trim()
              }
            >
              Add District
            </Button>
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {districts.map((d) => {
              const state = states.find((s) => s.id === d.stateId);
              const isEditing = editingDistrictId === d.id;
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={editingDistrictName}
                        onChange={(e) => setEditingDistrictName(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        placeholder="District name"
                        autoFocus
                      />
                      <select
                        value={editingDistrictStateId}
                        onChange={(e) => setEditingDistrictStateId(e.target.value)}
                        className="min-w-[140px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {states.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!editingDistrictName.trim() || !editingDistrictStateId) return;
                          updateDistrictMu.mutate({
                            id: d.id,
                            name: editingDistrictName.trim(),
                            stateId: editingDistrictStateId,
                          });
                        }}
                        disabled={updateDistrictMu.isPending || !editingDistrictName.trim() || !editingDistrictStateId}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingDistrictId(null);
                          setEditingDistrictName('');
                          setEditingDistrictStateId('');
                        }}
                        disabled={updateDistrictMu.isPending}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className={d.isActive ? '' : 'text-slate-400 line-through'}>
                        {d.name}
                        {state && (
                          <span className="ml-2 text-slate-500 text-sm">
                            ({state.name})
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingDistrictId(d.id);
                            setEditingDistrictName(d.name);
                            setEditingDistrictStateId(d.stateId);
                          }}
                        >
                          Edit
                        </Button>
                        {canDelete && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (window.confirm(`Delete district "${d.name}"? This will delete all its mandals.`))
                                deleteDistrictMu.mutate(d.id);
                            }}
                            disabled={deleteDistrictMu.isPending}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {activeTab === 'mandals' && (
        <Card title="Mandals" description="Add mandals under a district.">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="min-w-[200px]">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                District
              </label>
              <select
                value={mandalDistrictId}
                onChange={(e) => setMandalDistrictId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Select district</option>
                {districts.map((d) => {
                  const state = states.find((s) => s.id === d.stateId);
                  return (
                    <option key={d.id} value={d.id}>
                      {d.name} {state ? `(${state.name})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <Input
              label="Mandal name"
              value={mandalName}
              onChange={(e) => setMandalName(e.target.value)}
              placeholder="e.g. I Polavaram"
              className="max-w-xs"
            />
            <Button
              onClick={() => {
                if (!mandalDistrictId || !mandalName.trim()) return;
                createMandalMu.mutate({
                  districtId: mandalDistrictId,
                  name: mandalName.trim(),
                });
              }}
              disabled={
                createMandalMu.isPending ||
                !mandalDistrictId ||
                !mandalName.trim()
              }
            >
              Add Mandal
            </Button>
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {mandals.map((m) => {
              const district = districts.find((d) => d.id === m.districtId);
              const state = district
                ? states.find((s) => s.id === district.stateId)
                : null;
              const isEditing = editingMandalId === m.id;
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={editingMandalName}
                        onChange={(e) => setEditingMandalName(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        placeholder="Mandal name"
                        autoFocus
                      />
                      <select
                        value={editingMandalDistrictId}
                        onChange={(e) => setEditingMandalDistrictId(e.target.value)}
                        className="min-w-40 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {districts.map((d) => {
                          const st = states.find((s) => s.id === d.stateId);
                          return (
                            <option key={d.id} value={d.id}>
                              {d.name} {st ? `(${st.name})` : ''}
                            </option>
                          );
                        })}
                      </select>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!editingMandalName.trim() || !editingMandalDistrictId) return;
                          updateMandalMu.mutate({
                            id: m.id,
                            name: editingMandalName.trim(),
                            districtId: editingMandalDistrictId,
                          });
                        }}
                        disabled={updateMandalMu.isPending || !editingMandalName.trim() || !editingMandalDistrictId}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingMandalId(null);
                          setEditingMandalName('');
                          setEditingMandalDistrictId('');
                        }}
                        disabled={updateMandalMu.isPending}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className={m.isActive ? '' : 'text-slate-400 line-through'}>
                        {m.name}
                        {district && (
                          <span className="ml-2 text-slate-500 text-sm">
                            ({district.name}
                            {state ? `, ${state.name}` : ''})
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingMandalId(m.id);
                            setEditingMandalName(m.name);
                            setEditingMandalDistrictId(m.districtId);
                          }}
                        >
                          Edit
                        </Button>
                        {canDelete && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (window.confirm(`Delete mandal "${m.name}"?`))
                                deleteMandalMu.mutate(m.id);
                            }}
                            disabled={deleteMandalMu.isPending}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {activeTab === 'schools' && (
        <Card title="Schools" description="Manage school names (names only).">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <Input
              label="School name"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="e.g. SAI HIGH SCHOOL, MURAMULLA"
              className="max-w-xs"
            />
            <Button
              onClick={() => {
                if (!schoolName.trim()) return;
                createSchoolMu.mutate({ name: schoolName.trim() });
              }}
              disabled={createSchoolMu.isPending || !schoolName.trim()}
            >
              Add School
            </Button>
            <Button
              variant="outline"
              onClick={() => setBulkType('schools')}
            >
              Bulk upload (Excel/CSV)
            </Button>
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {schools.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                {editingSchoolId === s.id ? (
                  <>
                    <input
                      type="text"
                      value={editingSchoolName}
                      onChange={(e) => setEditingSchoolName(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      placeholder="School name"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!editingSchoolName.trim()) return;
                        updateSchoolMu.mutate({ id: s.id, name: editingSchoolName.trim() });
                      }}
                      disabled={updateSchoolMu.isPending || !editingSchoolName.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingSchoolId(null);
                        setEditingSchoolName('');
                      }}
                      disabled={updateSchoolMu.isPending}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className={s.isActive ? '' : 'text-slate-400 line-through'}>
                      {s.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingSchoolId(s.id);
                          setEditingSchoolName(s.name);
                        }}
                      >
                        Edit
                      </Button>
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Delete school "${s.name}"?`))
                              deleteSchoolMu.mutate(s.id);
                          }}
                          disabled={deleteSchoolMu.isPending}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {activeTab === 'colleges' && (
        <Card title="Colleges" description="Manage college names (names only).">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <Input
              label="College name"
              value={collegeName}
              onChange={(e) => setCollegeName(e.target.value)}
              placeholder="e.g. Example Degree College"
              className="max-w-xs"
            />
            <Button
              onClick={() => {
                if (!collegeName.trim()) return;
                createCollegeMu.mutate({ name: collegeName.trim() });
              }}
              disabled={createCollegeMu.isPending || !collegeName.trim()}
            >
              Add College
            </Button>
            <Button
              variant="outline"
              onClick={() => setBulkType('colleges')}
            >
              Bulk upload (Excel/CSV)
            </Button>
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {colleges.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                {editingCollegeId === c.id ? (
                  <>
                    <input
                      type="text"
                      value={editingCollegeName}
                      onChange={(e) => setEditingCollegeName(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      placeholder="College name"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!editingCollegeName.trim()) return;
                        updateCollegeMu.mutate({ id: c.id, name: editingCollegeName.trim() });
                      }}
                      disabled={updateCollegeMu.isPending || !editingCollegeName.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingCollegeId(null);
                        setEditingCollegeName('');
                      }}
                      disabled={updateCollegeMu.isPending}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className={c.isActive ? '' : 'text-slate-400 line-through'}>
                      {c.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingCollegeId(c.id);
                          setEditingCollegeName(c.name);
                        }}
                      >
                        Edit
                      </Button>
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Delete college "${c.name}"?`))
                              deleteCollegeMu.mutate(c.id);
                          }}
                          disabled={deleteCollegeMu.isPending}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Bulk upload modal */}
      {bulkType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900 dark:border dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Bulk upload {bulkType === 'schools' ? 'schools' : 'colleges'}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Upload an Excel (.xlsx, .xls) or CSV file. Use a column named &quot;name&quot;, &quot;{bulkType} name&quot;, or put names in the first column.
            </p>
            <input
              ref={bulkFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleBulkFileChange}
              className="mt-3 block w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:file:bg-slate-800 dark:file:text-slate-200"
            />
            {bulkParsing && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">Parsing file…</p>
            )}
            {bulkParseError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{bulkParseError}</p>
            )}
            {bulkNames.length > 0 && (
              <>
                <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Preview (first 15 of {bulkNames.length} name{bulkNames.length !== 1 ? 's' : ''})
                </p>
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                  {bulkNames.slice(0, 15).map((name, i) => (
                    <li key={i} className="py-0.5 text-slate-700 dark:text-slate-300">{name}</li>
                  ))}
                  {bulkNames.length > 15 && (
                    <li className="py-0.5 text-slate-500 dark:text-slate-400">
                      … and {bulkNames.length - 15} more
                    </li>
                  )}
                </ul>
              </>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={closeBulkModal} disabled={bulkCreateSchoolsMu.isPending || bulkCreateCollegesMu.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (bulkNames.length === 0) return;
                  if (bulkType === 'schools') bulkCreateSchoolsMu.mutate(bulkNames);
                  else bulkCreateCollegesMu.mutate(bulkNames);
                }}
                disabled={
                  bulkNames.length === 0 ||
                  bulkParsing ||
                  bulkCreateSchoolsMu.isPending ||
                  bulkCreateCollegesMu.isPending
                }
              >
                {bulkCreateSchoolsMu.isPending || bulkCreateCollegesMu.isPending
                  ? 'Uploading…'
                  : `Upload ${bulkNames.length} name${bulkNames.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
