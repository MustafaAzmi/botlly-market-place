import { createFileRoute, Link } from "@tanstack/react-router";
import { Store } from "lucide-react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/store/$slug")({
  head: () => ({
    meta: [
      { title: "Botly Store" },
      { name: "description", content: "Real merchant storefront on Botly." },
    ],
  }),
  component: PublicStorePage,
});

function PublicStorePage() {
  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Logo />
          <LanguageSwitcher />
        </div>
      </header>

      <main className="container mx-auto flex min-h-[calc(100vh-56px)] max-w-3xl items-center px-4 py-12">
        <div className="w-full rounded-2xl border border-dashed border-border bg-card p-10 text-center shadow-soft">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-normal">واجهة المتجر العامة قيد الربط</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            تم إيقاف كل بيانات الديمو هنا. المتجر العام لن يعرض أي قيمة افتراضية، وبعد ربط روابط
            المتاجر الحقيقية سيعرض فقط بيانات التاجر ومنتجاته المحفوظة.
          </p>
          <Button asChild className="mt-6">
            <Link to="/dashboard/store">العودة للوحة المتجر</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
