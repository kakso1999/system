import CustomerServiceFab from "@/components/customer-service-fab";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CustomerServiceFab />
    </>
  );
}
