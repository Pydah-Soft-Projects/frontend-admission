/**
 * Hook to fetch states, districts, mandals from the database (API) instead of lib.
 * Used for dropdowns in lead forms, lead detail, joining, etc.
 */
import { useQuery } from '@tanstack/react-query';
import { locationsAPI } from './api';

type LocationItem = { id: string; name: string };

function extractData<T>(res: any): T[] {
  // API may return array directly (locationsAPI unwraps) or { data: array }
  if (Array.isArray(res)) return res as T[];
  const d = res?.data;
  if (Array.isArray(d)) return d as T[];
  if (d?.data && Array.isArray(d.data)) return d.data as T[];
  return [];
}

export function useLocations(options?: {
  stateName?: string;
  districtName?: string;
}) {
  const { stateName, districtName } = options ?? {};

  const statesQuery = useQuery({
    queryKey: ['locations', 'states'],
    queryFn: async () => {
      const res = await locationsAPI.listStates();
      return extractData<LocationItem>(res);
    },
    staleTime: 5 * 60 * 1000,
  });

  const districtsQuery = useQuery({
    queryKey: ['locations', 'districts', stateName ?? ''],
    queryFn: async () => {
      if (!stateName?.trim()) return [];
      const res = await locationsAPI.listDistricts({ stateName: stateName.trim() });
      return extractData<LocationItem>(res);
    },
    enabled: !!stateName?.trim(),
    staleTime: 5 * 60 * 1000,
  });

  const mandalsQuery = useQuery({
    queryKey: ['locations', 'mandals', stateName ?? '', districtName ?? ''],
    queryFn: async () => {
      if (!stateName?.trim() || !districtName?.trim()) return [];
      const res = await locationsAPI.listMandals({
        stateName: stateName.trim(),
        districtName: districtName.trim(),
      });
      return extractData<LocationItem>(res);
    },
    enabled: !!stateName?.trim() && !!districtName?.trim(),
    staleTime: 5 * 60 * 1000,
  });

  const states = statesQuery.data ?? [];
  const districts = districtsQuery.data ?? [];
  const mandals = mandalsQuery.data ?? [];

  const stateNames = states.map((s) => s.name);
  const districtNames = districts.map((d) => d.name);
  const mandalNames = mandals.map((m) => m.name);

  return {
    states,
    districts,
    mandals,
    stateNames,
    districtNames,
    mandalNames,
    isLoading:
      statesQuery.isLoading || districtsQuery.isLoading || mandalsQuery.isLoading,
  };
}
