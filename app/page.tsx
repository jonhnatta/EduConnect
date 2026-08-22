import { Header } from "@/components/landing/header"
import { HeroSection } from "@/components/landing/hero-section"
import { FeaturesSection } from "@/components/landing/features-section"
import { HowItWorksSection } from "@/components/landing/how-it-works-section"
import { CTASection } from "@/components/landing/cta-section"
import { Footer } from "@/components/landing/footer"

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <HeroSection />
        <section id="funcionalidades">
          <FeaturesSection />
        </section>
        <section id="como-funciona">
          <HowItWorksSection />
        </section>
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}
