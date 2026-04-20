"use client";

import AdminBonusPage from "./admin-bonus";
import { BonusRoleGate } from "./bonus-shells";
import PromoterBonusPage from "./promoter-bonus";

export default function BonusPage() {
  return <BonusRoleGate admin={<AdminBonusPage />} promoter={<PromoterBonusPage />} />;
}
