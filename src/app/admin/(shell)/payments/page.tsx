import { Suspense } from "react";
import { AdminPaymentsContent } from "./AdminPaymentsContent";

export default function AdminPaymentsPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-zinc-500">Chargement des paiements…</p>
      }
    >
      <AdminPaymentsContent />
    </Suspense>
  );
}
