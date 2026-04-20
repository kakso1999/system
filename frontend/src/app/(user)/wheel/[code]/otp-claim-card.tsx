import type { KeyboardEvent } from "react";
import { LockOpen } from "lucide-react";

export interface OtpClaimCardProps {
  phone: string;
  otp: string[];
  smsEnabled: boolean;
  phoneVerified: boolean;
  otpSent: boolean;
  verifying: boolean;
  claiming: boolean;
  otpCooldown: number;
  sessionError: string;
  onPhoneChange: (value: string) => void;
  onOtpChange: (index: number, value: string) => void;
  onOtpKeyDown: (index: number, event: KeyboardEvent<HTMLInputElement>) => void;
  onVerifyPhone: () => void;
  onVerifyOtp: () => void;
  onClaim: () => void;
}

function PrimaryButton({ disabled, label, onClick }: { disabled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-surface-container-highest text-primary font-[var(--font-headline)] font-extrabold py-4 rounded-xl hover:bg-primary hover:text-white transition-all active:scale-[0.98] disabled:opacity-60"
    >
      {label}
    </button>
  );
}

function OtpGrid({
  otp,
  disabled,
  onOtpChange,
  onOtpKeyDown,
}: Pick<OtpClaimCardProps, "otp" | "onOtpChange" | "onOtpKeyDown"> & { disabled: boolean }) {
  return (
    <div>
      <label className="block text-xs font-bold text-outline uppercase tracking-widest mb-2 ml-1">Verification Code (6 digits)</label>
      <div className="grid grid-cols-6 gap-2">
        {otp.map((digit, i) => (
          <input
            key={i}
            id={`otp-${i}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(e) => onOtpChange(i, e.target.value)}
            onKeyDown={(e) => onOtpKeyDown(i, e)}
            className="w-full bg-surface-container-low border-none rounded-xl py-4 text-center font-bold text-xl text-primary focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          />
        ))}
      </div>
    </div>
  );
}

export function OtpClaimCard(props: OtpClaimCardProps) {
  const blocked = Boolean(props.sessionError);
  return (
    <div className="bg-surface-container-lowest rounded-xl p-8 shadow-[0px_20px_40px_rgba(39,44,81,0.06)] relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <LockOpen className="w-16 h-16 text-on-surface" />
      </div>
      <div className="relative z-10">
        <h3 className="font-[var(--font-headline)] font-bold text-xl mb-2 text-on-surface">Claim Your Prize</h3>
        <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
          Enter your mobile number to verify and securely link your reward to your profile.
        </p>
        {props.sessionError && <div className="mb-4 rounded-xl border border-error/10 bg-error/5 px-4 py-3 text-sm font-semibold text-error">{props.sessionError}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-outline uppercase tracking-widest mb-2 ml-1">Mobile Number</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">+</span>
              <input
                type="tel"
                value={props.phone}
                onChange={(e) => props.onPhoneChange(e.target.value)}
                placeholder="639171234567"
                disabled={props.phoneVerified || props.otpSent || blocked}
                className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-10 pr-4 text-on-surface font-semibold focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-outline/50 disabled:opacity-60"
              />
            </div>
          </div>
          {!props.phoneVerified && !props.otpSent && (
            <PrimaryButton
              onClick={props.onVerifyPhone}
              disabled={props.verifying || !props.phone || blocked}
              label={props.verifying ? "SENDING..." : (props.smsEnabled ? "SEND VERIFICATION CODE" : "VERIFY PHONE")}
            />
          )}
          {props.otpSent && !props.phoneVerified && (
            <>
              <OtpGrid otp={props.otp} disabled={blocked} onOtpChange={props.onOtpChange} onOtpKeyDown={props.onOtpKeyDown} />
              <PrimaryButton onClick={props.onVerifyOtp} disabled={props.verifying || props.otp.join("").length !== 6 || blocked} label={props.verifying ? "VERIFYING..." : "VERIFY CODE"} />
              <button onClick={props.onVerifyPhone} disabled={props.otpCooldown > 0 || props.verifying || blocked} className="w-full text-sm text-on-surface-variant font-semibold py-2 hover:text-primary transition-colors disabled:opacity-40">
                {props.otpCooldown > 0 ? `Resend in ${props.otpCooldown}s` : "Resend Code"}
              </button>
            </>
          )}
          {props.phoneVerified && (
            <button onClick={props.onClaim} disabled={props.claiming || blocked} className="w-full bg-gradient-to-r from-secondary to-secondary-dim text-white font-[var(--font-headline)] font-extrabold py-5 rounded-full shadow-lg shadow-secondary/20 active:scale-[0.97] transition-all disabled:opacity-60">
              {props.claiming ? "CLAIMING..." : "CLAIM REWARD"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
