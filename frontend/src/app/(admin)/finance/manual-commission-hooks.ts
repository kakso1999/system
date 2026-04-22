"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchRecentManualCommissions, fetchStaffMap, searchStaff } from "./manual-commission-api";
import { staffLabel, type ManualCommissionRecord, type StaffLite } from "./manual-commission-shared";

export function useManualCommissionRecords() {
  const [records, setRecords] = useState<ManualCommissionRecord[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, StaffLite>>({});
  const [loadingRecords, setLoadingRecords] = useState(true);
  const refreshRecords = useCallback(async () => {
    setLoadingRecords(true);
    try {
      const items = await fetchRecentManualCommissions();
      const nextMap = await fetchStaffMap(items, {});
      setRecords(items);
      setStaffMap(nextMap);
    } catch {
      setRecords([]);
      setStaffMap({});
    } finally {
      setLoadingRecords(false);
    }
  }, []);
  useEffect(() => { void refreshRecords(); }, [refreshRecords]);
  return { records, staffMap, loadingRecords, refreshRecords };
}

export function useBeneficiarySearch(beneficiary: StaffLite | null, beneficiaryQuery: string) {
  const [staffOptions, setStaffOptions] = useState<StaffLite[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  useEffect(() => {
    const keyword = beneficiaryQuery.trim();
    if (!keyword || keyword === staffLabel(beneficiary)) return void setStaffOptions([]);
    const timer = window.setTimeout(async () => {
      setLoadingOptions(true);
      try {
        setStaffOptions(await searchStaff(keyword));
      } catch {
        setStaffOptions([]);
      } finally {
        setLoadingOptions(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [beneficiary, beneficiaryQuery]);
  return { staffOptions, loadingOptions };
}
