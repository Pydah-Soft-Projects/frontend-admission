import { useQuery } from '@tanstack/react-query';
import { locationsAPI } from './api';

type InstitutionItem = { id: string; name: string };

const extractData = (res: any): InstitutionItem[] => {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return data as InstitutionItem[];
  if (Array.isArray(data?.data)) return data.data as InstitutionItem[];
  return [];
};

export function useInstitutions() {
  const schoolsQuery = useQuery({
    queryKey: ['locations', 'schools'],
    queryFn: async () => {
      const res = await locationsAPI.listSchools();
      return extractData(res);
    },
    staleTime: 5 * 60 * 1000,
  });

  const collegesQuery = useQuery({
    queryKey: ['locations', 'colleges'],
    queryFn: async () => {
      const res = await locationsAPI.listColleges();
      return extractData(res);
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    schools: schoolsQuery.data ?? [],
    colleges: collegesQuery.data ?? [],
    isLoading: schoolsQuery.isLoading || collegesQuery.isLoading,
    isFetching: schoolsQuery.isFetching || collegesQuery.isFetching,
    refetch: () => {
      schoolsQuery.refetch();
      collegesQuery.refetch();
    },
  };
}
