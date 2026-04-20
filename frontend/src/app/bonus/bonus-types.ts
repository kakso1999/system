export type BonusTier = {
  threshold: number;
  amount: number;
};

export type BonusRule = {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  tiers: BonusTier[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type BonusRuleListResponse = {
  items: BonusRule[];
  global_default: BonusRule | null;
};

export type BonusTodayTier = BonusTier & {
  reached: boolean;
  claimed: boolean;
  claimable: boolean;
};

export type BonusTodayResponse = {
  date: string;
  valid_count: number;
  rule: { staff_id: string | null; tiers: BonusTier[]; enabled: boolean } | null;
  tiers: BonusTodayTier[];
  total_earned_today: number;
};

export type BonusRecordStatus = "claimed" | "settled";

export type BonusClaimRecord = {
  id: string;
  staff_id?: string;
  date: string;
  tier_threshold: number;
  amount: number;
  valid_count_at_claim: number;
  status: string;
  created_at: string;
};

export type BonusRecordPage = {
  items: BonusClaimRecord[];
  total: number;
  page: number;
  page_size: number;
};

export type BonusSettlement = {
  id: string;
  staff_id: string;
  date: string;
  total_valid: number;
  total_bonus: number;
  created_at: string;
};

export type BonusSettlementPage = {
  items: BonusSettlement[];
  total: number;
  page: number;
  page_size: number;
};

export type StaffOption = {
  id: string;
  name: string;
  staff_no: string;
};

export type BonusRuleForm = {
  staff_id: string;
  tiers: BonusTier[];
  enabled: boolean;
};
