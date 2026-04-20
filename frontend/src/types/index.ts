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
  children_count?: number;
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
  is_online?: boolean;
  last_seen_at?: string | null;
  last_login_at?: string | null;
  work_status?: "stopped" | "promoting" | "paused";
  promotion_paused?: boolean;
  pause_reason?: string;
  paused_at?: string | null;
  resumed_at?: string | null;
  started_promoting_at?: string | null;
  stopped_promoting_at?: string | null;
  qr_version?: number;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  start_time: string;
  end_time: string;
  status: "draft" | "active" | "paused" | "ended";
  rules_text: string;
  no_prize_weight: number;
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
  max_per_staff: number;
  enabled: boolean;
  needs_reward_code: boolean;
  redirect_url: string;
  display_text: string;
  image_url?: string;
}

export type SettlementStatus = "pending_redeem" | "unpaid" | "paid" | "cancelled" | "frozen";

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
  settlement_status?: SettlementStatus;
  commission_amount?: number;
  settled_at?: string | null;
  cancelled_at?: string | null;
  frozen_at?: string | null;
  cancel_reason?: string;
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

export interface WithdrawalRequest {
  id: string;
  withdrawal_no: string;
  staff_id: string;
  amount: number;
  currency: string;
  payout_account_type: string;
  payout_account_name: string;
  payout_account_number: string;
  payout_bank_name: string;
  status: "pending" | "approved" | "rejected" | "paid";
  reject_reason?: string;
  transaction_no?: string;
  remark?: string;
  created_at: string;
  reviewed_at?: string;
  paid_at?: string;
}

export interface PageResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
