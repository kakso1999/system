import SponsorsCarousel from "@/components/sponsors-carousel";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">{children}</div>
      <div className="px-6 py-4">
        <SponsorsCarousel variant="auth" />
      </div>
    </div>
  );
}
