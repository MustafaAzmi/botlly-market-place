import { MarketingFooter, MarketingHeader } from "@/components/layout/MarketingChrome";

type LegalPageProps = {
  title: string;
  updatedAt: string;
  intro: string;
  sections: Array<{
    title: string;
    body: string;
  }>;
};

export function LegalPage({ title, updatedAt, intro, sections }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      <main className="border-t border-border/60">
        <section className="container mx-auto max-w-3xl px-4 py-16 md:py-20">
          <p className="text-sm font-medium text-primary">Botly</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{updatedAt}</p>
          <p className="mt-8 text-base leading-8 text-muted-foreground">{intro}</p>

          <div className="mt-10 space-y-8">
            {sections.map((section) => (
              <section key={section.title} className="space-y-3">
                <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
                <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
