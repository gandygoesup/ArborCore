import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  TreeDeciduous, 
  Calculator, 
  Link2, 
  CalendarCheck, 
  FileText, 
  Clock, 
  Users,
  Wrench,
  Construction
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { SiReplit, SiTwilio, SiStripe } from "react-icons/si";

export default function Landing() {
  const prefersReducedMotion = useReducedMotion();
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  const features = [
    {
      icon: Wrench,
      title: "Equipment Intelligence",
      bullets: [
        "Automatically schedule equipment maintenance",
        "Instantly access part numbers, order consumables, watch tutorials, and view user manuals by make and model",
        "Track exactly what each piece of equipment costs to operate"
      ]
    },
    {
      icon: Calculator,
      title: "Cost-of-Operation-Based Pricing",
      bullets: [
        "Automatically calculate estimates based on your real cost of operation",
        "Admin-adjustable specs for tree size, risk, cleanup, access, and time",
        "Keeps pricing efficient and consistent across the team",
        "Protect margins before the job is ever sold"
      ]
    },
    {
      icon: Link2,
      title: "Estimates & Invoices via Magic Link",
      bullets: [
        "Send customers one secure link to review details, approve the job, and pay",
        "Collect deposits or full payment instantly",
        "Eliminate back-and-forth, follow-ups, and approval delays"
      ]
    },
    {
      icon: CalendarCheck,
      title: "Secured Scheduling",
      bullets: [
        "Schedule crews and equipment together",
        "Prevent double-booking and missing resources",
        "Catch conflicts before they become job-day problems"
      ]
    },
    {
      icon: FileText,
      title: "Automatic Contracts & Documentation",
      bullets: [
        "Generate financial contracts automatically upon estimate approval",
        "Keep signed records attached to every job",
        "Eliminate paperwork gaps and disputes"
      ]
    },
    {
      icon: Clock,
      title: "Payment Plans & Automatic Reminders",
      bullets: [
        "Set and track payment plans easily",
        "Send reminders automatically",
        "Track balances in real time",
        "Spend less time chasing money"
      ]
    },
    {
      icon: Users,
      title: "Customer & Property Management",
      bullets: [
        "Track leads and customer details in one place",
        "Keep notes, job history, photos, and documents organized"
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <TreeDeciduous className="h-8 w-8 text-primary" />
            <span className="text-xl font-semibold" data-testid="text-brand">ArborCore</span>
          </div>
          <Button onClick={handleLogin} data-testid="button-login">
            Sign In
          </Button>
        </div>
      </header>

      <main>
        <section className="py-16 px-8">
          <div className="max-w-4xl mx-auto text-center">
            <motion.h1 
              className="text-2xl md:text-3xl font-bold mb-6 text-foreground"
              data-testid="text-headline"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <motion.span
                className="block"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: prefersReducedMotion ? 0 : 0.2 }}
              >
                Like Clean Operations & Ridiculous Efficiency?
              </motion.span>
              <motion.span
                className="block text-primary mt-2"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: prefersReducedMotion ? 0 : 0.5 }}
              >
                It's at our Core
              </motion.span>
            </motion.h1>
            <motion.p 
              className="text-muted-foreground mb-8 text-lg"
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: prefersReducedMotion ? 0 : 0.8 }}
            >
               Professional Tree Service Management Operating System
            </motion.p>
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: prefersReducedMotion ? 0 : 1.1 }}
            >
              <Button size="lg" onClick={handleLogin} data-testid="button-get-started">
                Get started Free
              </Button>
            </motion.div>

            <motion.div
              className="mt-8 p-4 rounded-md bg-muted/50 border border-border max-w-md mx-auto"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: prefersReducedMotion ? 0 : 1.4 }}
              data-testid="notice-under-development"
            >
              <div className="flex items-center gap-3">
                <Construction className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Under Development</p>
                  <p className="text-sm text-muted-foreground">
                    ArborCore is currently being built. Expected release: January-Febuary 2026
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="py-8 px-8 border-y">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-sm text-muted-foreground mb-4">Sponsored by</p>
            <div className="flex items-center justify-center gap-10 flex-wrap">
              <div className="flex items-center gap-2 text-muted-foreground" data-testid="sponsor-replit">
                <SiReplit className="h-6 w-6" />
                <span className="text-lg font-medium">Replit</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground" data-testid="sponsor-twilio">
                <SiTwilio className="h-6 w-6" />
                <span className="text-lg font-medium">Twilio</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground" data-testid="sponsor-stripe">
                <SiStripe className="h-6 w-6" />
                <span className="text-lg font-medium">Stripe</span>
              </div>
            </div>
          </div>
        </section>

        <section className="py-10 px-8 bg-muted/30">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Card key={index} data-testid={`card-feature-${index}`}>
                    <CardHeader className="pb-2">
                      <Icon className="h-6 w-6 text-primary mb-2" />
                      <CardTitle className="text-base font-semibold">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5 text-sm text-muted-foreground">
                        {feature.bullets.map((bullet, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-primary mt-1.5 shrink-0">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-10 px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-xl font-semibold mb-4">Ready to Take Control of Your Business?</h2>
            <p className="text-muted-foreground mb-6">
              Join tree service professionals saving hours every week with ArborCore.
            </p>
            <Button size="lg" onClick={handleLogin} data-testid="button-cta-bottom">
              Start Your Free Trial
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 px-8">
        <div className="max-w-7xl mx-auto text-center text-sm text-muted-foreground">
          ArborCore - Professional Tree Service Management
        </div>
      </footer>
    </div>
  );
}
