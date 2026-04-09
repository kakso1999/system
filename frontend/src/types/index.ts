export interface Staff {
  id: string;
  staff_no: string;
  name: string;
  phone: string;
  username: string;
  invite_code: string;
  parent_id: string | null;
  campaign_id: string | null;
  status: "active" | "disabled" | "pending_review";
  vip_level: number;
  stats: {
    total_scans: number;
    total_valid: number;
    total_commission: number;
    team_size: number;
    level1_count: number;
    level2_count: number;
    level3_count: number;
  };
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  start_time: string;
  end_time: string;
  status: "draft" | "active" | "paused" | "ended";
  rules_text: string;
  prize_url: string;
  max_claims_per_user: number;
  created_at: string;
}

export interface WheelItem {
  id: string;
  campaign_id: string;
  name: string;
  display_name: string;
  type: "onsite" | "website";
  weight: number;
  sort_order: number;
  enabled: boolean;
  needs_reward_code: boolean;
  redirect_url: string;
  display_text: string;
  image_url?: string;
}

export interface Claim {
  id: string;
  campaign_id: string;
  staff_id: string;
  phone: string;
  ip: string;
  device_fingerprint: string;
  prize_type: "onsite" | "website";
  verified: boolean;
  reward_code: string | null;
  redirected: boolean;
  status: "success" | "failed" | "blocked";
  risk_hit: string[];
  created_at: string;
}

export interface CommissionLog {
  id: string;
  commission_no: string;
  claim_id: string;
  source_staff_id: string;
  beneficiary_staff_id: string;
  level: number;
  type: string;
  rate: number;
  vip_level_at_time: number;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface VipUpgradeLog {
  id: string;
  staff_id: string;
  from_level: number;
  to_level: number;
  trigger: "auto" | "manual";
  total_valid_at_time: number;
  created_at: string;
}

export interface TeamReward {
  id: string;
  staff_id: string;
  milestone: number;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface PayoutAccount {
  id: string;
  staff_id: string;
  type: "gcash" | "maya" | "bank" | "usdt" | "other";
  account_name: string;
  account_number: string;
  bank_name: string;
  is_default: boolean;
  created_at: string;
}

export interface PageResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
